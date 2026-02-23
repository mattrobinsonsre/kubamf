import React from 'react'

// @contract LoadingSpinner.render - Must render a spinner with role="status" and aria-label="Loading"
// @contract LoadingSpinner.sizes - Must apply correct size classes for small/medium/large/xlarge
// @contract LoadingSpinner.defaultSize - Must default to medium size
// @contract LoadingSpinner.customClass - Must apply additional className when provided
const LoadingSpinner = ({ size = 'medium', className = '' }) => {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-6 h-6',
    large: 'w-8 h-8',
    xlarge: 'w-12 h-12'
  }

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400`}
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  )
}

export default LoadingSpinner