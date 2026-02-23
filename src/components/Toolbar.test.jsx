import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Toolbar from './Toolbar'
import { ThemeProvider } from '../contexts/ThemeContext'
import { KubeConfigProvider } from '../contexts/KubeConfigContext'
import { kubeApi } from '../utils/api'

// Mock the kubeApi
vi.mock('../utils/api', () => ({
  kubeApi: {
    getContexts: vi.fn(),
    checkConnection: vi.fn(),
  }
}))

// Mock SettingsDialog component
vi.mock('./SettingsDialog', () => ({
  default: ({ isOpen, onClose }) => {
    if (!isOpen) return null
    return (
      <div data-testid="settings-dialog">
        <button data-testid="close-settings" onClick={onClose}>
          Close
        </button>
      </div>
    )
  }
}))

// Mock DocumentationViewer component
vi.mock('./DocumentationViewer', () => ({
  default: ({ isOpen, onClose }) => {
    if (!isOpen) return null
    return (
      <div data-testid="docs-viewer">
        <button data-testid="close-docs" onClick={onClose}>
          Close
        </button>
      </div>
    )
  }
}))

const consoleSpy = vi.spyOn(console, 'log')

const renderToolbar = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  })

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <KubeConfigProvider>
          <Toolbar />
        </KubeConfigProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )

  return { ...result, queryClient }
}

describe('Toolbar', () => {
  let savedElectronAPI

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    kubeApi.getContexts.mockResolvedValue([
      { name: 'test-context', current: true }
    ])
    // Save and set electronAPI to undefined so web toolbar buttons render
    // (the vitest setup defines window.electronAPI via Object.defineProperty
    // with writable:true but not configurable, so we assign undefined
    // instead of deleting)
    savedElectronAPI = window.electronAPI
    window.electronAPI = undefined
  })

  afterEach(() => {
    cleanup()
    // Restore electronAPI to its original value from vitest setup
    window.electronAPI = savedElectronAPI
  })

  it('should render toolbar with all web-mode buttons', () => {
    const { container } = renderToolbar()

    expect(within(container).getByTitle('Refresh')).toBeInTheDocument()
    expect(within(container).getByTitle('Add Resource')).toBeInTheDocument()
    expect(within(container).getByTitle('Inspect Resource')).toBeInTheDocument()
    expect(within(container).getByTitle('Edit Resource')).toBeInTheDocument()
    expect(within(container).getByTitle('Delete Resource')).toBeInTheDocument()
    expect(within(container).getByTitle('Remove Finalizers (Pods)')).toBeInTheDocument()
    expect(within(container).getByTitle('Rolling Restart (Deployments/StatefulSets)')).toBeInTheDocument()
    expect(within(container).getByTitle('Documentation')).toBeInTheDocument()
    expect(within(container).getByTitle('Settings')).toBeInTheDocument()
    expect(within(container).getByTitle(/Theme:/)).toBeInTheDocument()
  })

  // @contract Toolbar.currentContext - Must display current context name when available
  it('should show current context when available', async () => {
    const { container } = renderToolbar()

    await within(container).findByText('Context:')
    expect(within(container).getByText('test-context')).toBeInTheDocument()
  })

  it('should not show context when no context is available', async () => {
    kubeApi.getContexts.mockResolvedValue([])

    const { container } = renderToolbar()

    // Allow async query to resolve
    await vi.waitFor(() => {
      expect(within(container).queryByText('test-context')).not.toBeInTheDocument()
    })
  })

  // @contract Toolbar.sseStatus - Must display SSE connection status
  it('should display SSE connection status', () => {
    const { container } = renderToolbar()

    // Default sseStatus is { connected: false, type: 'none' } which shows "Disconnected"
    expect(within(container).getByTitle('Disconnected')).toBeInTheDocument()
  })

  // @contract Toolbar.refresh - Must dispatch 'toolbar-refresh' CustomEvent
  it('should dispatch toolbar-refresh CustomEvent when refresh button clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { container } = renderToolbar()

    const refreshButton = within(container).getByTitle('Refresh')
    fireEvent.click(refreshButton)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toolbar-refresh' })
    )

    dispatchSpy.mockRestore()
  })

  // @contract Toolbar.addResource - Must dispatch 'toolbar-add-resource' CustomEvent
  it('should dispatch toolbar-add-resource CustomEvent when add resource button clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { container } = renderToolbar()

    const addButton = within(container).getByTitle('Add Resource')
    fireEvent.click(addButton)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toolbar-add-resource' })
    )
    dispatchSpy.mockRestore()
  })

  // @contract Toolbar.editResource - Must dispatch 'toolbar-edit' CustomEvent
  it('should dispatch toolbar-edit CustomEvent when edit resource button clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { container } = renderToolbar()

    const editButton = within(container).getByTitle('Edit Resource')
    fireEvent.click(editButton)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toolbar-edit' })
    )

    dispatchSpy.mockRestore()
  })

  // @contract Toolbar.inspectResource - Must dispatch 'toolbar-inspect' CustomEvent
  it('should dispatch toolbar-inspect CustomEvent when inspect resource button clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { container } = renderToolbar()

    const inspectButton = within(container).getByTitle('Inspect Resource')
    fireEvent.click(inspectButton)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toolbar-inspect' })
    )

    dispatchSpy.mockRestore()
  })

  // @contract Toolbar.deleteResource - Must dispatch 'toolbar-delete' CustomEvent
  it('should dispatch toolbar-delete CustomEvent when delete resource button clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { container } = renderToolbar()

    const deleteButton = within(container).getByTitle('Delete Resource')
    fireEvent.click(deleteButton)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toolbar-delete' })
    )

    dispatchSpy.mockRestore()
  })

  // @contract Toolbar.removeFinalizers - Must dispatch 'toolbar-remove-finalizers' CustomEvent
  it('should dispatch toolbar-remove-finalizers CustomEvent when remove finalizers button clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { container } = renderToolbar()

    const removeFinalButton = within(container).getByTitle('Remove Finalizers (Pods)')
    fireEvent.click(removeFinalButton)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toolbar-remove-finalizers' })
    )

    dispatchSpy.mockRestore()
  })

  // @contract Toolbar.rollingRestart - Must dispatch 'toolbar-rolling-restart' CustomEvent
  it('should dispatch toolbar-rolling-restart CustomEvent when rolling restart button clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    const { container } = renderToolbar()

    const rollingRestartButton = within(container).getByTitle('Rolling Restart (Deployments/StatefulSets)')
    fireEvent.click(rollingRestartButton)

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toolbar-rolling-restart' })
    )

    dispatchSpy.mockRestore()
  })

  // @contract Toolbar.cycleTheme - Must cycle through light/dark/system themes
  it('should cycle through themes when theme button clicked', () => {
    const { container } = renderToolbar()

    const themeButton = within(container).getByTitle(/Theme:/)

    // Initially should be system theme
    expect(themeButton.title).toBe('Theme: system')

    // Click to cycle to light
    fireEvent.click(themeButton)
    expect(themeButton.title).toBe('Theme: light')

    // Click to cycle to dark
    fireEvent.click(themeButton)
    expect(themeButton.title).toBe('Theme: dark')

    // Click to cycle back to system
    fireEvent.click(themeButton)
    expect(themeButton.title).toBe('Theme: system')
  })

  it('should display correct theme icon for light theme', () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'kubamf-theme') return 'light'
      return undefined
    })

    const { container } = renderToolbar()

    const themeButton = within(container).getByTitle('Theme: light')
    expect(themeButton).toBeInTheDocument()
  })

  it('should display correct theme icon for dark theme', () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'kubamf-theme') return 'dark'
      return undefined
    })

    const { container } = renderToolbar()

    const themeButton = within(container).getByTitle('Theme: dark')
    expect(themeButton).toBeInTheDocument()
  })

  it('should display correct theme icon for system theme', () => {
    localStorage.getItem.mockImplementation((key) => {
      if (key === 'kubamf-theme') return 'system'
      return undefined
    })

    const { container } = renderToolbar()

    const themeButton = within(container).getByTitle('Theme: system')
    expect(themeButton).toBeInTheDocument()
  })

  // @contract Toolbar.settings - Must open SettingsDialog when settings button clicked
  it('should open settings dialog when settings button clicked', () => {
    const { container } = renderToolbar()

    const settingsButton = within(container).getByTitle('Settings')
    fireEvent.click(settingsButton)

    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()
  })

  it('should close settings dialog when close button clicked', () => {
    const { container } = renderToolbar()

    // Open settings
    const settingsButton = within(container).getByTitle('Settings')
    fireEvent.click(settingsButton)

    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument()

    // Close settings
    const closeButton = screen.getByTestId('close-settings')
    fireEvent.click(closeButton)

    expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument()
  })

  // @contract Toolbar.docs - Must open DocumentationViewer when docs button clicked
  it('should open documentation viewer when docs button clicked', () => {
    const { container } = renderToolbar()

    const docsButton = within(container).getByTitle('Documentation')
    fireEvent.click(docsButton)

    expect(screen.getByTestId('docs-viewer')).toBeInTheDocument()
  })

  // @contract Toolbar.escCloseDocs - Must close docs when ESC key pressed
  it('should close docs when ESC key pressed while docs are open', () => {
    const { container } = renderToolbar()

    // Open docs
    const docsButton = within(container).getByTitle('Documentation')
    fireEvent.click(docsButton)

    expect(screen.getByTestId('docs-viewer')).toBeInTheDocument()

    // Press ESC
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('docs-viewer')).not.toBeInTheDocument()
  })

  it('should not close docs on ESC when docs are not open', () => {
    renderToolbar()

    // Docs should not be open initially
    expect(screen.queryByTestId('docs-viewer')).not.toBeInTheDocument()

    // Press ESC should not cause errors
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('docs-viewer')).not.toBeInTheDocument()
  })

  it('should have proper accessibility attributes on all buttons', () => {
    const { container } = renderToolbar()

    const buttons = within(container).getAllByRole('button')
    buttons.forEach(button => {
      expect(button).toHaveAttribute('title')
    })
  })

  it('should have proper hover styles applied', () => {
    const { container } = renderToolbar()

    const refreshButton = within(container).getByTitle('Refresh')
    expect(refreshButton).toHaveClass('hover:bg-gray-100', 'dark:hover:bg-gray-800')
  })
})
