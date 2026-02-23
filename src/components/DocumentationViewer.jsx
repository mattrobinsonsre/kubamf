// @contract DocumentationViewer.nullWhenClosed - Must return null when isOpen=false
// @contract DocumentationViewer.fetchOnOpen - Must fetch /api/docs/ui and /api/docs when opened
// @contract DocumentationViewer.loadingState - Must show loading message while fetching
// @contract DocumentationViewer.errorState - Must show error message if fetch fails
// @contract DocumentationViewer.categoryNav - Must render all 4 category buttons in sidebar
// @contract DocumentationViewer.categorySwitch - Must switch between categories when clicked
// @contract DocumentationViewer.apiDocs - Must render API endpoint documentation when API category selected
// @contract DocumentationViewer.docContent - Must render doc content via dangerouslySetInnerHTML for non-API categories
// @contract DocumentationViewer.closeButtons - Must call onClose from back button, close button, and backdrop
import React, { useState, useEffect } from 'react'
import { X, ChevronLeft, Home, Book, Code, Rocket, Shield } from 'lucide-react'

const DocumentationViewer = ({ isOpen, onClose }) => {
  const [docs, setDocs] = useState(null)
  const [activeCategory, setActiveCategory] = useState('general')
  const [activeDoc, setActiveDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showApiDocs, setShowApiDocs] = useState(false)
  const [apiDocs, setApiDocs] = useState(null)

  useEffect(() => {
    if (isOpen) {
      fetchDocs()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const fetchDocs = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch UI/deployment docs
      const uiResponse = await fetch('/api/docs/ui')
      if (!uiResponse.ok) throw new Error('Failed to load documentation')
      const uiDocs = await uiResponse.json()
      setDocs(uiDocs)

      // Set first doc as active if available
      if (uiDocs.general && uiDocs.general.length > 0) {
        setActiveDoc(uiDocs.general[0])
      }

      // Fetch API docs
      const apiResponse = await fetch('/api/docs')
      if (apiResponse.ok) {
        const apiData = await apiResponse.json()
        setApiDocs(apiData)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const categories = [
    { id: 'general', label: 'Getting Started', icon: Home },
    { id: 'deployment', label: 'Deployment', icon: Rocket },
    { id: 'api', label: 'API Reference', icon: Code },
    { id: 'security', label: 'Security', icon: Shield }
  ]

  const handleCategoryChange = (category) => {
    setActiveCategory(category)
    setShowApiDocs(category === 'api')

    if (category !== 'api' && docs && docs[category] && docs[category].length > 0) {
      setActiveDoc(docs[category][0])
    }
  }

  const renderApiDocs = () => {
    if (!apiDocs) return null

    return (
      <div className="max-w-none">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">{apiDocs.title}</h1>
        <p className="text-gray-700 dark:text-gray-300 mb-6">Version: {apiDocs.version}</p>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Endpoints</h2>
        {apiDocs.endpoints.map((endpoint, index) => (
          <div key={index} className="mb-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              <span className="text-blue-600 dark:text-blue-400">{endpoint.method}</span> {endpoint.path}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">{endpoint.description}</p>

            {endpoint.params && (
              <div className="mt-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">Parameters:</h4>
                <pre className="text-sm bg-gray-100 dark:bg-gray-900 p-2 rounded">
                  {JSON.stringify(endpoint.params, null, 2)}
                </pre>
              </div>
            )}

            {endpoint.query && (
              <div className="mt-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">Query Parameters:</h4>
                <pre className="text-sm bg-gray-100 dark:bg-gray-900 p-2 rounded">
                  {JSON.stringify(endpoint.query, null, 2)}
                </pre>
              </div>
            )}

            {endpoint.response && (
              <div className="mt-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">Response:</h4>
                <pre className="text-sm bg-gray-100 dark:bg-gray-900 p-2 rounded">
                  {JSON.stringify(endpoint.response, null, 2)}
                </pre>
              </div>
            )}

            {endpoint.streaming && (
              <div className="mt-2">
                <h4 className="font-medium text-gray-900 dark:text-gray-100">Streaming Response (SSE):</h4>
                <pre className="text-sm bg-gray-100 dark:bg-gray-900 p-2 rounded">
                  {JSON.stringify(endpoint.streaming, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" style={{WebkitAppRegion: 'no-drag'}}>
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="absolute inset-4 bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Back to App"
              >
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Documentation
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <nav className="p-4 space-y-1">
              {categories.map((category) => {
                const Icon = category.icon
                const isActive = activeCategory === category.id
                const categoryDocs = docs?.[category.id] || []

                return (
                  <div key={category.id}>
                    <button
                      onClick={() => handleCategoryChange(category.id)}
                      className={`w-full flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="text-sm font-medium">{category.label}</span>
                      {category.id !== 'api' && categoryDocs.length > 0 && (
                        <span className="ml-auto text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                          {categoryDocs.length}
                        </span>
                      )}
                    </button>

                    {/* Sub-items for non-API categories */}
                    {isActive && category.id !== 'api' && categoryDocs.length > 0 && (
                      <div className="ml-6 mt-1 space-y-1">
                        {categoryDocs.map((doc, index) => (
                          <button
                            key={index}
                            onClick={() => setActiveDoc(doc)}
                            className={`w-full text-left px-3 py-1 text-sm rounded transition-colors ${
                              activeDoc === doc
                                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                            }`}
                          >
                            {doc.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-8">
              {loading && (
                <div className="flex items-center justify-center h-64">
                  <div className="text-gray-500">Loading documentation...</div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              {!loading && !error && (
                <>
                  {showApiDocs ? (
                    renderApiDocs()
                  ) : (
                    activeDoc && (
                      <div
                        className="max-w-none text-gray-700 dark:text-gray-300 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-gray-900 dark:[&_h1]:text-gray-100 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900 dark:[&_h3]:text-gray-100 [&_h3]:mt-4 [&_h3]:mb-2 [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_li]:mb-2 [&_code]:bg-gray-100 dark:[&_code]:bg-gray-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:text-gray-800 dark:[&_code]:text-gray-200 [&_pre]:bg-gray-100 dark:[&_pre]:bg-gray-800 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-4 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 dark:[&_blockquote]:border-gray-600 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 dark:[&_blockquote]:text-gray-400 [&_a]:text-blue-600 dark:[&_a]:text-blue-400 [&_a]:underline [&_a:hover]:text-blue-700 dark:[&_a:hover]:text-blue-300 [&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-gray-100 [&_em]:italic"
                        dangerouslySetInnerHTML={{ __html: activeDoc.content }}
                      />
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
            <div>
              Press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">ESC</kbd> to close
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => window.open('https://github.com/yourusername/kubamf', '_blank')}
                className="hover:text-gray-700 dark:hover:text-gray-300"
              >
                GitHub
              </button>
              <button
                onClick={() => window.open('/api/docs', '_blank')}
                className="hover:text-gray-700 dark:hover:text-gray-300"
              >
                API JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DocumentationViewer