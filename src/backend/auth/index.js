/**
 * Authentication Framework
 * Two modes: 'none' (Electron desktop) or 'bamf' (behind bamf proxy)
 */

const NoAuthProvider = require('./providers/noauth')
const BamfAuthProvider = require('./providers/bamf')

class AuthManager {
  constructor(config) {
    this.config = config
    this.providers = new Map()
    this.setupProviders()
  }

  setupProviders() {
    const authConfig = this.config.get('auth') || {}

    // Always register the no-auth provider (Electron / desktop)
    this.providers.set('none', new NoAuthProvider(authConfig.none || {}))

    // Register bamf proxy auth if enabled
    if (authConfig.bamf?.enabled) {
      this.providers.set('bamf', new BamfAuthProvider(authConfig.bamf))
    }

    // Determine primary provider
    this.primaryProvider = authConfig.provider || 'none'

    if (!this.providers.has(this.primaryProvider)) {
      console.warn(`Auth provider '${this.primaryProvider}' not found, falling back to 'none'`)
      this.primaryProvider = 'none'
    }

    console.log(`🔐 Authentication: ${this.primaryProvider}`)
  }

  getPrimaryProvider() {
    return this.providers.get(this.primaryProvider)
  }

  getProvider(name) {
    return this.providers.get(name)
  }

  isAuthEnabled() {
    return this.primaryProvider !== 'none'
  }

  // Middleware factory for Express
  middleware() {
    const provider = this.getPrimaryProvider()
    return provider.middleware()
  }

  // Authentication routes setup
  setupRoutes(app) {
    const authRouter = require('express').Router()

    // Auth info endpoint
    authRouter.get('/info', (req, res) => {
      const provider = this.getPrimaryProvider()
      res.json({
        provider: this.primaryProvider,
        enabled: this.isAuthEnabled(),
        config: provider.getPublicConfig(),
        endpoints: provider.getEndpoints(),
        user: req.user || null
      })
    })

    // Provider-specific routes
    for (const [name, provider] of this.providers) {
      if (provider.setupRoutes) {
        const providerRouter = require('express').Router()
        provider.setupRoutes(providerRouter)
        authRouter.use(`/${name}`, providerRouter)
      }
    }

    app.use('/auth', authRouter)
  }

  // Validate authentication configuration
  validateConfig() {
    const errors = []
    const warnings = []

    const provider = this.providers.get(this.primaryProvider)
    if (provider && provider.validateConfig) {
      const validation = provider.validateConfig()
      errors.push(...validation.errors)
      warnings.push(...validation.warnings)
    }

    return { errors, warnings }
  }
}

module.exports = AuthManager
