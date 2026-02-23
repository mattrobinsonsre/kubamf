import React from 'react'
import { Terminal, FileText } from 'lucide-react'
import { formatCpuValue, formatMemoryValue, getResourceColor, parseContainerState, getResourceWarningIndicator } from '../utils/resourceHelpers'

// @contract ContainerRow.shellButton - Must render shell button when onOpenShell and pod are provided, call onOpenShell(pod, container) on click
// @contract ContainerRow.logsButton - Must render logs button when onViewLogs and pod are provided, call onViewLogs(pod, container) on click
// @contract ContainerRow.noButtons - Must not render shell/logs buttons when callbacks are null
// @contract ContainerRow.containerName - Must display container.name with tree-branch prefix
// @contract ContainerRow.stateDisplay - Must show container state badge with correct color classes
// @contract ContainerRow.readyIndicator - Must show checkmark when ready, x-mark when not
const ContainerRow = ({
  container,
  index,
  totalCount,
  podMetric,
  indentLevel = 8,
  showNamespace = false,
  namespace = null,
  pod = null,
  onOpenShell = null,
  onViewLogs = null
}) => {
  // Format resource requests/limits
  const cpuReq = container.resources?.requests?.cpu || '-'
  const cpuLimit = container.resources?.limits?.cpu || '-'
  const memReq = container.resources?.requests?.memory || '-'
  const memLimit = container.resources?.limits?.memory || '-'

  // Get warnings for resource configuration
  const cpuWarning = getResourceWarningIndicator(cpuReq, cpuLimit, 'cpu')
  const memWarning = getResourceWarningIndicator(memReq, memLimit, 'memory')

  const resourceInfo = `CPU: ${cpuReq}/${cpuLimit} | Mem: ${memReq}/${memLimit}`

  // Extract and format container metrics
  let cpuUsage = '-'
  let memUsage = '-'

  if (podMetric && podMetric.containers) {
    const containerMetric = podMetric.containers.find(c => c.name === container.name)
    if (containerMetric) {
      cpuUsage = formatCpuValue(containerMetric.cpu)
      memUsage = formatMemoryValue(containerMetric.memory)
    }
  }

  // Get color coding
  const cpuColor = getResourceColor(cpuUsage, cpuReq, cpuLimit, 'cpu')
  const memColor = getResourceColor(memUsage, memReq, memLimit, 'memory')

  // Parse container state
  const containerState = parseContainerState(container.state)

  return (
    <tr className="bg-gray-50 dark:bg-gray-800/50">
      <td className="px-2 py-1">
        {/* Shell and Logs buttons in the checkbox column */}
        <div className="flex items-center space-x-1">
          {onOpenShell && pod && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenShell(pod, container)
              }}
              className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
              title={`Open shell in ${container.name}`}
            >
              <Terminal size={16} />
            </button>
          )}
          {onViewLogs && pod && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onViewLogs(pod, container)
              }}
              className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/50 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-all"
              title={`View logs for ${container.name}`}
            >
              <FileText size={16} />
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className={`flex items-center space-x-2 pl-${indentLevel}`}>
          <span className="text-gray-400">
            {index === totalCount - 1 ? '└─' : '├─'}
          </span>
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {container.name}
          </span>
        </div>
      </td>

      {showNamespace && (
        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
          {/* Empty for container rows */}
        </td>
      )}

      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
          containerState === 'Running' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
          containerState === 'Waiting' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
        }`}>
          {containerState}
        </span>
      </td>

      {/* Ready */}
      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
        {container.ready ? '✓' : '✗'}
      </td>

      {/* Restarts */}
      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
        {container.restartCount || 0}
      </td>

      {/* CPU with color coding and warnings */}
      <td className={`px-3 py-2 whitespace-nowrap text-xs ${cpuColor}`}>
        <div className="flex items-center space-x-1">
          <span>{cpuUsage}</span>
          {cpuWarning && (
            <span className={cpuWarning.color} title={cpuWarning.tooltip}>
              {cpuWarning.symbol}
            </span>
          )}
        </div>
      </td>

      {/* Memory with color coding and warnings */}
      <td className={`px-3 py-2 whitespace-nowrap text-xs ${memColor}`}>
        <div className="flex items-center space-x-1">
          <span>{memUsage}</span>
          {memWarning && (
            <span className={memWarning.color} title={memWarning.tooltip}>
              {memWarning.symbol}
            </span>
          )}
        </div>
      </td>

      {/* Resources (requests/limits) */}
      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
        {resourceInfo}
      </td>

      {/* Age - empty for containers */}
      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">
        -
      </td>
    </tr>
  )
}

export default ContainerRow