/**
 * Tests for NoAuth Provider
 */

const NoAuthProvider = require('./noauth')

describe('NoAuthProvider', () => {
  let provider

  beforeEach(() => {
    provider = new NoAuthProvider({})
  })

  describe('Basic Functionality', () => {
    test('should return correct type', () => {
      expect(provider.getType()).toBe('none')
    })

    test('should provide middleware that passes all requests', () => {
      const middleware = provider.middleware()
      const req = {}
      const res = {}
      const next = jest.fn()

      middleware(req, res, next)

      expect(req.user).toBeNull()
      expect(req.authenticated).toBe(false)
      expect(next).toHaveBeenCalled()
    })

    test('should return appropriate public config', () => {
      const config = provider.getPublicConfig()

      expect(config).toHaveProperty('type', 'none')
      expect(config).toHaveProperty('message', 'Authentication is disabled')
      expect(config).toHaveProperty('enabled', false)
    })

    test('should return empty endpoints', () => {
      const endpoints = provider.getEndpoints()

      expect(endpoints).toEqual({})
    })
  })

  describe('Configuration Validation', () => {
    test('should return no errors in development', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const validation = provider.validateConfig()

      expect(validation.errors).toHaveLength(0)
      expect(validation.warnings).toHaveLength(0)

      process.env.NODE_ENV = originalEnv
    })

    test('should return warning in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const validation = provider.validateConfig()

      expect(validation.errors).toHaveLength(0)
      expect(validation.warnings).toHaveLength(1)
      expect(validation.warnings[0]).toContain('production environment')

      process.env.NODE_ENV = originalEnv
    })
  })

  describe('Middleware Integration', () => {
    test('should work with multiple requests', () => {
      const middleware = provider.middleware()
      const next = jest.fn()

      // First request
      const req1 = {}
      const res1 = {}
      middleware(req1, res1, next)

      // Second request
      const req2 = {}
      const res2 = {}
      middleware(req2, res2, next)

      expect(req1.user).toBeNull()
      expect(req1.authenticated).toBe(false)
      expect(req2.user).toBeNull()
      expect(req2.authenticated).toBe(false)
      expect(next).toHaveBeenCalledTimes(2)
    })

    test('should not modify existing request properties', () => {
      const middleware = provider.middleware()
      const req = { existingProp: 'value' }
      const res = {}
      const next = jest.fn()

      middleware(req, res, next)

      expect(req.existingProp).toBe('value')
      expect(req.user).toBeNull()
      expect(req.authenticated).toBe(false)
    })
  })
})