import React from 'react'

// @contract ConnectionError.contextDisplay - Must display the contextName in the error message
// @contract ConnectionError.clusterDisplay - Must display cluster info when provided, hide when absent
// @contract ConnectionError.retryButton - Must call onRetry when retry button is clicked
// @contract ConnectionError.errorCauses - Must display list of possible error causes
const ConnectionError = ({ contextName, cluster, onRetry }) => {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-600 dark:text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Connection Failed
        </h3>

        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Unable to connect to the Kubernetes cluster "{contextName}".
        </p>

        {cluster && (
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-4 text-sm">
            <p className="text-gray-700 dark:text-gray-300">
              <span className="font-medium">Cluster:</span> {cluster}
            </p>
          </div>
        )}

        <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          <p className="mb-2">Possible causes:</p>
          <ul className="text-left space-y-1">
            <li>• Cluster is unreachable</li>
            <li>• Invalid credentials</li>
            <li>• Network connectivity issues</li>
            <li>• kubectl configuration problems</li>
          </ul>
        </div>

        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Retry Connection
        </button>
      </div>
    </div>
  )
}

export default ConnectionError