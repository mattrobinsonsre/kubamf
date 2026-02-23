/**
 * Tests for Authentication Manager
 * Two modes: 'none' (Electron/desktop) and 'bamf' (behind bamf proxy)
 */

const AuthManager = require('./index')

// Mock the providers
jest.mock('./providers/noauth', () => {
  return jest.fn().mockImplementation(() => ({
    getType: () => 'none',
    middleware: () => (req, res, next) => {
      req.user = null
      req.authenticated = false
      next()
    },
    getPublicConfig: () => ({ type: 'none', message: 'Authentication is disabled' }),
    getEndpoints: () => ({}),
    validateConfig: () => ({ errors: [], warnings: [] })
  }))
})

jest.mock('./providers/bamf', () => {
  return jest.fn().mockImplementation(() => ({
    getType: () => 'bamf',
    middleware: () => (req, res, next) => {
      const email = req.headers['x-forwarded-email']
      if (!email) return res.status(401).json({ error: 'No identity header' })
      req.user = { email, username: email, roles: [], groups: [] }
      next()
    },
    getPublicConfig: () => ({ type: 'bamf', enabled: true, externalAuth: true }),
    getEndpoints: () => ({ info: '/auth/bamf/info' }),
    setupRoutes: jest.fn(),
    validateConfig: () => ({ errors: [], warnings: [] })
  }))
})

describe('AuthManager', () => {
  let mockConfig

  beforeEach(() => {
    mockConfig = {
      get: jest.fn()
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Constructor and Provider Setup', () => {
    test('should initialize with none provider by default', () => {
      mockConfig.get.mockReturnValue({
        provider: 'none',
        none: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)

      expect(authManager.primaryProvider).toBe('none')
      expect(authManager.providers.size).toBe(1)
      expect(authManager.providers.has('none')).toBe(true)
    })

    test('should initialize with bamf provider when enabled', () => {
      mockConfig.get.mockReturnValue({
        provider: 'bamf',
        none: { enabled: true },
        bamf: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)

      expect(authManager.primaryProvider).toBe('bamf')
      expect(authManager.providers.size).toBe(2)
      expect(authManager.providers.has('bamf')).toBe(true)
    })

    test('should fallback to none when invalid provider specified', () => {
      mockConfig.get.mockReturnValue({
        provider: 'invalid',
        none: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)

      expect(authManager.primaryProvider).toBe('none')
    })
  })

  describe('Provider Access Methods', () => {
    test('should return primary provider', () => {
      mockConfig.get.mockReturnValue({
        provider: 'bamf',
        none: { enabled: true },
        bamf: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)
      const provider = authManager.getPrimaryProvider()

      expect(provider).toBeDefined()
      expect(provider.getType()).toBe('bamf')
    })

    test('should return specific provider by name', () => {
      mockConfig.get.mockReturnValue({
        provider: 'none',
        none: { enabled: true },
        bamf: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)
      const bamfProvider = authManager.getProvider('bamf')

      expect(bamfProvider).toBeDefined()
      expect(bamfProvider.getType()).toBe('bamf')
    })
  })

  describe('Authentication Status', () => {
    test('should return false when none provider is primary', () => {
      mockConfig.get.mockReturnValue({
        provider: 'none',
        none: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)

      expect(authManager.isAuthEnabled()).toBe(false)
    })

    test('should return true when bamf provider is primary', () => {
      mockConfig.get.mockReturnValue({
        provider: 'bamf',
        none: { enabled: true },
        bamf: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)

      expect(authManager.isAuthEnabled()).toBe(true)
    })
  })

  describe('Middleware', () => {
    test('should return middleware from primary provider', () => {
      mockConfig.get.mockReturnValue({
        provider: 'bamf',
        none: { enabled: true },
        bamf: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)
      const middleware = authManager.middleware()

      expect(typeof middleware).toBe('function')
    })

    test('bamf middleware should reject requests without identity header', () => {
      mockConfig.get.mockReturnValue({
        provider: 'bamf',
        none: { enabled: true },
        bamf: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)
      const middleware = authManager.middleware()

      const req = { headers: {} }
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() }
      const next = jest.fn()

      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(next).not.toHaveBeenCalled()
    })

    test('bamf middleware should extract user from forwarded headers', () => {
      mockConfig.get.mockReturnValue({
        provider: 'bamf',
        none: { enabled: true },
        bamf: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)
      const middleware = authManager.middleware()

      const req = { headers: { 'x-forwarded-email': 'user@example.com' } }
      const res = {}
      const next = jest.fn()

      middleware(req, res, next)

      expect(req.user.email).toBe('user@example.com')
      expect(next).toHaveBeenCalled()
    })
  })

  describe('Route Setup', () => {
    test('should setup authentication routes', () => {
      const mockApp = {
        use: jest.fn()
      }

      mockConfig.get.mockReturnValue({
        provider: 'bamf',
        none: { enabled: true },
        bamf: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)
      authManager.setupRoutes(mockApp)

      expect(mockApp.use).toHaveBeenCalledWith('/auth', expect.any(Function))
    })
  })

  describe('Configuration Validation', () => {
    test('should validate configuration correctly', () => {
      mockConfig.get.mockReturnValue({
        provider: 'bamf',
        none: { enabled: true },
        bamf: { enabled: true }
      })

      const authManager = new AuthManager(mockConfig)
      const validation = authManager.validateConfig()

      expect(validation).toHaveProperty('errors')
      expect(validation).toHaveProperty('warnings')
      expect(Array.isArray(validation.errors)).toBe(true)
      expect(Array.isArray(validation.warnings)).toBe(true)
    })
  })

  describe('Error Handling', () => {
    test('should handle missing auth configuration gracefully', () => {
      mockConfig.get.mockReturnValue(null)

      expect(() => {
        new AuthManager(mockConfig)
      }).not.toThrow()
    })
  })
})
