import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ContextView from './ContextView'

// @tests-contract ContextView.sidebar
// @tests-contract ContextView.resourceList
// @tests-contract ContextView.emptyState
// @tests-contract ContextView.persistResource
// @tests-contract ContextView.persistNamespace
// @tests-contract ContextView.sidebarToggle
// @tests-contract ContextView.contextSwitch

// Mock preferences manager
vi.mock('../utils/preferences', () => ({
  default: {
    getSelectedResource: vi.fn(() => null),
    setSelectedResource: vi.fn(),
    getSelectedNamespace: vi.fn(() => 'All Namespaces'),
    setSelectedNamespace: vi.fn(),
    getSidebarWidth: vi.fn(() => 256),
    setSidebarWidth: vi.fn(),
    getTabOrder: vi.fn(() => []),
    setTabOrder: vi.fn(),
    getTheme: vi.fn(() => 'system'),
  },
  preferencesManager: {
    getSelectedResource: vi.fn(() => null),
    setSelectedResource: vi.fn(),
    getSelectedNamespace: vi.fn(() => 'All Namespaces'),
    setSelectedNamespace: vi.fn(),
    getSidebarWidth: vi.fn(() => 256),
    setSidebarWidth: vi.fn(),
    getTabOrder: vi.fn(() => []),
    setTabOrder: vi.fn(),
    getTheme: vi.fn(() => 'system'),
  },
}))

// Mock ResourceTree child component
vi.mock('./ResourceTree', () => ({
  default: ({ contextName, selectedResource, selectedNamespace, onResourceSelect }) => (
    <div data-testid="resource-tree">
      <div data-testid="tree-context">{contextName}</div>
      <div data-testid="tree-selected">{JSON.stringify(selectedResource)}</div>
      <div data-testid="tree-namespace">{selectedNamespace}</div>
      <button
        data-testid="select-deployments"
        onClick={() => onResourceSelect({ type: 'Deployments', kind: 'Deployment' })}
      >
        Select Deployments
      </button>
      <button
        data-testid="select-null"
        onClick={() => onResourceSelect(null)}
      >
        Deselect
      </button>
    </div>
  ),
}))

// Mock ResourceList child component
vi.mock('./ResourceList', () => ({
  default: ({ contextName, selectedResource, selectedNamespace, onNamespaceChange, isVisible }) => (
    <div data-testid="resource-list" data-visible={String(isVisible)}>
      <div data-testid="list-context">{contextName}</div>
      <div data-testid="list-resource">{JSON.stringify(selectedResource)}</div>
      <div data-testid="list-namespace">{selectedNamespace}</div>
      <button
        data-testid="change-namespace"
        onClick={() => onNamespaceChange('kube-system')}
      >
        Change Namespace
      </button>
    </div>
  ),
}))

import preferencesManager from '../utils/preferences'

describe('ContextView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preferencesManager.getSelectedResource.mockReturnValue(null)
    preferencesManager.getSelectedNamespace.mockReturnValue('All Namespaces')
    preferencesManager.getSidebarWidth.mockReturnValue(256)
  })

  // @tests-contract ContextView.emptyState
  it('should show empty state when no resource is selected', () => {
    render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context', cluster: 'test-cluster' }}
      />
    )

    expect(screen.getByText('Select a resource type to view')).toBeInTheDocument()
  })

  // @tests-contract ContextView.sidebar
  it('should render ResourceTree in the sidebar', () => {
    render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context', cluster: 'test-cluster' }}
      />
    )

    expect(screen.getByTestId('resource-tree')).toBeInTheDocument()
    expect(screen.getByTestId('tree-context')).toHaveTextContent('test-context')
  })

  // @tests-contract ContextView.sidebar
  it('should pass correct props to ResourceTree', () => {
    const resource = { type: 'Pods', kind: 'Pod' }
    preferencesManager.getSelectedResource.mockReturnValue(resource)

    render(
      <ContextView
        contextName="my-cluster"
        context={{ name: 'my-cluster' }}
      />
    )

    expect(screen.getByTestId('tree-context')).toHaveTextContent('my-cluster')
    const selectedDisplay = JSON.parse(screen.getByTestId('tree-selected').textContent)
    expect(selectedDisplay.type).toBe('Pods')
    expect(selectedDisplay.kind).toBe('Pod')
  })

  // @tests-contract ContextView.persistResource
  it('should persist resource selection via preferencesManager when resource is selected', async () => {
    render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context' }}
      />
    )

    // Click the mock button to select Deployments
    fireEvent.click(screen.getByTestId('select-deployments'))

    await waitFor(() => {
      expect(preferencesManager.setSelectedResource).toHaveBeenCalledWith(
        'test-context',
        { type: 'Deployments', kind: 'Deployment' }
      )
    })
  })

  // @tests-contract ContextView.resourceList
  it('should render ResourceList when a resource is selected', async () => {
    const resource = { type: 'Pods', kind: 'Pod' }
    preferencesManager.getSelectedResource.mockReturnValue(resource)

    render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context' }}
      />
    )

    // ResourceList should be rendered since there is a selectedResource
    expect(screen.getByTestId('resource-list')).toBeInTheDocument()
    expect(screen.getByTestId('list-context')).toHaveTextContent('test-context')
  })

  // @tests-contract ContextView.resourceList
  it('should show ResourceList after selecting a resource from the tree', async () => {
    render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context' }}
      />
    )

    // Initially should show empty state
    expect(screen.getByText('Select a resource type to view')).toBeInTheDocument()

    // Select a resource via the mock tree button
    fireEvent.click(screen.getByTestId('select-deployments'))

    await waitFor(() => {
      expect(screen.getByTestId('resource-list')).toBeInTheDocument()
    })

    const listResource = JSON.parse(screen.getByTestId('list-resource').textContent)
    expect(listResource.type).toBe('Deployments')
    expect(listResource.kind).toBe('Deployment')
  })

  // @tests-contract ContextView.persistNamespace
  it('should persist namespace changes via preferencesManager', async () => {
    const resource = { type: 'Pods', kind: 'Pod' }
    preferencesManager.getSelectedResource.mockReturnValue(resource)

    render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context' }}
      />
    )

    // Click the mock button to change namespace
    fireEvent.click(screen.getByTestId('change-namespace'))

    await waitFor(() => {
      expect(preferencesManager.setSelectedNamespace).toHaveBeenCalledWith(
        'test-context',
        'kube-system'
      )
    })
  })

  // @tests-contract ContextView.contextSwitch
  it('should reload preferences when contextName changes', () => {
    const { rerender } = render(
      <ContextView
        contextName="context-a"
        context={{ name: 'context-a' }}
      />
    )

    expect(preferencesManager.getSelectedResource).toHaveBeenCalledWith('context-a')

    // Clear mocks and rerender with a different context
    vi.clearAllMocks()

    rerender(
      <ContextView
        contextName="context-b"
        context={{ name: 'context-b' }}
      />
    )

    expect(preferencesManager.getSelectedResource).toHaveBeenCalledWith('context-b')
    expect(preferencesManager.getSelectedNamespace).toHaveBeenCalledWith('context-b')
  })

  // @tests-contract ContextView.sidebar
  it('should set sidebar width from preferencesManager', () => {
    preferencesManager.getSidebarWidth.mockReturnValue(300)

    const { container } = render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context' }}
      />
    )

    // The sidebar div should have the width from preferences
    const sidebarDiv = container.querySelector('[style*="width"]')
    expect(sidebarDiv).not.toBeNull()
    expect(sidebarDiv.style.width).toBe('300px')
  })

  // @tests-contract ContextView.sidebarToggle
  it('should show a toggle button to show the sidebar when hidden', async () => {
    const { container } = render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context' }}
      />
    )

    // Initially the sidebar should be visible
    expect(screen.getByTestId('resource-tree')).toBeInTheDocument()

    // Simulate resizing to below 120px to hide sidebar
    // Start resize
    const resizeHandle = container.querySelector('.cursor-col-resize')
    expect(resizeHandle).not.toBeNull()

    fireEvent.mouseDown(resizeHandle)

    // Move mouse to x < 120 to trigger hide
    fireEvent.mouseMove(document, { clientX: 50 })
    fireEvent.mouseUp(document)

    // After hiding, a "Show sidebar" button should appear
    await waitFor(() => {
      const showButton = screen.getByTitle('Show sidebar')
      expect(showButton).toBeInTheDocument()
    })

    // ResourceTree should be hidden
    expect(screen.queryByTestId('resource-tree')).not.toBeInTheDocument()

    // Click the show button to bring it back
    fireEvent.click(screen.getByTitle('Show sidebar'))

    await waitFor(() => {
      expect(screen.getByTestId('resource-tree')).toBeInTheDocument()
    })
  })

  // @tests-contract ContextView.emptyState
  it('should show empty state text in the content area when no resource selected', () => {
    render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context' }}
      />
    )

    expect(screen.getByText('Select a resource type to view')).toBeInTheDocument()
    expect(screen.queryByTestId('resource-list')).not.toBeInTheDocument()
  })

  // @tests-contract ContextView.sidebar
  it('should have a resize handle for the sidebar', () => {
    const { container } = render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context' }}
      />
    )

    const resizeHandle = container.querySelector('.cursor-col-resize')
    expect(resizeHandle).not.toBeNull()
    expect(resizeHandle.getAttribute('title')).toBe('Drag to resize sidebar')
  })

  // @tests-contract ContextView.sidebar
  it('should pass selectedNamespace to ResourceTree via preferencesManager', () => {
    preferencesManager.getSelectedNamespace.mockReturnValue('production')

    render(
      <ContextView
        contextName="test-context"
        context={{ name: 'test-context' }}
      />
    )

    expect(screen.getByTestId('tree-namespace')).toHaveTextContent('production')
  })
})
