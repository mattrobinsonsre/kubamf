const express = require('express')
const request = require('supertest')
const { setupSecurity, validateSecurityConfig, getSecurityConfig } = require('./security')

// Mock config module
jest.mock('./config', () => ({
  get: jest.fn()
}))

const config = require('./config')

describe('Security Module', () => {
  let app

  beforeEach(() => {
    jest.clearAllMocks()
    app = express()

    // Default mock config
    config.get.mockImplementation((path) => {
      const fullConfig = {
        security: {
          cors: {
            enabled: false,
            origins: ['http://localhost:3001'],
            credentials: false,
            methods: ['GET', 'POST'],
            allowedHeaders: ['Content-Type']
          },
          tls: {
            enabled: false,
            trustProxy: false
          }
        },
        logging: {
          enabled: false,
          format: 'combined'
        },
        compression: {
          enabled: false
        }
      }

      if (!path) return fullConfig
      if (path === 'security') return fullConfig.security
      if (path === 'logging') return fullConfig.logging
      if (path === 'compression') return fullConfig.compression
      return undefined
    })
  })

  describe('setupSecurity', () => {
    test('should return security config object', () => {
      const securityConfig = setupSecurity(app)

      expect(securityConfig).toBeDefined()
      expect(securityConfig.cors.enabled).toBe(false)
      expect(securityConfig.tls.enabled).toBe(false)
    })

    test('should setup CORS when enabled', () => {
      config.get.mockImplementation((path) => {
        const fullConfig = {
          security: {
            cors: {
              enabled: true,
              origins: ['https://example.com'],
              credentials: true,
              methods: ['GET', 'POST'],
              allowedHeaders: ['Content-Type', 'Authorization']
            },
            tls: { enabled: false, trustProxy: false }
          },
          logging: { enabled: false },
          compression: { enabled: false }
        }
        if (!path) return fullConfig
        if (path === 'security') return fullConfig.security
        if (path === 'logging') return fullConfig.logging
        if (path === 'compression') return fullConfig.compression
        return undefined
      })

      const middlewareStack = []
      app.use = jest.fn((middleware) => {
        middlewareStack.push(middleware)
      })
      app.set = jest.fn()

      setupSecurity(app)

      expect(app.use).toHaveBeenCalled()
      expect(middlewareStack.length).toBeGreaterThan(0)
    })

    test('should setup compression when enabled', () => {
      config.get.mockImplementation((path) => {
        const fullConfig = {
          security: {
            cors: { enabled: false, origins: ['*'], credentials: false, methods: ['GET'], allowedHeaders: [] },
            tls: { enabled: false, trustProxy: false }
          },
          logging: { enabled: false },
          compression: { enabled: true }
        }
        if (!path) return fullConfig
        if (path === 'security') return fullConfig.security
        if (path === 'logging') return fullConfig.logging
        if (path === 'compression') return fullConfig.compression
        return undefined
      })

      const middlewareStack = []
      app.use = jest.fn((middleware) => {
        middlewareStack.push(middleware)
      })
      app.set = jest.fn()

      setupSecurity(app)

      // compression middleware should have been added
      expect(app.use).toHaveBeenCalled()
      expect(middlewareStack.length).toBeGreaterThan(0)
    })

    test('should set trust proxy when configured', () => {
      config.get.mockImplementation((path) => {
        const fullConfig = {
          security: {
            cors: { enabled: false, origins: ['*'], credentials: false, methods: ['GET'], allowedHeaders: [] },
            tls: { enabled: false, trustProxy: true }
          },
          logging: { enabled: false },
          compression: { enabled: false }
        }
        if (!path) return fullConfig
        if (path === 'security') return fullConfig.security
        if (path === 'logging') return fullConfig.logging
        if (path === 'compression') return fullConfig.compression
        return undefined
      })

      app.set = jest.fn()

      setupSecurity(app)

      expect(app.set).toHaveBeenCalledWith('trust proxy', true)
    })

    test('should not set trust proxy when not configured', () => {
      app.set = jest.fn()

      setupSecurity(app)

      expect(app.set).not.toHaveBeenCalledWith('trust proxy', true)
    })

    test('should setup logging when enabled', () => {
      config.get.mockImplementation((path) => {
        const fullConfig = {
          security: {
            cors: { enabled: false, origins: ['*'], credentials: false, methods: ['GET'], allowedHeaders: [] },
            tls: { enabled: false, trustProxy: false }
          },
          logging: { enabled: true, format: 'combined' },
          compression: { enabled: false }
        }
        if (!path) return fullConfig
        if (path === 'security') return fullConfig.security
        if (path === 'logging') return fullConfig.logging
        if (path === 'compression') return fullConfig.compression
        return undefined
      })

      const middlewareStack = []
      app.use = jest.fn((middleware) => {
        middlewareStack.push(middleware)
      })
      app.set = jest.fn()

      setupSecurity(app)

      expect(app.use).toHaveBeenCalled()
      expect(middlewareStack.length).toBeGreaterThan(0)
    })
  })

  describe('validateSecurityConfig', () => {
    test('should return no errors for valid configuration', () => {
      config.get.mockImplementation((path) => {
        if (path === 'security') {
          return {
            cors: { enabled: true, origins: ['https://example.com'] },
            tls: { enabled: false, trustProxy: false }
          }
        }
        return undefined
      })

      const result = validateSecurityConfig()

      expect(result.errors).toEqual([])
      expect(result.warnings).toEqual([])
    })

    test('should error on empty CORS origins when CORS is enabled', () => {
      config.get.mockImplementation((path) => {
        if (path === 'security') {
          return {
            cors: { enabled: true, origins: [] },
            tls: { enabled: false, trustProxy: false }
          }
        }
        return undefined
      })

      const result = validateSecurityConfig()

      expect(result.errors).toContain('CORS is enabled but no origins are configured')
    })

    test('should return no errors when CORS is disabled', () => {
      config.get.mockImplementation((path) => {
        if (path === 'security') {
          return {
            cors: { enabled: false, origins: [] },
            tls: { enabled: false, trustProxy: false }
          }
        }
        return undefined
      })

      const result = validateSecurityConfig()

      expect(result.errors).toEqual([])
    })

    test('should include config in return value', () => {
      config.get.mockImplementation((path) => {
        if (path === 'security') {
          return {
            cors: { enabled: false, origins: [] },
            tls: { enabled: false, trustProxy: false }
          }
        }
        return undefined
      })

      const result = validateSecurityConfig()

      expect(result.config).toBeDefined()
      expect(result.config.cors).toBeDefined()
    })
  })

  describe('getSecurityConfig', () => {
    test('should return the security config from config manager', () => {
      const mockSecurityConfig = {
        cors: { enabled: true, origins: ['https://app.com'] },
        tls: { enabled: false, trustProxy: false }
      }

      config.get.mockImplementation((path) => {
        if (path === 'security') return mockSecurityConfig
        return undefined
      })

      const result = getSecurityConfig()

      expect(result).toEqual(mockSecurityConfig)
      expect(config.get).toHaveBeenCalledWith('security')
    })
  })

  describe('Integration Tests', () => {
    test('should handle request through security middleware stack', async () => {
      config.get.mockImplementation((path) => {
        const fullConfig = {
          security: {
            cors: { enabled: false, origins: [], credentials: false, methods: [], allowedHeaders: [] },
            tls: { enabled: false, trustProxy: false }
          },
          logging: { enabled: false },
          compression: { enabled: false }
        }
        if (!path) return fullConfig
        if (path === 'security') return fullConfig.security
        if (path === 'logging') return fullConfig.logging
        if (path === 'compression') return fullConfig.compression
        return undefined
      })

      setupSecurity(app)

      app.get('/test', (req, res) => {
        res.json({ message: 'success' })
      })

      const response = await request(app)
        .get('/test')
        .expect(200)

      expect(response.body.message).toBe('success')
    })

    test('should apply CORS headers when enabled', async () => {
      config.get.mockImplementation((path) => {
        const fullConfig = {
          security: {
            cors: {
              enabled: true,
              origins: ['https://example.com'],
              credentials: true,
              methods: ['GET', 'POST'],
              allowedHeaders: ['Content-Type']
            },
            tls: { enabled: false, trustProxy: false }
          },
          logging: { enabled: false },
          compression: { enabled: false }
        }
        if (!path) return fullConfig
        if (path === 'security') return fullConfig.security
        if (path === 'logging') return fullConfig.logging
        if (path === 'compression') return fullConfig.compression
        return undefined
      })

      setupSecurity(app)

      app.get('/test', (req, res) => {
        res.json({ message: 'success' })
      })

      const response = await request(app)
        .get('/test')
        .set('Origin', 'https://example.com')
        .expect(200)

      expect(response.headers['access-control-allow-origin']).toBe('https://example.com')
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    test('should apply compression when enabled', async () => {
      config.get.mockImplementation((path) => {
        const fullConfig = {
          security: {
            cors: { enabled: false, origins: [], credentials: false, methods: [], allowedHeaders: [] },
            tls: { enabled: false, trustProxy: false }
          },
          logging: { enabled: false },
          compression: { enabled: true }
        }
        if (!path) return fullConfig
        if (path === 'security') return fullConfig.security
        if (path === 'logging') return fullConfig.logging
        if (path === 'compression') return fullConfig.compression
        return undefined
      })

      setupSecurity(app)

      // Return a large response body to trigger compression
      const largeBody = 'x'.repeat(10000)
      app.get('/test', (req, res) => {
        res.json({ data: largeBody })
      })

      const response = await request(app)
        .get('/test')
        .set('Accept-Encoding', 'gzip')
        .expect(200)

      expect(response.headers['content-encoding']).toBe('gzip')
    })
  })
})
