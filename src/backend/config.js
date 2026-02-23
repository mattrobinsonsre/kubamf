const fs = require('fs')
const path = require('path')
const yaml = require('yaml')

class ConfigManager {
  constructor() {
    this.config = null
    this.loadConfig()
  }

  loadConfig() {
    // Default configuration
    const defaultConfig = {
      server: {
        port: 3001,
        nodeEnv: 'development',
        host: 'localhost'
      },
      security: {
        cors: {
          enabled: true,
          origins: ['*'],
          credentials: true,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: [
            'Origin',
            'X-Requested-With',
            'Content-Type',
            'Accept',
            'Authorization'
          ]
        },
        tls: {
          enabled: false,
          trustProxy: false
        }
      },
      limits: {
        json: '1mb',
        urlEncoded: '1mb'
      },
      healthCheck: {
        enabled: true,
        interval: 30000,
        timeout: 10000,
        memoryThreshold: 512
      },
      logging: {
        enabled: true,
        format: 'combined',
        level: 'info'
      },
      compression: {
        enabled: true
      },
      kubeconfig: {
        path: '',
        contexts: [],
        autoDetect: true
      },
      frontend: {
        enabled: true
      },
      auth: {
        provider: 'none', // 'none' (Electron/desktop) or 'bamf' (behind bamf proxy)
        none: {
          enabled: true
        },
        bamf: {
          enabled: false,
          trustHeaders: [
            'x-forwarded-email',
            'x-forwarded-user',
            'x-forwarded-roles',
            'x-forwarded-groups'
          ]
        }
      }
    }

    let config = defaultConfig

    // Load config file if it exists
    const configPaths = [
      process.env.CONFIG_FILE,
      '/app/config/kubamf.yaml',
      '/app/config/kubamf.yml',
      path.join(__dirname, '../config/kubamf.yaml'),
      path.join(__dirname, '../config/kubamf.yml'),
      path.join(process.cwd(), 'config/kubamf.yaml'),
      path.join(process.cwd(), 'config/kubamf.yml'),
      path.join(process.cwd(), 'kubamf.yaml'),
      path.join(process.cwd(), 'kubamf.yml')
    ].filter(Boolean)

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const fileContent = fs.readFileSync(configPath, 'utf8')
          const fileConfig = yaml.parse(fileContent)
          config = this.mergeConfig(config, fileConfig)
          console.log(`✅ Loaded configuration from: ${configPath}`)
          break
        } catch (error) {
          console.warn(`⚠️  Failed to load config from ${configPath}:`, error.message)
        }
      }
    }

    // Apply environment variable overrides
    config = this.applyEnvOverrides(config)

    // Validate configuration
    this.validateConfig(config)

    this.config = config
  }

  mergeConfig(base, override) {
    const result = { ...base }

    for (const key in override) {
      if (override[key] !== null && typeof override[key] === 'object' && !Array.isArray(override[key])) {
        result[key] = this.mergeConfig(base[key] || {}, override[key])
      } else {
        result[key] = override[key]
      }
    }

    return result
  }

  applyEnvOverrides(config) {
    const envMappings = {
      // Server
      'NODE_ENV': 'server.nodeEnv',
      'PORT': 'server.port',
      'HOST': 'server.host',

      // CORS (needed for Vite dev proxy)
      'CORS_ENABLED': 'security.cors.enabled',
      'CORS_ORIGINS': 'security.cors.origins',

      // TLS
      'TLS_ENABLED': 'security.tls.enabled',
      'TRUST_PROXY': 'security.tls.trustProxy',

      // Limits
      'JSON_LIMIT': 'limits.json',
      'URL_ENCODED_LIMIT': 'limits.urlEncoded',

      // Health Check
      'HEALTH_CHECK_ENABLED': 'healthCheck.enabled',
      'HEALTH_CHECK_INTERVAL': 'healthCheck.interval',
      'HEALTH_CHECK_TIMEOUT': 'healthCheck.timeout',
      'MEMORY_THRESHOLD_MB': 'healthCheck.memoryThreshold',

      // Logging
      'LOGGING_ENABLED': 'logging.enabled',
      'LOG_FORMAT': 'logging.format',
      'LOG_LEVEL': 'logging.level',

      // Compression
      'COMPRESSION_ENABLED': 'compression.enabled',

      // Kubeconfig
      'KUBECONFIG': 'kubeconfig.path',

      // Authentication
      'AUTH_PROVIDER': 'auth.provider',

      // Bamf auth
      'BAMF_ENABLED': 'auth.bamf.enabled',

      // Frontend
      'FRONTEND_ENABLED': 'frontend.enabled'
    }

    const result = JSON.parse(JSON.stringify(config))

    for (const [envKey, configPath] of Object.entries(envMappings)) {
      const envValue = process.env[envKey]
      if (envValue !== undefined) {
        this.setNestedValue(result, configPath, this.parseEnvValue(envValue))
      }
    }

    // Handle special cases for arrays from env vars
    if (process.env.CORS_ORIGINS !== undefined) {
      result.security.cors.origins = process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    }

    return result
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.')
    let current = obj

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {}
      }
      current = current[keys[i]]
    }

    current[keys[keys.length - 1]] = value
  }

  parseEnvValue(value) {
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^\d+$/.test(value)) return parseInt(value, 10)
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value)
    return value
  }

  validateConfig(config) {
    const errors = []
    const warnings = []

    // Validate port
    if (config.server.port < 1 || config.server.port > 65535) {
      errors.push('Server port must be between 1 and 65535')
    }

    if (errors.length > 0) {
      console.error('Configuration errors:')
      errors.forEach(error => console.error(`  ❌ ${error}`))
      process.exit(1)
    }

    if (warnings.length > 0) {
      console.warn('Configuration warnings:')
      warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`))
    }
  }

  get(path) {
    if (!path) return this.config

    const keys = path.split('.')
    let current = this.config

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key]
      } else {
        return undefined
      }
    }

    return current
  }

  getConfig() {
    return this.config
  }

  reload() {
    this.loadConfig()
  }
}

// Export singleton instance
const configManager = new ConfigManager()

module.exports = configManager
