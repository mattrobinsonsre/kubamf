import React, { useState, useEffect, useRef } from 'react'
import { useKubeConfig } from '../contexts/KubeConfigContext'
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import preferencesManager from '../utils/preferences'
import ContextView from './ContextView'

// @contract ContextTabs.emptyState - Must show "No Kubernetes Contexts Found" when contexts array is empty
// @contract ContextTabs.renderTabs - Must render a tab for each context in tabOrder
// @contract ContextTabs.activeTab - Must apply active styling (bg-blue-100, border-blue-600) to currentContext tab
// @contract ContextTabs.switchContext - Must call switchContext when a tab is clicked
// @contract ContextTabs.truncate - Must truncate context names longer than 20 characters with "..."
// @contract ContextTabs.connectionIcon - Must show AlertCircle icon when connectionStates[contextName] === false
// @contract ContextTabs.tabOrder - Must load/save tab order via preferencesManager
// @contract ContextTabs.dragReorder - Must support drag-and-drop tab reordering
// @contract ContextTabs.contextView - Must render ContextView for the currentContext
// @contract ContextTabs.scrollArrows - Must show scroll arrows when tabs overflow
const ContextTabs = () => {
  const { contexts, currentContext, switchContext, connectionStates } = useKubeConfig()
  const [tabOrder, setTabOrder] = useState([])
  const [draggedTab, setDraggedTab] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [scrollPosition, setScrollPosition] = useState(0)
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(false)
  const tabContainerRef = useRef(null)


  useEffect(() => {
    if (contexts.length > 0) {
      // Load saved tab order from preferences
      const savedOrder = preferencesManager.getTabOrder()
      if (savedOrder.length > 0) {
        // Keep saved order for known contexts, then append any new contexts not in saved order
        const existing = savedOrder.filter(name => contexts.find(c => c.name === name))
        const newContexts = contexts.filter(c => !savedOrder.includes(c.name)).map(c => c.name)
        setTabOrder([...existing, ...newContexts])
      } else {
        setTabOrder(contexts.map(c => c.name))
      }
    }
  }, [contexts])

  // Check scroll arrows visibility
  useEffect(() => {
    const checkScrollArrows = () => {
      if (tabContainerRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = tabContainerRef.current
        setShowLeftArrow(scrollLeft > 0)
        setShowRightArrow(scrollLeft < scrollWidth - clientWidth)
        setScrollPosition(scrollLeft)
      }
    }

    checkScrollArrows()
    const container = tabContainerRef.current
    if (container) {
      container.addEventListener('scroll', checkScrollArrows)
      window.addEventListener('resize', checkScrollArrows)
      return () => {
        container.removeEventListener('scroll', checkScrollArrows)
        window.removeEventListener('resize', checkScrollArrows)
      }
    }
  }, [tabOrder])


  // Auto-scroll to the active tab when context changes or tabs load
  useEffect(() => {
    if (currentContext && tabContainerRef.current) {
      const activeTab = tabContainerRef.current.querySelector(`[data-context="${currentContext}"]`)
      if (activeTab?.scrollIntoView) {
        activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [currentContext, tabOrder])

  const saveTabOrder = async (newOrder) => {
    setTabOrder(newOrder)
    await preferencesManager.setTabOrder(newOrder)
  }

  const scrollLeft = () => {
    if (tabContainerRef.current) {
      tabContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' })
    }
  }

  const scrollRight = () => {
    if (tabContainerRef.current) {
      tabContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' })
    }
  }


  const handleTabClick = (contextName) => {
    switchContext(contextName)
  }

  const handleDragStart = (e, contextName, index) => {
    setDraggedTab({ name: contextName, index })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', e.target)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIndex(index)
  }

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverIndex(null)
    }
  }

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault()
    setDragOverIndex(null)

    if (!draggedTab || draggedTab.index === dropIndex) {
      setDraggedTab(null)
      return
    }

    const newOrder = [...tabOrder]
    const draggedContextName = newOrder[draggedTab.index]

    // Remove the dragged item
    newOrder.splice(draggedTab.index, 1)

    // Insert at new position
    newOrder.splice(dropIndex, 0, draggedContextName)

    setTabOrder(newOrder)
    await saveTabOrder(newOrder)
    setDraggedTab(null)
  }

  const handleDragEnd = () => {
    setDraggedTab(null)
    setDragOverIndex(null)
  }


  const truncateContextName = (name, maxLength = 20) => {
    if (name.length <= maxLength) return name
    return name.substring(0, maxLength - 3) + '...'
  }

  const getConnectionIcon = (contextName) => {
    const isConnected = connectionStates[contextName]
    if (isConnected === false) {
      return <AlertCircle size={12} className="text-red-500 ml-1" />
    }
    return null
  }

  const visibleTabs = tabOrder

  if (contexts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">No Kubernetes Contexts Found</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Please configure kubectl or check your kubeconfig file.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Tab Bar Container */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0" style={{WebkitAppRegion: 'drag'}}>
        <div className="flex items-center min-w-0 flex-1">
          {/* Left scroll arrow */}
          {showLeftArrow && (
            <button
              onClick={scrollLeft}
              className="flex-shrink-0 w-8 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border-r border-gray-200 dark:border-gray-600 transition-colors"
              title="Scroll left"
              aria-label="Scroll left"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <ChevronLeft size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}

          {/* Scrollable Tab Container - This has overflow but is contained within the h-screen parent */}
          <div
            ref={tabContainerRef}
            className="flex overflow-x-auto scrollbar-hide flex-1 min-w-0"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitAppRegion: 'no-drag' }}
            onWheel={(e) => {
              // Prevent vertical scrolling from affecting horizontal tab scrolling
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                e.stopPropagation()
              }
              // Allow horizontal scrolling to bubble up for trackpad gestures
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault()
              }
            }}
          >
            {visibleTabs.map((contextName, index) => {
              const isActive = contextName === currentContext
              const context = contexts.find(c => c.name === contextName)
              const isDragging = draggedTab?.name === contextName
              const isDropTarget = dragOverIndex === index

              return (
                <div
                  key={contextName}
                  data-context={contextName}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, contextName, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleTabClick(contextName)}
                  className={`
                    flex items-center px-4 py-2 cursor-pointer border-r border-gray-200 dark:border-gray-700
                    hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-w-0 flex-shrink-0
                    ${isActive
                      ? 'bg-blue-100 dark:bg-blue-900 border-b-4 border-blue-600 shadow-lg font-bold text-blue-800 dark:text-blue-50 ring-1 ring-blue-200 dark:ring-blue-700'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }
                    ${isDragging
                      ? 'opacity-50 transform scale-95'
                      : ''
                    }
                    ${isDropTarget
                      ? 'bg-blue-100 dark:bg-blue-900 border-l-2 border-blue-500'
                      : ''
                    }
                  `}
                  style={{
                    transform: isDragging ? 'rotate(5deg)' : 'none',
                    transition: isDragging ? 'none' : 'all 0.2s ease'
                  }}
                >
                  <span className="text-sm font-medium truncate text-gray-900 dark:text-gray-100 select-none">
                    {truncateContextName(contextName)}
                  </span>

                  {getConnectionIcon(contextName)}
                </div>
              )
            })}
          </div>

          {/* Right scroll arrow */}
          {showRightArrow && (
            <button
              onClick={scrollRight}
              className="flex-shrink-0 w-8 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border-l border-gray-200 dark:border-gray-600 transition-colors"
              title="Scroll right"
              aria-label="Scroll right"
              style={{WebkitAppRegion: 'no-drag'}}
            >
              <ChevronRight size={16} className="text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar and Main Content */}
        {currentContext && (
          <ContextView
            contextName={currentContext}
            context={contexts.find(c => c.name === currentContext)}
          />
        )}
      </div>
    </div>
  )
}

export default ContextTabs