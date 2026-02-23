import React, { useState, useEffect, useMemo } from 'react'
import { useKubeConfig } from '../contexts/KubeConfigContext'
import LoadingSpinner from './LoadingSpinner'
import { kubeApi } from '../utils/api'

const ResourceView = ({ contextName, resource }) => {
  const { kubeConfigs } = useKubeConfig()
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedNamespace, setSelectedNamespace] = useState('default')
  const [namespaces, setNamespaces] = useState(['default'])
  const [searchFilter, setSearchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Memoize the resource kind and type to prevent unnecessary re-renders
  const resourceKind = useMemo(() => resource?.kind, [resource?.kind])
  const resourceType = useMemo(() => resource?.type, [resource?.type])

  // Fetch namespaces when context changes
  useEffect(() => {
    const fetchNamespaces = async () => {
      if (!contextName) return

      try {
        const data = await kubeApi.getNamespaces(contextName)
        if (data && data.items) {
          const namespaceNames = data.items.map(ns => ns.metadata?.name || ns).filter(Boolean)
          setNamespaces(namespaceNames.length > 0 ? namespaceNames : ['default'])
        }
      } catch (err) {
        console.warn('Failed to fetch namespaces:', err)
        setNamespaces(['default'])
      }
    }

    fetchNamespaces()
  }, [contextName])

  // Fetch resources when resource type, context, or namespace changes
  useEffect(() => {
    const fetchResources = async () => {
      if (!resourceKind || !contextName) return

      console.log('🔄 ResourceView: Starting fetch with', {
        resourceKind,
        resourceType,
        contextName,
        selectedNamespace
      })

      setLoading(true)
      setError(null)

      try {
        const isClusterScoped = ['Node', 'Namespace', 'ClusterRole', 'ClusterRoleBinding', 'PersistentVolume', 'StorageClass'].includes(resourceKind)
        let data

        switch (resourceKind) {
          case 'Pod':
            data = await kubeApi.getPods(contextName, isClusterScoped ? '' : selectedNamespace)
            break
          case 'Service':
            data = await kubeApi.getServices(contextName, isClusterScoped ? '' : selectedNamespace)
            break
          case 'Deployment':
            data = await kubeApi.getDeployments(contextName, isClusterScoped ? '' : selectedNamespace)
            break
          case 'ConfigMap':
            data = await kubeApi.getConfigMaps(contextName, isClusterScoped ? '' : selectedNamespace)
            break
          case 'Secret':
            data = await kubeApi.getSecrets(contextName, isClusterScoped ? '' : selectedNamespace)
            break
          case 'Node':
            data = await kubeApi.getNodes(contextName)
            break
          case 'Namespace':
            data = await kubeApi.getNamespaces(contextName)
            break
          case 'CustomResourceDefinition':
            data = await kubeApi.getCRDs(contextName)
            break
          default:
            data = await kubeApi.getResource(contextName, resourceKind.toLowerCase(), isClusterScoped ? '' : selectedNamespace)
        }

        setResources(data?.items || [])
      } catch (err) {
        setError(err.message)
        setResources([])
      } finally {
        setLoading(false)
      }
    }

    fetchResources()
  }, [resourceKind, resourceType, contextName, selectedNamespace])

  const formatAge = (timestamp) => {
    if (!timestamp) return 'Unknown'

    const now = new Date()
    const created = new Date(timestamp)
    const diffMs = now - created
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) return `${diffDays}d`
    if (diffHours > 0) return `${diffHours}h`
    if (diffMins > 0) return `${diffMins}m`
    return `${diffSecs}s`
  }

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'active':
      case 'ready':
        return 'text-green-600 dark:text-green-400'
      case 'pending':
      case 'waiting':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'failed':
      case 'error':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const isClusterScoped = ['Node', 'Namespace', 'ClusterRole', 'ClusterRoleBinding', 'PersistentVolume', 'StorageClass'].includes(resourceKind)

  // Filter resources based on search and status filters
  const filteredResources = resources.filter(item => {
    const name = item.metadata?.name || ''
    const status = item.status?.phase || item.status?.conditions?.[0]?.type || 'Unknown'

    const matchesSearch = searchFilter === '' || name.toLowerCase().includes(searchFilter.toLowerCase())
    const matchesStatus = statusFilter === 'all' || status.toLowerCase() === statusFilter.toLowerCase()

    return matchesSearch && matchesStatus
  })

  // Get unique statuses for filter dropdown
  const uniqueStatuses = [...new Set(resources.map(item => {
    const status = item.status?.phase || item.status?.conditions?.[0]?.type || 'Unknown'
    return status
  }))].sort()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {resourceType || 'Select a resource'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {contextName} {!isClusterScoped && `• namespace: ${selectedNamespace}`}
            </p>
          </div>

          {!isClusterScoped && (
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Namespace:
              </label>
              <select
                value={selectedNamespace}
                onChange={(e) => setSelectedNamespace(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {namespaces.map((ns) => (
                  <option key={ns} value={ns}>
                    {ns}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Filters Bar */}
        {resourceType && (
          <div className="flex items-center space-x-4">
            {/* Search Filter */}
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={`Search ${resourceType}...`}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full px-3 py-2 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Status:
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                {uniqueStatuses.map((status) => (
                  <option key={status} value={status.toLowerCase()}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            {/* Results Count */}
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {filteredResources.length} of {resources.length} items
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <LoadingSpinner size="large" />
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Loading {resourceType}...
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-red-600 dark:text-red-400 font-medium">Error</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{error}</p>
            </div>
          </div>
        ) : filteredResources.length === 0 && resources.length > 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                No {resourceType} match the current filters
              </p>
              <button
                onClick={() => {
                  setSearchFilter('')
                  setStatusFilter('all')
                }}
                className="mt-2 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 rounded-lg transition-colors"
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : resources.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2M4 13h2m8-8v2m0 6v2" />
                </svg>
              </div>
              <p className="text-gray-600 dark:text-gray-400">
                No {resourceType} found
                {!isClusterScoped && ` in namespace "${selectedNamespace}"`}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    {!isClusterScoped && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Namespace
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Age
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredResources.map((item, index) => {
                    const status = item.status?.phase || item.status?.conditions?.[0]?.type || 'Unknown'
                    const name = item.metadata?.name || 'Unknown'
                    const namespace = item.metadata?.namespace
                    const age = formatAge(item.metadata?.creationTimestamp)

                    return (
                      <tr key={`${namespace}-${name}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-medium">
                          {name}
                        </td>
                        {!isClusterScoped && (
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {namespace || '-'}
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm">
                          <span className={`font-medium ${getStatusColor(status)}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {age}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ResourceView