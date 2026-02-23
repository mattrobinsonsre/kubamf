import { describe, it, expect, vi, beforeEach } from 'vitest'

// @tests-contract PreferencesManager.defaults
// @tests-contract PreferencesManager.loadWeb
// @tests-contract PreferencesManager.loadElectron
// @tests-contract PreferencesManager.saveWeb
// @tests-contract PreferencesManager.getSet
// @tests-contract PreferencesManager.contextSpecific
// @tests-contract PreferencesManager.expandedCategories
// @tests-contract PreferencesManager.hiddenTabs
// @tests-contract PreferencesManager.windowPrefs
// @tests-contract PreferencesManager.reset
// @tests-contract PreferencesManager.invalidJson

vi.mock('./config', () => ({
  frontendConfig: {
    isElectron: vi.fn(() => false)
  }
}))

// Helper to get a fresh PreferencesManager instance
async function createFreshManager(isElectron = false) {
  vi.resetModules()
  vi.doMock('./config', () => ({
    frontendConfig: {
      isElectron: vi.fn(() => isElectron)
    }
  }))
  const module = await import('./preferences')
  return module.preferencesManager
}

describe('PreferencesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.getItem.mockReturnValue(null)
    localStorage.setItem.mockImplementation(() => {})
  })

  // @tests-contract PreferencesManager.defaults
  describe('defaults', () => {
    it('should initialize with correct default theme', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.getTheme()).toBe('system')
    })

    it('should initialize with correct default sidebarWidth', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.getSidebarWidth()).toBe(256)
    })

    it('should initialize with correct default tabOrder', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.getTabOrder()).toEqual([])
    })

    it('should initialize with correct default hiddenTabs as Set', async () => {
      const mgr = await createFreshManager(false)
      const tabs = mgr.getHiddenTabs()
      expect(tabs).toBeInstanceOf(Set)
      expect(tabs.size).toBe(0)
    })

    it('should initialize expandedCategories with workloads', async () => {
      const mgr = await createFreshManager(false)
      const cats = mgr.getExpandedCategories()
      expect(cats).toBeInstanceOf(Set)
      expect(cats.has('workloads')).toBe(true)
    })

    it('should initialize with null windowBounds', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.getWindowBounds()).toBeNull()
    })

    it('should initialize with false windowMaximized', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.getWindowMaximized()).toBe(false)
    })
  })

  // @tests-contract PreferencesManager.loadWeb
  describe('loadWeb', () => {
    it('should load preferences from localStorage in web mode', async () => {
      localStorage.getItem.mockReturnValue(JSON.stringify({ theme: 'dark' }))
      const mgr = await createFreshManager(false)
      await mgr.loadPreferences()
      expect(mgr.getTheme()).toBe('dark')
    })

    it('should use defaults when localStorage is empty', async () => {
      localStorage.getItem.mockReturnValue(null)
      const mgr = await createFreshManager(false)
      await mgr.loadPreferences()
      expect(mgr.getTheme()).toBe('system')
    })

    it('should merge stored prefs with defaults', async () => {
      localStorage.getItem.mockReturnValue(JSON.stringify({ theme: 'dark' }))
      const mgr = await createFreshManager(false)
      await mgr.loadPreferences()
      expect(mgr.getTheme()).toBe('dark')
      expect(mgr.getSidebarWidth()).toBe(256) // default preserved
    })
  })

  // @tests-contract PreferencesManager.invalidJson
  describe('invalidJson', () => {
    it('should handle invalid JSON in localStorage gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      localStorage.getItem.mockReturnValue('not valid json{{{')
      const mgr = await createFreshManager(false)
      await mgr.loadPreferences()
      expect(mgr.getTheme()).toBe('system')
      consoleSpy.mockRestore()
    })
  })

  // @tests-contract PreferencesManager.loadElectron
  describe('loadElectron', () => {
    it('should load from electronAPI.preferences in Electron mode', async () => {
      const origAPI = window.electronAPI
      window.electronAPI = {
        ...origAPI,
        preferences: {
          load: vi.fn().mockResolvedValue({ success: true, data: { theme: 'dark' } }),
          save: vi.fn().mockResolvedValue({ success: true })
        }
      }
      const mgr = await createFreshManager(true)
      await mgr.loadPreferences()
      expect(mgr.getTheme()).toBe('dark')
      window.electronAPI = origAPI
    })

    it('should use defaults when electronAPI load fails', async () => {
      const origAPI = window.electronAPI
      window.electronAPI = {
        ...origAPI,
        preferences: {
          load: vi.fn().mockResolvedValue({ success: false }),
          save: vi.fn().mockResolvedValue({ success: true })
        }
      }
      const mgr = await createFreshManager(true)
      await mgr.loadPreferences()
      expect(mgr.getTheme()).toBe('system')
      window.electronAPI = origAPI
    })
  })

  // @tests-contract PreferencesManager.saveWeb
  describe('saveWeb', () => {
    it('should save to localStorage in web mode', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setTheme('dark')
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'kubamf-preferences',
        expect.any(String)
      )
      const saved = JSON.parse(localStorage.setItem.mock.calls[0][1])
      expect(saved.theme).toBe('dark')
    })
  })

  // @tests-contract PreferencesManager.getSet
  describe('getSet', () => {
    it('should get a preference by key', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.get('theme')).toBe('system')
    })

    it('should return defaultValue when key missing', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.get('nonexistent', 'fallback')).toBe('fallback')
    })

    it('should return null as default', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.get('nonexistent')).toBeNull()
    })

    it('should set and get a preference', async () => {
      const mgr = await createFreshManager(false)
      await mgr.set('theme', 'dark')
      expect(mgr.get('theme')).toBe('dark')
    })

    it('should set custom keys', async () => {
      const mgr = await createFreshManager(false)
      await mgr.set('customKey', 'customValue')
      expect(mgr.get('customKey')).toBe('customValue')
    })
  })

  // @tests-contract PreferencesManager.contextSpecific
  describe('contextSpecific', () => {
    it('should store/retrieve selected resource per context', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setSelectedResource('minikube', { type: 'Deployments', kind: 'Deployment' })
      expect(mgr.getSelectedResource('minikube')).toEqual({ type: 'Deployments', kind: 'Deployment' })
    })

    it('should return default resource for unknown context', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.getSelectedResource('unknown')).toEqual({ type: 'Pods', kind: 'Pod' })
    })

    it('should store/retrieve namespace per context', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setSelectedNamespace('minikube', 'kube-system')
      expect(mgr.getSelectedNamespace('minikube')).toBe('kube-system')
    })

    it('should return "All Namespaces" for unknown context namespace', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.getSelectedNamespace('unknown')).toBe('All Namespaces')
    })

    it('should store/retrieve search filter per context', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setSearchFilter('minikube', 'nginx')
      expect(mgr.getSearchFilter('minikube')).toBe('nginx')
    })

    it('should return empty string for unknown context search', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.getSearchFilter('unknown')).toBe('')
    })

    it('should store/retrieve status filter per context', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setStatusFilter('minikube', 'Running')
      expect(mgr.getStatusFilter('minikube')).toBe('Running')
    })

    it('should return "all" for unknown context status', async () => {
      const mgr = await createFreshManager(false)
      expect(mgr.getStatusFilter('unknown')).toBe('all')
    })
  })

  // @tests-contract PreferencesManager.expandedCategories
  describe('expandedCategories', () => {
    it('should store as array and return as Set', async () => {
      const mgr = await createFreshManager(false)
      const cats = new Set(['workloads', 'networking', 'storage'])
      await mgr.setExpandedCategories(cats)
      const result = mgr.getExpandedCategories()
      expect(result).toBeInstanceOf(Set)
      expect(result.has('workloads')).toBe(true)
      expect(result.has('networking')).toBe(true)
      expect(result.has('storage')).toBe(true)
    })

    it('should default to Set with workloads', async () => {
      const mgr = await createFreshManager(false)
      const result = mgr.getExpandedCategories()
      expect(result.size).toBe(1)
      expect(result.has('workloads')).toBe(true)
    })
  })

  // @tests-contract PreferencesManager.hiddenTabs
  describe('hiddenTabs', () => {
    it('should store as array and return as Set', async () => {
      const mgr = await createFreshManager(false)
      const tabs = new Set(['tab1', 'tab2'])
      await mgr.setHiddenTabs(tabs)
      const result = mgr.getHiddenTabs()
      expect(result).toBeInstanceOf(Set)
      expect(result.has('tab1')).toBe(true)
      expect(result.has('tab2')).toBe(true)
    })

    it('should default to empty Set', async () => {
      const mgr = await createFreshManager(false)
      const result = mgr.getHiddenTabs()
      expect(result.size).toBe(0)
    })
  })

  // @tests-contract PreferencesManager.windowPrefs
  describe('windowPrefs', () => {
    it('should NOT save window bounds in web mode', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setWindowBounds({ x: 0, y: 0, width: 800, height: 600 })
      expect(mgr.getWindowBounds()).toBeNull()
    })

    it('should NOT save window maximized in web mode', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setWindowMaximized(true)
      expect(mgr.getWindowMaximized()).toBe(false)
    })

    it('should save window bounds in Electron mode', async () => {
      const origAPI = window.electronAPI
      window.electronAPI = {
        ...origAPI,
        preferences: {
          load: vi.fn().mockResolvedValue({ success: true, data: {} }),
          save: vi.fn().mockResolvedValue({ success: true })
        }
      }
      const mgr = await createFreshManager(true)
      await mgr.loadPreferences()
      await mgr.setWindowBounds({ x: 100, y: 100, width: 1024, height: 768 })
      expect(mgr.getWindowBounds()).toEqual({ x: 100, y: 100, width: 1024, height: 768 })
      window.electronAPI = origAPI
    })

    it('should save window maximized in Electron mode', async () => {
      const origAPI = window.electronAPI
      window.electronAPI = {
        ...origAPI,
        preferences: {
          load: vi.fn().mockResolvedValue({ success: true, data: {} }),
          save: vi.fn().mockResolvedValue({ success: true })
        }
      }
      const mgr = await createFreshManager(true)
      await mgr.loadPreferences()
      await mgr.setWindowMaximized(true)
      expect(mgr.getWindowMaximized()).toBe(true)
      window.electronAPI = origAPI
    })
  })

  // @tests-contract PreferencesManager.reset
  describe('reset', () => {
    it('should reset all preferences to defaults', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setTheme('dark')
      await mgr.setSidebarWidth(400)
      expect(mgr.getTheme()).toBe('dark')
      expect(mgr.getSidebarWidth()).toBe(400)

      await mgr.reset()
      expect(mgr.getTheme()).toBe('system')
      expect(mgr.getSidebarWidth()).toBe(256)
    })

    it('should save defaults after reset', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setTheme('dark')
      localStorage.setItem.mockClear()
      await mgr.reset()
      expect(localStorage.setItem).toHaveBeenCalled()
    })
  })

  describe('theme helpers', () => {
    it('should set and get theme', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setTheme('dark')
      expect(mgr.getTheme()).toBe('dark')
      await mgr.setTheme('light')
      expect(mgr.getTheme()).toBe('light')
    })
  })

  describe('tabOrder helpers', () => {
    it('should set and get tab order', async () => {
      const mgr = await createFreshManager(false)
      const order = ['tab2', 'tab1', 'tab3']
      await mgr.setTabOrder(order)
      expect(mgr.getTabOrder()).toEqual(order)
    })
  })

  describe('sidebarWidth helpers', () => {
    it('should set and get sidebar width', async () => {
      const mgr = await createFreshManager(false)
      await mgr.setSidebarWidth(300)
      expect(mgr.getSidebarWidth()).toBe(300)
    })
  })
})
