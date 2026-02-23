const cors = require('cors')
const compression = require('compression')
const morgan = require('morgan')
const config = require('./config')

const getSecurityConfig = () => config.get('security')

// Setup security middleware
const setupSecurity = (app) => {
  const securityConfig = getSecurityConfig()
  const loggingConfig = config.get('logging')
  const compressionConfig = config.get('compression')

  // Trust proxy if configured (bamf reverse proxy)
  if (securityConfig.tls.trustProxy) {
    app.set('trust proxy', true)
  }

  // Logging
  if (loggingConfig.enabled) {
    app.use(morgan(loggingConfig.format))
  }

  // Compression (skip SSE endpoints to avoid buffering)
  if (compressionConfig.enabled) {
    app.use(compression({
      filter: (req, res) => {
        if (req.headers.accept === 'text/event-stream') {
          return false
        }
        return compression.filter(req, res)
      }
    }))
  }

  // CORS (needed for Vite dev proxy in development)
  if (securityConfig.cors.enabled) {
    const corsOptions = {
      origin: securityConfig.cors.origins.includes('*')
        ? true
        : securityConfig.cors.origins,
      credentials: securityConfig.cors.credentials,
      methods: securityConfig.cors.methods,
      allowedHeaders: securityConfig.cors.allowedHeaders,
      optionsSuccessStatus: 200
    }
    app.use(cors(corsOptions))
  }

  return securityConfig
}

// Validate security configuration
const validateSecurityConfig = () => {
  const config = getSecurityConfig()
  const warnings = []
  const errors = []

  if (config.cors.enabled && !config.cors.origins.length) {
    errors.push('CORS is enabled but no origins are configured')
  }

  return { warnings, errors, config }
}

module.exports = {
  setupSecurity,
  validateSecurityConfig,
  getSecurityConfig
}
