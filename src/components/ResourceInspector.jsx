import React from 'react'
import { X, FileText, Activity, Clock, Tag, Network, Shield, Package, Cpu, HardDrive, GitBranch } from 'lucide-react'
import YAML from 'yaml'

// Format value as YAML (for complex objects) or return simple value
const formatValue = (value) => {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'object') {
    // Convert to YAML, removing the trailing newline
    return YAML.stringify(value).trim()
  }
  return value?.toString() || '-'
}

// Component to display a value (handles multi-line YAML)
const ValueDisplay = ({ value, className = "text-sm font-medium text-gray-900 dark:text-gray-100" }) => {
  const formatted = formatValue(value)
  const isMultiline = formatted.includes('\n')

  if (isMultiline) {
    return (
      <pre className={`${className} whitespace-pre-wrap break-words font-mono text-xs bg-gray-50 dark:bg-gray-800 p-2 rounded mt-1 block w-full`}>
        {formatted}
      </pre>
    )
  }

  return <span className={`${className} text-right ml-2`}>{formatted}</span>
}

// Format age helper (convert timestamp to relative time)
const formatAge = (timestamp) => {
  if (!timestamp) return 'Unknown'

  const date = new Date(timestamp)
  const now = new Date()
  const seconds = Math.floor((now - date) / 1000)

  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  const years = Math.floor(days / 365)
  return `${years}y`
}

// @contract ResourceInspector.nullWhenClosed - Must return null when isOpen=false or resource=null
// @contract ResourceInspector.backdropClose - Must call onClose when backdrop is clicked
// @contract ResourceInspector.closeButton - Must call onClose when close button(s) clicked
// @contract ResourceInspector.resourceName - Must display resource name in header
// @contract ResourceInspector.podDetails - Must show pod-specific sections (status, containers)
// @contract ResourceInspector.deploymentDetails - Must show deployment-specific sections (status, strategy, selector)
// @contract ResourceInspector.serviceDetails - Must show service-specific sections (config, ports, selector)
// @contract ResourceInspector.nodeDetails - Must show node-specific sections (status, capacity, addresses)
// @contract ResourceInspector.defaultDetails - Must show generic metadata/spec/status for unknown types
// @contract ResourceInspector.labels - Must display labels as badges
// @contract ResourceInspector.annotations - Must show first 5 annotations with "+N more" overflow
// @contract ResourceInspector.rawYaml - Must show collapsible raw YAML section
const ResourceInspector = ({ resource, resourceType, isOpen, onClose }) => {
  // @contract ResourceInspector.nullWhenClosed
  if (!isOpen || !resource) return null

  const metadata = resource.metadata || {}
  const spec = resource.spec || {}
  const status = resource.status || {}

  // Get resource-specific details based on type
  const getResourceDetails = () => {
    switch (resourceType?.kind) {
      case 'Pod':
        return {
          icon: <Package className="text-blue-500" />,
          title: 'Pod Details',
          sections: [
            {
              title: 'Status',
              icon: <Activity size={16} />,
              items: [
                { label: 'Phase', value: status.phase },
                { label: 'Ready', value: `${status.containerStatuses?.filter(c => c.ready).length || 0}/${status.containerStatuses?.length || 0}` },
                { label: 'Restarts', value: status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) || 0 },
                { label: 'Node', value: spec.nodeName },
                { label: 'IP', value: status.podIP },
                { label: 'QoS Class', value: status.qosClass }
              ]
            },
            {
              title: 'Containers',
              icon: <Package size={16} />,
              items: spec.containers?.map(c => ({
                label: c.name,
                value: c.image,
                subItems: [
                  { label: 'Ports', value: c.ports?.map(p => `${p.containerPort}/${p.protocol}`).join(', ') || 'None' },
                  { label: 'CPU', value: `${c.resources?.requests?.cpu || '-'} / ${c.resources?.limits?.cpu || '-'}` },
                  { label: 'Memory', value: `${c.resources?.requests?.memory || '-'} / ${c.resources?.limits?.memory || '-'}` }
                ]
              })) || []
            }
          ]
        }

      case 'Deployment':
        return {
          icon: <GitBranch className="text-green-500" />,
          title: 'Deployment Details',
          sections: [
            {
              title: 'Status',
              icon: <Activity size={16} />,
              items: [
                { label: 'Replicas', value: `${status.readyReplicas || 0}/${status.replicas || 0}` },
                { label: 'Updated', value: status.updatedReplicas || 0 },
                { label: 'Available', value: status.availableReplicas || 0 },
                { label: 'Unavailable', value: status.unavailableReplicas || 0 }
              ]
            },
            {
              title: 'Strategy',
              icon: <Activity size={16} />,
              items: [
                { label: 'Type', value: spec.strategy?.type },
                { label: 'Max Surge', value: spec.strategy?.rollingUpdate?.maxSurge },
                { label: 'Max Unavailable', value: spec.strategy?.rollingUpdate?.maxUnavailable }
              ]
            },
            {
              title: 'Selector',
              icon: <Tag size={16} />,
              items: Object.entries(spec.selector?.matchLabels || {}).map(([k, v]) => ({
                label: k,
                value: v
              }))
            }
          ]
        }

      case 'Service':
        return {
          icon: <Network className="text-purple-500" />,
          title: 'Service Details',
          sections: [
            {
              title: 'Configuration',
              icon: <Network size={16} />,
              items: [
                { label: 'Type', value: spec.type },
                { label: 'Cluster IP', value: spec.clusterIP },
                { label: 'External IPs', value: spec.externalIPs?.join(', ') || 'None' },
                { label: 'Session Affinity', value: spec.sessionAffinity }
              ]
            },
            {
              title: 'Ports',
              icon: <Network size={16} />,
              items: spec.ports?.map(p => ({
                label: p.name || p.port.toString(),
                value: `${p.port}:${p.targetPort}/${p.protocol}`,
                subItems: p.nodePort ? [{ label: 'NodePort', value: p.nodePort }] : []
              })) || []
            },
            {
              title: 'Selector',
              icon: <Tag size={16} />,
              items: Object.entries(spec.selector || {}).map(([k, v]) => ({
                label: k,
                value: v
              }))
            }
          ]
        }

      case 'Node':
        return {
          icon: <Cpu className="text-orange-500" />,
          title: 'Node Details',
          sections: [
            {
              title: 'Status',
              icon: <Activity size={16} />,
              items: [
                { label: 'Ready', value: status.conditions?.find(c => c.type === 'Ready')?.status },
                { label: 'Kubelet Version', value: status.nodeInfo?.kubeletVersion },
                { label: 'Container Runtime', value: status.nodeInfo?.containerRuntimeVersion },
                { label: 'OS', value: `${status.nodeInfo?.operatingSystem} ${status.nodeInfo?.architecture}` }
              ]
            },
            {
              title: 'Capacity',
              icon: <HardDrive size={16} />,
              items: [
                { label: 'CPU', value: status.capacity?.cpu },
                { label: 'Memory', value: status.capacity?.memory },
                { label: 'Pods', value: status.capacity?.pods },
                { label: 'Storage', value: status.capacity?.['ephemeral-storage'] }
              ]
            },
            {
              title: 'Addresses',
              icon: <Network size={16} />,
              items: status.addresses?.map(a => ({
                label: a.type,
                value: a.address
              })) || []
            }
          ]
        }

      default:
        // Generic resource display
        return {
          icon: <FileText className="text-gray-500" />,
          title: `${resourceType?.kind || 'Resource'} Details`,
          sections: [
            {
              title: 'Metadata',
              icon: <Tag size={16} />,
              items: [
                { label: 'Name', value: metadata.name },
                { label: 'Namespace', value: metadata.namespace || 'N/A' },
                { label: 'UID', value: metadata.uid },
                { label: 'Resource Version', value: metadata.resourceVersion }
              ]
            },
            spec && Object.keys(spec).length > 0 && {
              title: 'Spec',
              icon: <FileText size={16} />,
              items: Object.entries(spec).slice(0, 10).map(([k, v]) => ({
                label: k,
                value: formatValue(v)
              }))
            },
            status && Object.keys(status).length > 0 && {
              title: 'Status',
              icon: <Activity size={16} />,
              items: Object.entries(status).slice(0, 10).map(([k, v]) => ({
                label: k,
                value: formatValue(v)
              }))
            }
          ].filter(Boolean)
        }
    }
  }

  const details = getResourceDetails()

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-30 transition-opacity z-40 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 shadow-2xl z-50 transform transition-transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{WebkitAppRegion: 'no-drag'}}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {details.icon}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {metadata.name}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {details.title}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                aria-label="Close inspector"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Basic Info */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Created:</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {formatAge(metadata.creationTimestamp)}
                  </p>
                </div>
                {metadata.namespace && (
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Namespace:</span>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {metadata.namespace}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Labels */}
            {metadata.labels && Object.keys(metadata.labels).length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Labels</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(metadata.labels).map(([key, value]) => (
                    <span
                      key={key}
                      className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
                    >
                      {key}: {value}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Resource-specific sections */}
            {details.sections.map((section, idx) => (
              <div key={idx} className="mb-6">
                <div className="flex items-center space-x-2 mb-3">
                  {section.icon}
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {section.title}
                  </h3>
                </div>
                <div className="space-y-2">
                  {section.items.map((item, itemIdx) => {
                    const formatted = formatValue(item.value)
                    const isMultiline = formatted.includes('\n')

                    return (
                      <div key={itemIdx}>
                        {isMultiline ? (
                          <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {item.label}:
                            </span>
                            <ValueDisplay value={item.value} />
                          </div>
                        ) : (
                          <div className="flex justify-between items-start">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {item.label}:
                            </span>
                            <ValueDisplay value={item.value} />
                          </div>
                        )}
                        {item.subItems && (
                          <div className="ml-4 mt-1 space-y-1">
                            {item.subItems.map((subItem, subIdx) => (
                              <div key={subIdx} className="flex justify-between items-start">
                                <span className="text-xs text-gray-400">
                                  {subItem.label}:
                                </span>
                                <span className="text-xs text-gray-600 dark:text-gray-400 text-right ml-2">
                                  {subItem.value || '-'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Annotations */}
            {metadata.annotations && Object.keys(metadata.annotations).length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Annotations</h3>
                <div className="space-y-1">
                  {Object.entries(metadata.annotations).slice(0, 5).map(([key, value]) => (
                    <div key={key} className="text-xs">
                      <span className="text-gray-500 dark:text-gray-400">{key}:</span>
                      <p className="text-gray-700 dark:text-gray-300 truncate">{value}</p>
                    </div>
                  ))}
                  {Object.keys(metadata.annotations).length > 5 && (
                    <p className="text-xs text-gray-400">
                      +{Object.keys(metadata.annotations).length - 5} more...
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Raw YAML */}
            <details className="mb-6">
              <summary className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100">
                Raw YAML
              </summary>
              <pre className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto max-h-96 overflow-y-auto">
                {YAML.stringify(resource)}
              </pre>
            </details>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default ResourceInspector