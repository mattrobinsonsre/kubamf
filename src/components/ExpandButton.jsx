import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// @contract ExpandButton.expandedIcon - Must show ChevronDown when isExpanded=true
// @contract ExpandButton.collapsedIcon - Must show ChevronRight when isExpanded=false
// @contract ExpandButton.stopPropagation - Must stop event propagation on click
// @contract ExpandButton.callbackOnClick - Must call onClick callback when clicked
const ExpandButton = ({
  isExpanded,
  onClick,
  size = 14,
  className = "p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
}) => {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={className}
      aria-label={isExpanded ? 'Collapse' : 'Expand'}
      aria-expanded={isExpanded}
    >
      {isExpanded ? (
        <ChevronDown size={size} className="text-gray-500" />
      ) : (
        <ChevronRight size={size} className="text-gray-500" />
      )}
    </button>
  )
}

export default ExpandButton