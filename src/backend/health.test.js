const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')

// Mock dependencies
jest.mock('child_process')
jest.mock('fs')
jest.mock('os')

const HealthChecker = require('./health')

describe('HealthChecker', () => {
  let healthChecker
  let mockKubeConfig

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock kubeconfig
    mockKubeConfig = {
      getContexts: jest.fn()
    }

    // Setup default mocks
    os.homedir.mockReturnValue('/home/test')
    os.platform.mockReturnValue('linux')
    os.arch.mockReturnValue('x64')

    healthChecker = new HealthChecker(mockKubeConfig)
  })

  afterEach(() => {
    if (healthChecker) {
      // Clean up any intervals
      clearInterval(healthChecker.periodicTimer)
    }
  })

  describe('Application Health', () => {
    test('should return basic application health', () => {
      const health = healthChecker.getAppHealth()

      expect(health).toHaveProperty('status', 'healthy')
      expect(health).toHaveProperty('timestamp')
      expect(health).toHaveProperty('uptime')
      expect(health).toHaveProperty('memory')
      expect(health).toHaveProperty('system')

      expect(health.memory).toHaveProperty('used')
      expect(health.memory).toHaveProperty('total')
      expect(health.memory).toHaveProperty('limit')

      expect(health.system).toHaveProperty('platform', 'linux')
      expect(health.system).toHaveProperty('arch', 'x64')
      expect(health.system).toHaveProperty('nodeVersion')
      expect(health.system).toHaveProperty('pid')
    })

    test('should include current process information', () => {
      const health = healthChecker.getAppHealth()

      expect(typeof health.uptime).toBe('number')
      expect(health.uptime).toBeGreaterThan(0)
      expect(health.system.pid).toBe(process.pid)
      expect(health.system.nodeVersion).toBe(process.version)
    })
  })

  describe('Kubectl Availability Check', () => {
    test('should detect available kubectl', async () => {
      const mockProcess = createMockKubectlResponse('Client Version: v1.28.0')
      spawn.mockReturnValue(mockProcess)

      const result = await healthChecker.checkKubectl()

      expect(result.available).toBe(true)
      expect(result.version).toBe('Client Version: v1.28.0')
      expect(result.error).toBeNull()
      expect(spawn).toHaveBeenCalledWith('kubectl', ['version', '--client=true', '--short'])
    })

    test('should handle kubectl not available', async () => {
      const mockProcess = createMockKubectlResponse('', 'command not found', 1)
      spawn.mockReturnValue(mockProcess)

      const result = await healthChecker.checkKubectl()

      expect(result.available).toBe(false)
      expect(result.version).toBeNull()
      expect(result.error).toBe('command not found')
    })

    test('should handle kubectl execution error', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn()
      }

      spawn.mockReturnValue(mockProcess)

      // Simulate error event
      setTimeout(() => {
        mockProcess.on.mock.calls.forEach(call => {
          if (call[0] === 'error') call[1](new Error('ENOENT'))
        })
      }, 0)

      const result = await healthChecker.checkKubectl()

      expect(result.available).toBe(false)
      expect(result.error).toBe('ENOENT')
    })
  })

  describe('Kubeconfig Check', () => {
    test('should validate existing kubeconfig', () => {
      const mockStats = {
        size: 2048,
        mtime: new Date('2024-01-01T10:00:00Z')
      }

      // Return false for in-cluster SA token path, true for kubeconfig
      fs.existsSync.mockImplementation((p) =>
        p !== '/var/run/secrets/kubernetes.io/serviceaccount/token'
      )
      fs.statSync.mockReturnValue(mockStats)

      const result = healthChecker.checkKubeConfig()

      expect(result.valid).toBe(true)
      expect(result.path).toBe('/home/test/.kube/config')
      expect(result.size).toBe(2048)
      expect(result.modified).toBe('2024-01-01T10:00:00.000Z')
      expect(result.error).toBeNull()
    })

    test('should handle missing kubeconfig', () => {
      fs.existsSync.mockReturnValue(false)

      const result = healthChecker.checkKubeConfig()

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Kubeconfig file not found')
    })

    test('should handle kubeconfig access error', () => {
      fs.existsSync.mockImplementation((p) =>
        p !== '/var/run/secrets/kubernetes.io/serviceaccount/token'
      )
      fs.statSync.mockImplementation(() => {
        throw new Error('Permission denied')
      })

      const result = healthChecker.checkKubeConfig()

      expect(result.valid).toBe(false)
      expect(result.error).toBe('Permission denied')
    })

    test('should use custom KUBECONFIG path', () => {
      process.env.KUBECONFIG = '/custom/kubeconfig'
      fs.existsSync.mockImplementation((p) =>
        p !== '/var/run/secrets/kubernetes.io/serviceaccount/token'
      )
      fs.statSync.mockReturnValue({ size: 1024, mtime: new Date() })

      const result = healthChecker.checkKubeConfig()

      expect(result.valid).toBe(true)
      expect(result.path).toBe('/custom/kubeconfig')

      delete process.env.KUBECONFIG
    })
  })

  describe('Cluster Connectivity Check', () => {
    test('should check cluster connectivity successfully', async () => {
      const mockProcess = createMockKubectlResponse('Kubernetes control plane is running')
      spawn.mockReturnValue(mockProcess)

      const result = await healthChecker.checkClusterConnectivity('test-context')

      expect(result.reachable).toBe(true)
      expect(result.context).toBe('test-context')
      expect(result.info).toBe('Kubernetes control plane is running')
      expect(result.error).toBeNull()
      expect(typeof result.responseTime).toBe('number')

      expect(spawn).toHaveBeenCalledWith('kubectl', [
        '--context', 'test-context',
        'cluster-info',
        '--request-timeout=10s'
      ])
    })

    test('should handle cluster connectivity failure', async () => {
      const mockProcess = createMockKubectlResponse('', 'connection refused', 1)
      spawn.mockReturnValue(mockProcess)

      const result = await healthChecker.checkClusterConnectivity('unreachable-context')

      expect(result.reachable).toBe(false)
      expect(result.context).toBe('unreachable-context')
      expect(result.error).toBe('connection refused')
      expect(result.info).toBeNull()
    })

    test('should handle cluster connectivity timeout', async () => {
      // Mock a process that never responds
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
      }
      spawn.mockReturnValue(mockProcess)

      // Set a very short timeout for testing
      const originalTimeout = process.env.HEALTH_CHECK_TIMEOUT
      process.env.HEALTH_CHECK_TIMEOUT = '100'

      const result = await healthChecker.checkClusterConnectivity('slow-context')

      expect(result.reachable).toBe(false)
      expect(result.error).toBe('Health check timeout')
      expect(mockProcess.kill).toHaveBeenCalled()

      // Restore original timeout
      if (originalTimeout) {
        process.env.HEALTH_CHECK_TIMEOUT = originalTimeout
      } else {
        delete process.env.HEALTH_CHECK_TIMEOUT
      }
    })
  })

  describe('All Clusters Check', () => {
    test('should check all clusters successfully', async () => {
      const mockContexts = [
        { name: 'context1' },
        { name: 'context2' }
      ]
      mockKubeConfig.getContexts.mockResolvedValue({ contexts: mockContexts })

      // Mock successful connectivity for both contexts
      spawn.mockImplementation((cmd, args) => {
        if (args.includes('context1')) {
          return createMockKubectlResponse('cluster1 info')
        } else if (args.includes('context2')) {
          return createMockKubectlResponse('cluster2 info')
        }
      })

      const result = await healthChecker.checkAllClusters()

      expect(result.available).toBe(true)
      expect(result.total).toBe(2)
      expect(result.reachable).toBe(2)
      expect(result.unreachable).toBe(0)
      expect(result.clusters).toHaveLength(2)
      expect(result.error).toBeNull()
    })

    test('should handle mixed cluster connectivity', async () => {
      const mockContexts = [
        { name: 'good-context' },
        { name: 'bad-context' }
      ]
      mockKubeConfig.getContexts.mockResolvedValue({ contexts: mockContexts })

      spawn.mockImplementation((cmd, args) => {
        if (args.includes('good-context')) {
          return createMockKubectlResponse('cluster info')
        } else {
          return createMockKubectlResponse('', 'error', 1)
        }
      })

      const result = await healthChecker.checkAllClusters()

      expect(result.available).toBe(true) // At least one cluster is reachable
      expect(result.total).toBe(2)
      expect(result.reachable).toBe(1)
      expect(result.unreachable).toBe(1)
    })

    test('should handle no contexts available', async () => {
      mockKubeConfig.getContexts.mockResolvedValue({ contexts: [] })

      const result = await healthChecker.checkAllClusters()

      expect(result.available).toBe(false)
      expect(result.clusters).toEqual([])
      expect(result.error).toBe('No kubernetes contexts found')
    })

    test('should handle kubeconfig loading error', async () => {
      mockKubeConfig.getContexts.mockRejectedValue(new Error('Invalid kubeconfig'))

      const result = await healthChecker.checkAllClusters()

      expect(result.available).toBe(false)
      expect(result.clusters).toEqual([])
      expect(result.error).toBe('Invalid kubeconfig')
    })
  })

  describe('Full Health Check', () => {
    test('should perform comprehensive health check', async () => {
      // Setup mocks for successful health check
      fs.existsSync.mockImplementation((p) =>
        p !== '/var/run/secrets/kubernetes.io/serviceaccount/token'
      )
      fs.statSync.mockReturnValue({ size: 1024, mtime: new Date() })

      spawn.mockImplementation((cmd, args) => {
        if (args.includes('version')) {
          return createMockKubectlResponse('Client Version: v1.28.0')
        } else {
          return createMockKubectlResponse('cluster info')
        }
      })

      mockKubeConfig.getContexts.mockResolvedValue({
        contexts: [{ name: 'test-context' }]
      })

      const result = await healthChecker.getFullHealth()

      expect(result.status).toBe('healthy')
      expect(result).toHaveProperty('timestamp')
      expect(result).toHaveProperty('responseTime')
      expect(result.issues).toEqual([])

      expect(result.components).toHaveProperty('application')
      expect(result.components).toHaveProperty('kubectl')
      expect(result.components).toHaveProperty('kubeconfig')
      expect(result.components).toHaveProperty('clusters')

      expect(result.components.kubectl.available).toBe(true)
      expect(result.components.kubeconfig.valid).toBe(true)
      expect(result.components.clusters.available).toBe(true)
    })

    test('should report degraded status with some issues', async () => {
      // Setup mocks for degraded state
      fs.existsSync.mockImplementation((p) =>
        p !== '/var/run/secrets/kubernetes.io/serviceaccount/token'
      )
      fs.statSync.mockReturnValue({ size: 1024, mtime: new Date() })

      spawn.mockImplementation((cmd, args) => {
        if (args.includes('version')) {
          return createMockKubectlResponse('Client Version: v1.28.0')
        } else {
          return createMockKubectlResponse('', 'connection failed', 1)
        }
      })

      mockKubeConfig.getContexts.mockResolvedValue({
        contexts: [{ name: 'test-context' }]
      })

      const result = await healthChecker.getFullHealth()

      expect(result.status).toBe('degraded')
      expect(result.issues).toContain('no clusters reachable')
    })

    test('should report unhealthy status with critical issues', async () => {
      // Setup mocks for unhealthy state
      fs.existsSync.mockReturnValue(false) // No kubeconfig

      spawn.mockReturnValue(createMockKubectlResponse('', 'command not found', 1))

      const result = await healthChecker.getFullHealth()

      expect(result.status).toBe('unhealthy')
      expect(result.issues).toContain('kubectl not available')
      expect(result.issues).toContain('kubeconfig invalid')
    })
  })

  describe('Quick Health Check', () => {
    test('should return unknown status when no check performed', () => {
      const result = healthChecker.getQuickHealth()

      expect(result.status).toBe('unknown')
      expect(result.message).toBe('Health check not yet performed')
    })

    test('should return cached health status', async () => {
      // Perform a full health check first
      fs.existsSync.mockImplementation((p) =>
        p !== '/var/run/secrets/kubernetes.io/serviceaccount/token'
      )
      fs.statSync.mockReturnValue({ size: 1024, mtime: new Date() })
      spawn.mockReturnValue(createMockKubectlResponse('Client Version: v1.28.0'))
      mockKubeConfig.getContexts.mockResolvedValue({ contexts: [] })

      await healthChecker.getFullHealth()

      const result = healthChecker.getQuickHealth()

      expect(result.status).toBeDefined()
      expect(result).toHaveProperty('timestamp')
      expect(result).toHaveProperty('age')
      expect(result).toHaveProperty('stale')
      expect(result).toHaveProperty('summary')
    })

    test('should detect stale health data', async () => {
      // Mock old timestamp
      healthChecker.lastCheck = {
        status: 'healthy',
        timestamp: new Date(Date.now() - 120000).toISOString(), // 2 minutes old
        components: { clusters: { reachable: 1, total: 1 }, application: { uptime: 100 } }
      }
      healthChecker.checkInterval = 30000 // 30 seconds

      const result = healthChecker.getQuickHealth()

      expect(result.status).toBe('stale')
      expect(result.stale).toBe(true)
    })
  })

  describe('Readiness Check', () => {
    test('should report ready when dependencies are available', async () => {
      fs.existsSync.mockImplementation((p) =>
        p !== '/var/run/secrets/kubernetes.io/serviceaccount/token'
      )
      fs.statSync.mockReturnValue({ size: 1024, mtime: new Date() })

      const result = await healthChecker.getReadiness()

      expect(result.ready).toBe(true)
      expect(result.checks.kubeconfig).toBe(true)
    })

    test('should report not ready when kubeconfig missing', async () => {
      fs.existsSync.mockReturnValue(false)

      const result = await healthChecker.getReadiness()

      expect(result.ready).toBe(false)
      expect(result.reason).toBe('No Kubernetes credentials available')
      expect(result.checks.kubeconfig).toBe(false)
    })

    test('should handle readiness check errors', async () => {
      fs.existsSync.mockImplementation(() => {
        throw new Error('Stat failed')
      })

      const result = await healthChecker.getReadiness()

      expect(result.ready).toBe(false)
      expect(result.checks.kubeconfig).toBe(false)
    })
  })

  describe('Liveness Check', () => {
    test('should report alive with normal memory usage', () => {
      const result = healthChecker.getLiveness()

      expect(result.alive).toBe(true)
      expect(result).toHaveProperty('uptime')
      expect(result).toHaveProperty('memory')
      expect(result).toHaveProperty('timestamp')
    })

    test('should report not alive with high memory usage', () => {
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 600 * 1024 * 1024, // 600MB
        heapTotal: 800 * 1024 * 1024,
        rss: 700 * 1024 * 1024
      })

      // Set low threshold for testing
      process.env.MEMORY_THRESHOLD_MB = '500'

      const result = healthChecker.getLiveness()

      expect(result.alive).toBe(false)
      expect(result.reason).toContain('Memory usage too high')

      // Restore
      process.memoryUsage = originalMemoryUsage
      delete process.env.MEMORY_THRESHOLD_MB
    })
  })

  describe('Periodic Health Checks', () => {
    test('should start periodic health checks', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval')
      const getFullHealthSpy = jest.spyOn(healthChecker, 'getFullHealth').mockResolvedValue({})

      healthChecker.startPeriodicChecks()

      expect(setIntervalSpy).toHaveBeenCalled()

      setIntervalSpy.mockRestore()
      getFullHealthSpy.mockRestore()
    })
  })
})