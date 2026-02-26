/**
 * Per-request context using AsyncLocalStorage
 *
 * Propagates user identity from Express middleware through the entire
 * async call chain, including into KubernetesService for impersonation.
 */

const { AsyncLocalStorage } = require('async_hooks')

const requestContext = new AsyncLocalStorage()

/**
 * Express middleware that wraps the remainder of the request
 * in an AsyncLocalStorage context carrying the authenticated user.
 */
function requestContextMiddleware() {
  return (req, res, next) => {
    const ctx = {
      user: req.user || null,
      sessionToken: req.bamfSessionToken || null
    }
    requestContext.run(ctx, next)
  }
}

/**
 * Retrieve the current request context from anywhere in the async chain.
 * Returns null when called outside of a request (e.g. startup, tests).
 */
function getRequestContext() {
  return requestContext.getStore() || null
}

module.exports = { requestContextMiddleware, getRequestContext, requestContext }
