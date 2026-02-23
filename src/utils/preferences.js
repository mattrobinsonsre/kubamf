// User preferences management for both Electron and web versions
// @contract PreferencesManager.defaults - Must initialize with correct default values
// @contract PreferencesManager.loadWeb - Must load from localStorage in web mode
// @contract PreferencesManager.loadElectron - Must load from electronAPI.preferences in Electron mode
// @contract PreferencesManager.saveWeb - Must save to localStorage in web mode
// @contract PreferencesManager.getSet - Must get/set generic preferences
// @contract PreferencesManager.contextSpecific - Must store/retrieve per-context preferences (resource, namespace, search, status)
// @contract PreferencesManager.expandedCategories - Must store as array, return as Set
// @contract PreferencesManager.hiddenTabs - Must store as array, return as Set
// @contract PreferencesManager.windowPrefs - Must only save window prefs in Electron mode
// @contract PreferencesManager.reset - Must reset all preferences to defaults
// @contract PreferencesManager.invalidJson - Must handle invalid JSON in localStorage gracefully
import { frontendConfig } from './config'

class PreferencesManager {
  constructor() {
    this.isElectron = frontendConfig.isElectron()
    this.preferences = {}
    this.defaultPreferences = {
      // UI preferences
      theme: 'system',
      sidebarWidth: 256,
      tabOrder: [],
      hiddenTabs: [],

      // Context-specific preferences
      selectedResources: {}, // contextName -> resource
      selectedNamespaces: {}, // contextName -> namespace
      searchFilters: {}, // contextName -> searchTerm
      statusFilters: {}, // contextName -> status

      // Resource tree preferences
      expandedCategories: ['workloads'],

      // Table preferences
      columnWidths: {},
      sortOrder: {},

      // Window preferences (Electron only)
      windowBounds: null,
      windowMaximized: false,
    }

    this.loadPreferences()
  }

  async loadPreferences() {
    try {
      if (this.isElectron && window.electronAPI?.preferences) {
        // Load from Electron config file
        const result = await window.electronAPI.preferences.load()
        if (result.success) {
          this.preferences = { ...this.defaultPreferences, ...result.data }
        } else {
          this.preferences = { ...this.defaultPreferences }
        }
      } else {
        // Load from localStorage
        const stored = localStorage.getItem('kubamf-preferences')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            this.preferences = { ...this.defaultPreferences, ...parsed }
          } catch (e) {
            console.warn('Failed to parse stored preferences:', e)
            this.preferences = { ...this.defaultPreferences }
          }
        } else {
          this.preferences = { ...this.defaultPreferences }
        }
      }
    } catch (error) {
      console.warn('Failed to load preferences:', error)
      this.preferences = { ...this.defaultPreferences }
    }
  }

  async savePreferences() {
    try {
      if (this.isElectron && window.electronAPI?.preferences) {
        // Save to Electron config file
        await window.electronAPI.preferences.save(this.preferences)
      } else {
        // Save to localStorage
        localStorage.setItem('kubamf-preferences', JSON.stringify(this.preferences))
      }
    } catch (error) {
      console.warn('Failed to save preferences:', error)
    }
  }

  // Generic getter/setter
  get(key, defaultValue = null) {
    return this.preferences[key] ?? defaultValue
  }

  async set(key, value) {
    this.preferences[key] = value
    await this.savePreferences()
  }

  // Specific preference helpers
  async setTheme(theme) {
    await this.set('theme', theme)
  }

  getTheme() {
    return this.get('theme', 'system')
  }

  async setTabOrder(order) {
    await this.set('tabOrder', order)
  }

  getTabOrder() {
    return this.get('tabOrder', [])
  }

  async setHiddenTabs(hiddenTabs) {
    await this.set('hiddenTabs', Array.from(hiddenTabs))
  }

  getHiddenTabs() {
    return new Set(this.get('hiddenTabs', []))
  }

  async setSelectedResource(contextName, resource) {
    const selectedResources = this.get('selectedResources', {})
    selectedResources[contextName] = resource
    await this.set('selectedResources', selectedResources)
  }

  getSelectedResource(contextName) {
    const selectedResources = this.get('selectedResources', {})
    return selectedResources[contextName] || { type: 'Pods', kind: 'Pod' }
  }

  async setSelectedNamespace(contextName, namespace) {
    const selectedNamespaces = this.get('selectedNamespaces', {})
    selectedNamespaces[contextName] = namespace
    await this.set('selectedNamespaces', selectedNamespaces)
  }

  getSelectedNamespace(contextName) {
    const selectedNamespaces = this.get('selectedNamespaces', {})
    // Check if we have a saved namespace for this context
    if (selectedNamespaces[contextName]) {
      return selectedNamespaces[contextName]
    }
    // Fall back to 'All Namespaces' as default for better visibility
    return 'All Namespaces'
  }

  async setSearchFilter(contextName, searchTerm) {
    const searchFilters = this.get('searchFilters', {})
    searchFilters[contextName] = searchTerm
    await this.set('searchFilters', searchFilters)
  }

  getSearchFilter(contextName) {
    const searchFilters = this.get('searchFilters', {})
    return searchFilters[contextName] || ''
  }

  async setStatusFilter(contextName, status) {
    const statusFilters = this.get('statusFilters', {})
    statusFilters[contextName] = status
    await this.set('statusFilters', statusFilters)
  }

  getStatusFilter(contextName) {
    const statusFilters = this.get('statusFilters', {})
    return statusFilters[contextName] || 'all'
  }

  async setExpandedCategories(categories) {
    await this.set('expandedCategories', Array.from(categories))
  }

  getExpandedCategories() {
    return new Set(this.get('expandedCategories', ['workloads']))
  }

  async setSidebarWidth(width) {
    await this.set('sidebarWidth', width)
  }

  getSidebarWidth() {
    return this.get('sidebarWidth', 256)
  }

  // Window preferences (Electron only)
  async setWindowBounds(bounds) {
    if (this.isElectron) {
      await this.set('windowBounds', bounds)
    }
  }

  getWindowBounds() {
    return this.get('windowBounds', null)
  }

  async setWindowMaximized(maximized) {
    if (this.isElectron) {
      await this.set('windowMaximized', maximized)
    }
  }

  getWindowMaximized() {
    return this.get('windowMaximized', false)
  }

  // Reset all preferences
  async reset() {
    this.preferences = { ...this.defaultPreferences }
    await this.savePreferences()
  }
}

// Create singleton instance
export const preferencesManager = new PreferencesManager()
export default preferencesManager