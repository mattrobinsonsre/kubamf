import React, { useState, useEffect } from 'react'
import {
  RefreshCw,
  Settings,
  Plus,
  Trash2,
  Sun,
  Moon,
  Monitor,
  Wifi,
  WifiOff,
  Zap,
  BookOpen,
  Eye,
  Eraser,
  RotateCw,
  Edit3,
  Copy
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useKubeConfig } from '../contexts/KubeConfigContext'
import SettingsDialog from './SettingsDialog'
import DocumentationViewer from './DocumentationViewer'

const Toolbar = () => {
  const { theme, setTheme } = useTheme()
  const { currentContext, sseStatus } = useKubeConfig()
  const [showSettings, setShowSettings] = useState(false)
  const [showDocs, setShowDocs] = useState(false)

  // Listen for menu events from Electron
  useEffect(() => {
    if (window.electronAPI?.onMenuAction) {
      const cleanupSettings = window.electronAPI.onMenuAction('open-settings', () => {
        setShowSettings(true)
      })

      const cleanupAddResource = window.electronAPI.onMenuAction('add-resource', () => {
        handleAddResource()
      })

      const cleanupCloneResource = window.electronAPI.onMenuAction('clone-resource', () => {
        handleCloneResource()
      })

      const cleanupDeleteResource = window.electronAPI.onMenuAction('delete-resource', () => {
        handleDeleteResource()
      })

      const cleanupInspectResource = window.electronAPI.onMenuAction('inspect-resource', () => {
        handleInspectResource()
      })

      const cleanupEditResource = window.electronAPI.onMenuAction('edit-resource', () => {
        handleEditResource()
      })

      const cleanupDocumentation = window.electronAPI.onMenuAction('open-documentation', () => {
        setShowDocs(true)
      })

      const cleanupRemoveFinalizers = window.electronAPI.onMenuAction('remove-finalizers', () => {
        handleRemoveFinalizers()
      })

      const cleanupRollingRestart = window.electronAPI.onMenuAction('rolling-restart', () => {
        handleRollingRestart()
      })

      return () => {
        cleanupSettings()
        cleanupAddResource()
        cleanupCloneResource()
        cleanupDeleteResource()
        cleanupInspectResource()
        cleanupEditResource()
        cleanupDocumentation()
        cleanupRemoveFinalizers()
        cleanupRollingRestart()
      }
    }
  }, [])

  // @contract Toolbar.refresh - Must dispatch 'toolbar-refresh' CustomEvent
  const handleRefresh = () => {
    // Emit a custom event that ResourceList can listen to
    window.dispatchEvent(new CustomEvent('toolbar-refresh'))
  }


  // @contract Toolbar.addResource - Must dispatch 'toolbar-add-resource' CustomEvent
  const handleAddResource = () => {
    window.dispatchEvent(new CustomEvent('toolbar-add-resource'))
  }

  // @contract Toolbar.cloneResource - Must dispatch 'toolbar-clone-resource' CustomEvent
  const handleCloneResource = () => {
    window.dispatchEvent(new CustomEvent('toolbar-clone-resource'))
  }

  // @contract Toolbar.editResource - Must dispatch 'toolbar-edit' CustomEvent
  const handleEditResource = () => {
    // Emit a custom event that ResourceList can listen to
    window.dispatchEvent(new CustomEvent('toolbar-edit'))
  }

  // @contract Toolbar.inspectResource - Must dispatch 'toolbar-inspect' CustomEvent
  const handleInspectResource = () => {
    // Emit a custom event that ResourceList can listen to
    window.dispatchEvent(new CustomEvent('toolbar-inspect'))
  }

  // @contract Toolbar.deleteResource - Must dispatch 'toolbar-delete' CustomEvent
  const handleDeleteResource = () => {
    // Emit a custom event that ResourceList can listen to
    window.dispatchEvent(new CustomEvent('toolbar-delete'))
  }

  // @contract Toolbar.removeFinalizers - Must dispatch 'toolbar-remove-finalizers' CustomEvent
  const handleRemoveFinalizers = () => {
    // Emit a custom event for removing finalizers (Pods)
    window.dispatchEvent(new CustomEvent('toolbar-remove-finalizers'))
  }

  // @contract Toolbar.rollingRestart - Must dispatch 'toolbar-rolling-restart' CustomEvent
  const handleRollingRestart = () => {
    // Emit a custom event for rolling restart (Deployments, StatefulSets)
    window.dispatchEvent(new CustomEvent('toolbar-rolling-restart'))
  }

  // @contract Toolbar.docs - Must open DocumentationViewer when docs button clicked
  const handleDocs = () => {
    setShowDocs(true)
  }

  // @contract Toolbar.escCloseDocs - Must close docs when ESC key pressed
  // Handle ESC key to close docs
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && showDocs) {
        setShowDocs(false)
      }
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [showDocs])

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return <Sun size={16} />
      case 'dark': return <Moon size={16} />
      default: return <Monitor size={16} />
    }
  }

  // @contract Toolbar.sseStatus - Must display SSE connection status
  const getSSEStatusIcon = () => {
    if (sseStatus.type === 'electron') {
      return <Zap size={14} className="text-blue-500" />
    }
    if (sseStatus.connected) {
      return <Wifi size={14} className="text-green-500" />
    }
    return <WifiOff size={14} className="text-red-500" />
  }

  const getSSEStatusText = () => {
    if (sseStatus.type === 'electron') {
      return 'Electron (Real-time)'
    }
    if (sseStatus.connected) {
      return 'Connected (Real-time)'
    }
    return 'Disconnected'
  }

  // @contract Toolbar.cycleTheme - Must cycle through light/dark/system themes
  const cycleTheme = () => {
    const themes = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2" style={{WebkitAppRegion: 'drag'}}>
        <div className="flex items-center justify-between">
          {/* Left side - action buttons */}
          <div className="flex items-center space-x-1 pl-20">
            <button
              onClick={handleRefresh}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              title="Refresh"
              aria-label="Refresh"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <RefreshCw size={16} />
            </button>

            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2" />

            <button
              onClick={handleAddResource}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              title="Add Resource"
              aria-label="Add Resource"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <Plus size={16} />
            </button>

            <button
              onClick={handleInspectResource}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              title="Inspect Resource"
              aria-label="Inspect Resource"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <Eye size={16} />
            </button>

            <button
              onClick={handleEditResource}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              title="Edit Resource"
              aria-label="Edit Resource"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <Edit3 size={16} />
            </button>

            <button
              onClick={handleCloneResource}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              title="Clone Resource"
              aria-label="Clone Resource"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <Copy size={16} />
            </button>

            <button
              onClick={handleDeleteResource}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              title="Delete Resource"
              aria-label="Delete Resource"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <Trash2 size={16} />
            </button>

            <button
              onClick={handleRemoveFinalizers}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              title="Remove Finalizers (Pods)"
              aria-label="Remove Finalizers"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <Eraser size={16} />
            </button>

            <button
              onClick={handleRollingRestart}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              title="Rolling Restart (Deployments/StatefulSets)"
              aria-label="Rolling Restart"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <RotateCw size={16} />
            </button>

            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-2" />

            <button
              onClick={handleDocs}
              className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
              title="Documentation"
              aria-label="Documentation"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <BookOpen size={16} />
            </button>
          </div>

          {/* @contract Toolbar.currentContext - Must display current context name when available */}
          <div className="flex items-center space-x-2">
            {/* SSE Status Indicator */}
            <div
              className="flex items-center space-x-1 text-sm text-gray-600 dark:text-gray-400"
              title={getSSEStatusText()}
            >
              {getSSEStatusIcon()}
              <span className="hidden sm:inline">{getSSEStatusText()}</span>
            </div>

            {currentContext && (
              <>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Context: <span className="font-medium">{currentContext}</span>
                </span>
              </>
            )}

            {/* @contract Toolbar.settings - Must open SettingsDialog when settings button clicked */}
            {/* Theme and settings only in web mode - Electron has native menus */}
            {!window.electronAPI && (
              <>
                <button
                  onClick={cycleTheme}
                  className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
                  title={`Theme: ${theme}`}
                  aria-label={`Theme: ${theme}`}
                  style={{WebkitAppRegion: 'no-drag'}}
                >
                  {getThemeIcon()}
                </button>

                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

                <button
                  onClick={() => setShowSettings(true)}
                  className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
                  title="Settings"
                  aria-label="Settings"
                  style={{WebkitAppRegion: 'no-drag'}}
                >
                  <Settings size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsDialog
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <DocumentationViewer
        isOpen={showDocs}
        onClose={() => setShowDocs(false)}
      />
    </>
  )
}

export default Toolbar