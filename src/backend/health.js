const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

class HealthChecker {
  constructor(kubeConfig) {
    this.kubeConfig = kubeConfig
    this.lastCheck = null
    this.checkInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000 // 30 seconds
    this.clusterStatuses = new Map()
  }

  // Basic application health
  getAppHealth() {
    const uptime = process.uptime()
    const memUsage = process.memoryUsage()

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: uptime,
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        limit: Math.round(memUsage.rss / 1024 / 1024)
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        pid: process.pid
      }
    }
  }

  // Check if kubectl is available
  async checkKubectl() {
    const child = spawn('kubectl', ['version', '--client=true', '--short'])

    return new Promise((resolve) => {
      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data) => {
        stdout += data
      })

      child.stderr.on('data', (data) => {
        stderr += data
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            available: true,
            version: stdout.trim(),
            error: null
          })
        } else {
          resolve({
            available: false,
            version: null,
            error: stderr.trim()
          })
        }
      })

      child.on('error', (err) => {
        resolve({
          available: false,
          version: null,
          error: err.message
        })
      })
    })
  }

  // Check kubeconfig file
  checkKubeConfig() {
    try {
      const kubeconfigPath = process.env.KUBECONFIG || path.join(os.homedir(), '.kube', 'config')

      if (!fs.existsSync(kubeconfigPath)) {
        return {
          valid: false,
          path: kubeconfigPath,
          error: 'Kubeconfig file not found'
        }
      }

      const stats = fs.statSync(kubeconfigPath)
      return {
        valid: true,
        path: kubeconfigPath,
        size: stats.size,
        modified: stats.mtime.toISOString(),
        error: null
      }
    } catch (error) {
      return {
        valid: false,
        path: null,
        error: error.message
      }
    }
  }

  // Check connectivity to a specific cluster
  async checkClusterConnectivity(contextName) {
    const startTime = Date.now()
    const timeout = parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 10000

    return new Promise((resolve) => {
      let resolved = false

      const child = spawn('kubectl', [
        '--context', contextName,
        'cluster-info',
        '--request-timeout=10s'
      ])

      let stdout = ''
      let stderr = ''

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          child.kill()
          resolve({
            reachable: false,
            context: contextName,
            responseTime: Date.now() - startTime,
            error: 'Health check timeout',
            info: null
          })
        }
      }, timeout)

      child.stdout.on('data', (data) => {
        stdout += data
      })

      child.stderr.on('data', (data) => {
        stderr += data
      })

      child.on('close', (code) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)

        if (code === 0) {
          resolve({
            reachable: true,
            context: contextName,
            responseTime: Date.now() - startTime,
            info: stdout.trim(),
            error: null
          })
        } else {
          resolve({
            reachable: false,
            context: contextName,
            responseTime: Date.now() - startTime,
            error: stderr.trim(),
            info: null
          })
        }
      })

      child.on('error', (err) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)

        resolve({
          reachable: false,
          context: contextName,
          responseTime: Date.now() - startTime,
          error: err.message,
          info: null
        })
      })
    })
  }

  // Check all available kubernetes contexts
  async checkAllClusters() {
    try {
      const { contexts } = await this.kubeConfig.getContexts()

      if (!contexts || contexts.length === 0) {
        return {
          available: false,
          clusters: [],
          error: 'No kubernetes contexts found'
        }
      }

      // Check connectivity to all contexts in parallel
      const checks = contexts.map(ctx => this.checkClusterConnectivity(ctx.name || ctx))
      const results = await Promise.all(checks)

      // Update cluster status cache
      results.forEach(result => {
        this.clusterStatuses.set(result.context, {
          ...result,
          lastChecked: new Date().toISOString()
        })
      })

      const reachableClusters = results.filter(r => r.reachable)
      const unreachableClusters = results.filter(r => !r.reachable)

      return {
        available: reachableClusters.length > 0,
        total: contexts.length,
        reachable: reachableClusters.length,
        unreachable: unreachableClusters.length,
        clusters: results,
        error: null
      }
    } catch (error) {
      return {
        available: false,
        clusters: [],
        error: error.message
      }
    }
  }

  // Comprehensive health check
  async getFullHealth() {
    const startTime = Date.now()

    const [appHealth, kubectlCheck, kubeconfigCheck, clusterCheck] = await Promise.all([
      Promise.resolve(this.getAppHealth()),
      this.checkKubectl(),
      Promise.resolve(this.checkKubeConfig()),
      this.checkAllClusters()
    ])

    const totalTime = Date.now() - startTime

    // Determine overall health status
    let overallStatus = 'healthy'
    const issues = []

    if (!kubectlCheck.available) {
      overallStatus = 'unhealthy'
      issues.push('kubectl not available')
    }

    if (!kubeconfigCheck.valid) {
      overallStatus = 'unhealthy'
      issues.push('kubeconfig invalid')
    }

    if (!clusterCheck.available) {
      if (overallStatus === 'healthy') {
        overallStatus = 'degraded'
      }
      issues.push('no clusters reachable')
    } else if (clusterCheck.unreachable > 0) {
      if (overallStatus === 'healthy') {
        overallStatus = 'degraded'
      }
      issues.push(`${clusterCheck.unreachable} clusters unreachable`)
    }

    this.lastCheck = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime: totalTime,
      issues: issues,
      components: {
        application: appHealth,
        kubectl: kubectlCheck,
        kubeconfig: kubeconfigCheck,
        clusters: clusterCheck
      }
    }

    return this.lastCheck
  }

  // Quick health check (cached results)
  getQuickHealth() {
    if (!this.lastCheck) {
      return {
        status: 'unknown',
        message: 'Health check not yet performed',
        timestamp: new Date().toISOString()
      }
    }

    const age = Date.now() - new Date(this.lastCheck.timestamp).getTime()
    const isStale = age > this.checkInterval * 2

    return {
      status: isStale ? 'stale' : this.lastCheck.status,
      timestamp: this.lastCheck.timestamp,
      age: Math.round(age / 1000),
      stale: isStale,
      issues: this.lastCheck.issues,
      summary: {
        clusters: this.lastCheck.components.clusters.reachable || 0,
        totalClusters: this.lastCheck.components.clusters.total || 0,
        uptime: this.lastCheck.components.application.uptime
      }
    }
  }

  // Readiness check (for kubernetes readiness probe)
  async getReadiness() {
    try {
      // Check if basic dependencies are available
      const kubectlCheck = await this.checkKubectl()
      const kubeconfigCheck = this.checkKubeConfig()

      if (!kubectlCheck.available || !kubeconfigCheck.valid) {
        return {
          ready: false,
          reason: 'Dependencies not available',
          checks: {
            kubectl: kubectlCheck.available,
            kubeconfig: kubeconfigCheck.valid
          }
        }
      }

      return {
        ready: true,
        timestamp: new Date().toISOString(),
        checks: {
          kubectl: true,
          kubeconfig: true
        }
      }
    } catch (error) {
      return {
        ready: false,
        reason: error.message,
        checks: {
          kubectl: false,
          kubeconfig: false
        }
      }
    }
  }

  // Liveness check (for kubernetes liveness probe)
  getLiveness() {
    const uptime = process.uptime()
    const memUsage = process.memoryUsage()

    // Check if memory usage is too high
    const memoryThreshold = parseInt(process.env.MEMORY_THRESHOLD_MB) || 512
    const currentMemoryMB = memUsage.heapUsed / 1024 / 1024

    if (currentMemoryMB > memoryThreshold) {
      return {
        alive: false,
        reason: `Memory usage too high: ${Math.round(currentMemoryMB)}MB > ${memoryThreshold}MB`,
        uptime: uptime
      }
    }

    return {
      alive: true,
      uptime: uptime,
      memory: Math.round(currentMemoryMB),
      timestamp: new Date().toISOString()
    }
  }

  // Start periodic health checks
  startPeriodicChecks() {
    console.log(`Starting periodic health checks every ${this.checkInterval}ms`)

    // Initial check
    this.getFullHealth().catch(console.error)

    // Periodic checks
    this.periodicTimer = setInterval(() => {
      this.getFullHealth().catch(console.error)
    }, this.checkInterval)
  }
}

module.exports = HealthChecker
