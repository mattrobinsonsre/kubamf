import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FrontendConfig } from './config'

describe('FrontendConfig', () => {
  let originalWindow

  beforeEach(() => {
    // Store original values
    originalWindow = global.window

    // Mock window object
    global.window = {
      electronAPI: undefined,
      __STATIC_HOSTING__: undefined,
      KUBAMF_API_HOST: undefined,
      navigator: { userAgent: 'test-agent' },
      location: { origin: 'http://localhost:5173', hostname: 'localhost', href: 'http://localhost:5173/' }
    }

    // Mock import.meta.env
    vi.stubGlobal('import.meta', {
      env: {
        MODE: 'test',
        DEV: false,
        VITE_API_HOST: undefined
      }
    })
  })

  afterEach(() => {
    global.window = originalWindow
    vi.unstubAllGlobals()
  })

  describe('Electron Configuration', () => {
    beforeEach(() => {
      global.window.electronAPI = {
        isElectron: true,
        kubectl: {}
      }
    })

    it('should detect Electron environment', () => {
      const config = new FrontendConfig()

      expect(config.get('deployment')).toBe('electron')
      expect(config.get('apiUrl')).toBeNull()
      expect(config.get('wsUrl')).toBeNull()
      expect(config.isElectron()).toBe(true)
      expect(config.isWeb()).toBe(false)
    })

    it('should enable Electron-specific features', () => {
      const config = new FrontendConfig()
      const features = config.getFeatures()

      expect(features.realTimeUpdates).toBe(true)
      expect(features.fileSystem).toBe(true)
      expect(features.notifications).toBe(true)
    })

    it('should show Electron UI features', () => {
      const config = new FrontendConfig()
      const ui = config.getUiConfig()

      expect(ui.showElectronFeatures).toBe(true)
      expect(ui.showWebFeatures).toBe(false)
    })
  })

  describe('Static Hosting Configuration', () => {
    beforeEach(() => {
      global.window.__STATIC_HOSTING__ = true
      global.window.KUBAMF_API_HOST = 'https://api.example.com/api'
    })

    it('should detect static hosting environment', () => {
      const config = new FrontendConfig()

      expect(config.get('deployment')).toBe('static')
      expect(config.isStaticHosting()).toBe(true)
      expect(config.isWeb()).toBe(true)
    })

    it('should use injected API host for static hosting', () => {
      const config = new FrontendConfig()

      expect(config.getApiUrl()).toBe('https://api.example.com/api/api')
      expect(config.getWsUrl()).toBe('wss://api.example.com/api')
    })

    it('should fallback to environment variable if no window config', () => {
      delete global.window.KUBAMF_API_HOST
      import.meta.env.VITE_API_HOST = 'https://env.example.com'

      const config = new FrontendConfig()

      expect(config.getApiUrl()).toBe('https://env.example.com/api')
    })

    it('should fallback to localhost if no config provided', () => {
      delete global.window.KUBAMF_API_HOST
      delete import.meta.env.VITE_API_HOST

      const config = new FrontendConfig()

      expect(config.getApiUrl()).toBe('http://localhost:3001/api')
    })

    it('should disable file system features for static hosting', () => {
      const config = new FrontendConfig()
      const features = config.getFeatures()

      expect(features.fileSystem).toBe(false)
      expect(features.notifications).toBe(false)
      expect(features.realTimeUpdates).toBe(true)
    })
  })

  describe('Web Development Configuration', () => {
    beforeEach(() => {
      import.meta.env.VITE_API_HOST = 'http://localhost:3001'
    })

    it('should detect web development environment', () => {
      const config = new FrontendConfig()

      expect(config.get('deployment')).toBe('web')
      expect(config.isWeb()).toBe(true)
      expect(config.isElectron()).toBe(false)
    })

    it('should use development API host', () => {
      const config = new FrontendConfig()

      expect(config.getApiUrl()).toBe('http://localhost:3001/api')
      expect(config.getWsUrl()).toBe('ws://localhost:3001')
    })

    it('should enable web-appropriate features', () => {
      const config = new FrontendConfig()
      const features = config.getFeatures()

      expect(features.realTimeUpdates).toBe(true)
      expect(features.fileSystem).toBe(false)
      expect(features.notifications).toBe(false)
    })

    it('should show web UI features', () => {
      const config = new FrontendConfig()
      const ui = config.getUiConfig()

      expect(ui.showElectronFeatures).toBe(false)
      expect(ui.showWebFeatures).toBe(true)
    })
  })

  describe('Configuration Access', () => {
    beforeEach(() => {
      import.meta.env.VITE_API_HOST = 'http://test.local:3001'
    })

    it('should get nested configuration values', () => {
      const config = new FrontendConfig()

      expect(config.get('features.realTimeUpdates')).toBe(true)
      expect(config.get('ui.showWebFeatures')).toBe(true)
      expect(config.get('nonexistent.path')).toBeUndefined()
    })

    it('should return full config when no path provided', () => {
      const config = new FrontendConfig()
      const fullConfig = config.get()

      expect(fullConfig).toHaveProperty('deployment')
      expect(fullConfig).toHaveProperty('apiUrl')
      expect(fullConfig).toHaveProperty('features')
      expect(fullConfig).toHaveProperty('ui')
    })

    it('should provide convenience methods', () => {
      const config = new FrontendConfig()

      expect(config.getApiUrl()).toBe('http://test.local:3001/api')
      expect(config.getWsUrl()).toBe('ws://test.local:3001')
      expect(typeof config.getFeatures()).toBe('object')
      expect(typeof config.getUiConfig()).toBe('object')
    })
  })

  describe('Debug Information', () => {
    beforeEach(() => {
      global.window.electronAPI = { isElectron: true }
      global.window.__STATIC_HOSTING__ = false
      global.window.KUBAMF_API_HOST = 'https://debug.example.com'
      import.meta.env.MODE = 'development'
      import.meta.env.VITE_API_HOST = 'http://localhost:4000'
    })

    it('should provide comprehensive debug information', () => {
      const config = new FrontendConfig()
      const debug = config.getDebugInfo()

      expect(debug).toHaveProperty('config')
      expect(debug).toHaveProperty('environment')

      expect(debug.environment.nodeEnv).toBe('development')
      expect(debug.environment.viteApiHost).toBe('http://localhost:4000')
      expect(debug.environment.windowApiHost).toBe('https://debug.example.com')
      expect(debug.environment.staticHosting).toBe(false)
      expect(debug.environment.electronApi).toBe(true)
      expect(debug.environment.userAgent).toBe('test-agent')
    })
  })

  describe('URL Transformation', () => {
    it('should correctly transform HTTP to WebSocket URLs', () => {
      global.window.KUBAMF_API_HOST = 'http://example.com'
      global.window.__STATIC_HOSTING__ = true

      const config = new FrontendConfig()
      expect(config.getWsUrl()).toBe('ws://example.com')
    })

    it('should correctly transform HTTPS to WebSocket Secure URLs', () => {
      global.window.KUBAMF_API_HOST = 'https://secure.example.com'
      global.window.__STATIC_HOSTING__ = true

      const config = new FrontendConfig()
      expect(config.getWsUrl()).toBe('wss://secure.example.com')
    })
  })
})