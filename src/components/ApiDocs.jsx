import React from 'react'
import { Book, ExternalLink, Copy, Check } from 'lucide-react'
import { useState } from 'react'

const ApiDocs = () => {
  const [copiedEndpoint, setCopiedEndpoint] = useState(null)

  const copyToClipboard = (text, endpoint) => {
    navigator.clipboard.writeText(text)
    setCopiedEndpoint(endpoint)
    setTimeout(() => setCopiedEndpoint(null), 2000)
  }

  const apiEndpoints = [
    {
      category: 'Context Management',
      endpoints: [
        {
          method: 'GET',
          path: '/api/kubeconfig/contexts',
          description: 'List all available Kubernetes contexts',
          example: 'curl http://localhost:3001/api/kubeconfig/contexts'
        },
        {
          method: 'POST',
          path: '/api/kubeconfig/check-connection',
          description: 'Check connection to a specific context',
          example: 'curl -X POST http://localhost:3001/api/kubeconfig/check-connection -H "Content-Type: application/json" -d \'{"context":"my-context"}\''
        },
        {
          method: 'GET',
          path: '/api/kubeconfig/current',
          description: 'Get the current active context',
          example: 'curl http://localhost:3001/api/kubeconfig/current'
        }
      ]
    },
    {
      category: 'Resources',
      endpoints: [
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/namespaces',
          description: 'List all namespaces in a context',
          example: 'curl http://localhost:3001/api/contexts/my-context/resources/namespaces'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/pods',
          description: 'List pods (use ?namespace=NAME for specific namespace)',
          example: 'curl "http://localhost:3001/api/contexts/my-context/resources/pods?namespace=default"'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/pods/:namespace/:podName/metrics',
          description: 'Get pod metrics (CPU and memory usage)',
          example: 'curl http://localhost:3001/api/contexts/my-context/resources/pods/default/my-pod/metrics'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/pods/:namespace/:podName/containers',
          description: 'List containers in a pod',
          example: 'curl http://localhost:3001/api/contexts/my-context/resources/pods/default/my-pod/containers'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/services',
          description: 'List services (use ?namespace=NAME for specific namespace)',
          example: 'curl "http://localhost:3001/api/contexts/my-context/resources/services?namespace=default"'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/deployments',
          description: 'List deployments (use ?namespace=NAME for specific namespace)',
          example: 'curl "http://localhost:3001/api/contexts/my-context/resources/deployments?namespace=default"'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/configmaps',
          description: 'List ConfigMaps (use ?namespace=NAME for specific namespace)',
          example: 'curl "http://localhost:3001/api/contexts/my-context/resources/configmaps?namespace=default"'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/secrets',
          description: 'List secrets (use ?namespace=NAME for specific namespace)',
          example: 'curl "http://localhost:3001/api/contexts/my-context/resources/secrets?namespace=default"'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/nodes',
          description: 'List cluster nodes',
          example: 'curl http://localhost:3001/api/contexts/my-context/resources/nodes'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/crds',
          description: 'List Custom Resource Definitions',
          example: 'curl http://localhost:3001/api/contexts/my-context/resources/crds'
        },
        {
          method: 'GET',
          path: '/api/contexts/:context/resources/logs/:namespace/:podName',
          description: 'Get pod logs (use ?container=NAME for specific container)',
          example: 'curl "http://localhost:3001/api/contexts/my-context/resources/logs/default/my-pod?container=nginx"'
        }
      ]
    },
    {
      category: 'Generic Resources',
      endpoints: [
        {
          method: 'GET',
          path: '/api/contexts/:context/resources',
          description: 'Get any resource type (use ?resourceType=TYPE&namespace=NAME)',
          example: 'curl "http://localhost:3001/api/contexts/my-context/resources?resourceType=statefulsets&namespace=default"'
        }
      ]
    },
    {
      category: 'Health & Status',
      endpoints: [
        {
          method: 'GET',
          path: '/health',
          description: 'Backend health check',
          example: 'curl http://localhost:3001/health'
        },
        {
          method: 'GET',
          path: '/health/ready',
          description: 'Backend readiness check',
          example: 'curl http://localhost:3001/health/ready'
        }
      ]
    }
  ]

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900 overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Book className="h-8 w-8" />
            Kubamf API Documentation
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            REST API endpoints for interacting with Kubernetes clusters
          </p>
        </div>

        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Base URL</h3>
          <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded text-sm">
            {window.location.origin}/api
          </code>
        </div>

        {apiEndpoints.map((category, categoryIndex) => (
          <div key={categoryIndex} className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
              {category.category}
            </h2>
            <div className="space-y-4">
              {category.endpoints.map((endpoint, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`
                        px-2 py-1 text-xs font-semibold rounded
                        ${endpoint.method === 'GET' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}
                        ${endpoint.method === 'POST' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : ''}
                        ${endpoint.method === 'PUT' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : ''}
                        ${endpoint.method === 'DELETE' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : ''}
                      `}>
                        {endpoint.method}
                      </span>
                      <code className="text-sm font-mono text-gray-900 dark:text-gray-100">
                        {endpoint.path}
                      </code>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {endpoint.description}
                  </p>

                  <div className="bg-gray-50 dark:bg-gray-900 rounded p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-500">Example</span>
                      <button
                        onClick={() => copyToClipboard(endpoint.example, index + '-' + categoryIndex)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        {copiedEndpoint === index + '-' + categoryIndex ? (
                          <>
                            <Check size={12} />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <code className="text-xs text-gray-800 dark:text-gray-200 break-all font-mono">
                      {endpoint.example}
                    </code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">Authentication</h3>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This API uses the kubeconfig file from your system for authentication. Ensure your kubectl context is properly configured.
          </p>
        </div>

        <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-500">
          <p>For the full backend API documentation, visit</p>
          <a
            href="/api"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
          >
            {window.location.origin}/api
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  )
}

export default ApiDocs