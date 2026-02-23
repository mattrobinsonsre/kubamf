// @contract YamlEditor.nullWhenClosed - Must return null when isOpen=false
// @contract YamlEditor.initContent - Must initialize editor with YAML content from resource
// @contract YamlEditor.manifestMode - Must strip managed fields in manifest mode
// @contract YamlEditor.fullMode - Must show all fields including status in full mode
// @contract YamlEditor.toggleMode - Must switch between manifest and full modes
// @contract YamlEditor.yamlValidation - Must detect and display YAML syntax errors
// @contract YamlEditor.saveApply - Must call onSave with 'apply' mode in manifest edit mode
// @contract YamlEditor.saveReplace - Must call onSave with 'replace' mode in full edit mode
// @contract YamlEditor.saveDisabled - Must disable Apply button when no changes, errors, or saving
// @contract YamlEditor.closeWithChanges - Must confirm before discarding unsaved changes, then close
// @contract YamlEditor.closeNoChanges - Must close directly when no unsaved changes
// @contract YamlEditor.escClose - Must close editor on ESC key
// @contract YamlEditor.minimize - Must minimize/maximize editor panel
// @contract YamlEditor.createMode - Must support create mode with initialYaml, schema validation, and Create button
import React, { useState, useEffect, useRef, useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode'
import { X, Minimize2, Maximize2, Save, XCircle, Eye, Edit3, GitCompare, AlertTriangle, Plus } from 'lucide-react'
import YAML from 'yaml'
import { useTheme } from '../contexts/ThemeContext'
import { stripManagedFields } from '../utils/resource-utils'
import { createSchemaLinter } from '../utils/schema-validation'

const YamlEditor = ({
  resource,
  isOpen,
  onClose,
  onSave,
  resourceType,
  contextName,
  mode = 'edit', // 'edit' or 'create'
  schema = null, // OpenAPI v3 schema for validation
  initialYaml = '' // Initial YAML for create mode
}) => {
  const { theme } = useTheme()
  const [editMode, setEditMode] = useState('manifest') // 'manifest' or 'full'
  const [isMinimized, setIsMinimized] = useState(false)
  const [yamlContent, setYamlContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [saveError, setSaveError] = useState(null) // Only save-failure errors
  const [yamlError, setYamlError] = useState(false) // Track if YAML has syntax errors
  const [saving, setSaving] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [showConfirmClose, setShowConfirmClose] = useState(false)

  const editorRef = useRef(null)
  const isCreateMode = mode === 'create'

  // Build CodeMirror extensions with optional schema linting
  const extensions = useMemo(() => {
    const exts = [yaml()]
    // Add schema linter (handles YAML syntax + schema validation)
    exts.push(createSchemaLinter(schema))
    return exts
  }, [schema])

  // Initialize content when resource changes or in create mode
  useEffect(() => {
    if (isOpen) {
      if (isCreateMode) {
        // Create mode: use initialYaml
        const yamlStr = initialYaml || ''
        setYamlContent(yamlStr)
        setOriginalContent('')
        setHasChanges(yamlStr.trim().length > 0) // Start with changes in create mode
        setSaveError(null)
        setEditMode('manifest')
      } else if (resource) {
        // Edit mode: use resource
        const content = editMode === 'manifest'
          ? stripManagedFields(resource)
          : resource

        const yamlStr = YAML.stringify(content, {
          indent: 2,
          lineWidth: 0 // Prevent line wrapping
        })

        setYamlContent(yamlStr)
        setOriginalContent(yamlStr)
        setHasChanges(false)
        setSaveError(null)
      }
    }
  }, [resource, isOpen, editMode, isCreateMode, initialYaml])

  // Track changes
  const handleChange = (value) => {
    setYamlContent(value)
    if (isCreateMode) {
      setHasChanges(value.trim().length > 0)
    } else {
      setHasChanges(value.trimEnd() !== originalContent.trimEnd())
    }

    // Validate YAML syntax (for save button disable state)
    try {
      YAML.parse(value)
      setYamlError(false)
    } catch (err) {
      setYamlError(true)
    }
  }

  // Toggle between modes (only in edit mode)
  const toggleMode = () => {
    if (isCreateMode) return
    const newMode = editMode === 'manifest' ? 'full' : 'manifest'
    setEditMode(newMode)

    // Re-render content in new mode
    const content = newMode === 'manifest'
      ? stripManagedFields(resource)
      : resource

    const yamlStr = YAML.stringify(content, {
      indent: 2,
      lineWidth: 0
    })

    setYamlContent(yamlStr)
    setOriginalContent(yamlStr)
    setHasChanges(false)
  }

  // Save handler
  const handleSave = async () => {
    if (yamlError) {
      setSaveError('Please fix YAML syntax errors before saving')
      return
    }

    try {
      setSaving(true)
      setSaveError(null)
      const parsedYaml = YAML.parse(yamlContent)

      if (isCreateMode) {
        await onSave(parsedYaml, 'create')
      } else {
        // In full mode, preserve resourceVersion for optimistic locking
        // In manifest mode, let kubectl apply handle merging
        const saveMode = editMode === 'full' ? 'replace' : 'apply'
        await onSave(parsedYaml, saveMode)
      }

      setOriginalContent(yamlContent)
      setHasChanges(false)
    } catch (err) {
      setSaveError(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // Close editor, confirming if there are unsaved changes
  const handleClose = () => {
    if (hasChanges) {
      setShowConfirmClose(true)
      return
    }
    forceClose()
  }

  const forceClose = () => {
    setHasChanges(false)
    setSaveError(null)
    setYamlError(false)
    setShowConfirmClose(false)
    onClose()
  }

  // ESC key to close
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showConfirmClose) {
          setShowConfirmClose(false)
        } else {
          handleClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, hasChanges, showConfirmClose])

  if (!isOpen) return null

  const editorTitle = isCreateMode
    ? `Create ${resourceType?.kind || 'Resource'}`
    : (resource?.metadata?.name || 'Resource Editor')

  const saveButtonLabel = isCreateMode
    ? (saving ? 'Creating...' : 'Create')
    : (saving ? 'Saving...' : 'Apply')

  const SaveIcon = isCreateMode ? Plus : Save

  return (
    <div className={`fixed ${isMinimized ? 'bottom-0 right-4' : 'inset-0'} z-50`} style={{WebkitAppRegion: 'no-drag'}}>
      {/* Backdrop (only when not minimized) */}
      {!isMinimized && (
        <div
          className="absolute inset-0 bg-black bg-opacity-30"
          onClick={handleClose}
        />
      )}

      {/* Editor Panel */}
      <div className={`
        ${isMinimized
          ? 'w-96 h-12 rounded-t-lg shadow-2xl'
          : 'absolute inset-4 rounded-lg shadow-2xl'
        }
        bg-white dark:bg-gray-900 flex flex-col transition-all duration-300
      `}>
        {/* Header */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
          <div className="flex items-center justify-between gap-4">
            {/* Left side - title and mode buttons */}
            <div className="flex items-center gap-3 min-w-0 overflow-hidden">
              {isCreateMode
                ? <Plus className="text-green-500 flex-shrink-0" size={20} />
                : <Edit3 className="text-blue-500 flex-shrink-0" size={20} />
              }
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {editorTitle}
              </h2>

              {/* Mode toggle - only in edit mode */}
              {!isMinimized && !isCreateMode && editMode && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={toggleMode}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      editMode === 'manifest'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                    title="Edit manifest fields only (recommended)"
                  >
                    <span className="flex items-center gap-1">
                      <Edit3 size={14} />
                      <span>Manifest</span>
                    </span>
                  </button>
                  <button
                    onClick={toggleMode}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      editMode === 'full'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                    title="Edit all fields (advanced)"
                  >
                    <span className="flex items-center gap-1">
                      <Eye size={14} />
                      <span>Full</span>
                    </span>
                  </button>

                  {editMode === 'full' && (
                    <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                      <AlertTriangle size={14} />
                      <span className="text-xs">Editing managed fields</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right side - action buttons (Always visible) */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasChanges && !isMinimized && (
                <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                  {isCreateMode ? 'Ready to create' : 'Unsaved changes'}
                </span>
              )}

              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors shadow-sm"
                title={isMinimized ? 'Maximize' : 'Minimize'}
                aria-label={isMinimized ? 'Maximize editor' : 'Minimize editor'}
              >
                {isMinimized ? <Maximize2 size={18} className="text-white" /> : <Minimize2 size={18} className="text-white" />}
              </button>

              <button
                onClick={handleClose}
                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors shadow-sm"
                title="Close"
                aria-label="Close editor"
              >
                <X size={18} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Editor Content (hidden when minimized) */}
        {!isMinimized && (
          <>
            {/* Error Banner - only for save failures */}
            {saveError && (
              <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-400">{saveError}</p>
              </div>
            )}

            {/* CodeMirror Editor */}
            <div className="flex-1 overflow-auto">
              <CodeMirror
                ref={editorRef}
                value={yamlContent}
                height="100%"
                theme={theme === 'dark' ? vscodeDark : vscodeLight}
                extensions={extensions}
                onChange={handleChange}
                editable={true}
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  highlightSelectionMatches: true,
                  searchKeymap: true,
                }}
                className="overflow-auto"
              />
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{resourceType?.kind || 'Resource'}</span>
                {!isCreateMode && resource?.metadata?.namespace && (
                  <>
                    <span>•</span>
                    <span>Namespace: {resource.metadata.namespace}</span>
                  </>
                )}
                {!isCreateMode && (
                  <>
                    <span>•</span>
                    <span>Mode: {editMode === 'manifest' ? 'Manifest Edit' : 'Full Edit'}</span>
                  </>
                )}
                {isCreateMode && (
                  <>
                    <span>•</span>
                    <span>Mode: Create</span>
                  </>
                )}
                {schema && (
                  <>
                    <span>•</span>
                    <span className="text-green-600 dark:text-green-400">Schema validation active</span>
                  </>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {showDiff && (
                  <button
                    className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm"
                    onClick={() => setShowDiff(false)}
                  >
                    <span className="flex items-center space-x-1">
                      <GitCompare size={14} />
                      <span>Show Diff</span>
                    </span>
                  </button>
                )}

                <button
                  onClick={handleClose}
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm"
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  onClick={handleSave}
                  className={`px-3 py-1 text-white rounded transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                    isCreateMode
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                  disabled={!hasChanges || yamlError || saving}
                >
                  <span className="flex items-center space-x-1">
                    <SaveIcon size={14} />
                    <span>{saveButtonLabel}</span>
                  </span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Confirm close dialog */}
        {showConfirmClose && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black bg-opacity-40 rounded-lg">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm mx-4">
              <p className="text-gray-900 dark:text-gray-100 font-medium mb-4">
                {isCreateMode ? 'Discard resource template?' : 'Discard unsaved changes?'}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowConfirmClose(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Keep Editing
                </button>
                <button
                  onClick={forceClose}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default YamlEditor
