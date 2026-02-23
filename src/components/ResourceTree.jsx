import React, { useState, useEffect } from 'react'
import preferencesManager from '../utils/preferences'
import { kubeApi } from '../utils/api'

// @contract ResourceTree.loadPreferences - Must load expanded categories from preferences on mount
// @contract ResourceTree.fetchCRDs - Must fetch CRDs when contextName changes, both Electron and web paths
// @contract ResourceTree.autoRefreshCRDs - Must auto-refresh CRDs every 30 seconds
// @contract ResourceTree.toggleCategory - Must toggle category expansion and save to preferences
// @contract ResourceTree.expandAll - Must expand all categories and save to preferences
// @contract ResourceTree.collapseAll - Must collapse all categories and save to preferences
// @contract ResourceTree.resourceSelect - Must call onResourceSelect when a resource is clicked
// @contract ResourceTree.searchFilter - Must filter resources by type name (case insensitive)
// @contract ResourceTree.clearSearch - Must clear search term and show all resources
// @contract ResourceTree.selectedHighlight - Must highlight the currently selected resource
// @contract ResourceTree.builtinCategories - Must render all 5 built-in resource categories with correct resources
// @contract ResourceTree.customResourceSeparator - Must show separator before custom resource categories
const ResourceTree = ({ contextName, selectedResource, onResourceSelect, onCRDsLoaded }) => {
  const [expandedCategories, setExpandedCategories] = useState(new Set(['workloads']))
  const [searchTerm, setSearchTerm] = useState('')
  const [customResourceCategories, setCustomResourceCategories] = useState([])

  // @contract ResourceTree.loadPreferences
  // Load preferences on mount
  useEffect(() => {
    const savedExpandedCategories = preferencesManager.getExpandedCategories()
    setExpandedCategories(savedExpandedCategories)
  }, [])

  // @contract ResourceTree.fetchCRDs
  // @contract ResourceTree.autoRefreshCRDs
  // Load CRDs when context changes and set up auto-refresh
  useEffect(() => {
    if (contextName) {
      fetchCRDs()

      // Set up auto-refresh every 30 seconds
      const intervalId = setInterval(() => {
        fetchCRDs()
      }, 30000)

      return () => clearInterval(intervalId)
    }
  }, [contextName])

  const fetchCRDs = async () => {
    try {
      if (window.electronAPI) {
        // Electron mode - use IPC
        const response = await window.electronAPI.kubectl.getCRDs(contextName)
        if (response.success) {
          const crds = response.data.items || []
          organizeCRDsByAPI(crds)
          if (onCRDsLoaded) onCRDsLoaded(crds)
        }
      } else {
        // Web mode - use streaming API
        await kubeApi.getCRDsStream(
          contextName,
          (data) => {
            // Update progressively as data comes in
            if (data.items && data.items.length > 0) {
              organizeCRDsByAPI(data.items)
              if (onCRDsLoaded) onCRDsLoaded(data.items)
            }
          },
          (result, error) => {
            if (error) {
              console.error('Failed to fetch CRDs:', error)
            } else if (result && result.items) {
              organizeCRDsByAPI(result.items)
              if (onCRDsLoaded) onCRDsLoaded(result.items)
            }
          }
        )
      }
    } catch (error) {
      console.error('Failed to fetch CRDs:', error)
    }
  }

  const organizeCRDsByAPI = (crds) => {
    const apiGroups = {}

    crds.forEach(crd => {
      const group = crd.spec?.group || 'core'
      const versions = crd.spec?.versions || []
      const names = crd.spec?.names || {}

      if (!apiGroups[group]) {
        apiGroups[group] = {
          name: group === 'core' ? 'Core' : group,
          key: `api-${group.replace(/\./g, '-')}`,
          resources: []
        }
      }

      apiGroups[group].resources.push({
        type: names.plural || names.kind,
        kind: names.kind,
        icon: '🔧',
        apiVersion: `${group}/${versions[0]?.name || 'v1'}`,
        scope: crd.spec?.scope || 'Namespaced',
        crd: crd // Store the full CRD for reference
      })
    })

    const categories = Object.values(apiGroups).sort((a, b) => {
      if (a.key === 'api-core') return -1
      if (b.key === 'api-core') return 1
      return a.name.localeCompare(b.name)
    })

    // Patch the state to preserve expanded state
    setCustomResourceCategories(prevCategories => {
      // If it's the same data, don't update
      if (JSON.stringify(prevCategories) === JSON.stringify(categories)) {
        return prevCategories
      }
      return categories
    })
  }

  // @contract ResourceTree.builtinCategories
  const resourceCategories = [
    {
      name: 'Workloads',
      key: 'workloads',
      resources: [
        { type: 'Pods', kind: 'Pod', icon: '🏗️', scope: 'Namespaced' },
        { type: 'Deployments', kind: 'Deployment', icon: '🚀', scope: 'Namespaced' },
        { type: 'ReplicaSets', kind: 'ReplicaSet', icon: '📊', scope: 'Namespaced' },
        { type: 'StatefulSets', kind: 'StatefulSet', icon: '💾', scope: 'Namespaced' },
        { type: 'DaemonSets', kind: 'DaemonSet', icon: '👹', scope: 'Namespaced' },
        { type: 'Jobs', kind: 'Job', icon: '⚡', scope: 'Namespaced' },
        { type: 'CronJobs', kind: 'CronJob', icon: '⏰', scope: 'Namespaced' },
      ]
    },
    {
      name: 'Services & Networking',
      key: 'networking',
      resources: [
        { type: 'Services', kind: 'Service', icon: '🌐', scope: 'Namespaced' },
        { type: 'Ingresses', kind: 'Ingress', icon: '🚪', scope: 'Namespaced' },
        { type: 'NetworkPolicies', kind: 'NetworkPolicy', icon: '🛡️', scope: 'Namespaced' },
        { type: 'Endpoints', kind: 'Endpoints', icon: '🎯', scope: 'Namespaced' },
      ]
    },
    {
      name: 'Config & Storage',
      key: 'config',
      resources: [
        { type: 'ConfigMaps', kind: 'ConfigMap', icon: '⚙️', scope: 'Namespaced' },
        { type: 'Secrets', kind: 'Secret', icon: '🔐', scope: 'Namespaced' },
        { type: 'PersistentVolumes', kind: 'PersistentVolume', icon: '💽', scope: 'Cluster' },
        { type: 'PersistentVolumeClaims', kind: 'PersistentVolumeClaim', icon: '📀', scope: 'Namespaced' },
        { type: 'StorageClasses', kind: 'StorageClass', icon: '🗄️', scope: 'Cluster' },
      ]
    },
    {
      name: 'Security & Access',
      key: 'security',
      resources: [
        { type: 'ServiceAccounts', kind: 'ServiceAccount', icon: '👤', scope: 'Namespaced' },
        { type: 'Roles', kind: 'Role', icon: '🔑', scope: 'Namespaced' },
        { type: 'ClusterRoles', kind: 'ClusterRole', icon: '🗝️', scope: 'Cluster' },
        { type: 'RoleBindings', kind: 'RoleBinding', icon: '🔗', scope: 'Namespaced' },
        { type: 'ClusterRoleBindings', kind: 'ClusterRoleBinding', icon: '⛓️', scope: 'Cluster' },
      ]
    },
    {
      name: 'Cluster',
      key: 'cluster',
      resources: [
        { type: 'Nodes', kind: 'Node', icon: '🖥️', scope: 'Cluster' },
        { type: 'Namespaces', kind: 'Namespace', icon: '📁', scope: 'Cluster' },
        { type: 'Events', kind: 'Event', icon: '📝', scope: 'Namespaced' },
        { type: 'CustomResourceDefinitions', kind: 'CustomResourceDefinition', icon: '🔧', scope: 'Cluster' },
      ]
    }
  ]

  // @contract ResourceTree.toggleCategory
  const toggleCategory = async (categoryKey) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryKey)) {
      newExpanded.delete(categoryKey)
    } else {
      newExpanded.add(categoryKey)
    }
    setExpandedCategories(newExpanded)
    await preferencesManager.setExpandedCategories(newExpanded)
  }

  // @contract ResourceTree.expandAll
  const expandAll = async () => {
    const allCategories = new Set([
      ...resourceCategories.map(cat => cat.key),
      ...customResourceCategories.map(cat => cat.key)
    ])
    setExpandedCategories(allCategories)
    await preferencesManager.setExpandedCategories(allCategories)
  }

  // @contract ResourceTree.collapseAll
  const collapseAll = async () => {
    setExpandedCategories(new Set())
    await preferencesManager.setExpandedCategories(new Set())
  }

  // @contract ResourceTree.resourceSelect
  const handleResourceClick = (resource) => {
    onResourceSelect(resource)
  }

  // Combine all categories
  const allCategories = [...resourceCategories, ...customResourceCategories]

  // @contract ResourceTree.searchFilter
  // Filter resources based on search term
  const filteredCategories = searchTerm
    ? allCategories.map(category => ({
        ...category,
        resources: category.resources.filter(resource =>
          resource.type.toLowerCase().includes(searchTerm.toLowerCase())
        )
      })).filter(category => category.resources.length > 0)
    : allCategories


  return (
    <div className="h-full overflow-hidden flex flex-col"
    >
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        {/* Expand/collapse buttons and search bar */}
        <div className="relative flex gap-2">
          {/* Expand/Collapse symbol buttons */}
          {!searchTerm && (
            <>
              <button
                onClick={expandAll}
                title="Expand All"
                aria-label="Expand All"
                className="px-2 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6M6 15l6 6 6-6" />
                </svg>
              </button>
              <button
                onClick={collapseAll}
                title="Collapse All"
                aria-label="Collapse All"
                className="px-2 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 18l6-6-6-6M15 18l6-6-6-6" />
                </svg>
              </button>
            </>
          )}

          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 pl-8 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {/* Clear button */}
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Clear search"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex-1 p-2 overflow-y-auto resource-list-scroll"
        style={{ scrollbarWidth: 'thin', minHeight: 0 }}
      >
        {filteredCategories.map((category, index) => {
          const isExpanded = expandedCategories.has(category.key)
          const isFirstCustomCategory = index === resourceCategories.length &&
                                        customResourceCategories.length > 0 &&
                                        filteredCategories.length > resourceCategories.length

          return (
            <React.Fragment key={category.key}>
              {/* Add separator before first custom resource category */}
              {isFirstCustomCategory && (
                <div className="my-4 px-3">
                  <div className="border-t border-gray-300 dark:border-gray-600"></div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-2 mb-1">
                    Custom Resources
                  </div>
                </div>
              )}
              <div className="mb-2">
              <button
                onClick={() => toggleCategory(category.key)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <span className="flex items-center min-w-0 flex-1">
                  <svg
                    className={`w-4 h-4 mr-2 flex-shrink-0 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                  <span className="truncate whitespace-nowrap">{category.name}</span>
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                  {category.resources.length}
                </span>
              </button>

              {isExpanded && (
                <div className="ml-4 mt-1 space-y-1">
                  {category.resources.map((resource) => {
                    const isSelected = selectedResource?.type === resource.type

                    return (
                      <button
                        key={resource.type}
                        onClick={() => handleResourceClick(resource)}
                        className={`w-full flex items-center px-3 py-2 text-sm rounded-lg transition-colors text-left ${
                          isSelected
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                        }`}
                      >
                        <span className="mr-2 text-base flex-shrink-0">{resource.icon}</span>
                        <span className="truncate whitespace-nowrap">{resource.type}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default ResourceTree