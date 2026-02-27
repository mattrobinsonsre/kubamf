const os = require('os')

// Mock dependencies
jest.mock('fs')
jest.mock('os')
jest.mock('yaml', () => ({
  parse: jest.fn()
}))

describe('ConfigManager', () => {
  let ConfigManager
  let fs
  let yaml

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset Jest module registry so require('./config') creates a fresh singleton
    jest.resetModules()

    // Re-acquire mock references after module reset
    fs = require('fs')
    yaml = require('yaml')

    // Setup default mocks
    os.homedir.mockReturnValue('/home/test')
    fs.existsSync.mockReturnValue(false)

    // Clear environment variables used by any test
    delete process.env.NODE_ENV
    delete process.env.PORT
    delete process.env.HOST
    delete process.env.CONFIG_FILE
    delete process.env.CORS_ENABLED
    delete process.env.CORS_ORIGINS
    delete process.env.TLS_ENABLED
    delete process.env.TRUST_PROXY
    delete process.env.AUTH_PROVIDER
    delete process.env.BAMF_ENABLED
    delete process.env.KUBECONFIG
    delete process.env.FRONTEND_ENABLED
    delete process.env.COMPRESSION_ENABLED
    delete process.env.LOGGING_ENABLED
    delete process.env.LOG_FORMAT
    delete process.env.LOG_LEVEL
    delete process.env.HEALTH_CHECK_ENABLED
    delete process.env.HEALTH_CHECK_INTERVAL
    delete process.env.HEALTH_CHECK_TIMEOUT
    delete process.env.MEMORY_THRESHOLD_MB
    delete process.env.JSON_LIMIT
    delete process.env.URL_ENCODED_LIMIT
  })

  describe('Default Configuration', () => {
    test('should load default configuration when no config file exists', () => {
      ConfigManager = require('./config')

      const config = ConfigManager.getConfig()

      expect(config.server.port).toBe(3001)
      expect(config.server.nodeEnv).toBe('development')
      expect(config.security.cors.enabled).toBe(true)
      expect(config.healthCheck.enabled).toBe(true)
    })

    test('should have correct default auth configuration', () => {
      ConfigManager = require('./config')

      const config = ConfigManager.getConfig()

      expect(config.auth.provider).toBe('none')
      expect(config.auth.none.enabled).toBe(true)
      expect(config.auth.bamf.enabled).toBe(false)
    })

    test('should have correct default security configuration', () => {
      ConfigManager = require('./config')

      const config = ConfigManager.getConfig()

      expect(config.security.cors.origins).toEqual(['*'])
      expect(config.security.cors.credentials).toBe(true)
      expect(config.security.tls.enabled).toBe(false)
      expect(config.security.tls.trustProxy).toBe(false)
    })

    test('should validate configuration on load', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ConfigManager = require('./config')

      expect(ConfigManager.getConfig()).toBeDefined()
      consoleSpy.mockRestore()
    })
  })

  describe('Configuration File Loading', () => {
    test('should load configuration from YAML file when it exists', () => {
      const mockConfig = {
        server: { port: 8080, nodeEnv: 'test' },
        security: { cors: { enabled: true } }
      }

      fs.existsSync.mockReturnValue(true)
      fs.readFileSync.mockReturnValue('mock yaml content')
      yaml.parse.mockReturnValue(mockConfig)

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ConfigManager = require('./config')

      const config = ConfigManager.getConfig()
      expect(config.server.port).toBe(8080)
      expect(config.server.nodeEnv).toBe('test')
      expect(config.security.cors.enabled).toBe(true)

      consoleSpy.mockRestore()
    })

    test('should handle YAML parsing errors gracefully', () => {
      fs.existsSync.mockReturnValue(true)
      fs.readFileSync.mockReturnValue('invalid yaml')
      yaml.parse.mockImplementation(() => {
        throw new Error('Invalid YAML')
      })

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      ConfigManager = require('./config')

      // Should fall back to default configuration
      const config = ConfigManager.getConfig()
      expect(config.server.port).toBe(3001)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to load config/),
        'Invalid YAML'
      )

      consoleSpy.mockRestore()
    })

    test('should load from custom config file path', () => {
      process.env.CONFIG_FILE = '/custom/config.yaml'

      fs.existsSync.mockImplementation((p) => {
        return p === '/custom/config.yaml'
      })
      fs.readFileSync.mockReturnValue('custom: config')
      yaml.parse.mockReturnValue({ server: { port: 9000 } })

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ConfigManager = require('./config')

      const config = ConfigManager.getConfig()
      expect(config.server.port).toBe(9000)

      consoleSpy.mockRestore()
    })
  })

  describe('Environment Variable Overrides', () => {
    test('should override server config with environment variables', () => {
      process.env.NODE_ENV = 'production'
      process.env.PORT = '4000'

      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.server.nodeEnv).toBe('production')
      expect(config.server.port).toBe(4000)
    })

    test('should override CORS config with environment variables', () => {
      process.env.CORS_ENABLED = 'true'
      process.env.CORS_ORIGINS = 'https://app.com,https://staging.com'

      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.security.cors.enabled).toBe(true)
      expect(config.security.cors.origins).toEqual(['https://app.com', 'https://staging.com'])
    })

    test('should override BAMF config with environment variables', () => {
      process.env.BAMF_ENABLED = 'true'

      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.auth.bamf.enabled).toBe(true)
    })

    test('should override AUTH_PROVIDER with environment variable', () => {
      process.env.AUTH_PROVIDER = 'bamf'

      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.auth.provider).toBe('bamf')
    })

    test('should parse boolean environment variables correctly', () => {
      process.env.TLS_ENABLED = 'true'
      process.env.CORS_ENABLED = 'false'

      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.security.tls.enabled).toBe(true)
      expect(config.security.cors.enabled).toBe(false)
    })

    test('should parse numeric environment variables correctly', () => {
      process.env.PORT = '5000'

      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.server.port).toBe(5000)
    })

    test('should handle CORS_ORIGINS as comma-separated list', () => {
      process.env.CORS_ORIGINS = 'https://a.com, https://b.com, https://c.com'

      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.security.cors.origins).toEqual([
        'https://a.com',
        'https://b.com',
        'https://c.com'
      ])
    })

    test('should filter empty strings from CORS_ORIGINS', () => {
      process.env.CORS_ORIGINS = ''

      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.security.cors.origins).toEqual([])
    })
  })

  describe('Configuration Validation', () => {
    test('should exit with error for invalid port', () => {
      process.env.PORT = '70000'

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {})
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      ConfigManager = require('./config')

      expect(mockExit).toHaveBeenCalledWith(1)
      expect(consoleSpy).toHaveBeenCalledWith('Configuration errors:')

      mockExit.mockRestore()
      consoleSpy.mockRestore()
    })

    test('should exit with error for port below 1', () => {
      process.env.PORT = '0'

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {})
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      ConfigManager = require('./config')

      expect(mockExit).toHaveBeenCalledWith(1)

      mockExit.mockRestore()
      consoleSpy.mockRestore()
    })

    test('should not exit for valid port', () => {
      process.env.PORT = '8080'

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {})

      ConfigManager = require('./config')

      expect(mockExit).not.toHaveBeenCalled()

      mockExit.mockRestore()
    })
  })

  describe('Configuration Access', () => {
    test('should get nested configuration values', () => {
      ConfigManager = require('./config')

      expect(ConfigManager.get('server.port')).toBe(3001)
      expect(ConfigManager.get('security.cors.enabled')).toBe(true)
      expect(ConfigManager.get('nonexistent.path')).toBeUndefined()
    })

    test('should return full config when no path provided', () => {
      ConfigManager = require('./config')

      const fullConfig = ConfigManager.get()
      expect(fullConfig).toHaveProperty('server')
      expect(fullConfig).toHaveProperty('security')
      expect(fullConfig).toHaveProperty('healthCheck')
      expect(fullConfig).toHaveProperty('auth')
    })

    test('should reload configuration', () => {
      ConfigManager = require('./config')
      ConfigManager.get('server.port')

      process.env.PORT = '6000'
      ConfigManager.reload()

      expect(ConfigManager.get('server.port')).toBe(6000)
    })
  })

  describe('Configuration Merging', () => {
    test('should merge nested configuration objects correctly', () => {
      const mockFileConfig = {
        server: { port: 8080 },
        security: {
          cors: { enabled: true, origins: ['https://example.com'] },
          tls: { enabled: true }
        }
      }

      fs.existsSync.mockReturnValue(true)
      fs.readFileSync.mockReturnValue('mock content')
      yaml.parse.mockReturnValue(mockFileConfig)

      process.env.CORS_ORIGINS = 'https://override.com'

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.server.port).toBe(8080) // From file
      expect(config.security.cors.enabled).toBe(true) // From file
      expect(config.security.cors.origins).toEqual(['https://override.com']) // From env
      expect(config.security.tls.enabled).toBe(true) // From file
      expect(config.healthCheck.enabled).toBe(true) // From defaults

      consoleSpy.mockRestore()
    })

    test('should preserve default auth config when file does not override it', () => {
      const mockFileConfig = {
        server: { port: 8080 }
      }

      fs.existsSync.mockReturnValue(true)
      fs.readFileSync.mockReturnValue('mock content')
      yaml.parse.mockReturnValue(mockFileConfig)

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      ConfigManager = require('./config')
      const config = ConfigManager.getConfig()

      expect(config.auth.provider).toBe('none')
      expect(config.auth.bamf.enabled).toBe(false)

      consoleSpy.mockRestore()
    })
  })
})
