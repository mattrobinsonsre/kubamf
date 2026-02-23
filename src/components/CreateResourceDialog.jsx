import React, { useState, useMemo, useEffect } from 'react'
import { X, Search, Plus, FileText } from 'lucide-react'
import { getTemplate, getTemplateKinds, templateCategories, generateCRDTemplate } from '../shared/resource-templates'

/**
 * Modal dialog for selecting a resource type to create.
 * Shows built-in templates categorized, plus CRD types with schema-generated templates.
 */
const CreateResourceDialog = ({ isOpen, onClose, onSelect, crdData = [] }) => {
  const [searchTerm, setSearchTerm] = useState('')

  // Reset search when dialog opens
  useEffect(() => {
    if (isOpen) setSearchTerm('')
  }, [isOpen])

  // Build the list of available resource types
  const resourceOptions = useMemo(() => {
    const options = []

    // Built-in templates
    for (const [category, kinds] of Object.entries(templateCategories)) {
      for (const kind of kinds) {
        options.push({
          kind,
          category,
          type: 'builtin',
          template: getTemplate(kind),
          schema: null
        })
      }
    }

    // CRD types
    if (crdData && crdData.length > 0) {
      for (const crd of crdData) {
        const names = crd.spec?.names
        const kind = names?.kind
        if (!kind) continue

        const group = crd.spec?.group || ''
        const versions = crd.spec?.versions || []
        const version = versions.find(v => v.served) || versions[0]
        const schema = version?.schema?.openAPIV3Schema || null

        options.push({
          kind,
          category: 'Custom Resources',
          type: 'crd',
          apiGroup: group,
          template: generateCRDTemplate(crd),
          schema,
          crd
        })
      }
    }

    return options
  }, [crdData])

  // Filter by search
  const filteredOptions = useMemo(() => {
    if (!searchTerm) return resourceOptions
    const term = searchTerm.toLowerCase()
    return resourceOptions.filter(opt =>
      opt.kind.toLowerCase().includes(term) ||
      opt.category.toLowerCase().includes(term) ||
      (opt.apiGroup && opt.apiGroup.toLowerCase().includes(term))
    )
  }, [resourceOptions, searchTerm])

  // Group by category
  const groupedOptions = useMemo(() => {
    const groups = {}
    for (const opt of filteredOptions) {
      if (!groups[opt.category]) {
        groups[opt.category] = []
      }
      groups[opt.category].push(opt)
    }
    return groups
  }, [filteredOptions])

  const handleSelect = (option) => {
    onSelect({
      yaml: option.template || '',
      schema: option.schema,
      kind: option.kind,
      type: option.type
    })
    onClose()
  }

  const handleBlankYaml = () => {
    onSelect({
      yaml: `# Edit the fields below to define your resource\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: my-resource\n  namespace: default\n`,
      schema: null,
      kind: 'Resource',
      type: 'blank'
    })
    onClose()
  }

  // ESC to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50" style={{ WebkitAppRegion: 'no-drag' }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-30" onClick={onClose} />

      {/* Dialog */}
      <div className="absolute inset-x-0 top-[10%] mx-auto max-w-2xl max-h-[75vh] bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plus className="text-green-500" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Create Resource
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search resource types..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Resource list */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Blank YAML option */}
          <button
            onClick={handleBlankYaml}
            className="w-full mb-4 p-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-gray-400" />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Blank YAML</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Start from scratch with a minimal template</div>
              </div>
            </div>
          </button>

          {/* Categorized resources */}
          {Object.entries(groupedOptions).map(([category, options]) => (
            <div key={category} className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                {category}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {options.map((option) => (
                  <button
                    key={`${option.category}-${option.kind}`}
                    onClick={() => handleSelect(option)}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-left"
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {option.kind}
                    </div>
                    {option.apiGroup && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {option.apiGroup}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {Object.keys(groupedOptions).length === 0 && searchTerm && (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              No resource types found matching "{searchTerm}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateResourceDialog
