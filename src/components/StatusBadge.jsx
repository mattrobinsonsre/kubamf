import React from 'react'

// @contract StatusBadge.render - Must render status text inside a badge span
// @contract StatusBadge.sizes - Must apply correct size classes for small/normal
// @contract StatusBadge.colorCallback - Must call getStatusColor with status and apply returned classes
const StatusBadge = ({ status, getStatusColor, size = 'normal' }) => {
  const sizeClasses = {
    small: 'px-1 py-0.5 text-xs',
    normal: 'px-1.5 py-0.5 text-xs font-semibold'
  }

  return (
    <span className={`inline-flex ${sizeClasses[size]} rounded-full ${getStatusColor(status)}`}>
      {status}
    </span>
  )
}

export default StatusBadge