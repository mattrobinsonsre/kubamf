/**
 * Bamf Authentication Provider
 *
 * Trusts identity from bamf's reverse proxy headers.
 * Bamf handles SSO/OIDC, sessions, CSRF, and K8s impersonation.
 * This provider simply extracts user identity from forwarded headers.
 */

const BaseAuthProvider = require('./base')

class BamfAuthProvider extends BaseAuthProvider {
  initialize() {
    this.trustHeaders = this.config.trustHeaders || [
      'x-forwarded-email',
      'x-forwarded-user',
      'x-forwarded-roles',
      'x-forwarded-groups'
    ]
    this.logAuth('info', 'Bamf auth provider initialized (trusting proxy headers)')
  }

  getType() {
    return 'bamf'
  }

  isEnabled() {
    return true
  }

  middleware() {
    return (req, res, next) => {
      const email = req.headers['x-forwarded-email']
      if (!email) {
        return res.status(401).json({ error: 'No identity header from bamf proxy' })
      }

      req.user = this.createUserObject({
        id: email,
        email,
        username: req.headers['x-forwarded-user'] || email,
        roles: (req.headers['x-forwarded-roles'] || '').split(',').filter(Boolean),
        groups: (req.headers['x-forwarded-groups'] || '').split(',').filter(Boolean)
      })

      next()
    }
  }

  setupRoutes(router) {
    // GET /auth/bamf/info - tells frontend auth is handled by bamf
    // No login/logout routes - bamf owns those
    router.get('/info', (req, res) => {
      res.json({
        provider: 'bamf',
        message: 'Authentication is handled by bamf proxy',
        user: req.user || null
      })
    })
  }

  getPublicConfig() {
    return {
      type: 'bamf',
      enabled: true,
      externalAuth: true,
      message: 'Authentication is managed by bamf'
    }
  }

  getEndpoints() {
    return {
      info: '/auth/bamf/info'
      // No login/logout endpoints - bamf handles those externally
    }
  }

  validateConfig() {
    const errors = []
    const warnings = []

    if (!this.config.enabled) {
      warnings.push('Bamf auth provider is registered but not enabled')
    }

    return { errors, warnings }
  }
}

module.exports = BamfAuthProvider
