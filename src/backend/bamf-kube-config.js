/**
 * Creates a KubeConfig that routes K8s API calls through the BAMF API
 * kube proxy endpoint instead of talking to the K8s API directly.
 *
 * In BAMF mode, kubamf does NOT need:
 * - A ServiceAccount with impersonation RBAC
 * - Direct access to the K8s API
 *
 * The BAMF kube proxy chain handles:
 * - Authentication (validates the BAMF session token)
 * - RBAC (checks user's roles against the K8s resource)
 * - Forwarding through bridge → agent → K8s API
 * - Impersonation (agent sets Impersonate-User/Group headers)
 *
 * Two modes:
 * - No token arg: uses AsyncLocalStorage for per-request token injection.
 *   Works for regular HTTP requests (list pods, get resources, etc.) where
 *   the k8s client calls applyToRequest synchronously.
 * - With token arg: bakes the token directly into the config. Required for
 *   exec/attach operations where the k8s client creates a WebSocket
 *   internally and AsyncLocalStorage context is lost during the WebSocket
 *   construction.
 *
 * Requires environment variables:
 * - BAMF_API_URL: Internal URL of the BAMF API (e.g. http://bamf-api:8000)
 * - BAMF_KUBE_RESOURCE_NAME: Name of the kubernetes resource in BAMF
 */

const k8s = require('@kubernetes/client-node')

function createBamfKubeConfig(sessionToken) {
  const apiUrl = process.env.BAMF_API_URL
  const resourceName = process.env.BAMF_KUBE_RESOURCE_NAME

  if (!apiUrl) {
    throw new Error('BAMF_API_URL environment variable is required in BAMF mode')
  }
  if (!resourceName) {
    throw new Error('BAMF_KUBE_RESOURCE_NAME environment variable is required in BAMF mode')
  }

  const server = `${apiUrl.replace(/\/$/, '')}/api/v1/kube/${resourceName}`

  const kc = new k8s.KubeConfig()
  kc.loadFromOptions({
    clusters: [{
      name: 'bamf-proxy',
      server,
      skipTLSVerify: true,
    }],
    users: [{
      name: 'bamf-session',
    }],
    contexts: [{
      name: 'bamf-proxy',
      cluster: 'bamf-proxy',
      user: 'bamf-session',
    }],
    currentContext: 'bamf-proxy',
  })

  if (sessionToken) {
    // Explicit token mode — for exec/attach WebSocket operations.
    // The token is baked directly into the config, avoiding any
    // AsyncLocalStorage propagation issues.
    kc.applyToRequest = (opts) => {
      opts.headers = opts.headers || {}
      opts.headers['Authorization'] = `Bearer ${sessionToken}`
      return opts
    }
    kc.applyToHTTPSOptions = async (opts) => {
      opts.headers = opts.headers || {}
      opts.headers.Authorization = `Bearer ${sessionToken}`
    }
  } else {
    // AsyncLocalStorage mode — for regular HTTP requests (list, get, watch).
    // The k8s client calls applyToRequest synchronously within the Express
    // handler's async context, so AsyncLocalStorage works reliably here.
    const { getRequestContext } = require('./request-context')
    kc.applyToRequest = (opts) => {
      const ctx = getRequestContext()
      if (ctx && ctx.sessionToken) {
        opts.headers = opts.headers || {}
        opts.headers['Authorization'] = `Bearer ${ctx.sessionToken}`
      }
      return opts
    }
    kc.applyToHTTPSOptions = async (opts) => {
      const ctx = getRequestContext()
      if (ctx && ctx.sessionToken) {
        opts.headers = opts.headers || {}
        opts.headers.Authorization = `Bearer ${ctx.sessionToken}`
      }
    }
  }

  // Only one context — prevent accidental switching
  kc.setCurrentContext = () => {}

  return kc
}

module.exports = { createBamfKubeConfig }
