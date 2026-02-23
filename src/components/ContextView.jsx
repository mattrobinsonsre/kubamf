import React, { useState, useRef, useCallback, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import ResourceTree from './ResourceTree'
import ResourceList from './ResourceList'
import preferencesManager from '../utils/preferences'

// @contract ContextView.sidebar - Must render ResourceTree in a resizable sidebar
// @contract ContextView.resourceList - Must render ResourceList for selected resource configurations
// @contract ContextView.emptyState - Must show "Select a resource type to view" when no resource selected
// @contract ContextView.persistResource - Must persist selectedResource via preferencesManager
// @contract ContextView.persistNamespace - Must persist selectedNamespace via preferencesManager
// @contract ContextView.persistSidebarWidth - Must persist sidebarWidth via preferencesManager
// @contract ContextView.sidebarToggle - Must hide sidebar when resized below 120px, show toggle button
// @contract ContextView.contextSwitch - Must reload preferences when contextName changes
// @contract ContextView.resizeLimits - Must enforce min 120px (hide) and max 400px sidebar width
const ContextView = ({ contextName, context }) => {
  // Load persisted preferences for this context
  const [selectedResource, setSelectedResource] = useState(
    preferencesManager.getSelectedResource(contextName)
  )
  const [selectedNamespace, setSelectedNamespace] = useState(
    preferencesManager.getSelectedNamespace(contextName)
  )
  const [sidebarWidth, setSidebarWidth] = useState(
    preferencesManager.getSidebarWidth()
  )
  const [isResizing, setIsResizing] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const resizeRef = useRef(null)

  // Track ResourceList instances with their resource configurations
  const [resourceListConfigs, setResourceListConfigs] = useState(new Map())
  const [crdData, setCrdData] = useState([])

  // Persist resource selection changes
  const handleResourceSelect = async (resource) => {
    setSelectedResource(resource)
    await preferencesManager.setSelectedResource(contextName, resource)

    // Add this resource configuration if not already there
    if (resource) {
      const resourceKey = `${contextName}-${resource.kind}-${resource.type}`
      setResourceListConfigs(prev => {
        const newMap = new Map(prev)
        if (!newMap.has(resourceKey)) {
          newMap.set(resourceKey, { ...resource })
        }
        return newMap
      })
    }
  }

  // Persist namespace selection changes
  const handleNamespaceChange = async (namespace) => {
    setSelectedNamespace(namespace)
    await preferencesManager.setSelectedNamespace(contextName, namespace)
  }

  // Load preferences when context changes
  useEffect(() => {
    const resource = preferencesManager.getSelectedResource(contextName)
    setSelectedResource(resource)
    setSelectedNamespace(preferencesManager.getSelectedNamespace(contextName))

    // Add the initial resource configuration
    if (resource) {
      const resourceKey = `${contextName}-${resource.kind}-${resource.type}`
      setResourceListConfigs(prev => {
        const newMap = new Map(prev)
        if (!newMap.has(resourceKey)) {
          newMap.set(resourceKey, { ...resource })
        }
        return newMap
      })
    }
  }, [contextName])

  const startResize = useCallback((e) => {
    setIsResizing(true)
    e.preventDefault()
  }, [])

  const stopResize = useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = useCallback(
    async (e) => {
      if (isResizing) {
        const newWidth = e.clientX
        if (newWidth < 120) {
          // Hide sidebar if too narrow
          setSidebarVisible(false)
          setSidebarWidth(256) // Reset to default width for when it's shown again
        } else if (newWidth > 400) {
          // Max width limit
          setSidebarWidth(400)
          await preferencesManager.setSidebarWidth(400)
        } else {
          setSidebarWidth(newWidth)
          setSidebarVisible(true)
          await preferencesManager.setSidebarWidth(newWidth)
        }
      }
    },
    [isResizing]
  )

  const showSidebar = () => {
    setSidebarVisible(true)
  }

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', resize)
      document.addEventListener('mouseup', stopResize)
      return () => {
        document.removeEventListener('mousemove', resize)
        document.removeEventListener('mouseup', stopResize)
      }
    }
  }, [isResizing, resize, stopResize])

  return (
    <div className="flex-1 flex h-full">
      {/* Sidebar Toggle Button (when hidden) */}
      {!sidebarVisible && (
        <button
          onClick={showSidebar}
          className="w-8 h-8 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-r-md flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors z-10"
          title="Show sidebar"
        >
          <ChevronRight size={16} className="text-gray-600 dark:text-gray-400" />
        </button>
      )}

      {/* Resource Tree Sidebar */}
      {sidebarVisible && (
        <div
          className="border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0 flex flex-col h-full relative"
          style={{ width: sidebarWidth }}
        >
          <ResourceTree
            contextName={contextName}
            selectedResource={selectedResource}
            selectedNamespace={selectedNamespace}
            onResourceSelect={handleResourceSelect}
            onCRDsLoaded={setCrdData}
          />

          {/* Resize Handle */}
          <div
            ref={resizeRef}
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-transparent hover:bg-blue-500 hover:opacity-50 transition-colors z-10"
            onMouseDown={startResize}
            title="Drag to resize sidebar"
          />
        </div>
      )}

      {/* Main Content Area - Resource Lists */}
      <div className="flex-1 overflow-hidden relative">
        {/* Render all created ResourceList instances */}
        {Array.from(resourceListConfigs.entries()).map(([resourceKey, resourceConfig]) => {
          const isVisible = selectedResource &&
                           resourceKey === `${contextName}-${selectedResource.kind}-${selectedResource.type}`

          return (
            <div
              key={resourceKey}
              className="absolute inset-0"
              style={{
                display: isVisible ? 'block' : 'none',
                visibility: isVisible ? 'visible' : 'hidden'
              }}
            >
              <ResourceList
                contextName={contextName}
                selectedResource={resourceConfig}
                selectedNamespace={selectedNamespace}
                onNamespaceChange={handleNamespaceChange}
                isVisible={isVisible}
                crdData={crdData}
              />
            </div>
          )
        })}

        {/* Show empty state if no resource selected */}
        {!selectedResource && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p>Select a resource type to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ContextView