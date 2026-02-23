import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// @contract api.electronIPC - Must use window.electronAPI.kubectl IPC methods in Electron mode
// @contract api.httpFallback - Must use HTTP API via axios in web mode
// @contract api.contextPathRouting - Must use /contexts/{context}/resources/* path pattern for web API
// @contract api.errorHandling - Must throw on IPC errors, propagate HTTP errors

describe('API Utils', () => {
  let mockAxiosInstance

  beforeEach(() => {
    vi.resetModules()

    mockAxiosInstance = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
      interceptors: {
        response: {
          use: vi.fn()
        }
      }
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Helper to import a fresh kubeApi with mocked dependencies
  const importFreshApi = async ({ isElectron = false, apiUrl = 'http://localhost:3001/api' } = {}) => {
    vi.doMock('axios', () => ({
      default: {
        create: vi.fn(() => mockAxiosInstance),
      }
    }))

    vi.doMock('./config', () => ({
      frontendConfig: {
        isElectron: () => isElectron,
        getApiUrl: () => apiUrl,
        isWeb: () => !isElectron,
      },
      FrontendConfig: vi.fn(),
    }))

    const mod = await import('./api')
    return mod.kubeApi
  }

  // @tests-contract api.electronIPC
  describe('Electron Environment', () => {
    beforeEach(() => {
      window.electronAPI = {
        isElectron: true,
        kubectl: {
          getContexts: vi.fn(),
          checkConnection: vi.fn(),
          getNamespaces: vi.fn(),
          getPods: vi.fn(),
          getPodContainers: vi.fn(),
          getServices: vi.fn(),
          getDeployments: vi.fn(),
          getConfigMaps: vi.fn(),
          getSecrets: vi.fn(),
          getNodes: vi.fn(),
          getCRDs: vi.fn(),
          getLogs: vi.fn(),
        }
      }
    })

    afterEach(() => {
      window.electronAPI = {
        isElectron: false,
        platform: 'linux',
        kubectl: {
          getContexts: vi.fn(),
          checkConnection: vi.fn(),
          getNamespaces: vi.fn(),
          getPods: vi.fn(),
          getPodContainers: vi.fn(),
          getServices: vi.fn(),
          getDeployments: vi.fn(),
          getConfigMaps: vi.fn(),
          getSecrets: vi.fn(),
          getNodes: vi.fn(),
          getCRDs: vi.fn(),
          getResource: vi.fn(),
          getLogs: vi.fn(),
        }
      }
    })

    it('should use IPC for getContexts in Electron', async () => {
      const mockContexts = [
        { name: 'context1', cluster: 'cluster1' },
        { name: 'context2', cluster: 'cluster2' }
      ]

      window.electronAPI.kubectl.getContexts.mockResolvedValue({
        success: true,
        data: mockContexts
      })

      const kubeApi = await importFreshApi({ isElectron: true })
      const result = await kubeApi.getContexts()

      expect(result).toEqual(mockContexts)
      expect(window.electronAPI.kubectl.getContexts).toHaveBeenCalled()
    })

    it('should handle IPC errors in Electron', async () => {
      window.electronAPI.kubectl.getContexts.mockResolvedValue({
        success: false,
        error: 'IPC Error'
      })

      const kubeApi = await importFreshApi({ isElectron: true })

      await expect(kubeApi.getContexts()).rejects.toThrow('IPC Error')
    })

    it('should use IPC for checkConnection in Electron', async () => {
      const mockResult = { connected: true, info: 'cluster info' }

      window.electronAPI.kubectl.checkConnection.mockResolvedValue({
        success: true,
        data: mockResult
      })

      const kubeApi = await importFreshApi({ isElectron: true })
      const result = await kubeApi.checkConnection('test-context')

      expect(result).toEqual(mockResult)
      expect(window.electronAPI.kubectl.checkConnection).toHaveBeenCalledWith('test-context')
    })

    it('should use IPC for getPods in Electron', async () => {
      const mockPods = [{ name: 'pod1' }, { name: 'pod2' }]

      window.electronAPI.kubectl.getPods.mockResolvedValue({
        success: true,
        data: mockPods
      })

      const kubeApi = await importFreshApi({ isElectron: true })
      const result = await kubeApi.getPods('test-context', 'default')

      expect(result).toEqual(mockPods)
      expect(window.electronAPI.kubectl.getPods).toHaveBeenCalledWith('test-context', 'default')
    })

    it('should use IPC for getPodContainers in Electron', async () => {
      const mockContainers = [{ name: 'container1' }, { name: 'container2' }]

      window.electronAPI.kubectl.getPodContainers.mockResolvedValue({
        success: true,
        data: mockContainers
      })

      const kubeApi = await importFreshApi({ isElectron: true })
      const result = await kubeApi.getPodContainers('test-context', 'default', 'test-pod')

      expect(result).toEqual(mockContainers)
      expect(window.electronAPI.kubectl.getPodContainers).toHaveBeenCalledWith('test-context', 'default', 'test-pod')
    })
  })

  // @tests-contract api.httpFallback
  // @tests-contract api.contextPathRouting
  describe('Web Environment', () => {
    it('should use HTTP for getContexts', async () => {
      const mockContexts = [
        { name: 'context1', cluster: 'cluster1' },
        { name: 'context2', cluster: 'cluster2' }
      ]

      mockAxiosInstance.get.mockResolvedValue({ data: mockContexts })

      const kubeApi = await importFreshApi()
      const result = await kubeApi.getContexts()

      expect(result).toEqual(mockContexts)
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/kubeconfig/contexts')
    })

    it('should use HTTP for checkConnection', async () => {
      const mockResult = { connected: true }
      mockAxiosInstance.post.mockResolvedValue({ data: mockResult })

      const kubeApi = await importFreshApi()
      const result = await kubeApi.checkConnection('test-context')

      expect(result).toEqual(mockResult)
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/kubeconfig/check-connection', { context: 'test-context' })
    })

    it('should use context-path routing for getPods', async () => {
      const mockPods = [{ name: 'pod1' }]
      mockAxiosInstance.get.mockResolvedValue({ data: mockPods })

      const kubeApi = await importFreshApi()
      const result = await kubeApi.getPods('test-context', 'default')

      expect(result).toEqual(mockPods)
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/pods?namespace=default'
      )
    })

    it('should handle empty namespace for getPods', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] })

      const kubeApi = await importFreshApi()
      await kubeApi.getPods('test-context', '')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/pods'
      )
    })

    it('should use context-path routing for getServices', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] })

      const kubeApi = await importFreshApi()
      await kubeApi.getServices('test-context', 'default')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/services?namespace=default'
      )
    })

    it('should use context-path routing for getDeployments', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] })

      const kubeApi = await importFreshApi()
      await kubeApi.getDeployments('test-context')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/deployments'
      )
    })

    it('should use context-path routing for getConfigMaps', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] })

      const kubeApi = await importFreshApi()
      await kubeApi.getConfigMaps('test-context', 'kube-system')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/configmaps?namespace=kube-system'
      )
    })

    it('should use context-path routing for getSecrets', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] })

      const kubeApi = await importFreshApi()
      await kubeApi.getSecrets('test-context')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/secrets'
      )
    })

    it('should use context-path routing for getNodes', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] })

      const kubeApi = await importFreshApi()
      await kubeApi.getNodes('test-context')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/nodes'
      )
    })

    it('should use context-path routing for getCRDs', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] })

      const kubeApi = await importFreshApi()
      await kubeApi.getCRDs('test-context')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/crds'
      )
    })

    it('should use context-path routing for getNamespaces', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] })

      const kubeApi = await importFreshApi()
      await kubeApi.getNamespaces('test-context')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/namespaces'
      )
    })

    it('should use context-path routing for getLogs', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { logs: 'log content' } })

      const kubeApi = await importFreshApi()
      const result = await kubeApi.getLogs('test-context', 'default', 'test-pod', 'container1')

      expect(result).toEqual({ logs: 'log content' })
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/logs/default/test-pod?container=container1'
      )
    })

    it('should use context-path routing for getPodContainers', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] })

      const kubeApi = await importFreshApi()
      await kubeApi.getPodContainers('test-context', 'default', 'pod-with-dashes')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/contexts/test-context/resources/pods/default/pod-with-dashes/containers'
      )
    })
  })

  // @tests-contract api.errorHandling
  describe('Error Handling', () => {
    it('should handle HTTP errors', async () => {
      const error = new Error('Network Error')
      mockAxiosInstance.get.mockRejectedValue(error)

      const kubeApi = await importFreshApi()

      await expect(kubeApi.getContexts()).rejects.toThrow('Network Error')
    })

    it('should handle HTTP errors with response data', async () => {
      const error = new Error('Request failed')
      error.response = { data: { error: 'Unauthorized' }, status: 401 }
      mockAxiosInstance.get.mockRejectedValue(error)

      const kubeApi = await importFreshApi()

      await expect(kubeApi.getNamespaces('test-context')).rejects.toThrow('Request failed')
    })
  })

  describe('API Configuration', () => {
    it('should create axios instance with correct base URL', async () => {
      const axiosModule = await import('axios')

      vi.doMock('axios', () => ({
        default: {
          create: vi.fn(() => mockAxiosInstance),
        }
      }))

      vi.doMock('./config', () => ({
        frontendConfig: {
          isElectron: () => false,
          getApiUrl: () => 'https://custom.example.com/api',
          isWeb: () => true,
        },
        FrontendConfig: vi.fn(),
      }))

      await import('./api')

      // The axios.create call happens at module load time
      const { default: axios } = await import('axios')
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://custom.example.com/api',
        })
      )
    })
  })
})
