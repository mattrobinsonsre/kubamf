/**
 * Base Authentication Provider
 * Abstract class that all auth providers must extend
 */

class BaseAuthProvider {
  constructor(config) {
    this.config = config || {}
    this.initialize()
  }

  // Initialize the provider (override in subclasses)
  initialize() {
    // Default implementation does nothing
  }

  // Express middleware for authentication (must override)
  middleware() {
    throw new Error('middleware() must be implemented by auth provider')
  }

  // Setup provider-specific routes (optional)
  setupRoutes(router) {
    // Default implementation - no routes
  }

  // Get public configuration (safe to send to frontend)
  getPublicConfig() {
    return {
      type: this.getType(),
      enabled: this.isEnabled()
    }
  }

  // Get available endpoints for this provider
  getEndpoints() {
    return {}
  }

  // Get provider type/name
  getType() {
    return 'base'
  }

  // Check if provider is enabled
  isEnabled() {
    return this.config.enabled === true
  }

  // Validate provider configuration
  validateConfig() {
    return {
      errors: [],
      warnings: []
    }
  }

  // Helper method to create standardized user object
  createUserObject(userData) {
    const now = new Date().toISOString()

    return {
      id: userData.id || userData.sub || userData.username,
      username: userData.username || userData.preferred_username || userData.email,
      email: userData.email,
      name: userData.name || userData.displayName,
      groups: userData.groups || [],
      roles: userData.roles || [],
      provider: this.getType(),
      authenticatedAt: now,
      expiresAt: userData.exp ? new Date(userData.exp * 1000).toISOString() : null,
      ...userData.custom || {}
    }
  }

  // Helper method to check if user has required permissions
  hasPermission(user, permission) {
    // Default implementation - all authenticated users have all permissions
    // Override in subclasses for more granular control
    return !!user
  }

  // Helper method to check if user is in required groups
  hasGroups(user, requiredGroups) {
    if (!requiredGroups || requiredGroups.length === 0) {
      return true
    }

    if (!user.groups || user.groups.length === 0) {
      return false
    }

    return requiredGroups.some(group => user.groups.includes(group))
  }

  // Helper method to check if user has required roles
  hasRoles(user, requiredRoles) {
    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    if (!user.roles || user.roles.length === 0) {
      return false
    }

    return requiredRoles.some(role => user.roles.includes(role))
  }

  // Log authentication events
  logAuth(level, message, meta = {}) {
    const logData = {
      component: 'auth',
      provider: this.getType(),
      timestamp: new Date().toISOString(),
      ...meta
    }

    console[level](`[AUTH:${this.getType().toUpperCase()}] ${message}`, logData)
  }
}

module.exports = BaseAuthProvider