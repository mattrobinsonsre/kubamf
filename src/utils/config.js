/**
 * Frontend Configuration
 * Minimal configuration system that primarily relies on backend for configuration
 * Frontend only needs to know the backend URL and basic connection details
 */

class FrontendConfig {
  constructor() {
    this.config = this.loadConfig()
  }

  loadConfig() {
    // Priority order:
    // 1. Runtime environment variables (injected by Vite)
    // 2. Static hosting configuration
    // 3. Development defaults

    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron
    const isStaticHosting = typeof window !== 'undefined' && window.__STATIC_HOSTING__

    // For Electron, no HTTP configuration needed (uses IPC)
    if (isElectron) {
      return {
        deployment: 'electron',
        apiUrl: null, // Uses IPC
        wsUrl: null,  // Uses IPC
        features: {
          realTimeUpdates: true,
          fileSystem: true,
          notifications: true
        },
        ui: {
          showElectronFeatures: true,
          showWebFeatures: false
        }
      }
    }

    // For static hosting, use injected configuration
    if (isStaticHosting) {
      const apiHost = (typeof window !== 'undefined' && window.KUBAMF_API_HOST) ||
                     import.meta.env.VITE_API_HOST ||
                     'http://localhost:3001'

      return {
        deployment: 'static',
        apiUrl: `${apiHost}/api`,
        wsUrl: apiHost.replace(/^http/, 'ws'),
        features: {
          realTimeUpdates: true,
          fileSystem: false,
          notifications: false
        },
        ui: {
          showElectronFeatures: false,
          showWebFeatures: true
        }
      }
    }

    // For development/standard web deployment.
    // When served from a real hostname (not localhost), use the current origin
    // so the browser talks to the same backend that served the page. This is
    // essential for BAMF proxy mode where the frontend is served via a tunnel
    // hostname like kubamf.tunnel.bamf.example.com.
    const currentHost = typeof window !== 'undefined' ? window.location.origin : ''
    const isLocalhost = currentHost.includes('localhost') || currentHost.includes('127.0.0.1')
    const apiHost = import.meta.env.VITE_API_HOST ||
                    (isLocalhost ? 'http://localhost:3001' : currentHost)

    return {
      deployment: 'web',
      apiUrl: `${apiHost}/api`,
      wsUrl: apiHost.replace(/^http/, 'ws'),
      features: {
        realTimeUpdates: true,
        fileSystem: false,
        notifications: false
      },
      ui: {
        showElectronFeatures: false,
        showWebFeatures: true
      }
    }
  }

  get(path) {
    if (!path) return this.config

    return path.split('.').reduce((obj, key) => {
      return obj && obj[key] !== undefined ? obj[key] : undefined
    }, this.config)
  }

  getApiUrl() {
    return this.get('apiUrl')
  }

  getWsUrl() {
    return this.get('wsUrl')
  }

  isElectron() {
    return this.get('deployment') === 'electron'
  }

  isStaticHosting() {
    return this.get('deployment') === 'static'
  }

  isWeb() {
    return ['web', 'static'].includes(this.get('deployment'))
  }

  getFeatures() {
    return this.get('features') || {}
  }

  getUiConfig() {
    return this.get('ui') || {}
  }

  // Get runtime information for debugging
  getDebugInfo() {
    return {
      config: this.config,
      environment: {
        nodeEnv: import.meta.env.MODE,
        viteApiHost: import.meta.env.VITE_API_HOST,
        windowApiHost: typeof window !== 'undefined' ? window.KUBAMF_API_HOST : undefined,
        staticHosting: typeof window !== 'undefined' ? window.__STATIC_HOSTING__ : undefined,
        electronApi: typeof window !== 'undefined' ? !!window.electronAPI : false,
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
      }
    }
  }
}

// Export singleton instance
export const frontendConfig = new FrontendConfig()

// Export class for testing
export { FrontendConfig }

// Helper hooks for React components
export const useConfig = () => frontendConfig
export const useApiUrl = () => frontendConfig.getApiUrl()
export const useFeatures = () => frontendConfig.getFeatures()
export const useUiConfig = () => frontendConfig.getUiConfig()

// Development helper
if (import.meta.env.DEV) {
  window.__KUBAMF_CONFIG__ = frontendConfig
}