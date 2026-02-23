import React from 'react'

const SubResourceHeader = ({
  title,
  showNamespace = false,
  columns = [],
  indentLevel = 0,
  colSpan = null
}) => {
  return (
    <tr className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
      {colSpan ? (
        <td colSpan={colSpan} className={`px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 ${indentLevel > 0 ? `pl-${indentLevel}` : ''}`}>
          <div className="flex items-center space-x-2">
            <span>{title}</span>
          </div>
        </td>
      ) : (
        <>
          <td className="w-8 px-2"></td>{/* Empty checkbox column */}
          <td className={`px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 ${indentLevel > 0 ? `pl-${indentLevel}` : ''}`}>
            {title}
          </td>
          {showNamespace && (
            <td className="px-3 py-1 text-xs text-blue-600 dark:text-blue-400"></td>
          )}
          {columns.map((col, idx) => (
            <td key={idx} className="px-3 py-1 text-xs text-blue-600 dark:text-blue-400">
              {col}
            </td>
          ))}
        </>
      )}
    </tr>
  )
}

export default SubResourceHeader