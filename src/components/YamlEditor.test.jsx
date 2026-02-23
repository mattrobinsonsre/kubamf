import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import YamlEditor from './YamlEditor'

// @tests-contract YamlEditor.nullWhenClosed
// @tests-contract YamlEditor.initContent
// @tests-contract YamlEditor.manifestMode
// @tests-contract YamlEditor.fullMode
// @tests-contract YamlEditor.toggleMode
// @tests-contract YamlEditor.yamlValidation
// @tests-contract YamlEditor.saveApply
// @tests-contract YamlEditor.saveReplace
// @tests-contract YamlEditor.saveDisabled
// @tests-contract YamlEditor.cancelWithChanges
// @tests-contract YamlEditor.cancelNoChanges
// @tests-contract YamlEditor.minimize

vi.mock('@uiw/react-codemirror', () => {
  const React = require('react')
  return {
    default: React.forwardRef(({ value, onChange }, ref) => (
      <textarea data-testid="codemirror" value={value || ''} onChange={(e) => onChange && onChange(e.target.value)} />
    ))
  }
})
vi.mock('@codemirror/lang-yaml', () => ({ yaml: () => [] }))
vi.mock('@uiw/codemirror-theme-vscode', () => ({ vscodeDark: {}, vscodeLight: {} }))
vi.mock('../utils/resource-utils', () => ({
  stripManagedFields: (resource) => {
    if (!resource) return null
    const cleaned = JSON.parse(JSON.stringify(resource))
    delete cleaned.status
    if (cleaned.metadata) {
      delete cleaned.metadata.resourceVersion
      delete cleaned.metadata.uid
      delete cleaned.metadata.generation
      delete cleaned.metadata.creationTimestamp
      delete cleaned.metadata.deletionTimestamp
      delete cleaned.metadata.deletionGracePeriodSeconds
      delete cleaned.metadata.managedFields
      delete cleaned.metadata.selfLink
      delete cleaned.metadata.ownerReferences
      if (cleaned.metadata.annotations && Object.keys(cleaned.metadata.annotations).length === 0) {
        delete cleaned.metadata.annotations
      }
      if (cleaned.metadata.labels && Object.keys(cleaned.metadata.labels).length === 0) {
        delete cleaned.metadata.labels
      }
    }
    return cleaned
  }
}))
vi.mock('../utils/schema-validation', () => ({
  createSchemaLinter: () => []
}))

const mockTheme = { theme: 'dark', setTheme: vi.fn() }
vi.mock('../contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => mockTheme)
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const React = require('react')
  return {
    X: (props) => React.createElement('span', { 'data-testid': 'icon-x', ...props }),
    Minimize2: (props) => React.createElement('span', { 'data-testid': 'icon-minimize', ...props }),
    Maximize2: (props) => React.createElement('span', { 'data-testid': 'icon-maximize', ...props }),
    Save: (props) => React.createElement('span', { 'data-testid': 'icon-save', ...props }),
    XCircle: (props) => React.createElement('span', { 'data-testid': 'icon-xcircle', ...props }),
    Eye: (props) => React.createElement('span', { 'data-testid': 'icon-eye', ...props }),
    Edit3: (props) => React.createElement('span', { 'data-testid': 'icon-edit', ...props }),
    GitCompare: (props) => React.createElement('span', { 'data-testid': 'icon-gitcompare', ...props }),
    AlertTriangle: (props) => React.createElement('span', { 'data-testid': 'icon-alert', ...props }),
    Plus: (props) => React.createElement('span', { 'data-testid': 'icon-plus', ...props }),
  }
})

const mockResource = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: {
    name: 'test-config',
    namespace: 'default',
    resourceVersion: '12345',
    uid: 'abc-123',
    generation: 1,
    creationTimestamp: '2024-01-01T00:00:00Z',
    managedFields: [{ manager: 'kubectl' }],
    selfLink: '/api/v1/configmaps/test-config',
    labels: { app: 'test' },
    annotations: {},
  },
  data: {
    key1: 'value1',
  },
  status: {
    phase: 'Active',
  },
}

const mockResourceType = { kind: 'ConfigMap' }

const getEditor = () => {
  const editors = screen.getAllByTestId('codemirror')
  return editors[editors.length - 1]
}

describe('YamlEditor', () => {
  let onClose, onSave

  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    onClose = vi.fn()
    onSave = vi.fn().mockResolvedValue()
    window.confirm = vi.fn()
  })

  const renderEditor = (props = {}) => {
    return render(
      <YamlEditor
        resource={mockResource}
        isOpen={true}
        onClose={onClose}
        onSave={onSave}
        resourceType={mockResourceType}
        contextName="test-ctx"
        {...props}
      />
    )
  }

  // @tests-contract YamlEditor.nullWhenClosed
  describe('nullWhenClosed', () => {
    it('should return null when isOpen is false', () => {
      const { container } = render(
        <YamlEditor
          resource={mockResource}
          isOpen={false}
          onClose={onClose}
          onSave={onSave}
          resourceType={mockResourceType}
          contextName="test-ctx"
        />
      )
      expect(container.innerHTML).toBe('')
    })

    it('should render editor when isOpen is true', () => {
      renderEditor()
      expect(screen.getByText('test-config')).toBeInTheDocument()
    })
  })

  // @tests-contract YamlEditor.initContent
  describe('initContent', () => {
    it('should initialize editor with YAML content from resource', () => {
      renderEditor()
      const editor = getEditor()
      expect(editor.value).toContain('apiVersion')
      expect(editor.value).toContain('v1')
      expect(editor.value).toContain('test-config')
    })
  })

  // @tests-contract YamlEditor.manifestMode
  describe('manifestMode', () => {
    it('should strip managed fields in manifest mode (default)', () => {
      renderEditor()
      const editor = getEditor()
      expect(editor.value).not.toContain('resourceVersion')
      expect(editor.value).not.toContain('uid')
      expect(editor.value).not.toContain('managedFields')
      expect(editor.value).not.toContain('selfLink')
      expect(editor.value).not.toContain('creationTimestamp')
      expect(editor.value).not.toContain('status')
      expect(editor.value).not.toContain('Active')
      expect(editor.value).toContain('key1')
      expect(editor.value).toContain('value1')
    })

    it('should strip empty annotations in manifest mode', () => {
      renderEditor()
      const editor = getEditor()
      expect(editor.value).not.toContain('annotations')
    })

    it('should preserve labels with values in manifest mode', () => {
      renderEditor()
      const editor = getEditor()
      expect(editor.value).toContain('app')
      expect(editor.value).toContain('test')
    })
  })

  // @tests-contract YamlEditor.fullMode
  describe('fullMode', () => {
    it('should show all fields including status in full mode', () => {
      renderEditor()
      const fullButton = screen.getByText('Full').closest('button')
      fireEvent.click(fullButton)
      const editor = getEditor()
      expect(editor.value).toContain('resourceVersion')
      expect(editor.value).toContain('uid')
      expect(editor.value).toContain('status')
      expect(editor.value).toContain('Active')
    })
  })

  // @tests-contract YamlEditor.toggleMode
  describe('toggleMode', () => {
    it('should switch between manifest and full modes', () => {
      renderEditor()
      expect(screen.getByText('Mode: Manifest Edit')).toBeInTheDocument()

      const fullButton = screen.getByText('Full').closest('button')
      fireEvent.click(fullButton)
      expect(screen.getByText('Mode: Full Edit')).toBeInTheDocument()
      expect(screen.getByText('Editing managed fields')).toBeInTheDocument()

      const manifestButton = screen.getByText('Manifest').closest('button')
      fireEvent.click(manifestButton)
      expect(screen.getByText('Mode: Manifest Edit')).toBeInTheDocument()
    })

    it('should reset hasChanges when toggling modes', () => {
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'modified: true' } })
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

      const fullButton = screen.getByText('Full').closest('button')
      fireEvent.click(fullButton)
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    })
  })

  // @tests-contract YamlEditor.yamlValidation
  describe('yamlValidation', () => {
    it('should disable save button when YAML has syntax errors', () => {
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'invalid: yaml: [broken' } })
      const applyButton = screen.getByText('Apply').closest('button')
      expect(applyButton).toBeDisabled()
    })

    it('should enable save button when valid YAML replaces invalid YAML', () => {
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'invalid: yaml: [broken' } })
      const applyButton = screen.getByText('Apply').closest('button')
      expect(applyButton).toBeDisabled()

      fireEvent.change(editor, { target: { value: 'valid: yaml' } })
      expect(applyButton).not.toBeDisabled()
    })
  })

  // @tests-contract YamlEditor.saveApply
  describe('saveApply', () => {
    it('should call onSave with apply mode in manifest edit mode', async () => {
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'key: newvalue' } })

      const applyButton = screen.getByText('Apply').closest('button')
      fireEvent.click(applyButton)

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ key: 'newvalue' }, 'apply')
      })
    })
  })

  // @tests-contract YamlEditor.saveReplace
  describe('saveReplace', () => {
    it('should call onSave with replace mode in full edit mode', async () => {
      renderEditor()
      const fullButton = screen.getByText('Full').closest('button')
      fireEvent.click(fullButton)

      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'key: newvalue' } })

      const applyButton = screen.getByText('Apply').closest('button')
      fireEvent.click(applyButton)

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ key: 'newvalue' }, 'replace')
      })
    })
  })

  // @tests-contract YamlEditor.saveDisabled
  describe('saveDisabled', () => {
    it('should disable Apply button when no changes have been made', () => {
      renderEditor()
      const applyButton = screen.getByText('Apply').closest('button')
      expect(applyButton).toBeDisabled()
    })

    it('should disable Apply button when YAML has errors', () => {
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'invalid: yaml: [broken' } })
      const applyButton = screen.getByText('Apply').closest('button')
      expect(applyButton).toBeDisabled()
    })

    it('should enable Apply button when there are valid changes', () => {
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'key: newvalue' } })
      const applyButton = screen.getByText('Apply').closest('button')
      expect(applyButton).not.toBeDisabled()
    })
  })

  // @tests-contract YamlEditor.closeWithChanges
  describe('closeWithChanges', () => {
    it('should show in-app confirm dialog when closing with unsaved changes', () => {
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'modified: true' } })

      const cancelButtons = screen.getAllByText('Cancel')
      const footerCancel = cancelButtons[cancelButtons.length - 1]
      fireEvent.click(footerCancel)

      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('should close when Discard is clicked in confirm dialog', () => {
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'modified: true' } })

      const cancelButtons = screen.getAllByText('Cancel')
      const footerCancel = cancelButtons[cancelButtons.length - 1]
      fireEvent.click(footerCancel)

      fireEvent.click(screen.getByText('Discard'))
      expect(onClose).toHaveBeenCalled()
    })

    it('should stay open when Keep Editing is clicked in confirm dialog', () => {
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'modified: true' } })

      const cancelButtons = screen.getAllByText('Cancel')
      const footerCancel = cancelButtons[cancelButtons.length - 1]
      fireEvent.click(footerCancel)

      fireEvent.click(screen.getByText('Keep Editing'))
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
    })
  })

  // @tests-contract YamlEditor.closeNoChanges
  describe('closeNoChanges', () => {
    it('should close directly when no unsaved changes', () => {
      renderEditor()
      const cancelButtons = screen.getAllByText('Cancel')
      const footerCancel = cancelButtons[cancelButtons.length - 1]
      fireEvent.click(footerCancel)

      expect(onClose).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
    })
  })

  // @tests-contract YamlEditor.minimize
  describe('minimize', () => {
    it('should minimize editor panel when minimize button is clicked', () => {
      renderEditor()
      expect(screen.getAllByTestId('codemirror').length).toBeGreaterThan(0)

      const minimizeButton = screen.getByLabelText('Minimize editor')
      fireEvent.click(minimizeButton)

      expect(screen.queryByTestId('codemirror')).not.toBeInTheDocument()
    })

    it('should maximize editor panel when maximize button is clicked', () => {
      renderEditor()
      const minimizeButton = screen.getByLabelText('Minimize editor')
      fireEvent.click(minimizeButton)
      expect(screen.queryByTestId('codemirror')).not.toBeInTheDocument()

      const maximizeButton = screen.getByLabelText('Maximize editor')
      fireEvent.click(maximizeButton)
      expect(screen.getAllByTestId('codemirror').length).toBeGreaterThan(0)
    })
  })

  describe('footer info', () => {
    it('should show resource kind, namespace, and edit mode in footer', () => {
      renderEditor()
      expect(screen.getByText('ConfigMap')).toBeInTheDocument()
      expect(screen.getByText(/Namespace:.*default/)).toBeInTheDocument()
      expect(screen.getByText('Mode: Manifest Edit')).toBeInTheDocument()
    })
  })

  describe('save error handling', () => {
    it('should display error when save fails', async () => {
      onSave.mockRejectedValue(new Error('Server error'))
      renderEditor()
      const editor = getEditor()
      fireEvent.change(editor, { target: { value: 'key: newvalue' } })

      const applyButton = screen.getByText('Apply').closest('button')
      fireEvent.click(applyButton)

      await waitFor(() => {
        expect(screen.getByText(/Save failed: Server error/)).toBeInTheDocument()
      })
    })
  })
})
