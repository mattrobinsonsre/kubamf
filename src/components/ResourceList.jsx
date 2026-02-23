import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Search, Filter, AlertTriangle, CheckCircle, Clock, XCircle, X, ChevronDown, RefreshCw, Terminal, FileText } from 'lucide-react'
import { useKubeConfig } from '../contexts/KubeConfigContext'
import * as resourceSorting from '../utils/resourceSorting'
import { createResourceHelpers, formatCpuValue, formatMemoryValue, getResourceColor, parseContainerState, getPodResourceWarnings } from '../utils/resourceHelpers'
import { kubeApi } from '../utils/api'
import ContainerRow from './ContainerRow'
import ExpandButton from './ExpandButton'
import StatusBadge from './StatusBadge'
import SubResourceHeader from './SubResourceHeader'
import ResourceInspector from './ResourceInspector'
import YamlEditor from './YamlEditor'
import CreateResourceDialog from './CreateResourceDialog'
import ContainerShell from './ContainerShell'
import LogViewer from './LogViewer'
import { prepareForClone } from '../utils/resource-utils'
import YAML from 'yaml'

const ResourceList = ({ contextName, selectedResource, selectedNamespace = 'default', onNamespaceChange, isVisible = true, crdData = [] }) => {
  const { isElectron, kubectlAPI } = useKubeConfig()
  const [resources, setResources] = useState([])
  const [namespaces, setNamespaces] = useState([])
  const [currentNamespace, setCurrentNamespace] = useState(selectedNamespace)
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [podMetrics, setPodMetrics] = useState({}) // Store metrics by pod key (namespace/name)
  const [podContainers, setPodContainers] = useState({}) // Store containers by pod key
  const [expandedResources, setExpandedResources] = useState(new Set()) // Track which resources are expanded
  const [childResources, setChildResources] = useState({}) // Store child resources for expanded items
  const [selectedResources, setSelectedResources] = useState(new Set()) // Track selected resources
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null) // Track last selected index for shift-click
  const [inspectedResource, setInspectedResource] = useState(null) // Resource being inspected
  const [showInspector, setShowInspector] = useState(false) // Show/hide inspector panel
  const [showEditor, setShowEditor] = useState(false) // Show/hide YAML editor
  const [editedResource, setEditedResource] = useState(null) // Resource being edited
  const [showShell, setShowShell] = useState(false) // Show/hide shell
  const [shellPod, setShellPod] = useState(null) // Pod for shell
  const [shellContainer, setShellContainer] = useState(null) // Container for shell
  const [showLogs, setShowLogs] = useState(false) // Show/hide logs viewer
  const [logsPod, setLogsPod] = useState(null) // Pod for logs
  const [logsContainer, setLogsContainer] = useState(null) // Container for logs
  const [showCreateDialog, setShowCreateDialog] = useState(false) // Show/hide create dialog
  const [createEditorMode, setCreateEditorMode] = useState(false) // Show editor in create mode
  const [createYaml, setCreateYaml] = useState('') // YAML for create mode
  const [createSchema, setCreateSchema] = useState(null) // Schema for create mode
  const [createKind, setCreateKind] = useState('') // Kind for create mode

  const tableRef = useRef(null)
  const metricsAbortControllerRef = useRef(null)
  const sseConnectionRef = useRef(null)
  const refreshStateRef = useRef({ loading: false, streaming: false })

  // Use conversion functions from resourceSorting module
  const cpuToMillicores = resourceSorting.cpuToMillicores
  const memoryToBytes = resourceSorting.memoryToBytes

  // Create helper functions using the factory function
  const helpers = useMemo(
    () => createResourceHelpers(selectedResource?.kind, podMetrics),
    [selectedResource?.kind, podMetrics]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any pending metrics loading on unmount
      if (metricsAbortControllerRef.current) {
        metricsAbortControllerRef.current.abort()
      }
      // Close any SSE connections
      if (sseConnectionRef.current) {
        sseConnectionRef.current.close()
      }
    }
  }, [])

  // Fetch namespaces when context changes
  useEffect(() => {
    if (contextName) {
      fetchNamespaces()
    }
  }, [contextName])

  // Update current namespace when selectedNamespace prop changes or context changes
  useEffect(() => {
    if (contextName && selectedNamespace) {
      setCurrentNamespace(selectedNamespace)
    }
  }, [selectedNamespace, contextName])

  // Keep refresh state ref updated
  useEffect(() => {
    refreshStateRef.current = { loading, streaming }
  }, [loading, streaming])


  // Track previous visibility to detect when component becomes visible
  const prevIsVisibleRef = useRef(isVisible)

  // Fetch resources when context, resource type, or namespace changes
  useEffect(() => {
    if (contextName && selectedResource && currentNamespace) {
      // Check if component just became visible (was hidden, now visible)
      const justBecameVisible = !prevIsVisibleRef.current && isVisible
      prevIsVisibleRef.current = isVisible

      if (justBecameVisible) {
        // Do immediate refresh when becoming visible
        if (!refreshStateRef.current.loading && !refreshStateRef.current.streaming) {
          fetchResourcesWithPatch()
        }
      } else if (!resources.length) {
        // Initial fetch if no resources loaded yet
        fetchResources()
      }

      // Set up auto-refresh with different intervals based on visibility
      // Visible: 10 seconds (for active monitoring)
      // Hidden: 5 minutes (to keep data relatively fresh without overloading)
      const refreshInterval = isVisible ? 10000 : 300000

      const intervalId = setInterval(() => {
        // Only refresh if not currently loading or streaming
        if (!refreshStateRef.current.loading && !refreshStateRef.current.streaming) {
          fetchResourcesWithPatch()
        }
      }, refreshInterval)

      return () => clearInterval(intervalId)
    }
  }, [contextName, selectedResource, currentNamespace, isVisible])

  const fetchNamespaces = async () => {
    try {
      if (isElectron && kubectlAPI) {
        // Use kubectl API for Electron
        const result = await kubectlAPI.getNamespaces(contextName)
        console.log('Namespace fetch result:', result)

        if (result.success) {
          const namespaceList = result.data.items || []
          const namespaceNames = Array.isArray(namespaceList)
            ? namespaceList.map(ns => ns.metadata?.name || ns.name || ns).sort()
            : []
          setNamespaces(namespaceNames)
        } else {
          console.error('Failed to fetch namespaces:', result.error)
          setNamespaces([])
        }
      } else {
        // Use streaming API for web to avoid timeouts
        await kubeApi.getNamespacesStream(
          contextName,
          (data) => {
            // Update progressively as data comes in
            if (data.items && data.items.length > 0) {
              const namespaceNames = data.items
                .map(ns => ns.metadata?.name || ns.name || ns)
                .sort()
              setNamespaces(namespaceNames)
            }
          },
          (result, error) => {
            if (error) {
              console.error('Error fetching namespaces:', error)
              setNamespaces([])
            } else if (result && result.items) {
              const namespaceNames = result.items
                .map(ns => ns.metadata?.name || ns.name || ns)
                .sort()
              setNamespaces(namespaceNames)
            }
          }
        )
      }
    } catch (err) {
      console.error('Error fetching namespaces:', err)
      setNamespaces([])
    }
  }

  // Patching function for auto-refresh that preserves state
  const fetchResourcesWithPatch = async () => {
    if (!selectedResource?.kind) return

    // Don't show loading indicator for background refresh
    // Save current scroll position
    const scrollTop = tableRef.current?.parentElement?.scrollTop

    try {
      let data = []
      const isAllNamespaces = currentNamespace === 'All Namespaces'
      const isClusterScoped = selectedResource.scope === 'Cluster'
      const targetNamespace = isClusterScoped ? null : (isAllNamespaces ? null : currentNamespace)

      if (isElectron && kubectlAPI) {
        // Use kubectl API for Electron
        let result
        if ((isAllNamespaces && !isClusterScoped) || isClusterScoped) {
          // For "All Namespaces", use a single call with empty namespace
          switch (selectedResource.kind) {
            case 'Pod':
              result = await kubectlAPI.getPods(contextName, '')
              break
            case 'Service':
              result = await kubectlAPI.getServices(contextName, '')
              break
            case 'Deployment':
              result = await kubectlAPI.getDeployments(contextName, '')
              break
            case 'ConfigMap':
              result = await kubectlAPI.getConfigMaps(contextName, '')
              break
            case 'Secret':
              result = await kubectlAPI.getSecrets(contextName, '')
              break
            default:
              result = await kubectlAPI.getResource(contextName, selectedResource.kind, '')
          }
        } else {
          // Single namespace or cluster-scoped resources
          switch (selectedResource.kind) {
            case 'Pod':
              result = await kubectlAPI.getPods(contextName, targetNamespace)
              break
            case 'Service':
              result = await kubectlAPI.getServices(contextName, targetNamespace)
              break
            case 'Deployment':
              result = await kubectlAPI.getDeployments(contextName, targetNamespace)
              break
            case 'ConfigMap':
              result = await kubectlAPI.getConfigMaps(contextName, targetNamespace)
              break
            case 'Secret':
              result = await kubectlAPI.getSecrets(contextName, targetNamespace)
              break
            case 'Node':
              result = await kubectlAPI.getNodes(contextName)
              break
            case 'Namespace':
              result = await kubectlAPI.getNamespaces(contextName)
              break
            default:
              result = await kubectlAPI.getResource(contextName, selectedResource.kind, targetNamespace)
          }
        }

        if (result && result.success) {
          data = result.data?.items || []
        }
      } else {
        // Use HTTP API for web
        const resourceType = selectedResource.type
        let result

        const fetchNamespace = (isAllNamespaces && !isClusterScoped) ? '' : targetNamespace

        // Don't use streaming for auto-refresh
        switch (selectedResource.kind) {
          case 'Pod':
            result = await kubeApi.getPods(contextName, fetchNamespace)
            break
          case 'Service':
            result = await kubeApi.getServices(contextName, fetchNamespace)
            break
          case 'Deployment':
            result = await kubeApi.getDeployments(contextName, fetchNamespace)
            break
          case 'ConfigMap':
            result = await kubeApi.getConfigMaps(contextName, fetchNamespace)
            break
          case 'Secret':
            result = await kubeApi.getSecrets(contextName, fetchNamespace)
            break
          case 'Node':
            result = await kubeApi.getNodes(contextName)
            break
          case 'Namespace':
            result = await kubeApi.getNamespaces(contextName)
            break
          case 'CustomResourceDefinition':
            result = await kubeApi.getCRDs(contextName)
            break
          default:
            const nsParam = isClusterScoped ? undefined : fetchNamespace
            result = await kubeApi.getResources(contextName, resourceType, nsParam)
            break
        }

        data = result.items || result
      }

      const resourcesArray = Array.isArray(data) ? data : []

      // Patch resources to preserve expanded state
      setResources(prevResources => {
        // Create a map of previous resources by key for quick lookup
        const prevMap = new Map()
        prevResources.forEach(r => {
          const key = `${r.metadata?.namespace || 'cluster'}/${r.metadata?.name || r.name}`
          prevMap.set(key, r)
        })

        // Update resources while preserving any client-side state
        return resourcesArray.map(newResource => {
          const key = `${newResource.metadata?.namespace || 'cluster'}/${newResource.metadata?.name || newResource.name}`
          const prevResource = prevMap.get(key)

          // Preserve the 'kind' property if it was set previously
          if (prevResource?.kind && !newResource.kind) {
            newResource.kind = prevResource.kind
          }

          return newResource
        })
      })

      // For pods, update metrics for only new or changed pods
      if (selectedResource.kind === 'Pod' && resourcesArray.length > 0) {
        loadPodMetricsAsync(resourcesArray, metricsAbortControllerRef.current?.signal)
      }

      // Restore scroll position
      if (scrollTop !== undefined && tableRef.current?.parentElement) {
        tableRef.current.parentElement.scrollTop = scrollTop
      }
    } catch (err) {
      // Silently ignore errors in background refresh
      console.debug('Background refresh error:', err)
    }
  }

  const fetchResources = async () => {
    if (!selectedResource?.kind) return

    setLoading(true)
    setError(null)
    setResources([]) // Clear existing resources for streaming

    // Cancel any active SSE connection
    if (sseConnectionRef.current) {
      sseConnectionRef.current.close()
      sseConnectionRef.current = null
    }

    setStreaming(false)

    try {
      let data = []
      const isAllNamespaces = currentNamespace === 'All Namespaces'
      const isClusterScoped = selectedResource.scope === 'Cluster'
      const targetNamespace = isClusterScoped ? null : (isAllNamespaces ? null : currentNamespace)

      if (isElectron && kubectlAPI) {
        // Use kubectl API for Electron
        let result
        if ((isAllNamespaces && !isClusterScoped) || isClusterScoped) {
          // For "All Namespaces", use a single call with empty namespace (triggers --all-namespaces)
          switch (selectedResource.kind) {
            case 'Pod':
              result = await kubectlAPI.getPods(contextName, '')
              break
            case 'Service':
              result = await kubectlAPI.getServices(contextName, '')
              break
            case 'Deployment':
              result = await kubectlAPI.getDeployments(contextName, '')
              break
            case 'ConfigMap':
              result = await kubectlAPI.getConfigMaps(contextName, '')
              break
            case 'Secret':
              result = await kubectlAPI.getSecrets(contextName, '')
              break
            default:
              result = await kubectlAPI.getResource(contextName, selectedResource.kind, '')
          }
        } else {
          // Single namespace or cluster-scoped resources
          switch (selectedResource.kind) {
            case 'Pod':
              result = await kubectlAPI.getPods(contextName, targetNamespace)
              break
            case 'Service':
              result = await kubectlAPI.getServices(contextName, targetNamespace)
              break
            case 'Deployment':
              result = await kubectlAPI.getDeployments(contextName, targetNamespace)
              break
            case 'ConfigMap':
              result = await kubectlAPI.getConfigMaps(contextName, targetNamespace)
              break
            case 'Secret':
              result = await kubectlAPI.getSecrets(contextName, targetNamespace)
              break
            case 'Node':
              result = await kubectlAPI.getNodes(contextName)
              break
            default:
              result = await kubectlAPI.getResource(contextName, selectedResource.kind, targetNamespace)
          }
        }

        // Extract data from the wrapped response
        if (result && result.success) {
          data = result.data?.items || []
        } else {
          throw new Error(result?.error || 'Failed to fetch resources')
        }
      } else {
        // Use HTTP API for web
        // Use the plural type from selectedResource.type (which is already correctly formatted)
        const resourceType = selectedResource.type
        let result

        try {
          // Use the kubeApi methods based on resource type
          const fetchNamespace = (isAllNamespaces && !isClusterScoped) ? '' : targetNamespace

          // Check if this resource should use streaming (custom resources or when requested)
          const useStreaming = selectedResource.apiVersion &&
                              selectedResource.apiVersion !== 'v1' &&
                              selectedResource.apiVersion !== 'apps/v1' &&
                              selectedResource.apiVersion !== 'batch/v1' &&
                              selectedResource.apiVersion !== 'rbac.authorization.k8s.io/v1'

          if (useStreaming) {
            // Use streaming for custom resources and potentially large datasets
            const nsParam = isClusterScoped ? undefined : fetchNamespace
            let allResources = []

            setStreaming(true)
            setLoading(false) // Not loading anymore, but streaming

            const eventSource = await kubeApi.getResourcesStream(
              contextName,
              resourceType,
              nsParam,
              (data) => {
                // Progressive update as data arrives
                if (data.items && data.items.length > 0) {
                  allResources = [...allResources, ...data.items]
                  setResources([...allResources]) // Update UI progressively
                }
              },
              (error) => {
                // Streaming completed or error
                if (error) {
                  console.error('Streaming error:', error)
                  setError(error.message || 'Streaming error occurred')
                }
                setStreaming(false)
              }
            )

            // Store the EventSource reference for cleanup
            sseConnectionRef.current = eventSource

            // Don't set data here as it will be handled by the streaming callbacks
            return
          } else {
            // Use regular fetching for standard resources
            switch (selectedResource.kind) {
              case 'Pod':
                result = await kubeApi.getPods(contextName, fetchNamespace)
                break
              case 'Service':
                result = await kubeApi.getServices(contextName, fetchNamespace)
                break
              case 'Deployment':
                result = await kubeApi.getDeployments(contextName, fetchNamespace)
                break
              case 'ConfigMap':
                result = await kubeApi.getConfigMaps(contextName, fetchNamespace)
                break
              case 'Secret':
                result = await kubeApi.getSecrets(contextName, fetchNamespace)
                break
              case 'Node':
                result = await kubeApi.getNodes(contextName)
                break
              case 'Namespace':
                result = await kubeApi.getNamespaces(contextName)
                break
              case 'CustomResourceDefinition':
                result = await kubeApi.getCRDs(contextName)
                break
              default:
                // For cluster-scoped resources, don't pass namespace
                const nsParam = isClusterScoped ? undefined : fetchNamespace
                result = await kubeApi.getResources(contextName, resourceType, nsParam)
                break
            }

            data = result.items || result
          }
        } catch (err) {
          console.error('Error fetching resources via API:', err)
          throw new Error(`Failed to fetch ${selectedResource.type}: ${err.message}`)
        }
      }

      const resourcesArray = Array.isArray(data) ? data : []
      setResources(resourcesArray)

      // For pods, start loading metrics asynchronously with cancellation
      if (selectedResource.kind === 'Pod' && resourcesArray.length > 0) {
        // Cancel any previous metrics loading
        if (metricsAbortControllerRef.current) {
          metricsAbortControllerRef.current.abort()
        }

        // Create new abort controller
        const abortController = new AbortController()
        metricsAbortControllerRef.current = abortController

        loadPodMetricsAsync(resourcesArray, abortController.signal)
        loadPodContainersAsync(resourcesArray, abortController.signal)
      }
    } catch (err) {
      console.error('Error fetching resources:', err)
      setError(err.message)
      setResources([])
    } finally {
      setLoading(false)
    }
  }

  // Load pod metrics asynchronously with cancellation support
  const loadPodMetricsAsync = useCallback(async (pods, abortSignal) => {
    // Clear previous metrics
    setPodMetrics({})

    // Load metrics for each pod in batches to avoid overwhelming the API
    const batchSize = 5
    for (let i = 0; i < pods.length; i += batchSize) {
      // Check if cancelled
      if (abortSignal?.aborted) return

      const batch = pods.slice(i, i + batchSize)

      // Process batch concurrently
      await Promise.allSettled(
        batch.map(async (pod) => {
          // Check if cancelled before making API call
          if (abortSignal?.aborted) return

          try {
            let result

            if (isElectron && kubectlAPI) {
              // Electron mode - use IPC
              result = await kubectlAPI.getPodMetrics(
                contextName,
                pod.metadata?.namespace,
                pod.metadata?.name
              )
              if (result.success) {
                result = result.data
              }
            } else {
              // Web mode - use backend API
              const response = await fetch(
                `/api/contexts/${contextName}/resources/pods/${pod.metadata?.namespace}/${pod.metadata?.name}/metrics`
              )
              result = await response.json()
            }

            // Check if cancelled before updating state
            if (!abortSignal?.aborted && result) {
              const podKey = `${pod.metadata?.namespace}/${pod.metadata?.name}`
              setPodMetrics(prev => ({
                ...prev,
                [podKey]: result
              }))
            }
          } catch (error) {
            // Silently ignore metrics errors for individual pods
            console.debug(`Metrics not available for pod ${pod.metadata?.name}:`, error)
          }
        })
      )

      // Small delay between batches to avoid overwhelming the metrics API
      if (i + batchSize < pods.length && !abortSignal?.aborted) {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, 100)
          // Clean up timeout if aborted
          if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
              clearTimeout(timeoutId)
              reject(new Error('Aborted'))
            }, { once: true })
          }
        }).catch(() => {/* Ignore abort errors */})
      }
    }
  }, [contextName, isElectron, kubectlAPI])

  // Load container data asynchronously for pods
  const loadPodContainersAsync = useCallback(async (pods, abortSignal) => {
    // Clear previous container data
    setPodContainers({})

    // Load containers for each pod in batches
    const batchSize = 5
    for (let i = 0; i < pods.length; i += batchSize) {
      if (abortSignal?.aborted) return

      const batch = pods.slice(i, i + batchSize)

      await Promise.allSettled(
        batch.map(async (pod) => {
          if (abortSignal?.aborted) return

          try {
            let containers = []

            if (isElectron && kubectlAPI) {
              const result = await kubectlAPI.getPodContainers(
                contextName,
                pod.metadata?.namespace,
                pod.metadata?.name
              )
              if (result.success) {
                containers = result.data
              }
            } else {
              containers = await kubeApi.getPodContainers(
                contextName,
                pod.metadata?.namespace,
                pod.metadata?.name
              )
            }

            if (!abortSignal?.aborted && containers) {
              const podKey = `${pod.metadata?.namespace}/${pod.metadata?.name}`

              // Also get resource specs from pod spec
              const containerSpecs = pod.spec?.containers || []
              const enrichedContainers = containers.map(container => {
                const spec = containerSpecs.find(c => c.name === container.name)
                return {
                  ...container,
                  resources: spec?.resources || {},
                  ports: spec?.ports || []
                }
              })

              setPodContainers(prev => ({
                ...prev,
                [podKey]: enrichedContainers
              }))
            }
          } catch (error) {
            console.debug(`Container info not available for pod ${pod.metadata?.name}:`, error)
          }
        })
      )

      // Small delay between batches
      if (i + batchSize < pods.length && !abortSignal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
  }, [contextName, isElectron, kubectlAPI, kubeApi])

  // Filter and sort resources
  // Toggle resource expansion and load child resources if needed
  const toggleResourceExpansion = async (resource, resourceKey, resourceKind) => {
    setExpandedResources(prev => {
      const newSet = new Set(prev)
      if (newSet.has(resourceKey)) {
        newSet.delete(resourceKey)
      } else {
        newSet.add(resourceKey)
        // Load child resources if not already loaded
        if (!childResources[resourceKey]) {
          loadChildResources(resource, resourceKey, resourceKind)
        }
      }
      return newSet
    })
  }

  // Load child resources based on parent type
  const loadChildResources = async (parentResource, parentKey, parentKind) => {
    try {
      // Use provided parentKind or fall back to selectedResource.kind
      parentKind = parentKind || selectedResource.kind
      const namespace = parentResource.metadata?.namespace
      const name = parentResource.metadata?.name
      let children = []

      if (parentKind === 'Deployment') {
        // Load ReplicaSets for this Deployment
        const selector = parentResource.spec?.selector?.matchLabels
        if (selector && namespace) {
          const allReplicaSets = await fetchResourcesByType('ReplicaSet', namespace)
          // Filter ReplicaSets that belong to this deployment
          children = allReplicaSets.filter(rs => {
            const ownerRefs = rs.metadata?.ownerReferences || []
            return ownerRefs.some(ref =>
              ref.kind === 'Deployment' &&
              ref.name === name
            )
          })
        }
      } else if (parentKind === 'ReplicaSet' || parentKind === 'DaemonSet' ||
                 parentKind === 'StatefulSet' || parentKind === 'Job') {
        // Load Pods for these workload resources
        const selector = parentResource.spec?.selector?.matchLabels
        if (selector && namespace) {
          const allPods = await fetchResourcesByType('Pod', namespace)
          // Filter Pods that match the selector
          children = allPods.filter(pod => {
            const podLabels = pod.metadata?.labels || {}
            return Object.entries(selector).every(([key, value]) =>
              podLabels[key] === value
            )
          })
        }
      } else if (parentKind === 'CronJob') {
        // Load Jobs for this CronJob
        if (namespace) {
          const allJobs = await fetchResourcesByType('Job', namespace)
          // Filter Jobs that belong to this CronJob
          children = allJobs.filter(job => {
            const ownerRefs = job.metadata?.ownerReferences || []
            return ownerRefs.some(ref =>
              ref.kind === 'CronJob' &&
              ref.name === name
            )
          })
        }
      }

      // Store the child resources
      setChildResources(prev => ({
        ...prev,
        [parentKey]: children
      }))

      // If children are Pods, also load their metrics and containers
      // Check if they're pods by the parent type
      const childrenArePods = (parentKind === 'ReplicaSet' || parentKind === 'DaemonSet' ||
                              parentKind === 'StatefulSet' || parentKind === 'Job')

      if (children.length > 0 && childrenArePods) {
        // Ensure kind is set for proper handling
        children.forEach(child => {
          if (!child.kind) child.kind = 'Pod'
        })
        loadPodMetricsAsync(children, metricsAbortControllerRef.current?.signal)
        loadPodContainersAsync(children, metricsAbortControllerRef.current?.signal)
      } else if (parentKind === 'Deployment' && children.length > 0) {
        // For deployments, children are ReplicaSets. Set their kind properly.
        children.forEach(child => {
          if (!child.kind) child.kind = 'ReplicaSet'
        })
      }
    } catch (error) {
      console.error(`Error loading child resources for ${parentKey}:`, error)
    }
  }

  // Helper function to fetch resources by type
  const fetchResourcesByType = async (kind, namespace) => {
    try {
      let result
      if (isElectron && kubectlAPI) {
        // Map resource kinds to API methods
        const apiMethodMap = {
          'Pod': 'getPods',
          'ReplicaSet': 'getResources',
          'DaemonSet': 'getResources',
          'StatefulSet': 'getResources',
          'Job': 'getResources',
          'CronJob': 'getResources',
          'Deployment': 'getDeployments'
        }
        const apiMethod = apiMethodMap[kind] || 'getResources'

        if (apiMethod === 'getResources') {
          result = await kubectlAPI.getResources(contextName, kind, namespace)
        } else if (kubectlAPI[apiMethod]) {
          result = await kubectlAPI[apiMethod](contextName, namespace)
        }

        if (result?.success) {
          return result.data?.items || []
        }
      } else {
        // Use backend API - all resources go through getResources
        const data = await kubeApi.getResources(contextName, kind, namespace)
        return data?.items || data || []
      }
    } catch (error) {
      console.error(`Error fetching ${kind} resources:`, error)
    }
    return []
  }

  const filteredAndSortedResources = React.useMemo(() => {
    let filtered = resources.filter(resource => {
      const name = resource.metadata?.name || resource.name || ''
      return name.toLowerCase().includes(searchTerm.toLowerCase())
    })

    // Use the sortResources utility function with all necessary options
    const sorted = resourceSorting.sortResources(filtered, sortBy, sortOrder, {
      podMetrics,
      selectedResourceKind: selectedResource.kind,
      getResourceStatus: helpers.getResourceStatus,
      getRestartCount: helpers.getRestartCount,
      getCpuUsage: helpers.getCpuUsage,
      getMemoryUsage: helpers.getMemoryUsage,
      getContainerReadyCount: helpers.getContainerReadyCount,
      getParentResource: helpers.getParentResource,
      getResourceInfo: helpers.getResourceInfo,
      formatPorts: helpers.formatPorts,
      getNodeRoles: helpers.getNodeRoles
    })

    return sorted
  }, [resources, searchTerm, sortBy, sortOrder, podMetrics, selectedResource.kind, helpers]) // Added helpers as dependency


  const getStatusIcon = (status) => {
    switch (status.toLowerCase()) {
      case 'running':
      case 'ready':
      case 'active':
      case 'succeeded':
        return <CheckCircle size={16} className="text-green-500" />
      case 'pending':
      case 'waiting':
      case 'progressing':
        return <Clock size={16} className="text-yellow-500" />
      case 'failed':
      case 'error':
      case 'notready':
        return <XCircle size={16} className="text-red-500" />
      case 'unknown':
        return <AlertTriangle size={16} className="text-gray-500" />
      default:
        return <AlertTriangle size={16} className="text-blue-500" />
    }
  }

  const formatAge = (timestamp) => {
    if (!timestamp) return 'Unknown'
    const now = new Date()
    const created = new Date(timestamp)
    const diffMs = now - created
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (diffDays > 0) {
      return `${diffDays}d${diffHours}h`
    } else if (diffHours > 0) {
      return `${diffHours}h`
    } else {
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      return `${diffMinutes}m`
    }
  }

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'ready':
      case 'active':
      case 'succeeded':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'pending':
      case 'waiting':
      case 'progressing':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'failed':
      case 'error':
      case 'notready':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'unknown':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    }
  }

  // Check if resource type should show parent column
  const shouldShowParentColumn = () => {
    return ['Pod', 'ReplicaSet', 'Job'].includes(selectedResource.kind)
  }

  // Handle resource selection with click, ctrl/cmd+click, and shift+click
  const handleResourceClick = (resourceKey, index, event) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const isMultiSelect = isMac ? event.metaKey : event.ctrlKey
    const isRangeSelect = event.shiftKey

    if (isRangeSelect && lastSelectedIndex !== null) {
      // Shift+click: select range
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      const newSelection = new Set(selectedResources)

      // Get all visible resources in the range
      for (let i = start; i <= end; i++) {
        const resource = filteredAndSortedResources[i]
        if (resource) {
          const key = `${resource.metadata?.namespace || 'cluster'}/${resource.metadata?.name || resource.name}`
          newSelection.add(key)
        }
      }

      setSelectedResources(newSelection)
    } else if (isMultiSelect) {
      // Ctrl/Cmd+click: toggle selection
      const newSelection = new Set(selectedResources)
      if (newSelection.has(resourceKey)) {
        newSelection.delete(resourceKey)
        // If we removed the last selected, clear it
        if (lastSelectedResourceRef.current === resourceKey) {
          lastSelectedResourceRef.current = null
        }
      } else {
        newSelection.add(resourceKey)
        lastSelectedResourceRef.current = resourceKey // Track last added
      }
      setSelectedResources(newSelection)
      setLastSelectedIndex(index)
    } else {
      // Regular click: select only this item
      setSelectedResources(new Set([resourceKey]))
      setLastSelectedIndex(index)
      lastSelectedResourceRef.current = resourceKey // Track last selected
    }
  }

  // Clear selection when clicking outside
  const handleTableClick = (event) => {
    // Only clear if clicking on the table background, not on a row
    if (event.target === event.currentTarget) {
      setSelectedResources(new Set())
      setLastSelectedIndex(null)
    }
  }

  // Select all with Ctrl/Cmd+A and handle inspect with Ctrl/Cmd+I
  useEffect(() => {
    const handleKeyDown = (event) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const isSelectAll = (isMac ? event.metaKey : event.ctrlKey) && event.key === 'a'
      const isInspect = (isMac ? event.metaKey : event.ctrlKey) && event.key === 'i'

      if (event.key === 'Escape') {
        if (showInspector) { setShowInspector(false); setInspectedResource(null); return }
        if (showEditor) { setShowEditor(false); setEditedResource(null); return }
        if (showShell) { setShowShell(false); return }
        if (showLogs) { setShowLogs(false); return }
        if (showCreateDialog) { setShowCreateDialog(false); return }
        if (createEditorMode) { setCreateEditorMode(false); return }
      } else if (isSelectAll && !event.target.matches('input, textarea')) {
        event.preventDefault()
        const allKeys = filteredAndSortedResources.map(resource =>
          `${resource.metadata?.namespace || 'cluster'}/${resource.metadata?.name || resource.name}`
        )
        setSelectedResources(new Set(allKeys))
      } else if (isInspect && !event.target.matches('input, textarea')) {
        event.preventDefault()
        handleInspect()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [filteredAndSortedResources, selectedResources, resources, showInspector, showEditor, showShell, showLogs, showCreateDialog, createEditorMode])

  // Track the last selected resource for multi-select scenarios
  const lastSelectedResourceRef = useRef(null)

  // Handle inspect action for selected resources
  const handleInspect = () => {
    if (selectedResources.size === 0) {
      // No resources selected, do nothing
      return
    }

    let resourceKeyToInspect

    if (selectedResources.size === 1) {
      // Single resource selected
      resourceKeyToInspect = Array.from(selectedResources)[0]
    } else {
      // Multiple resources selected - use the last one added
      // and deselect the others
      resourceKeyToInspect = lastSelectedResourceRef.current
      if (resourceKeyToInspect) {
        setSelectedResources(new Set([resourceKeyToInspect]))
      } else {
        // Fallback to the first one if we don't have the last selected tracked
        resourceKeyToInspect = Array.from(selectedResources)[0]
        setSelectedResources(new Set([resourceKeyToInspect]))
      }
    }

    const resource = resources.find(r => {
      const key = `${r.metadata?.namespace || 'cluster'}/${r.metadata?.name || r.name}`
      return key === resourceKeyToInspect
    })

    if (resource) {
      setInspectedResource(resource)
      setShowInspector(true)
    }
  }

  // Handle edit for selected resource
  const handleEdit = () => {
    if (selectedResources.size === 0) {
      return
    }

    // Get first selected resource for editing
    let resourceKeyToEdit
    if (selectedResources.size === 1) {
      resourceKeyToEdit = Array.from(selectedResources)[0]
    } else {
      // Multiple selected - use the last selected (if tracked) or first
      if (lastSelectedIndex !== null && selectedResources.has(filteredAndSortedResources[lastSelectedIndex]?.key)) {
        resourceKeyToEdit = filteredAndSortedResources[lastSelectedIndex].key
      } else {
        resourceKeyToEdit = Array.from(selectedResources)[0]
        setSelectedResources(new Set([resourceKeyToEdit]))
      }
    }

    const resource = resources.find(r => {
      const key = `${r.metadata?.namespace || 'cluster'}/${r.metadata?.name || r.name}`
      return key === resourceKeyToEdit
    })

    if (resource) {
      setEditedResource(resource)
      setShowEditor(true)
    }
  }

  // Handle remove finalizers for selected resources
  const handleRemoveFinalizers = async () => {
    if (selectedResources.size === 0) {
      return
    }

    // Check if any resource is selected
    if (!selectedResource || !selectedResource.kind) {
      return
    }

    const count = selectedResources.size
    const resourceType = selectedResource.kind
    const message = count === 1
      ? `Are you sure you want to remove finalizers from this ${resourceType}?`
      : `Are you sure you want to remove finalizers from ${count} ${resourceType}s?`

    if (!window.confirm(message)) {
      return
    }

    const resourcesToUpdate = resources.filter(r => {
      const key = `${r.metadata?.namespace || 'cluster'}/${r.metadata?.name || r.name}`
      return selectedResources.has(key)
    })

    let successCount = 0
    let failedResources = []

    for (const resource of resourcesToUpdate) {
      try {
        const namespace = resource.metadata?.namespace
        const name = resource.metadata?.name || resource.name

        const apiVersion = resource.apiVersion || selectedResource.apiVersion || ''
        const finalizerUrl = `/api/resources/${contextName}/${selectedResource.kind}/${namespace}/${name}/finalizers${apiVersion ? `?apiVersion=${encodeURIComponent(apiVersion)}` : ''}`
        const response = await fetch(finalizerUrl, {
          method: 'PATCH'
        })

        if (response.ok) {
          successCount++
        } else {
          const error = await response.text()
          failedResources.push({ name, error })
        }
      } catch (error) {
        failedResources.push({ name: resource.metadata?.name || resource.name, error: error.message })
      }
    }

    // Clear selection
    setSelectedResources(new Set())

    // Show results
    if (failedResources.length === 0) {
      console.log(`Successfully removed finalizers from ${successCount} ${selectedResource.kind}(s)`)
    } else {
      console.error(`Removed finalizers from ${successCount} ${selectedResource.kind}(s), failed ${failedResources.length}:`, failedResources)
      alert(`Removed finalizers from ${successCount} ${selectedResource.kind}(s), but failed:\n${failedResources.map(f => `- ${f.name}: ${f.error}`).join('\n')}`)
    }

    // Refresh the resource list
    fetchResources()
  }

  // Handle rolling restart for various resource types
  const handleRollingRestart = async () => {
    if (selectedResources.size === 0) {
      return
    }

    // Check if any resource is selected
    if (!selectedResource || !selectedResource.kind) {
      return
    }

    // Resources that support rolling restart
    const supportedKinds = ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'ReplicationController', 'Pod']
    if (!supportedKinds.includes(selectedResource.kind)) {
      alert(`Rolling restart is not supported for ${selectedResource.kind} resources`)
      return
    }

    const count = selectedResources.size
    const resourceType = selectedResource.kind
    const message = count === 1
      ? `Are you sure you want to restart this ${resourceType}?`
      : `Are you sure you want to restart ${count} ${resourceType}s?`

    if (!window.confirm(message)) {
      return
    }

    const resourcesToRestart = resources.filter(r => {
      const key = `${r.metadata?.namespace || 'cluster'}/${r.metadata?.name || r.name}`
      return selectedResources.has(key)
    })

    let successCount = 0
    let failedResources = []

    for (const resource of resourcesToRestart) {
      try {
        const namespace = resource.metadata?.namespace
        const name = resource.metadata?.name || resource.name

        const response = await fetch(`/api/resources/${contextName}/${selectedResource.kind}/${namespace}/${name}/restart`, {
          method: 'POST'
        })

        if (response.ok) {
          successCount++
        } else {
          const error = await response.text()
          failedResources.push({ name, error })
        }
      } catch (error) {
        failedResources.push({ name: resource.metadata?.name || resource.name, error: error.message })
      }
    }

    // Clear selection
    setSelectedResources(new Set())

    // Show results
    if (failedResources.length === 0) {
      console.log(`Successfully triggered rolling restart for ${successCount} ${resourceType}(s)`)
    } else {
      console.error(`Restarted ${successCount} ${resourceType}(s), failed ${failedResources.length}:`, failedResources)
      alert(`Restarted ${successCount} ${resourceType}(s), but failed:\n${failedResources.map(f => `- ${f.name}: ${f.error}`).join('\n')}`)
    }

    // Refresh after a delay to show the restart in progress
    setTimeout(() => fetchResources(), 2000)
  }

  // Handle delete action for selected resources
  const handleDelete = async () => {
    if (selectedResources.size === 0) {
      return
    }

    const count = selectedResources.size
    const resourceType = selectedResource.kind || selectedResource.type
    const message = count === 1
      ? `Are you sure you want to delete this ${resourceType}?`
      : `Are you sure you want to delete ${count} ${resourceType}s?`

    if (!window.confirm(message)) {
      return
    }

    const resourcesToDelete = resources.filter(r => {
      const key = `${r.metadata?.namespace || 'cluster'}/${r.metadata?.name || r.name}`
      return selectedResources.has(key)
    })

    let successCount = 0
    let failedResources = []

    for (const resource of resourcesToDelete) {
      try {
        const namespace = resource.metadata?.namespace
        const name = resource.metadata?.name || resource.name

        const apiVersion = resource.apiVersion || selectedResource.apiVersion || ''
        const apiVersionParam = apiVersion ? `?apiVersion=${encodeURIComponent(apiVersion)}` : ''
        const url = namespace
          ? `/api/resources/${contextName}/${selectedResource.kind}/${namespace}/${name}${apiVersionParam}`
          : `/api/resources/${contextName}/${selectedResource.kind}/${name}${apiVersionParam}`

        const response = await fetch(url, {
          method: 'DELETE'
        })

        if (response.ok) {
          successCount++
        } else {
          const error = await response.text()
          failedResources.push({ name, error })
        }
      } catch (error) {
        failedResources.push({ name: resource.metadata?.name || resource.name, error: error.message })
      }
    }

    // Clear selection
    setSelectedResources(new Set())

    // Show results
    if (failedResources.length === 0) {
      console.log(`Successfully deleted ${successCount} resource(s)`)
    } else {
      console.error(`Deleted ${successCount} resource(s), failed to delete ${failedResources.length}:`, failedResources)
      alert(`Deleted ${successCount} resource(s), but failed to delete:\n${failedResources.map(f => `- ${f.name}: ${f.error}`).join('\n')}`)
    }

    // Refresh the resource list
    fetchResources()
  }

  // Handle opening shell for a container
  const handleOpenShell = (pod, container) => {
    setShellPod(pod)
    setShellContainer(container)
    setShowShell(true)
  }

  // Handle viewing logs for a container
  const handleViewLogs = (pod, container) => {
    setLogsPod(pod)
    setLogsContainer(container)
    setShowLogs(true)
  }

  // Handle create from template selection
  const handleCreateFromTemplate = ({ yaml, schema, kind }) => {
    setCreateYaml(yaml || '')
    setCreateSchema(schema || null)
    setCreateKind(kind || 'Resource')
    setCreateEditorMode(true)
  }

  // Handle clone of selected resource
  const handleClone = () => {
    if (selectedResources.size === 0) return

    // Get first selected resource
    const resourceKey = selectedResources.size === 1
      ? Array.from(selectedResources)[0]
      : (lastSelectedResourceRef.current || Array.from(selectedResources)[0])

    const resource = resources.find(r => {
      const key = `${r.metadata?.namespace || 'cluster'}/${r.metadata?.name || r.name}`
      return key === resourceKey
    })

    if (!resource) return

    const cloned = prepareForClone(resource)
    if (!cloned) return

    const yamlStr = YAML.stringify(cloned, { indent: 2, lineWidth: 0 })

    setCreateYaml(yamlStr)
    setCreateSchema(null)
    setCreateKind(resource.kind || selectedResource.kind || 'Resource')
    setCreateEditorMode(true)
  }

  // Handle save for create mode
  const handleCreateSave = async (resourceData, saveMode) => {
    if (saveMode === 'create') {
      try {
        if (isElectron && kubectlAPI && kubectlAPI.createResource) {
          const result = await kubectlAPI.createResource(contextName, resourceData)
          if (!result.success) {
            throw new Error(result.error || 'Failed to create resource')
          }
        } else {
          const response = await fetch(`/api/resources/${contextName}/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resourceData)
          })
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || `HTTP ${response.status}`)
          }
        }
        setCreateEditorMode(false)
        fetchResources() // Refresh the list
      } catch (error) {
        throw error // Re-throw so YamlEditor shows the error
      }
    }
  }

  const handleColumnSort = (column) => {
    console.log(`Sorting by column: ${column}, current sortBy: ${sortBy}, current sortOrder: ${sortOrder}`)
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const getSortIcon = (column) => {
    if (sortBy !== column) return '↕'
    return sortOrder === 'asc' ? '↑' : '↓'
  }


  if (!selectedResource) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <Filter size={48} className="mx-auto mb-4 opacity-50" />
          <p>Select a resource type to view resources</p>
        </div>
      </div>
    )
  }

  // Listen for toolbar and Electron menu events
  useEffect(() => {
    // Only handle events if this ResourceList is visible
    const handleToolbarInspect = () => {
      if (isVisible) handleInspect()
    }
    const handleToolbarDelete = () => {
      if (isVisible) handleDelete()
    }
    const handleToolbarRefresh = () => {
      if (isVisible) fetchResources()
    }
    const handleToolbarEdit = () => {
      if (isVisible) handleEdit()
    }
    const handleToolbarRemoveFinalizers = () => {
      if (isVisible) handleRemoveFinalizers()
    }
    const handleToolbarRollingRestart = () => {
      if (isVisible) handleRollingRestart()
    }
    const handleToolbarAddResource = () => {
      if (isVisible) setShowCreateDialog(true)
    }
    const handleToolbarCloneResource = () => {
      if (isVisible) handleClone()
    }

    window.addEventListener('toolbar-inspect', handleToolbarInspect)
    window.addEventListener('toolbar-delete', handleToolbarDelete)
    window.addEventListener('toolbar-refresh', handleToolbarRefresh)
    window.addEventListener('toolbar-edit', handleToolbarEdit)
    window.addEventListener('toolbar-remove-finalizers', handleToolbarRemoveFinalizers)
    window.addEventListener('toolbar-rolling-restart', handleToolbarRollingRestart)
    window.addEventListener('toolbar-add-resource', handleToolbarAddResource)
    window.addEventListener('toolbar-clone-resource', handleToolbarCloneResource)

    // Electron menu events (also only when visible)
    let cleanupInspect, cleanupDelete, cleanupEdit
    if (window.electronAPI?.onMenuAction) {
      cleanupInspect = window.electronAPI.onMenuAction('inspect-resource', () => {
        if (isVisible) handleInspect()
      })
      cleanupDelete = window.electronAPI.onMenuAction('delete-resource', () => {
        if (isVisible) handleDelete()
      })
      cleanupEdit = window.electronAPI.onMenuAction('edit-resource', () => {
        if (isVisible) handleEdit()
      })
    }

    return () => {
      window.removeEventListener('toolbar-inspect', handleToolbarInspect)
      window.removeEventListener('toolbar-delete', handleToolbarDelete)
      window.removeEventListener('toolbar-refresh', handleToolbarRefresh)
      window.removeEventListener('toolbar-edit', handleToolbarEdit)
      window.removeEventListener('toolbar-remove-finalizers', handleToolbarRemoveFinalizers)
      window.removeEventListener('toolbar-rolling-restart', handleToolbarRollingRestart)
      window.removeEventListener('toolbar-add-resource', handleToolbarAddResource)
      window.removeEventListener('toolbar-clone-resource', handleToolbarCloneResource)
      if (cleanupInspect) cleanupInspect()
      if (cleanupDelete) cleanupDelete()
      if (cleanupEdit) cleanupEdit()
    }
  }, [selectedResources, resources, isVisible, fetchResources, handleInspect, handleDelete, handleEdit, handleRemoveFinalizers, handleRollingRestart])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">
            {selectedResource.type}
          </h2>

          {/* Namespace Selector */}
          {selectedResource.scope !== 'Cluster' && (
            <div className="relative flex-shrink-0">
              <select
                value={currentNamespace}
                onChange={(e) => {
                  const newNamespace = e.target.value
                  setCurrentNamespace(newNamespace)
                  // Notify parent component to persist the change
                  if (onNamespaceChange) {
                    onNamespaceChange(newNamespace)
                  }
                }}
                className="appearance-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 pr-6 text-xs text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="All Namespaces">All Namespaces</option>
                {namespaces.map(namespace => (
                  <option key={namespace} value={namespace}>
                    {namespace}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-0" style={{ minWidth: '200px', maxWidth: '500px' }}>
            <Search size={14} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-8 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Resource count / filter status */}
          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 whitespace-nowrap">
            {searchTerm
              ? `${filteredAndSortedResources.length} of ${resources.length}`
              : `${resources.length}`}
            {selectedResources.size > 0 && ` (${selectedResources.size} selected)`}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <RefreshCw size={32} className="animate-spin mx-auto mb-4 text-blue-500" />
              <p className="text-gray-600 dark:text-gray-400">Loading {selectedResource.type}...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4">
            <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle size={20} className="text-red-500" />
                <h3 className="font-medium text-red-800 dark:text-red-200">Error</h3>
              </div>
              <p className="mt-2 text-red-700 dark:text-red-300">{error}</p>
              <button
                onClick={fetchResources}
                className="mt-3 px-4 py-2 bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-200 rounded-md hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {streaming && filteredAndSortedResources.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <RefreshCw size={32} className="animate-spin mx-auto mb-4 text-blue-500" />
              <p className="text-gray-600 dark:text-gray-400">Streaming {selectedResource.type}...</p>
            </div>
          </div>
        )}

        {!loading && !streaming && !error && filteredAndSortedResources.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <Filter size={48} className="mx-auto mb-4 opacity-50" />
              <p>No {selectedResource.type.toLowerCase()} found</p>
              {searchTerm && (
                <p className="text-sm mt-2">Try adjusting your search terms</p>
              )}
            </div>
          </div>
        )}

        {!loading && !error && filteredAndSortedResources.length > 0 && (
          <div className="h-full overflow-x-auto overflow-y-auto w-0 min-w-full">
            <table className="min-w-full w-max" ref={tableRef} onClick={handleTableClick}>
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0">
                <tr>
                  <th className="w-8 px-2">
                    <input
                      type="checkbox"
                      checked={selectedResources.size === filteredAndSortedResources.length && filteredAndSortedResources.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allKeys = filteredAndSortedResources.map(resource =>
                            `${resource.metadata?.namespace || 'cluster'}/${resource.metadata?.name || resource.name}`
                          )
                          setSelectedResources(new Set(allKeys))
                        } else {
                          setSelectedResources(new Set())
                        }
                      }}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      aria-label="Select all resources"
                      title="Select/deselect all"
                    />
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => handleColumnSort('name')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Name</span>
                      <span className="text-gray-400">{getSortIcon('name')}</span>
                    </div>
                  </th>
                  {currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster' && (
                    <th
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => handleColumnSort('namespace')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Namespace</span>
                        <span className="text-gray-400">{getSortIcon('namespace')}</span>
                      </div>
                    </th>
                  )}
                  <th
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => handleColumnSort('status')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Status</span>
                      <span className="text-gray-400">{getSortIcon('status')}</span>
                    </div>
                  </th>
                  {selectedResource.kind === 'Pod' && (
                    <>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('ready')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Ready</span>
                          <span className="text-gray-400">{getSortIcon('ready')}</span>
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('restarts')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Restarts</span>
                          <span className="text-gray-400">{getSortIcon('restarts')}</span>
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('cpu')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>CPU</span>
                          <span className="text-gray-400">{getSortIcon('cpu')}</span>
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('memory')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Memory</span>
                          <span className="text-gray-400">{getSortIcon('memory')}</span>
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('parent')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Parent</span>
                          <span className="text-gray-400">{getSortIcon('parent')}</span>
                        </div>
                      </th>
                    </>
                  )}
                  {selectedResource.kind === 'Service' && (
                    <>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('type')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Type</span>
                          <span className="text-gray-400">{getSortIcon('type')}</span>
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('clusterip')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Cluster IP</span>
                          <span className="text-gray-400">{getSortIcon('clusterip')}</span>
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('ports')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Ports</span>
                          <span className="text-gray-400">{getSortIcon('ports')}</span>
                        </div>
                      </th>
                    </>
                  )}
                  {selectedResource.kind === 'Deployment' && (
                    <>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('ready')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Ready</span>
                          <span className="text-gray-400">{getSortIcon('ready')}</span>
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('uptodate')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Up-to-date</span>
                          <span className="text-gray-400">{getSortIcon('uptodate')}</span>
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('available')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Available</span>
                          <span className="text-gray-400">{getSortIcon('available')}</span>
                        </div>
                      </th>
                    </>
                  )}
                  {selectedResource.kind === 'Node' && (
                    <>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('roles')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Roles</span>
                          <span className="text-gray-400">{getSortIcon('roles')}</span>
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('version')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Version</span>
                          <span className="text-gray-400">{getSortIcon('version')}</span>
                        </div>
                      </th>
                    </>
                  )}
                  {/* Generic columns for unknown resource types */}
                  {!['Pod', 'Service', 'Deployment', 'Node'].includes(selectedResource.kind) && (
                    <>
                      <th
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => handleColumnSort('info')}
                      >
                        <div className="flex items-center space-x-1">
                          <span>Info</span>
                          <span className="text-gray-400">{getSortIcon('info')}</span>
                        </div>
                      </th>
                      {shouldShowParentColumn() && (
                        <th
                          className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          onClick={() => handleColumnSort('parent')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>Parent</span>
                            <span className="text-gray-400">{getSortIcon('parent')}</span>
                          </div>
                        </th>
                      )}
                    </>
                  )}
                  <th
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => handleColumnSort('age')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Age</span>
                      <span className="text-gray-400">{getSortIcon('age')}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredAndSortedResources.map((resource, index) => {
                  const name = resource.metadata?.name || resource.name || `resource-${index}`
                  const namespace = resource.metadata?.namespace
                  const status = helpers.getResourceStatus(resource)
                  const age = formatAge(resource.metadata?.creationTimestamp)
                  const rawData = resource.rawData || []
                  // Create unique key using namespace and name to avoid duplicates
                  const uniqueKey = namespace ? `${namespace}/${name}` : name

                  const resourceKind = selectedResource.kind
                  const resourceKey = uniqueKey

                  // Determine if this resource can be expanded and has children
                  const canHaveChildren = ['Pod', 'Deployment', 'ReplicaSet', 'DaemonSet', 'StatefulSet', 'Job', 'CronJob'].includes(resourceKind)
                  const isExpanded = canHaveChildren && expandedResources.has(resourceKey)

                  // Get appropriate child resources
                  let childItems = []
                  let hasChildren = false

                  if (resourceKind === 'Pod') {
                    childItems = podContainers[resourceKey] || []
                    hasChildren = childItems.length > 0
                  } else if (canHaveChildren) {
                    // Check if we've loaded children or if they exist
                    const loadedChildren = childResources[resourceKey] || []
                    childItems = isExpanded ? loadedChildren : []

                    // For deployments, check if it has replicas
                    if (resourceKind === 'Deployment') {
                      hasChildren = (resource.status?.replicas || 0) > 0
                    }
                    // For ReplicaSets, DaemonSets, StatefulSets, check if they have pods
                    else if (['ReplicaSet', 'DaemonSet', 'StatefulSet'].includes(resourceKind)) {
                      hasChildren = (resource.status?.replicas || resource.status?.numberReady || 0) > 0
                    }
                    // For Jobs, check if there are pods
                    else if (resourceKind === 'Job') {
                      hasChildren = (resource.status?.active || resource.status?.succeeded || resource.status?.failed || 0) > 0
                    }
                    // For CronJobs, check spec
                    else if (resourceKind === 'CronJob') {
                      hasChildren = resource.status?.active?.length > 0 || false
                    }

                    // If we've already loaded children, use that as the source of truth
                    if (loadedChildren.length > 0) {
                      hasChildren = true
                    }
                  }

                  const isSelected = selectedResources.has(resourceKey)

                  return (
                    <React.Fragment key={uniqueKey}>
                    <tr
                      className={`transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900/70 shadow-sm'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      style={{
                        borderLeft: isSelected ? '3px solid rgb(59, 130, 246)' : '3px solid transparent',
                        borderRight: isSelected ? '1px solid rgb(59, 130, 246, 0.3)' : '1px solid transparent',
                        borderTop: isSelected ? '1px solid rgb(59, 130, 246, 0.3)' : undefined,
                        borderBottom: isSelected ? '1px solid rgb(59, 130, 246, 0.3)' : undefined,
                      }}
                      onClick={(e) => handleResourceClick(resourceKey, index, e)}
                      onMouseDown={(e) => e.preventDefault()} // Prevent text selection on shift-click
                    >
                      <td className="w-8 px-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const newSelection = new Set(selectedResources)
                            if (newSelection.has(resourceKey)) {
                              newSelection.delete(resourceKey)
                            } else {
                              newSelection.add(resourceKey)
                            }
                            setSelectedResources(newSelection)
                            setLastSelectedIndex(index)
                          }}
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {canHaveChildren && hasChildren && (
                            <ExpandButton
                              isExpanded={isExpanded}
                              onClick={() => toggleResourceExpansion(resource, resourceKey, resourceKind)}
                              size={14}
                            />
                          )}
                          {getStatusIcon(status)}
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate" title={name}>
                            {name}
                          </span>
                        </div>
                      </td>

                      {currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster' && (
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const namespace = resource.metadata?.namespace
                              if (namespace) {
                                setCurrentNamespace(namespace)
                                // Notify parent component to persist the change
                                if (onNamespaceChange) {
                                  onNamespaceChange(namespace)
                                }
                              }
                            }}
                            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer transition-colors"
                            title={`Switch to ${resource.metadata?.namespace || '-'} namespace`}
                          >
                            {resource.metadata?.namespace || '-'}
                          </button>
                        </td>
                      )}

                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusBadge status={status} getStatusColor={getStatusColor} />
                      </td>

                      {selectedResource.kind === 'Pod' && (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {helpers.getContainerReadyCount(resource)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {helpers.getRestartCount(resource)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">
                            {(() => {
                              const cpu = helpers.getCpuUsage(resource)
                              const warnings = getPodResourceWarnings(resource)
                              if (cpu === '-' && !warnings.cpu) return <span className="text-gray-400 dark:text-gray-500">-</span>
                              // Simple color coding for pods based on existence
                              const cpuValue = parseFloat(cpu) || 0
                              const color = cpuValue > 500 ? 'text-orange-500' :
                                          cpuValue > 100 ? 'text-yellow-500' :
                                          cpuValue > 0 ? 'text-green-500' :
                                          'text-gray-400 dark:text-gray-500'
                              return (
                                <div className="flex items-center space-x-1">
                                  <span className={color}>{cpu}</span>
                                  {warnings.cpu && (
                                    <span className="text-indigo-500 dark:text-indigo-400" title="Some containers have CPU configuration warnings">
                                      ⚠️
                                    </span>
                                  )}
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">
                            {(() => {
                              const mem = helpers.getMemoryUsage(resource)
                              const warnings = getPodResourceWarnings(resource)
                              if (mem === '-' && !warnings.memory) return <span className="text-gray-400 dark:text-gray-500">-</span>
                              // Simple color coding for pods based on existence
                              const memValue = parseFloat(mem) || 0
                              const color = memValue > 1024 ? 'text-orange-500' :
                                          memValue > 512 ? 'text-yellow-500' :
                                          memValue > 0 ? 'text-green-500' :
                                          'text-gray-400 dark:text-gray-500'
                              return (
                                <div className="flex items-center space-x-1">
                                  <span className={color}>{mem}</span>
                                  {warnings.memory && (
                                    <span className="text-indigo-500 dark:text-indigo-400" title="Some containers have memory configuration warnings">
                                      ⚠️
                                    </span>
                                  )}
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {helpers.getParentResource(resource)}
                          </td>
                        </>
                      )}

                      {selectedResource.kind === 'Service' && (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {resource.spec?.type || '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {resource.spec?.clusterIP || '-'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {helpers.formatPorts(resource.spec?.ports)}
                          </td>
                        </>
                      )}

                      {selectedResource.kind === 'Deployment' && (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {resource.status?.readyReplicas || 0}/{resource.status?.replicas || 0}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {resource.status?.updatedReplicas || 0}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {resource.status?.availableReplicas || 0}
                          </td>
                        </>
                      )}

                      {selectedResource.kind === 'Node' && (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {helpers.getNodeRoles(resource)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {resource.status?.nodeInfo?.kubeletVersion || '-'}
                          </td>
                        </>
                      )}

                      {/* Generic info column for unknown resource types */}
                      {!['Pod', 'Service', 'Deployment', 'Node'].includes(selectedResource.kind) && (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                            {helpers.getResourceInfo(resource)}
                          </td>
                          {shouldShowParentColumn() && (
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                              {helpers.getParentResource(resource)}
                            </td>
                          )}
                        </>
                      )}

                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {age}
                      </td>
                    </tr>

                    {/* Child resources or containers when expanded */}
                    {isExpanded && (
                      <>
                        {/* For Pods showing containers */}
                        {resourceKind === 'Pod' && childItems.length > 0 && (
                          <>
                            {/* Sub-header row explaining what columns mean for containers */}
                            <SubResourceHeader
                              title="Containers"
                              showNamespace={currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster'}
                              columns={['→ State', 'Ready', 'Restarts', 'CPU', 'Memory', '→ Resources', '']}
                            />

                            {/* Render each container */}
                            {childItems.map((container, cIndex) => (
                              <ContainerRow
                                key={`${uniqueKey}-container-${container.name}`}
                                container={container}
                                index={cIndex}
                                totalCount={childItems.length}
                                podMetric={podMetrics[`${namespace}/${name}`]}
                                indentLevel={8}
                                showNamespace={currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster'}
                                namespace={namespace}
                                pod={resource}
                                onOpenShell={handleOpenShell}
                                onViewLogs={handleViewLogs}
                              />
                            ))}
                          </>
                        )}

                        {/* For other resources showing child resources */}
                        {resourceKind !== 'Pod' && childItems.length > 0 && (
                          <>
                            {/* Sub-header for child resources */}
                            <tr className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
                              <td colSpan="100%" className="px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                <div className="flex items-center space-x-2">
                                  <span>
                                    {resourceKind === 'Deployment' && 'ReplicaSets'}
                                    {resourceKind === 'ReplicaSet' && 'Pods'}
                                    {resourceKind === 'DaemonSet' && 'Pods'}
                                    {resourceKind === 'StatefulSet' && 'Pods'}
                                    {resourceKind === 'Job' && 'Pods'}
                                    {resourceKind === 'CronJob' && 'Jobs'}
                                  </span>
                                </div>
                              </td>
                            </tr>

                            {/* Render child resources */}
                            {childItems.map((childResource, cIndex) => {
                              const childKey = `${uniqueKey}-child-${childResource.metadata?.uid || cIndex}`
                              const childKind = childResource.kind ||
                                (resourceKind === 'Deployment' ? 'ReplicaSet' :
                                 resourceKind === 'CronJob' ? 'Job' : 'Pod')
                              const isChildExpanded = expandedResources.has(childKey)
                              // Only get containers if this is actually a Pod
                              const childContainers = childKind === 'Pod'
                                ? (podContainers[`${childResource.metadata?.namespace}/${childResource.metadata?.name}`] || [])
                                : []
                              const childChildItems = childResources[childKey] || []

                              return (
                                <React.Fragment key={childKey}>
                                  <tr className="bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50">
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      <div className="flex items-center space-x-2 pl-6">
                                        <span className="text-gray-400">
                                          {cIndex === childItems.length - 1 ? '└─' : '├─'}
                                        </span>
                                        {/* Expand button for child if it can have children */}
                                        {(childKind === 'Pod' || childKind === 'ReplicaSet' || childKind === 'Job') &&
                                         ((childKind === 'Pod' && childContainers.length > 0) ||
                                          (childKind === 'ReplicaSet' && (childResource.status?.replicas || 0) > 0) ||
                                          (childKind === 'Job' && (childResource.status?.active || childResource.status?.succeeded || childResource.status?.failed || 0) > 0)) && (
                                          <ExpandButton
                                            isExpanded={isChildExpanded}
                                            onClick={() => toggleResourceExpansion(childResource, childKey, childKind)}
                                            size={12}
                                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                          />
                                        )}
                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                          {childResource.metadata?.name || '-'}
                                        </span>
                                      </div>
                                    </td>

                                    {currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster' && (
                                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                        {childResource.metadata?.namespace || '-'}
                                      </td>
                                    )}

                                    <td className="px-3 py-2 whitespace-nowrap">
                                      <StatusBadge
                                        status={helpers.getResourceStatus(childResource)}
                                        getStatusColor={getStatusColor}
                                      />
                                    </td>

                                    {/* Additional columns based on child type */}
                                    {childKind === 'Pod' && (
                                      <>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                          {helpers.getContainerReadyCount(childResource)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                          {helpers.getRestartCount(childResource)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                          {helpers.getCpuUsage(childResource)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                          {helpers.getMemoryUsage(childResource)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                          {helpers.getParentResource(childResource)}
                                        </td>
                                      </>
                                    )}

                                    {(childKind === 'ReplicaSet' || childKind === 'Job') && (
                                      <>
                                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                          {childResource.status?.readyReplicas || childResource.status?.succeeded || 0}/
                                          {childResource.spec?.replicas || childResource.spec?.completions || 0}
                                        </td>
                                        <td colSpan="4" className="px-3 py-2 whitespace-nowrap text-xs text-gray-400">
                                          {/* Empty columns */}
                                        </td>
                                      </>
                                    )}

                                    <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                      {formatAge(childResource.metadata?.creationTimestamp)}
                                    </td>
                                  </tr>

                                  {/* Nested expansion for Pods showing containers */}
                                  {isChildExpanded && childKind === 'Pod' && childContainers.length > 0 && (
                                    <>
                                      <SubResourceHeader
                                        title="Containers"
                                        showNamespace={currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster'}
                                        columns={['→ State', 'Ready', 'Restarts', 'CPU', 'Memory', '→ Resources', '']}
                                        indentLevel={12}
                                      />

                                      {childContainers.map((container, containerIndex) => (
                                        <ContainerRow
                                          key={`${childKey}-container-${container.name}`}
                                          container={container}
                                          index={containerIndex}
                                          totalCount={childContainers.length}
                                          podMetric={podMetrics[`${childResource.metadata?.namespace}/${childResource.metadata?.name}`]}
                                          indentLevel={14}
                                          showNamespace={currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster'}
                                          namespace={childResource.metadata?.namespace}
                                          pod={childResource}
                                          onOpenShell={handleOpenShell}
                                          onViewLogs={handleViewLogs}
                                        />
                                      ))}
                                    </>
                                  )}

                                  {/* Nested expansion for ReplicaSets/Jobs showing Pods */}
                                  {isChildExpanded && (childKind === 'ReplicaSet' || childKind === 'Job') && childChildItems.length > 0 && (
                                    <>
                                      <tr className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
                                        <td colSpan="100%" className="px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                          <div className="flex items-center space-x-2 pl-12">
                                            <span>Pods</span>
                                          </div>
                                        </td>
                                      </tr>

                                      {childChildItems.map((pod, podIndex) => {
                                        const podKey = `${childKey}-pod-${pod.metadata?.uid || podIndex}`
                                        const isPodExpanded = expandedResources.has(podKey)
                                        const podContainerList = podContainers[`${pod.metadata?.namespace}/${pod.metadata?.name}`] || []

                                        return (
                                          <React.Fragment key={podKey}>
                                            <tr className="bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-100/50 dark:hover:bg-gray-700/30">
                                              <td className="px-3 py-2 whitespace-nowrap">
                                                <div className="flex items-center space-x-2 pl-12">
                                                  <span className="text-gray-400">
                                                    {podIndex === childChildItems.length - 1 ? '└─' : '├─'}
                                                  </span>
                                                  {podContainerList.length > 0 && (
                                                    <ExpandButton
                                                      isExpanded={isPodExpanded}
                                                      onClick={() => toggleResourceExpansion(pod, podKey, 'Pod')}
                                                      size={10}
                                                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                    />
                                                  )}
                                                  <span className="text-xs text-gray-600 dark:text-gray-400">
                                                    {pod.metadata?.name || '-'}
                                                  </span>
                                                </div>
                                              </td>

                                              {currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster' && (
                                                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                                                  {pod.metadata?.namespace || '-'}
                                                </td>
                                              )}

                                              <td className="px-3 py-2 whitespace-nowrap">
                                                <StatusBadge
                                                  status={helpers.getResourceStatus(pod)}
                                                  getStatusColor={getStatusColor}
                                                  size="small"
                                                />
                                              </td>

                                              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                                                {helpers.getContainerReadyCount(pod)}
                                              </td>
                                              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                                                {helpers.getRestartCount(pod)}
                                              </td>
                                              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                                                {helpers.getCpuUsage(pod)}
                                              </td>
                                              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                                                {helpers.getMemoryUsage(pod)}
                                              </td>
                                              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                                                {helpers.getParentResource(pod)}
                                              </td>
                                              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
                                                {formatAge(pod.metadata?.creationTimestamp)}
                                              </td>
                                            </tr>

                                            {/* Containers for nested pod */}
                                            {isPodExpanded && podContainerList.length > 0 && (
                                              <>
                                                <tr className="bg-blue-50/50 dark:bg-blue-900/10 border-b border-blue-200/50 dark:border-blue-800/50">
                                                  <td className="px-3 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400 pl-20">
                                                    Containers
                                                  </td>
                                                  {currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster' && (
                                                    <td className="px-3 py-0.5 text-xs text-blue-500 dark:text-blue-500"></td>
                                                  )}
                                                  <td className="px-3 py-0.5 text-xs text-blue-500 dark:text-blue-500">→ State</td>
                                                  <td className="px-3 py-0.5 text-xs text-blue-500 dark:text-blue-500">Ready</td>
                                                  <td className="px-3 py-0.5 text-xs text-blue-500 dark:text-blue-500">Restarts</td>
                                                  <td className="px-3 py-0.5 text-xs text-blue-500 dark:text-blue-500">CPU</td>
                                                  <td className="px-3 py-0.5 text-xs text-blue-500 dark:text-blue-500">Memory</td>
                                                  <td className="px-3 py-0.5 text-xs text-blue-500 dark:text-blue-500">→ Resources</td>
                                                  <td className="px-3 py-0.5 text-xs text-blue-500 dark:text-blue-500"></td>
                                                </tr>

                                                {podContainerList.map((container, containerIdx) => (
                                                  <ContainerRow
                                                    key={`${podKey}-container-${container.name}`}
                                                    container={container}
                                                    index={containerIdx}
                                                    totalCount={podContainerList.length}
                                                    podMetric={podMetrics[`${pod.metadata?.namespace}/${pod.metadata?.name}`]}
                                                    indentLevel={20}
                                                    showNamespace={currentNamespace === 'All Namespaces' && selectedResource.scope !== 'Cluster'}
                                                    namespace={pod.metadata?.namespace}
                                                    pod={pod}
                                                    onOpenShell={handleOpenShell}
                                                    onViewLogs={handleViewLogs}
                                                  />
                                                ))}
                                              </>
                                            )}
                                          </React.Fragment>
                                        )
                                      })}
                                    </>
                                  )}
                                </React.Fragment>
                              )
                            })}
                          </>
                        )}
                      </>
                    )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer with count */}
      {!loading && !error && (
        <div className="px-2 py-1 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {filteredAndSortedResources.length} {selectedResource.type.toLowerCase()}
            {searchTerm && ` (filtered from ${resources.length})`}
            {streaming && ' • Streaming...'}
          </p>
          {selectedResources.size > 0 && (
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {selectedResources.size} selected
            </p>
          )}
        </div>
      )}

      {/* Resource Inspector Panel */}
      <ResourceInspector
        resource={inspectedResource}
        resourceType={selectedResource}
        isOpen={showInspector}
        onClose={() => setShowInspector(false)}
      />

      {/* YAML Editor (edit mode) */}
      <YamlEditor
        resource={editedResource}
        isOpen={showEditor}
        onClose={() => setShowEditor(false)}
        resourceType={selectedResource}
        contextName={contextName}
        mode="edit"
        onSave={async (updatedResource) => {
          try {
            if (isElectron && kubectlAPI && kubectlAPI.updateResource) {
              const result = await kubectlAPI.updateResource(
                contextName,
                selectedResource.kind,
                updatedResource.metadata?.name,
                updatedResource.metadata?.namespace,
                updatedResource
              )
              if (!result.success) {
                throw new Error(result.error || 'Failed to update resource')
              }
            } else {
              const response = await fetch(`/api/resources/${contextName}/${selectedResource.kind}/${updatedResource.metadata.namespace}/${updatedResource.metadata.name}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedResource)
              })
              if (!response.ok) {
                const error = await response.text()
                throw new Error(error || `HTTP ${response.status}`)
              }
            }
            setShowEditor(false)
            fetchResources()
          } catch (error) {
            throw error
          }
        }}
      />

      {/* Create Resource Dialog */}
      <CreateResourceDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSelect={handleCreateFromTemplate}
        crdData={crdData}
      />

      {/* YAML Editor (create mode) */}
      <YamlEditor
        isOpen={createEditorMode}
        onClose={() => setCreateEditorMode(false)}
        resourceType={{ kind: createKind }}
        contextName={contextName}
        mode="create"
        initialYaml={createYaml}
        schema={createSchema}
        onSave={handleCreateSave}
      />

      {/* Container Shell */}
      {showShell && shellPod && shellContainer && (
        <ContainerShell
          pod={shellPod}
          container={shellContainer}
          namespace={shellPod.metadata?.namespace}
          contextName={contextName}
          isOpen={showShell}
          onClose={() => {
            setShowShell(false)
            setShellPod(null)
            setShellContainer(null)
          }}
        />
      )}

      {/* Log Viewer */}
      {showLogs && logsPod && logsContainer && (
        <LogViewer
          pod={logsPod}
          container={logsContainer}
          namespace={logsPod.metadata?.namespace}
          contextName={contextName}
          isOpen={showLogs}
          onClose={() => {
            setShowLogs(false)
            setLogsPod(null)
            setLogsContainer(null)
          }}
        />
      )}
    </div>
  )
}

export default ResourceList