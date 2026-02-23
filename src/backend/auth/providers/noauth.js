/**
 * No Authentication Provider
 * Allows all requests without authentication (development/testing only)
 */

const BaseAuthProvider = require('./base')

class NoAuthProvider extends BaseAuthProvider {
  getType() {
    return 'none'
  }

  middleware() {
    return (req, res, next) => {
      // No authentication required - all requests pass through
      req.user = null
      req.authenticated = false
      next()
    }
  }

  getPublicConfig() {
    return {
      ...super.getPublicConfig(),
      message: 'Authentication is disabled'
    }
  }

  validateConfig() {
    const warnings = []

    if (process.env.NODE_ENV === 'production') {
      warnings.push('No authentication is configured in production environment')
    }

    return {
      errors: [],
      warnings
    }
  }
}

module.exports = NoAuthProvider