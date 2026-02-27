const express = require('express')
const path = require('path')
const fs = require('fs')
const os = require('os')
const yaml = require('yaml')
const config = require('./config')
const { setupSecurity, validateSecurityConfig } = require('./security')
const HealthChecker = require('./health')
const AuthManager = require('./auth')
const KubernetesService = require('../shared/kubernetes-service')
const logger = require('./logger')

const app = express()
const PORT = process.env.PORT || 3001

// Validate security configuration on startup
const { warnings, errors } = validateSecurityConfig()

if (errors.length > 0) {
  errors.forEach(error => logger.error('Security configuration error', { error }))
  process.exit(1)
}

if (warnings.length > 0) {
  warnings.forEach(warning => logger.warn('Security configuration warning', { warning }))
}

// Setup security middleware
const securityConfig = setupSecurity(app)

// Setup authentication
const authManager = new AuthManager(config)
const authValidation = authManager.validateConfig()

if (authValidation.errors.length > 0) {
  authValidation.errors.forEach(error => logger.error('Authentication configuration error', { error }))
  process.exit(1)
}

if (authValidation.warnings.length > 0) {
  authValidation.warnings.forEach(warning => logger.warn('Authentication configuration warning', { warning }))
}

// Basic middleware
app.use(logger.httpLogger()) // Add HTTP request logging
app.use(express.json({ limit: process.env.JSON_LIMIT || '1mb' }))
app.use(express.urlencoded({ extended: true, limit: process.env.URL_ENCODED_LIMIT || '1mb' }))

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Security headers for static files
  app.use(express.static(path.join(__dirname, '../frontend'), {
    setHeaders: (res, path) => {
      // Cache static assets
      if (path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
      // Security headers for all static content
      res.setHeader('X-Content-Type-Options', 'nosniff')
    }
  }))
}

// Kubernetes configuration utilities
class KubeConfigManager {
  constructor() {
    this.defaultKubeconfigPath = process.env.KUBECONFIG || path.join(os.homedir(), '.kube', 'config')
    this.currentKubeconfigPath = this.defaultKubeconfigPath
    this.kubeconfigCache = new Map()
  }

  getCurrentKubeconfigPath() {
    return this.currentKubeconfigPath
  }

  setKubeconfigPath(newPath) {
    if (process.env.BAMF_ENABLED === 'true') {
      throw new Error('Cannot switch kubeconfig in BAMF mode')
    }
    if (!fs.existsSync(newPath)) {
      throw new Error(`Kubeconfig file not found: ${newPath}`)
    }

    // Validate the kubeconfig file
    try {
      const content = fs.readFileSync(newPath, 'utf8')
      yaml.parse(content) // Will throw if invalid YAML
      this.currentKubeconfigPath = newPath
      this.kubeconfigCache.clear() // Clear cache when switching files
      logger.info('Switched kubeconfig', { path: newPath })
      return true
    } catch (error) {
      throw new Error(`Invalid kubeconfig file: ${error.message}`)
    }
  }

  resetToDefault() {
    this.currentKubeconfigPath = this.defaultKubeconfigPath
    this.kubeconfigCache.clear()
    console.log(`📋 Reset to default kubeconfig: ${this.defaultKubeconfigPath}`)
  }

  async getContexts(kubeconfigPath = null) {
    const pathToUse = kubeconfigPath || this.currentKubeconfigPath

    try {
      // Check cache first
      const cacheKey = `contexts:${pathToUse}`
      if (this.kubeconfigCache.has(cacheKey)) {
        const cached = this.kubeconfigCache.get(cacheKey)
        if (Date.now() - cached.timestamp < 30000) { // 30 seconds cache
          return cached.data
        }
      }

      // BAMF mode or in-cluster: always use the synthetic in-cluster context.
      // In BAMF mode, kubamf talks to the local K8s API via ServiceAccount
      // with impersonation — kubeconfig files are irrelevant.
      const saTokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token'
      if ((process.env.BAMF_ENABLED === 'true' || !fs.existsSync(pathToUse)) && fs.existsSync(saTokenPath)) {
        const result = {
          contexts: [{
            name: 'in-cluster',
            cluster: 'in-cluster',
            user: 'serviceaccount',
            namespace: process.env.POD_NAMESPACE || 'default',
            current: true
          }],
          currentContext: 'in-cluster',
          kubeconfigPath: saTokenPath,
          isDefault: true,
          inCluster: true
        }
        this.kubeconfigCache.set(cacheKey, { data: result, timestamp: Date.now() })
        return result
      }

      if (!fs.existsSync(pathToUse)) {
        throw new Error(`Kubeconfig file not found: ${pathToUse}`)
      }

      const kubeconfigContent = fs.readFileSync(pathToUse, 'utf8')
      const kubeconfig = yaml.parse(kubeconfigContent)

      const contexts = kubeconfig.contexts?.map(ctx => ({
        name: ctx.name,
        cluster: ctx.context?.cluster || '',
        user: ctx.context?.user || '',
        namespace: ctx.context?.namespace || 'default',
        current: ctx.name === kubeconfig['current-context']
      })) || []

      const result = {
        contexts,
        currentContext: kubeconfig['current-context'] || '',
        kubeconfigPath: pathToUse,
        isDefault: pathToUse === this.defaultKubeconfigPath
      }

      // Cache the result
      this.kubeconfigCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      })

      return result
    } catch (error) {
      console.error('Error loading kubeconfig:', error)
      throw error
    }
  }

  async discoverKubeconfigFiles() {
    // In BAMF mode, kubeconfig discovery is irrelevant — return empty.
    if (process.env.BAMF_ENABLED === 'true') {
      return []
    }

    const kubeconfigLocations = [
      // Default locations
      this.defaultKubeconfigPath,
      path.join(os.homedir(), '.kube', 'config'),

      // Common alternative locations
      path.join(os.homedir(), '.kube', 'config-dev'),
      path.join(os.homedir(), '.kube', 'config-staging'),
      path.join(os.homedir(), '.kube', 'config-prod'),
      path.join(os.homedir(), '.kube', 'config-test'),

      // Environment-specific locations
      '/etc/kubeconfig',
      '/etc/kubernetes/admin.conf',

      // Current directory
      path.join(process.cwd(), 'kubeconfig'),
      path.join(process.cwd(), 'config'),
    ]

    const discovered = []

    for (const location of kubeconfigLocations) {
      try {
        if (fs.existsSync(location)) {
          const stat = fs.statSync(location)
          if (stat.isFile()) {
            // Try to parse and get basic info
            const content = fs.readFileSync(location, 'utf8')
            const kubeconfig = yaml.parse(content)

            discovered.push({
              path: location,
              isDefault: location === this.defaultKubeconfigPath,
              isCurrent: location === this.currentKubeconfigPath,
              contextCount: kubeconfig.contexts?.length || 0,
              currentContext: kubeconfig['current-context'] || '',
              lastModified: stat.mtime,
              size: stat.size
            })
          }
        }
      } catch (error) {
        // Skip invalid files
        console.debug(`Skipping invalid kubeconfig: ${location} - ${error.message}`)
      }
    }

    return discovered.sort((a, b) => {
      // Sort by: current first, default second, then by last modified
      if (a.isCurrent) return -1
      if (b.isCurrent) return 1
      if (a.isDefault) return -1
      if (b.isDefault) return 1
      return b.lastModified - a.lastModified
    })
  }

  async checkConnection(contextName) {
    return await kubernetesService.checkConnection(contextName)
  }
}


const kubeConfig = new KubeConfigManager()
const kubernetesService = new KubernetesService()

// Initialize health checker
const healthChecker = new HealthChecker(kubeConfig)

// Start periodic health checks if enabled
if (process.env.HEALTH_CHECK_ENABLED !== 'false') {
  healthChecker.startPeriodicChecks()
}

// Health check routes (before API routes, no auth required)
app.get('/health', async (req, res) => {
  try {
    const health = healthChecker.getQuickHealth()
    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 200 : 503

    res.status(statusCode).json(health)
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

app.get('/health/detailed', async (req, res) => {
  try {
    const health = await healthChecker.getFullHealth()
    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 200 : 503

    res.status(statusCode).json(health)
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

app.get('/health/ready', async (req, res) => {
  try {
    const readiness = await healthChecker.getReadiness()
    const statusCode = readiness.ready ? 200 : 503

    res.status(statusCode).json(readiness)
  } catch (error) {
    res.status(503).json({
      ready: false,
      reason: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

app.get('/health/live', (req, res) => {
  try {
    const liveness = healthChecker.getLiveness()
    const statusCode = liveness.alive ? 200 : 503

    res.status(statusCode).json(liveness)
  } catch (error) {
    res.status(503).json({
      alive: false,
      reason: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// Security info endpoint (for debugging security configuration)
app.get('/security-info', (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.EXPOSE_SECURITY_INFO !== 'true') {
    return res.status(404).json({ error: 'Not found' })
  }

  res.json({
    cors: {
      enabled: securityConfig.cors.enabled,
      origins: securityConfig.cors.enabled ? securityConfig.cors.origins : 'disabled'
    },
    tls: {
      enabled: securityConfig.tls.enabled
    }
  })
})

// Setup authentication routes
authManager.setupRoutes(app)

// Apply authentication middleware to API routes
app.use('/api', authManager.middleware())

// In bamf mode, wrap API requests in AsyncLocalStorage so the bamf auth
// token propagates through the async chain into KubernetesService calls
if (config.get('auth.bamf.enabled')) {
  const { requestContextMiddleware } = require('./request-context')
  app.use('/api', requestContextMiddleware())
}

// API Routes

// Import route modules
const execRoutes = require('./routes/exec')
const logsRoutes = require('./routes/logs')

// Mount routes
app.use('/api/exec', execRoutes.router)
app.use('/api/logs', logsRoutes)

// Kubeconfig routes
app.get('/api/kubeconfig/contexts', async (req, res) => {
  try {
    const contexts = await kubeConfig.getContexts()
    res.json(contexts.contexts)

    // Broadcast context list update
    broadcastSSEEvent('context-list-update', {
      contexts: contexts.contexts,
      currentContext: contexts.currentContext
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/kubeconfig/check-connection', async (req, res) => {
  try {
    const { context } = req.body
    const result = await kubeConfig.checkConnection(context)

    // Broadcast cluster status update
    broadcastSSEEvent('cluster-status', {
      context,
      connected: result.connected,
      timestamp: new Date().toISOString()
    })

    res.json(result)
  } catch (error) {
    // Broadcast failure status
    broadcastSSEEvent('cluster-status', {
      context: req.body.context,
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    })

    res.status(500).json({ error: error.message })
  }
})

// Enhanced kubeconfig management routes
app.get('/api/kubeconfig/current', (req, res) => {
  try {
    const currentPath = kubeConfig.getCurrentKubeconfigPath()
    res.json({
      path: currentPath,
      isDefault: currentPath === kubeConfig.defaultKubeconfigPath
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/kubeconfig/discover', async (req, res) => {
  try {
    const discovered = await kubeConfig.discoverKubeconfigFiles()
    res.json(discovered)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/kubeconfig/switch', async (req, res) => {
  try {
    const { path: kubeconfigPath } = req.body

    if (!kubeconfigPath) {
      return res.status(400).json({ error: 'Kubeconfig path is required' })
    }

    // Validate and switch to the new kubeconfig
    kubeConfig.setKubeconfigPath(kubeconfigPath)

    // Get contexts from the new kubeconfig to verify it's working
    const contexts = await kubeConfig.getContexts()

    res.json({
      success: true,
      message: `Switched to kubeconfig: ${kubeconfigPath}`,
      kubeconfigPath,
      contextCount: contexts.contexts.length,
      currentContext: contexts.currentContext
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.post('/api/kubeconfig/reset', (req, res) => {
  try {
    kubeConfig.resetToDefault()
    res.json({
      success: true,
      message: 'Reset to default kubeconfig',
      kubeconfigPath: kubeConfig.getCurrentKubeconfigPath()
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/kubeconfig/:kubeconfigPath/contexts', async (req, res) => {
  try {
    const { kubeconfigPath } = req.params
    const decodedPath = decodeURIComponent(kubeconfigPath)

    // Get contexts from a specific kubeconfig file without switching to it
    const contexts = await kubeConfig.getContexts(decodedPath)
    res.json(contexts)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/kubeconfig/upload', async (req, res) => {
  try {
    const { content, filename } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Kubeconfig content is required' })
    }

    // Validate the kubeconfig content
    try {
      yaml.parse(content)
    } catch (error) {
      return res.status(400).json({ error: 'Invalid YAML format' })
    }

    // Generate a safe filename
    const safeFilename = filename?.replace(/[^a-zA-Z0-9.-]/g, '_') || `uploaded-${Date.now()}.yaml`
    const uploadPath = path.join(os.homedir(), '.kube', `kubamf-${safeFilename}`)

    // Ensure .kube directory exists
    const kubeDir = path.join(os.homedir(), '.kube')
    if (!fs.existsSync(kubeDir)) {
      fs.mkdirSync(kubeDir, { recursive: true })
    }

    // Write the file
    fs.writeFileSync(uploadPath, content, 'utf8')

    // Validate by getting contexts
    const contexts = await kubeConfig.getContexts(uploadPath)

    res.json({
      success: true,
      message: 'Kubeconfig uploaded successfully',
      path: uploadPath,
      contextCount: contexts.contexts.length,
      contexts: contexts.contexts
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

app.post('/api/kubeconfig/validate', async (req, res) => {
  try {
    const { content } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Kubeconfig content is required' })
    }

    // Validate YAML format
    let kubeconfig
    try {
      kubeconfig = yaml.parse(content)
    } catch (error) {
      return res.status(400).json({
        valid: false,
        error: 'Invalid YAML format',
        details: error.message
      })
    }

    // Validate kubeconfig structure
    const validation = {
      valid: true,
      warnings: [],
      info: {
        contexts: kubeconfig.contexts?.length || 0,
        clusters: kubeconfig.clusters?.length || 0,
        users: kubeconfig.users?.length || 0,
        currentContext: kubeconfig['current-context'] || 'none'
      }
    }

    if (!kubeconfig.contexts || kubeconfig.contexts.length === 0) {
      validation.warnings.push('No contexts found in kubeconfig')
    }

    if (!kubeconfig.clusters || kubeconfig.clusters.length === 0) {
      validation.warnings.push('No clusters found in kubeconfig')
    }

    if (!kubeconfig.users || kubeconfig.users.length === 0) {
      validation.warnings.push('No users found in kubeconfig')
    }

    if (!kubeconfig['current-context']) {
      validation.warnings.push('No current-context set in kubeconfig')
    }

    res.json(validation)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Resource routes
app.get('/api/contexts/:context/resources/namespaces', async (req, res) => {
  try {
    const { context } = req.params
    const { stream } = req.query

    // If streaming is requested, use Server-Sent Events
    if (stream === 'true') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      })

      try {
        const result = await kubernetesService.getNamespaces(context)
        const items = result.items || []

        // Send namespaces in chunks to avoid timeout
        const chunkSize = 50
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize)
          const progress = Math.min(100, Math.round(((i + chunk.length) / items.length) * 100))

          res.write(`data: ${JSON.stringify({
            items: chunk,
            progress,
            done: false
          })}\n\n`)
        }

        // Send completion
        res.write('data: [DONE]\n\n')
        res.end()
      } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
        res.end()
      }
    } else {
      const result = await kubernetesService.getNamespaces(context)
      res.json(result)
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/contexts/:context/resources/pods', async (req, res) => {
  try {
    const { context } = req.params
    const { namespace } = req.query
    // If namespace is empty string or not provided, use 'all' for all namespaces
    const targetNamespace = namespace || 'all'
    const result = await kubernetesService.getPods(context, targetNamespace)
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/contexts/:context/resources/pods/:namespace/:podName/metrics', async (req, res) => {
  const { context, namespace, podName } = req.params
  try {
    const result = await kubernetesService.getPodMetrics(context, namespace, podName)
    res.json(result)
  } catch (error) {
    // Don't log errors for expected cases (pod not found, etc)
    if (!error.message?.includes('not found') && !error.message?.includes('NotFound')) {
      console.error(`Metrics API error for ${podName}:`, error.message || error)
    }
    // Return empty metrics if not available (metrics server might not be installed)
    res.json({ cpu: '-', memory: '-' })
  }
})

app.get('/api/contexts/:context/resources/pods/:namespace/:podName/containers', async (req, res) => {
  try {
    const { context, namespace, podName } = req.params

    // Log suspicious requests that might be for ReplicaSets
    if (podName && !podName.match(/-[a-z0-9]{5}$/)) {
      console.log(`Warning: Suspicious pod name format (might be ReplicaSet): ${podName}`)
    }

    // Use the SDK to get pod containers
    const result = await kubernetesService.getPodContainers(context, namespace, podName)
    res.json(result)
  } catch (error) {
    // Check if it's a not found error
    if (error.message?.includes('not found') || error.message?.includes('NotFound')) {
      console.log(`Pod not found: ${req.params.namespace}/${req.params.podName}`)
      res.status(404).json({ error: 'Pod not found', containers: [] })
    } else {
      console.error(`Error getting pod containers for ${req.params.podName}:`, error.message)
      res.status(500).json({ error: error.message })
    }
  }
})

app.get('/api/contexts/:context/resources/services', async (req, res) => {
  try {
    const { context } = req.params
    const { namespace } = req.query
    const result = await kubernetesService.getServices(context, namespace || 'all')
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/contexts/:context/resources/deployments', async (req, res) => {
  try {
    const { context } = req.params
    const { namespace } = req.query
    const result = await kubernetesService.getDeployments(context, namespace || 'all')
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/contexts/:context/resources/configmaps', async (req, res) => {
  try {
    const { context } = req.params
    const { namespace } = req.query
    const result = await kubernetesService.getConfigMaps(context, namespace || 'all')
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/contexts/:context/resources/secrets', async (req, res) => {
  try {
    const { context } = req.params
    const { namespace } = req.query
    const result = await kubernetesService.getSecrets(context, namespace || 'all')
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/contexts/:context/resources/nodes', async (req, res) => {
  try {
    const { context } = req.params
    const result = await kubernetesService.getNodes(context)
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/contexts/:context/resources/crds', async (req, res) => {
  try {
    const { context } = req.params
    const { stream } = req.query

    // If streaming is requested, use Server-Sent Events
    if (stream === 'true') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      })

      try {
        const result = await kubernetesService.getCRDs(context)
        const items = result.items || []

        // Send CRDs in chunks to avoid timeout
        const chunkSize = 20
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize)
          const progress = Math.min(100, Math.round(((i + chunk.length) / items.length) * 100))

          res.write(`data: ${JSON.stringify({
            items: chunk,
            progress,
            done: false
          })}\n\n`)
        }

        // Send completion
        res.write('data: [DONE]\n\n')
        res.end()
      } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
        res.end()
      }
    } else {
      const result = await kubernetesService.getCRDs(context)
      res.json(result)
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Generic resource route with streaming support
app.get('/api/contexts/:context/resources', async (req, res) => {
  try {
    const { context } = req.params
    const { resourceType, namespace, stream } = req.query

    // If streaming is requested, use Server-Sent Events
    if (stream === 'true') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      })

      try {
        // Check if it's a custom resource
        const crdsResponse = await kubernetesService.getCRDs(context)
        const crds = crdsResponse.items || []
        const matchingCrd = crds.find(crd => {
          const names = crd.spec?.names || {}
          return names.plural === resourceType || names.kind === resourceType
        })

        if (matchingCrd) {
          // Stream custom resource data
          for await (const batch of kubernetesService.getCustomResourcePaginated(context, matchingCrd, namespace || '')) {
            res.write(`data: ${JSON.stringify(batch)}\n\n`)
            if (batch.done) break
          }
        } else {
          // For built-in resources, check if paginated version exists
          let hasPaginated = false

          // Check for paginated methods
          if (resourceType === 'pods' || resourceType === 'Pods' || resourceType === 'Pod') {
            for await (const batch of kubernetesService.getPodsPaginated(context, namespace || '')) {
              res.write(`data: ${JSON.stringify(batch)}\n\n`)
              if (batch.done) break
            }
            hasPaginated = true
          }

          // Fallback to non-paginated for other resources
          if (!hasPaginated) {
            const result = await kubernetesService.getResource(context, resourceType, namespace || '')
            res.write(`data: ${JSON.stringify({ items: result.items, done: true })}\n\n`)
          }
        }

        res.write('data: [DONE]\n\n')
        res.end()
      } catch (error) {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
        res.end()
      }
    } else {
      // Non-streaming (backward compatible)
      const result = await kubernetesService.getResource(context, resourceType, namespace || '')
      res.json(result)
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Documentation endpoints
app.get('/api/docs/ui', (req, res) => {
  try {
    const docsPath = path.join(__dirname, '../../public/docs.json')
    if (require('fs').existsSync(docsPath)) {
      const docs = JSON.parse(require('fs').readFileSync(docsPath, 'utf8'))
      res.json(docs)
    } else {
      res.status(404).json({ error: 'Documentation not found. Please run npm run generate-docs' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
  const docs = {
    title: 'Kubamf API Documentation',
    version: '1.0.0',
    endpoints: [
      {
        path: '/api/health',
        method: 'GET',
        description: 'Health check endpoint',
        response: { status: 'healthy', uptime: 'number' }
      },
      {
        path: '/api/contexts',
        method: 'GET',
        description: 'Get all available Kubernetes contexts',
        response: { contexts: ['array of context names'], currentContext: 'string' }
      },
      {
        path: '/api/contexts/:context/resources/namespaces',
        method: 'GET',
        description: 'Get all namespaces in a context',
        params: { context: 'Kubernetes context name' },
        response: { items: ['array of namespace objects'] }
      },
      {
        path: '/api/contexts/:context/resources/pods',
        method: 'GET',
        description: 'Get pods in a context',
        params: { context: 'Kubernetes context name' },
        query: { namespace: 'Namespace name or "all" for all namespaces' },
        response: { items: ['array of pod objects'] }
      },
      {
        path: '/api/contexts/:context/resources',
        method: 'GET',
        description: 'Get generic resources',
        params: { context: 'Kubernetes context name' },
        query: {
          resourceType: 'Resource type (e.g., pods, services, deployments)',
          namespace: 'Namespace name or empty for all',
          stream: 'Set to "true" for Server-Sent Events streaming (for large datasets)'
        },
        response: { items: ['array of resource objects'] },
        streaming: {
          format: 'Server-Sent Events',
          messages: [
            { items: ['array of resources'], done: 'boolean', progress: 'number (0-100)' },
            '[DONE] - Final message'
          ]
        }
      },
      {
        path: '/api/contexts/:context/resources/pods/:namespace/:podName/metrics',
        method: 'GET',
        description: 'Get pod metrics (CPU and memory usage)',
        params: {
          context: 'Kubernetes context name',
          namespace: 'Namespace of the pod',
          podName: 'Name of the pod'
        },
        response: { cpu: 'string', memory: 'string' }
      },
      {
        path: '/api/contexts/:context/resources/pods/:namespace/:podName/containers',
        method: 'GET',
        description: 'Get containers in a pod',
        params: {
          context: 'Kubernetes context name',
          namespace: 'Namespace of the pod',
          podName: 'Name of the pod'
        },
        response: ['array of container objects']
      },
      {
        path: '/api/contexts/:context/resources/services',
        method: 'GET',
        description: 'Get services in a context',
        params: { context: 'Kubernetes context name' },
        query: { namespace: 'Namespace name or "all"' },
        response: { items: ['array of service objects'] }
      },
      {
        path: '/api/contexts/:context/resources/deployments',
        method: 'GET',
        description: 'Get deployments in a context',
        params: { context: 'Kubernetes context name' },
        query: { namespace: 'Namespace name or "all"' },
        response: { items: ['array of deployment objects'] }
      },
      {
        path: '/api/contexts/:context/resources/nodes',
        method: 'GET',
        description: 'Get nodes in a cluster',
        params: { context: 'Kubernetes context name' },
        response: { items: ['array of node objects'] }
      },
      {
        path: '/api/contexts/:context/resources/crds',
        method: 'GET',
        description: 'Get Custom Resource Definitions',
        params: { context: 'Kubernetes context name' },
        response: { items: ['array of CRD objects'] }
      },
      {
        path: '/api/contexts/:context/resources/logs/:namespace/:podName',
        method: 'GET',
        description: 'Get pod logs',
        params: {
          context: 'Kubernetes context name',
          namespace: 'Namespace of the pod',
          podName: 'Name of the pod'
        },
        query: { container: 'Container name (optional)' },
        response: { logs: 'string' }
      }
    ]
  }
  res.json(docs)
})

// Resource logs
app.get('/api/contexts/:context/resources/logs/:namespace/:podName', async (req, res) => {
  try {
    const { context, namespace, podName } = req.params
    const { container } = req.query
    const logs = await kubernetesService.getPodLogs(context, namespace, podName, container || '')
    res.json({ logs })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Remove finalizers from any resource
app.patch('/api/resources/:context/:kind/:namespace/:name/finalizers', async (req, res) => {
  try {
    const { context, kind, namespace, name } = req.params
    const apiVersion = req.query.apiVersion

    // Remove all finalizers
    const result = await kubernetesService.removeFinalizers(context, kind, name, namespace, apiVersion)

    res.json({
      success: true,
      message: `Successfully removed finalizers from ${kind}/${name}`,
      resource: result
    })
  } catch (error) {
    console.error('Error removing finalizers:', error)
    res.status(500).json({
      error: error.message || 'Failed to remove finalizers',
      details: error.toString()
    })
  }
})

// Trigger rolling restart for deployments/statefulsets/daemonsets/pods
app.post('/api/resources/:context/:kind/:namespace/:name/restart', async (req, res) => {
  try {
    const { context, kind, namespace, name } = req.params

    // Validate resource kind
    const validKinds = ['Deployment', 'StatefulSet', 'DaemonSet', 'Pod']
    if (!validKinds.includes(kind)) {
      return res.status(400).json({
        error: `Rolling restart is only supported for ${validKinds.join(', ')}`
      })
    }

    const result = await kubernetesService.rollingRestart(context, kind, name, namespace)

    res.json({
      success: true,
      message: `Successfully triggered rolling restart for ${kind}/${name}`,
      resource: result
    })
  } catch (error) {
    console.error('Error triggering rolling restart:', error)
    res.status(500).json({
      error: error.message || 'Failed to trigger rolling restart',
      details: error.toString()
    })
  }
})

// Create a new resource
app.post('/api/resources/:context/create', async (req, res) => {
  try {
    const { context } = req.params
    const resourceData = req.body

    if (!resourceData || !resourceData.apiVersion || !resourceData.kind) {
      return res.status(400).json({ error: 'Resource must include apiVersion and kind' })
    }

    const result = await kubernetesService.createResource(context, resourceData)
    res.json({ success: true, resource: result })
  } catch (error) {
    console.error('Create resource error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update a specific resource
app.put('/api/resources/:context/:kind/:namespace/:name', async (req, res) => {
  try {
    const { context, kind, namespace, name } = req.params
    const updatedResource = req.body

    // Validate required parameters
    if (!context || !kind || !namespace || !name) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    const result = await kubernetesService.updateResource(context, kind, name, namespace, updatedResource)
    res.json(result)
  } catch (error) {
    console.error('Update resource error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete a specific resource
app.delete('/api/resources/:context/:kind/:namespace?/:name', async (req, res) => {
  try {
    const { context, kind, namespace, name } = req.params

    // Validate required parameters
    if (!context || !kind || !name) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    // Use kubernetesService to delete the resource
    const apiVersion = req.query.apiVersion
    await kubernetesService.deleteResource(context, kind, name, namespace, apiVersion)

    res.json({
      success: true,
      message: `Successfully deleted ${kind}/${name}`,
      resource: {
        kind,
        name,
        namespace: namespace || 'cluster'
      }
    })
  } catch (error) {
    console.error('Error deleting resource:', error)
    res.status(500).json({
      error: error.message || 'Failed to delete resource',
      details: error.stderr || error.toString()
    })
  }
})

// Frontend health checks (no auth required)
app.get('/health/frontend', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'frontend',
    timestamp: new Date().toISOString(),
    server: 'express'
  })
})

app.get('/health/frontend/ready', (req, res) => {
  // Check if frontend files exist
  const frontendPath = path.join(__dirname, '../frontend/index.html')
  if (process.env.NODE_ENV === 'production' && !require('fs').existsSync(frontendPath)) {
    return res.status(503).json({
      ready: false,
      service: 'frontend',
      reason: 'Frontend files not found',
      timestamp: new Date().toISOString()
    })
  }

  res.json({
    ready: true,
    service: 'frontend',
    timestamp: new Date().toISOString()
  })
})

// Server-Sent Events endpoint for real-time updates
app.get('/api/events', (req, res) => {
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  })

  // Send initial connection event
  res.write('data: {"type":"connection","payload":{"status":"connected"}}\n\n')
  if (typeof res.flush === 'function') res.flush()

  // Set up periodic heartbeat
  const heartbeat = setInterval(() => {
    res.write('data: {"type":"ping","payload":{"timestamp":"' + new Date().toISOString() + '"}}\n\n')
    if (typeof res.flush === 'function') res.flush()
  }, 30000) // Send ping every 30 seconds

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat)
    console.log('SSE client disconnected')
  })

  req.on('error', (err) => {
    console.error('SSE client error:', err)
    clearInterval(heartbeat)
  })

  // Store connection for later use (for broadcasting events)
  if (!global.sseConnections) {
    global.sseConnections = new Set()
  }
  global.sseConnections.add(res)

  // Remove connection when it closes
  req.on('close', () => {
    global.sseConnections.delete(res)
  })
})

// Utility function to broadcast SSE events
function broadcastSSEEvent(eventType, data) {
  if (!global.sseConnections || global.sseConnections.size === 0) {
    return
  }

  const eventData = JSON.stringify({ type: eventType, payload: data, timestamp: new Date().toISOString() })
  const message = `event: ${eventType}\ndata: ${eventData}\n\n`

  // Send to all connected clients
  global.sseConnections.forEach(res => {
    try {
      res.write(message)
      if (typeof res.flush === 'function') res.flush()
    } catch (error) {
      console.error('Error sending SSE event:', error)
      global.sseConnections.delete(res)
    }
  })
}

// Serve React app in production (catch-all route)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res, next) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/health/')) {
      return next()
    }

    // Set security headers for the main app
    res.setHeader('X-Frame-Options', process.env.FRAME_OPTIONS || 'SAMEORIGIN')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

    // Content Security Policy for frontend
    if (process.env.CSP_ENABLED === 'true') {
      const csp = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none';"
      res.setHeader('Content-Security-Policy', csp)
    }

    res.sendFile(path.join(__dirname, '../frontend/index.html'))
  })
}

// Start server function for Electron
const startServer = () => {
  const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'
  const server = app.listen(PORT, host, () => {
    console.log(`Backend server running on http://${host}:${PORT}`)
    console.log(`Health check: http://${host}:${PORT}/health`)
    console.log(`API documentation: http://${host}:${PORT}/api`)
  })

  // Set up WebSocket server for exec
  const WebSocket = require('ws')
  const wss = new WebSocket.Server({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname

    if (pathname === '/api/exec/stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // In BAMF mode, extract identity from proxy headers and wrap in
        // AsyncLocalStorage so handleExecWebSocket can use impersonation.
        // The upgrade event bypasses Express middleware, so we replicate
        // the auth + context setup that /api routes get automatically.
        if (config.get('auth.bamf.enabled')) {
          const email = request.headers['x-forwarded-email']
          if (!email) {
            ws.close(1008, 'No identity header from bamf proxy')
            return
          }
          const { requestContext } = require('./request-context')
          const ctx = {
            user: {
              id: email,
              email,
              username: request.headers['x-forwarded-user'] || email,
              roles: (request.headers['x-forwarded-roles'] || '').split(',').filter(Boolean),
              groups: (request.headers['x-forwarded-groups'] || '').split(',').filter(Boolean),
              provider: 'bamf',
              authenticatedAt: new Date().toISOString()
            },
            sessionToken: request.headers['x-bamf-session-token'] || null
          }
          requestContext.run(ctx, () => {
            execRoutes.handleExecWebSocket(ws, request)
          })
        } else {
          execRoutes.handleExecWebSocket(ws, request)
        }
      })
    } else {
      socket.destroy()
    }
  })

  // Graceful shutdown handling
  const gracefulShutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`)

    // Stop accepting new connections
    server.close((err) => {
      if (err) {
        console.error('❌ Error during server shutdown:', err)
        process.exit(1)
      }

      console.log('✅ HTTP server closed')

      // Stop health checker periodic checks
      if (healthChecker) {
        console.log('🏥 Stopping health checks...')
      }

      // Give time for existing requests to complete
      setTimeout(() => {
        console.log('✅ Graceful shutdown completed')
        process.exit(0)
      }, 5000) // 5 second grace period
    })

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout')
      process.exit(1)
    }, 30000)
  }

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error)
    gracefulShutdown('uncaughtException')
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
    gracefulShutdown('unhandledRejection')
  })

  return server
}

// Export for Electron
if (require.main === module) {
  // Direct execution (development)
  startServer()
} else {
  // Required as module (Electron production)
  module.exports = { startServer, app }
}