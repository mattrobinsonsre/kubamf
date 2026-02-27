// Resource helper functions for ResourceList component
// @contract parseResourceValue.cpu - Must parse CPU values in millicores and cores
// @contract parseResourceValue.memory - Must parse memory values in Ki/Mi/Gi/K/M/G
// @contract formatCpuValue.nanocores - Must convert nanocores to millicores
// @contract formatCpuValue.millicores - Must pass through millicores unchanged
// @contract formatMemoryValue.ki - Must convert Ki to Mi
// @contract formatMemoryValue.gi - Must convert Gi to Mi
// @contract getResourceColor.noUsage - Must return gray when usage is dash
// @contract getResourceColor.overLimit - Must return red when usage > 80% of limit
// @contract getResourceColor.overRequest - Must return orange when usage > 95% of request
// @contract getResourceColor.underRequest - Must return blue when usage < 50% of request
// @contract getResourceColor.healthy - Must return green for normal usage
// @contract getResourceWarnings.missingRequest - Must warn when request is not set
// @contract getResourceWarnings.missingLimit - Must warn when limit is not set
// @contract parseContainerState.string - Must return string as-is
// @contract parseContainerState.object - Must extract and capitalize key from object
// @contract parseContainerState.null - Must return Unknown for null/undefined
// @contract createResourceHelpers.podStatus - Must return pod phase
// @contract createResourceHelpers.deploymentStatus - Must compare ready vs desired replicas
// @contract createResourceHelpers.nodeStatus - Must check Ready condition

// Helper function to parse resource values (e.g., "100m" -> 100, "2Gi" -> 2048)
export const parseResourceValue = (value, type) => {
  if (!value || value === '-') return 0

  const strValue = String(value)

  if (type === 'cpu') {
    // CPU can be in millicores (m) or cores
    if (strValue.endsWith('m')) {
      return parseFloat(strValue.slice(0, -1))
    }
    // Assume cores, convert to millicores
    return parseFloat(strValue) * 1000
  } else if (type === 'memory') {
    // Memory can be in Mi, Gi, Ki, or bytes
    const match = strValue.match(/^(\d+(?:\.\d+)?)(Mi|Gi|Ki|M|G|K)?$/)
    if (match) {
      const num = parseFloat(match[1])
      const unit = match[2] || 'Mi'
      switch(unit) {
        case 'Ki': case 'K': return num / 1024
        case 'Mi': case 'M': return num
        case 'Gi': case 'G': return num * 1024
        default: return num
      }
    }
  }

  return parseFloat(strValue) || 0
}

// Format raw CPU value to readable format (e.g., "1312875n" -> "1m")
export const formatCpuValue = (cpuRaw) => {
  if (!cpuRaw || cpuRaw === '0' || cpuRaw === '-') return '-'

  const cpuMatch = cpuRaw.match(/^(\d+)([a-zA-Z]*)$/)
  if (!cpuMatch) return cpuRaw

  const value = parseFloat(cpuMatch[1])
  const unit = cpuMatch[2] || ''

  if (unit === 'n') {
    // nanocores to millicores (1 millicore = 1,000,000 nanocores)
    return `${Math.round(value / 1000000)}m`
  } else if (unit === 'm') {
    // Already in millicores
    return cpuRaw
  } else if (unit === '' || unit === 'u') {
    // Cores to millicores
    return `${Math.round(value * 1000)}m`
  }

  return cpuRaw
}

// Format raw memory value to readable format (e.g., "207016Ki" -> "202Mi")
export const formatMemoryValue = (memRaw) => {
  if (!memRaw || memRaw === '0' || memRaw === '-') return '-'

  const memMatch = memRaw.match(/^(\d+)([a-zA-Z]*)$/)
  if (!memMatch) return memRaw

  const value = parseFloat(memMatch[1])
  const unit = memMatch[2] || 'Ki'

  if (unit === 'Ki') {
    // Ki to Mi
    return `${Math.round(value / 1024)}Mi`
  } else if (unit === 'Mi') {
    // Already in Mi
    return memRaw
  } else if (unit === 'Gi') {
    // Gi to Mi
    return `${Math.round(value * 1024)}Mi`
  } else if (unit === '' || unit === 'B') {
    // Bytes to Mi
    return `${Math.round(value / (1024 * 1024))}Mi`
  }

  return memRaw
}

// Get color for resource usage based on requests/limits
export const getResourceColor = (usage, request, limit, type) => {
  if (usage === '-' || (!request && !limit) || (request === '-' && limit === '-')) {
    return 'text-gray-400 dark:text-gray-500'
  }

  const usageVal = parseResourceValue(usage, type)
  const reqVal = request !== '-' ? parseResourceValue(request, type) : 0
  const limitVal = limit !== '-' ? parseResourceValue(limit, type) : 0

  // If no request/limit set, yellow
  if (!reqVal && !limitVal) {
    return 'text-yellow-500'
  }

  // Check against limit first (worst case)
  if (limitVal > 0) {
    const limitPercent = (usageVal / limitVal) * 100
    if (limitPercent > 80) return 'text-red-600'
  }

  // Check against request
  if (reqVal > 0) {
    const reqPercent = (usageVal / reqVal) * 100
    if (reqPercent > 95) return 'text-orange-500'
    if (reqPercent < 50) return 'text-blue-500'
  }

  return 'text-green-500'
}

// Check for resource configuration warnings
export const getResourceWarnings = (request, limit, type) => {
  const warnings = []

  // Check if resources are not set
  if (!request || request === '-') {
    warnings.push(`No ${type} request set`)
  }
  if (!limit || limit === '-') {
    warnings.push(`No ${type} limit set`)
  }

  // If both are set, check the ratio
  if (request && request !== '-' && limit && limit !== '-') {
    const reqVal = parseResourceValue(request, type)
    const limitVal = parseResourceValue(limit, type)

    if (reqVal > 0 && limitVal > 0) {
      const ratio = (reqVal / limitVal) * 100

      if (type === 'cpu' && ratio < 50) {
        warnings.push(`CPU request (${request}) is less than 50% of limit (${limit})`)
      } else if (type === 'memory' && ratio < 80) {
        warnings.push(`Memory request (${request}) is less than 80% of limit (${limit})`)
      }
    }
  }

  return warnings
}

// Get warning indicator for resource configuration
export const getResourceWarningIndicator = (request, limit, type) => {
  const warnings = getResourceWarnings(request, limit, type)

  if (warnings.length === 0) {
    return null
  }

  // Priority order: Missing resources > Imbalanced ratio
  const hasNoResources = warnings.some(w => w.includes('No'))
  const hasRatioWarning = warnings.some(w => w.includes('less than'))

  if (hasNoResources) {
    // Missing resources (highest priority) - yellow warning
    return { symbol: '⚠️', color: 'text-yellow-600 dark:text-yellow-400', tooltip: warnings.filter(w => w.includes('No')).join('; ') }
  } else if (hasRatioWarning) {
    // Imbalanced ratio (lower priority) - use indigo/purple for a softer warning
    return { symbol: '⚠️', color: 'text-indigo-500 dark:text-indigo-400', tooltip: warnings.join('; ') }
  }

  return null
}

// Get warnings for pod based on all its containers
export const getPodResourceWarnings = (pod) => {
  const warnings = { cpu: false, memory: false }

  if (!pod.spec?.containers) {
    return warnings
  }

  // Check each container for warnings
  pod.spec.containers.forEach(container => {
    const cpuReq = container.resources?.requests?.cpu || '-'
    const cpuLimit = container.resources?.limits?.cpu || '-'
    const memReq = container.resources?.requests?.memory || '-'
    const memLimit = container.resources?.limits?.memory || '-'

    const cpuWarnings = getResourceWarnings(cpuReq, cpuLimit, 'cpu')
    const memWarnings = getResourceWarnings(memReq, memLimit, 'memory')

    if (cpuWarnings.length > 0) {
      warnings.cpu = true
    }
    if (memWarnings.length > 0) {
      warnings.memory = true
    }
  })

  return warnings
}

// Parse container state from object or string format
export const parseContainerState = (state) => {
  if (!state) return 'Unknown'

  if (typeof state === 'string') {
    return state
  } else if (typeof state === 'object') {
    // Find the key whose value is truthy (V1ContainerState has running/terminated/waiting but only one is non-null)
    const stateKey = Object.keys(state).find(k => state[k]) || 'Unknown'
    // Capitalize first letter
    return stateKey.charAt(0).toUpperCase() + stateKey.slice(1)
  }

  return 'Unknown'
}

export const createResourceHelpers = (selectedResourceKind, podMetrics) => ({
  getResourceStatus: (resource) => {
    if (!resource.status) return 'Unknown'

    // Known specific resource types
    if (selectedResourceKind === 'Pod') {
      return resource.status?.phase || 'Unknown'
    } else if (selectedResourceKind === 'Deployment') {
      const ready = resource.status?.readyReplicas || 0
      const desired = resource.status?.replicas || 0
      return ready === desired ? 'Ready' : 'NotReady'
    } else if (selectedResourceKind === 'Node') {
      const conditions = resource.status?.conditions || []
      const readyCondition = conditions.find(c => c.type === 'Ready')
      return readyCondition?.status === 'True' ? 'Ready' : 'NotReady'
    }

    // Generic status detection for any resource
    const status = resource.status

    // Check for common condition patterns
    if (status.conditions && Array.isArray(status.conditions)) {
      const readyCondition = status.conditions.find(c =>
        c.type === 'Ready' || c.type === 'Available' || c.type === 'Progressing'
      )
      if (readyCondition) {
        return readyCondition.status === 'True' ? 'Ready' : 'NotReady'
      }
    }

    // Check for common status fields
    if (status.phase) return status.phase
    if (status.state) return status.state
    if (status.ready !== undefined) return status.ready ? 'Ready' : 'NotReady'

    // Check for replica-based status
    if (status.readyReplicas !== undefined && status.replicas !== undefined) {
      return status.readyReplicas === status.replicas ? 'Ready' : 'NotReady'
    }

    // Look for keywords in status object
    const statusStr = JSON.stringify(status).toLowerCase()
    if (statusStr.includes('running')) return 'Running'
    if (statusStr.includes('ready')) return 'Ready'
    if (statusStr.includes('active')) return 'Active'
    if (statusStr.includes('succeeded')) return 'Succeeded'
    if (statusStr.includes('failed')) return 'Failed'
    if (statusStr.includes('pending')) return 'Pending'
    if (statusStr.includes('error')) return 'Error'

    return 'Active'
  },

  getContainerReadyCount: (resource) => {
    if (!resource.status?.containerStatuses) return '-'
    const ready = resource.status.containerStatuses.filter(c => c.ready).length
    const total = resource.status.containerStatuses.length
    return `${ready}/${total}`
  },

  getRestartCount: (resource) => {
    if (!resource.status?.containerStatuses) return '0'
    return resource.status.containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0).toString()
  },

  formatPorts: (ports) => {
    if (!ports || ports.length === 0) return '-'
    return ports.map(p => `${p.port}${p.protocol ? `/${p.protocol}` : ''}`).join(', ')
  },

  getNodeRoles: (resource) => {
    if (!resource.metadata?.labels) return '-'
    const roles = []
    if (resource.metadata.labels['node-role.kubernetes.io/control-plane']) roles.push('control-plane')
    if (resource.metadata.labels['node-role.kubernetes.io/master']) roles.push('master')
    if (resource.metadata.labels['node-role.kubernetes.io/worker']) roles.push('worker')
    return roles.length > 0 ? roles.join(', ') : 'worker'
  },

  getParentResource: (resource) => {
    const ownerReferences = resource.metadata?.ownerReferences
    if (!ownerReferences || ownerReferences.length === 0) {
      return '-'
    }

    // Find the most relevant owner (controller if available)
    const controller = ownerReferences.find(ref => ref.controller === true)
    const owner = controller || ownerReferences[0]

    return `${owner.kind}/${owner.name}`
  },

  getCpuUsage: (resource) => {
    if (selectedResourceKind === 'Pod') {
      const podKey = `${resource.metadata?.namespace}/${resource.metadata?.name}`
      const metrics = podMetrics[podKey]
      return metrics?.cpu || '-'
    }
    return '-'
  },

  getMemoryUsage: (resource) => {
    if (selectedResourceKind === 'Pod') {
      const podKey = `${resource.metadata?.namespace}/${resource.metadata?.name}`
      const metrics = podMetrics[podKey]
      return metrics?.memory || '-'
    }
    return '-'
  },

  getResourceInfo: function(resource) {
    // Try to find the most relevant secondary information for this resource
    if (selectedResourceKind === 'Pod') {
      return this.getContainerReadyCount(resource)
    } else if (selectedResourceKind === 'Service') {
      return resource.spec?.type || '-'
    } else if (selectedResourceKind === 'Deployment') {
      const ready = resource.status?.readyReplicas || 0
      const desired = resource.status?.replicas || 0
      return `${ready}/${desired}`
    } else if (selectedResourceKind === 'Node') {
      return this.getNodeRoles(resource)
    } else if (selectedResourceKind === 'ConfigMap' || selectedResourceKind === 'Secret') {
      const dataCount = Object.keys(resource.data || {}).length
      return `${dataCount} keys`
    } else if (resource.spec?.replicas !== undefined) {
      // For any resource with replicas
      const ready = resource.status?.readyReplicas || resource.status?.replicas || 0
      const desired = resource.spec.replicas || 0
      return `${ready}/${desired}`
    } else if (resource.spec?.type) {
      // For resources with a type field
      return resource.spec.type
    }

    return '-'
  }
})