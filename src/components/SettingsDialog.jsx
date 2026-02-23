import React, { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import preferencesManager from '../utils/preferences'

const SettingsDialog = ({ isOpen, onClose }) => {
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState('appearance')

  // Local state for settings that get saved on "Save Changes"
  const [defaultNamespace, setDefaultNamespace] = useState('')
  const [refreshInterval, setRefreshInterval] = useState('30')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [devMode, setDevMode] = useState(false)
  const [verboseLogging, setVerboseLogging] = useState(false)

  // Load current settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      setDefaultNamespace(preferencesManager.get('defaultNamespace', ''))
      setRefreshInterval(String(preferencesManager.get('refreshInterval', 30)))
      setAutoRefresh(preferencesManager.get('autoRefresh', true))
      setDevMode(preferencesManager.get('devMode', false))
      setVerboseLogging(preferencesManager.get('verboseLogging', false))
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSave = async () => {
    await preferencesManager.set('defaultNamespace', defaultNamespace)
    await preferencesManager.set('refreshInterval', parseInt(refreshInterval, 10))
    await preferencesManager.set('autoRefresh', autoRefresh)
    await preferencesManager.set('devMode', devMode)
    await preferencesManager.set('verboseLogging', verboseLogging)
    onClose()
  }

  const handleClearData = async () => {
    if (window.confirm('Are you sure you want to clear all data? This will reset all settings and cached data.')) {
      await preferencesManager.reset()
      localStorage.removeItem('kubamf-current-context')
      setDefaultNamespace('')
      setRefreshInterval('30')
      setAutoRefresh(true)
      setDevMode(false)
      setVerboseLogging(false)
    }
  }

  const tabs = [
    { id: 'appearance', name: 'Appearance', icon: '🎨' },
    { id: 'kubernetes', name: 'Kubernetes', icon: '⎈' },
    { id: 'advanced', name: 'Advanced', icon: '⚙️' },
  ]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{WebkitAppRegion: 'no-drag'}}>
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Center the modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Settings
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg p-1"
                aria-label="Close settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex">
            {/* Sidebar */}
            <div className="w-48 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
              <nav className="p-4 space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    <span className="mr-2">{tab.icon}</span>
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 p-6">
              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                      Appearance
                    </h4>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Theme
                        </label>
                        <div className="space-y-2">
                          {[
                            { value: 'light', label: 'Light', icon: '☀️' },
                            { value: 'dark', label: 'Dark', icon: '🌙' },
                            { value: 'system', label: 'System', icon: '💻' },
                          ].map((option) => (
                            <label key={option.value} className="flex items-center">
                              <input
                                type="radio"
                                name="theme"
                                value={option.value}
                                checked={theme === option.value}
                                onChange={(e) => setTheme(e.target.value)}
                                className="mr-3 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="mr-2">{option.icon}</span>
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {option.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'kubernetes' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                      Kubernetes Configuration
                    </h4>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Default Namespace
                        </label>
                        <input
                          type="text"
                          value={defaultNamespace}
                          onChange={(e) => setDefaultNamespace(e.target.value)}
                          placeholder="default"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Leave empty for All Namespaces
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Resource Refresh Interval
                        </label>
                        <select
                          value={refreshInterval}
                          onChange={(e) => setRefreshInterval(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="5">5 seconds</option>
                          <option value="10">10 seconds</option>
                          <option value="30">30 seconds</option>
                          <option value="60">1 minute</option>
                          <option value="0">Manual only</option>
                        </select>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="autoRefresh"
                          checked={autoRefresh}
                          onChange={(e) => setAutoRefresh(e.target.checked)}
                          className="mr-3 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="autoRefresh" className="text-sm text-gray-700 dark:text-gray-300">
                          Auto-refresh resources
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'advanced' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                      Advanced Settings
                    </h4>

                    <div className="space-y-4">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="devMode"
                          checked={devMode}
                          onChange={(e) => setDevMode(e.target.checked)}
                          className="mr-3 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="devMode" className="text-sm text-gray-700 dark:text-gray-300">
                          Enable developer mode
                        </label>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="verboseLogging"
                          checked={verboseLogging}
                          onChange={(e) => setVerboseLogging(e.target.checked)}
                          className="mr-3 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="verboseLogging" className="text-sm text-gray-700 dark:text-gray-300">
                          Verbose logging
                        </label>
                      </div>

                      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                          onClick={handleClearData}
                          className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Clear All Data
                        </button>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          This will reset all settings and cached data
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-end space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsDialog
