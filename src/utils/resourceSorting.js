// Utility functions for sorting Kubernetes resources

/**
 * Convert Kubernetes CPU units to millicores for comparison
 * @param {string|number|null|undefined} cpuString - CPU value with optional unit
 * @returns {number} Value in millicores, or -1 for invalid/missing values
 */
export const cpuToMillicores = (cpuString) => {
  if (!cpuString || cpuString === '-' || cpuString === undefined || cpuString === null) return -1

  const match = cpuString.toString().match(/^([0-9.]+)([a-zA-Z]*)?$/)
  if (!match) return -1

  const value = parseFloat(match[1])
  if (isNaN(value)) return -1

  const unit = match[2] || ''

  switch(unit) {
    case 'm': // millicores
      return value
    case 'n': // nanocores
      return value / 1000000
    case '': // cores
      return value * 1000
    default:
      return -1
  }
}

/**
 * Convert Kubernetes memory units to bytes for comparison
 * @param {string|number|null|undefined} memString - Memory value with optional unit
 * @returns {number} Value in bytes, or -1 for invalid/missing values
 */
export const memoryToBytes = (memString) => {
  if (!memString || memString === '-' || memString === undefined || memString === null) return -1

  const match = memString.toString().match(/^([0-9.]+)([a-zA-Z]*)?$/)
  if (!match) return -1

  const value = parseFloat(match[1])
  if (isNaN(value)) return -1

  const unit = match[2] || ''

  switch(unit) {
    case 'Ki': // kibibytes
      return value * 1024
    case 'Mi': // mebibytes
      return value * 1024 * 1024
    case 'Gi': // gibibytes
      return value * 1024 * 1024 * 1024
    case 'Ti': // tebibytes
      return value * 1024 * 1024 * 1024 * 1024
    case 'Pi': // pebibytes
      return value * 1024 * 1024 * 1024 * 1024 * 1024
    case 'Ei': // exbibytes
      return value * 1024 * 1024 * 1024 * 1024 * 1024 * 1024
    case 'K': // kilobytes (decimal)
      return value * 1000
    case 'M': // megabytes (decimal)
      return value * 1000 * 1000
    case 'G': // gigabytes (decimal)
      return value * 1000 * 1000 * 1000
    case 'T': // terabytes (decimal)
      return value * 1000 * 1000 * 1000 * 1000
    case '': // bytes
      return value
    default:
      return -1
  }
}

/**
 * Compare two values for sorting
 * @param {any} aValue - First value
 * @param {any} bValue - Second value
 * @param {string} sortOrder - 'asc' or 'desc'
 * @returns {number} -1, 0, or 1 for sorting
 */
export const compareValues = (aValue, bValue, sortOrder = 'asc') => {
  // Handle null, undefined, and -1 (invalid) values
  const aInvalid = aValue === null || aValue === undefined || aValue === -1 || aValue === ''
  const bInvalid = bValue === null || bValue === undefined || bValue === -1 || bValue === ''

  // For ascending sort, invalid values go to the end
  // For descending sort, invalid values still go to the end
  if (aInvalid && bInvalid) return 0
  if (aInvalid) return sortOrder === 'asc' ? 1 : 1
  if (bInvalid) return sortOrder === 'asc' ? -1 : -1

  // Handle equality
  if (aValue === bValue) return 0

  // Perform comparison
  let result
  if (typeof aValue === 'string' && typeof bValue === 'string') {
    result = aValue.localeCompare(bValue)
  } else {
    result = aValue > bValue ? 1 : -1
  }

  // Apply sort order
  return sortOrder === 'desc' ? -result : result
}

/**
 * Sort resources by a specific field
 * @param {Array} resources - Array of resources to sort
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - 'asc' or 'desc'
 * @param {Object} options - Additional options like podMetrics, selectedResourceKind
 * @returns {Array} Sorted array (new array, not mutated)
 */
export const sortResources = (resources, sortBy, sortOrder = 'asc', options = {}) => {
  const {
    podMetrics = {},
    selectedResourceKind = 'Pod',
    getResourceStatus,
    getRestartCount,
    getCpuUsage,
    getMemoryUsage,
    getContainerReadyCount,
    getParentResource,
    getResourceInfo,
    formatPorts,
    getNodeRoles
  } = options

  // Create a copy to avoid mutation
  return [...resources].sort((a, b) => {
    let aValue, bValue

    switch (sortBy) {
      case 'name':
        aValue = (a.metadata?.name || a.name || '').toLowerCase()
        bValue = (b.metadata?.name || b.name || '').toLowerCase()
        break

      case 'namespace':
        aValue = (a.metadata?.namespace || '').toLowerCase()
        bValue = (b.metadata?.namespace || '').toLowerCase()
        break

      case 'status':
        if (getResourceStatus) {
          aValue = (getResourceStatus(a) || 'Unknown').toLowerCase()
          bValue = (getResourceStatus(b) || 'Unknown').toLowerCase()
        } else {
          // Fallback implementation
          aValue = (a.status?.phase || 'Unknown').toLowerCase()
          bValue = (b.status?.phase || 'Unknown').toLowerCase()
        }
        break

      case 'ready':
        if (selectedResourceKind === 'Pod') {
          if (getContainerReadyCount) {
            aValue = getContainerReadyCount(a)
            bValue = getContainerReadyCount(b)
          } else {
            // Fallback: count ready containers
            const aContainers = a.status?.containerStatuses || []
            const bContainers = b.status?.containerStatuses || []
            const aReady = aContainers.filter(c => c.ready).length
            const bReady = bContainers.filter(c => c.ready).length
            const aTotal = aContainers.length || 1
            const bTotal = bContainers.length || 1
            aValue = aTotal > 0 ? aReady / aTotal : 0
            bValue = bTotal > 0 ? bReady / bTotal : 0
          }
        } else if (selectedResourceKind === 'Deployment') {
          const aReady = a.status?.readyReplicas || 0
          const aDesired = a.status?.replicas || 0
          const bReady = b.status?.readyReplicas || 0
          const bDesired = b.status?.replicas || 0
          aValue = aDesired > 0 ? aReady / aDesired : 0
          bValue = bDesired > 0 ? bReady / bDesired : 0
        } else {
          aValue = 0
          bValue = 0
        }
        break

      case 'restarts':
        if (getRestartCount) {
          const aRestarts = getRestartCount(a)
          const bRestarts = getRestartCount(b)
          aValue = parseInt(aRestarts !== undefined ? aRestarts : 0) || 0
          bValue = parseInt(bRestarts !== undefined ? bRestarts : 0) || 0
        } else {
          // Fallback: sum restart counts
          const aContainers = a.status?.containerStatuses || []
          const bContainers = b.status?.containerStatuses || []
          aValue = aContainers.reduce((sum, c) => sum + (c.restartCount || 0), 0)
          bValue = bContainers.reduce((sum, c) => sum + (c.restartCount || 0), 0)
        }
        break

      case 'cpu':
        if (getCpuUsage) {
          const aCpu = getCpuUsage(a)
          const bCpu = getCpuUsage(b)
          // Handle both object and string formats
          const aCpuValue = typeof aCpu === 'object' ? aCpu.value : aCpu
          const bCpuValue = typeof bCpu === 'object' ? bCpu.value : bCpu
          aValue = cpuToMillicores(aCpuValue !== undefined ? aCpuValue : '-')
          bValue = cpuToMillicores(bCpuValue !== undefined ? bCpuValue : '-')
        } else {
          // Fallback: use podMetrics
          const aPodKey = `${a.metadata?.namespace}/${a.metadata?.name}`
          const bPodKey = `${b.metadata?.namespace}/${b.metadata?.name}`
          aValue = cpuToMillicores(podMetrics[aPodKey]?.cpu || '-')
          bValue = cpuToMillicores(podMetrics[bPodKey]?.cpu || '-')
        }
        break

      case 'memory':
        if (getMemoryUsage) {
          const aMem = getMemoryUsage(a)
          const bMem = getMemoryUsage(b)
          // Handle both object and string formats
          const aMemValue = typeof aMem === 'object' ? aMem.value : aMem
          const bMemValue = typeof bMem === 'object' ? bMem.value : bMem
          aValue = memoryToBytes(aMemValue !== undefined ? aMemValue : '-')
          bValue = memoryToBytes(bMemValue !== undefined ? bMemValue : '-')
        } else {
          // Fallback: use podMetrics
          const aPodKey = `${a.metadata?.namespace}/${a.metadata?.name}`
          const bPodKey = `${b.metadata?.namespace}/${b.metadata?.name}`
          aValue = memoryToBytes(podMetrics[aPodKey]?.memory || '-')
          bValue = memoryToBytes(podMetrics[bPodKey]?.memory || '-')
        }
        break

      case 'parent':
        if (getParentResource) {
          aValue = getParentResource(a).toLowerCase()
          bValue = getParentResource(b).toLowerCase()
        } else {
          aValue = ''
          bValue = ''
        }
        break

      case 'type':
        if (selectedResourceKind === 'Service') {
          aValue = (a.spec?.type || '').toLowerCase()
          bValue = (b.spec?.type || '').toLowerCase()
        } else if (getResourceInfo) {
          aValue = getResourceInfo(a).toLowerCase()
          bValue = getResourceInfo(b).toLowerCase()
        } else {
          aValue = ''
          bValue = ''
        }
        break

      case 'clusterip':
        aValue = (a.spec?.clusterIP || '').toLowerCase()
        bValue = (b.spec?.clusterIP || '').toLowerCase()
        break

      case 'ports':
        if (formatPorts) {
          aValue = formatPorts(a.spec?.ports || []).toLowerCase()
          bValue = formatPorts(b.spec?.ports || []).toLowerCase()
        } else {
          aValue = ''
          bValue = ''
        }
        break

      case 'uptodate':
        aValue = a.status?.updatedReplicas || 0
        bValue = b.status?.updatedReplicas || 0
        break

      case 'available':
        aValue = a.status?.availableReplicas || 0
        bValue = b.status?.availableReplicas || 0
        break

      case 'roles':
        if (getNodeRoles) {
          aValue = getNodeRoles(a).toLowerCase()
          bValue = getNodeRoles(b).toLowerCase()
        } else {
          aValue = ''
          bValue = ''
        }
        break

      case 'version':
        aValue = (a.status?.nodeInfo?.kubeletVersion || '').toLowerCase()
        bValue = (b.status?.nodeInfo?.kubeletVersion || '').toLowerCase()
        break

      case 'info':
        if (getResourceInfo) {
          aValue = getResourceInfo(a).toLowerCase()
          bValue = getResourceInfo(b).toLowerCase()
        } else {
          aValue = ''
          bValue = ''
        }
        break

      case 'age':
        aValue = new Date(a.metadata?.creationTimestamp || 0).getTime()
        bValue = new Date(b.metadata?.creationTimestamp || 0).getTime()
        break

      default:
        return 0
    }

    return compareValues(aValue, bValue, sortOrder)
  })
}