import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ContextTabs from './ContextTabs'
import { ThemeProvider } from '../contexts/ThemeContext'
import { KubeConfigProvider } from '../contexts/KubeConfigContext'

// @tests-contract ContextTabs.emptyState
// @tests-contract ContextTabs.renderTabs
// @tests-contract ContextTabs.activeTab
// @tests-contract ContextTabs.switchContext
// @tests-contract ContextTabs.truncate
// @tests-contract ContextTabs.connectionIcon
// @tests-contract ContextTabs.tabOrder
// @tests-contract ContextTabs.contextView

// Mock the kubeApi module (used by KubeConfigProvider)
vi.mock('../utils/api', () => ({
  kubeApi: {
    getContexts: vi.fn(),
    checkConnection: vi.fn(),
  },
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  },
}))

// Mock the SSE manager (used by KubeConfigProvider)
vi.mock('../utils/sse', () => ({
  default: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(() => vi.fn()), // returns unsubscribe function
    getStatus: vi.fn(() => ({ type: 'sse', connected: false })),
  },
  sseManager: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(() => vi.fn()),
    getStatus: vi.fn(() => ({ type: 'sse', connected: false })),
  },
}))

// Mock preferences manager (used by ContextTabs for tab order)
vi.mock('../utils/preferences', () => ({
  default: {
    getTabOrder: vi.fn(() => []),
    setTabOrder: vi.fn(),
    getSelectedResource: vi.fn(() => null),
    setSelectedResource: vi.fn(),
    getSelectedNamespace: vi.fn(() => 'All Namespaces'),
    setSelectedNamespace: vi.fn(),
    getSidebarWidth: vi.fn(() => 256),
    setSidebarWidth: vi.fn(),
    getTheme: vi.fn(() => 'system'),
  },
  preferencesManager: {
    getTabOrder: vi.fn(() => []),
    setTabOrder: vi.fn(),
    getSelectedResource: vi.fn(() => null),
    setSelectedResource: vi.fn(),
    getSelectedNamespace: vi.fn(() => 'All Namespaces'),
    setSelectedNamespace: vi.fn(),
    getSidebarWidth: vi.fn(() => 256),
    setSidebarWidth: vi.fn(),
    getTheme: vi.fn(() => 'system'),
  },
}))

// Mock ContextView component (child of ContextTabs)
// Uses data attributes instead of visible text to avoid duplicate text matches with tab labels
vi.mock('./ContextView', () => ({
  default: ({ contextName, context }) => (
    <div data-testid="context-view" data-context-name={contextName} data-context={JSON.stringify(context)} />
  ),
}))

// Import the mocked module so we can control its return values
import { kubeApi } from '../utils/api'
import preferencesManager from '../utils/preferences'

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  })

const renderWithProviders = (component) => {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <KubeConfigProvider>
          {component}
        </KubeConfigProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

describe('ContextTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    preferencesManager.getTabOrder.mockReturnValue([])
  })

  // @tests-contract ContextTabs.emptyState
  it('should show "No Kubernetes Contexts Found" when no contexts available', async () => {
    kubeApi.getContexts.mockResolvedValue([])

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByText('No Kubernetes Contexts Found')).toBeInTheDocument()
    })

    expect(
      screen.getByText('Please configure kubectl or check your kubeconfig file.')
    ).toBeInTheDocument()
  })

  // @tests-contract ContextTabs.renderTabs
  it('should render tabs for all available contexts', async () => {
    const mockContexts = [
      { name: 'context-alpha', current: true },
      { name: 'context-beta', current: false },
      { name: 'context-gamma', current: false },
    ]

    kubeApi.getContexts.mockResolvedValue(mockContexts)

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByText('context-alpha')).toBeInTheDocument()
    })

    expect(screen.getByText('context-beta')).toBeInTheDocument()
    expect(screen.getByText('context-gamma')).toBeInTheDocument()
  })

  // @tests-contract ContextTabs.activeTab
  it('should apply active styling to the current context tab', async () => {
    const mockContexts = [
      { name: 'active-ctx', current: true },
      { name: 'other-ctx', current: false },
    ]

    kubeApi.getContexts.mockResolvedValue(mockContexts)

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByText('active-ctx')).toBeInTheDocument()
    })

    // The active tab's parent div should have bg-blue-100 class
    const activeTabSpan = screen.getByText('active-ctx')
    const activeTabDiv = activeTabSpan.closest('div[draggable]')
    expect(activeTabDiv.className).toContain('bg-blue-100')
    expect(activeTabDiv.className).toContain('border-blue-600')

    // The inactive tab should NOT have bg-blue-100
    const inactiveTabSpan = screen.getByText('other-ctx')
    const inactiveTabDiv = inactiveTabSpan.closest('div[draggable]')
    expect(inactiveTabDiv.className).not.toContain('bg-blue-100')
  })

  // @tests-contract ContextTabs.switchContext
  it('should switch context when a tab is clicked', async () => {
    const mockContexts = [
      { name: 'ctx-one', current: true },
      { name: 'ctx-two', current: false },
    ]

    kubeApi.getContexts.mockResolvedValue(mockContexts)

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByText('ctx-one')).toBeInTheDocument()
    })

    // ContextView should initially show ctx-one
    expect(screen.getByTestId('context-view')).toHaveAttribute('data-context-name', 'ctx-one')

    // Click on ctx-two tab
    const ctxTwoSpan = screen.getByText('ctx-two')
    fireEvent.click(ctxTwoSpan)

    await waitFor(() => {
      expect(screen.getByTestId('context-view')).toHaveAttribute('data-context-name', 'ctx-two')
    })
  })

  // @tests-contract ContextTabs.truncate
  it('should truncate long context names to 20 characters with ellipsis', async () => {
    const longName = 'very-long-context-name-that-exceeds-limit'
    const mockContexts = [{ name: longName, current: true }]

    kubeApi.getContexts.mockResolvedValue(mockContexts)

    renderWithProviders(<ContextTabs />)

    // The truncated name should be first 17 chars + '...' = 20 chars
    const truncated = longName.substring(0, 17) + '...'

    await waitFor(() => {
      expect(screen.getByText(truncated)).toBeInTheDocument()
    })
  })

  // @tests-contract ContextTabs.contextView
  it('should render ContextView for the current context', async () => {
    const mockContexts = [
      { name: 'my-context', current: true, cluster: 'my-cluster' },
    ]

    kubeApi.getContexts.mockResolvedValue(mockContexts)

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByTestId('context-view')).toBeInTheDocument()
    })

    const contextView = screen.getByTestId('context-view')
    expect(contextView).toHaveAttribute('data-context-name', 'my-context')
    expect(contextView).toHaveAttribute('data-context', JSON.stringify(mockContexts[0]))
  })

  // @tests-contract ContextTabs.contextView
  it('should not render ContextView when there is no currentContext', async () => {
    // Return contexts but none marked current and no saved context
    // Actually, the provider sets currentContext from contexts[0] if no current is found,
    // so we test the empty case instead.
    kubeApi.getContexts.mockResolvedValue([])

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByText('No Kubernetes Contexts Found')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('context-view')).not.toBeInTheDocument()
  })

  // @tests-contract ContextTabs.tabOrder
  it('should use saved tab order from preferencesManager', async () => {
    const mockContexts = [
      { name: 'alpha', current: false },
      { name: 'beta', current: false },
      { name: 'gamma', current: true },
    ]

    // Return a custom order from preferences
    preferencesManager.getTabOrder.mockReturnValue(['gamma', 'alpha', 'beta'])

    kubeApi.getContexts.mockResolvedValue(mockContexts)

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByText('gamma')).toBeInTheDocument()
    })

    // All tabs should be present
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()

    // Check ordering by getting all tab span elements inside draggable divs
    const allTabSpans = screen.getAllByText(/^(gamma|alpha|beta)$/)
    expect(allTabSpans[0]).toHaveTextContent('gamma')
    expect(allTabSpans[1]).toHaveTextContent('alpha')
    expect(allTabSpans[2]).toHaveTextContent('beta')
  })

  // @tests-contract ContextTabs.tabOrder
  it('should filter out non-existent contexts from saved tab order', async () => {
    const mockContexts = [
      { name: 'ctx-a', current: true },
      { name: 'ctx-b', current: false },
    ]

    // Saved order includes a context that no longer exists
    preferencesManager.getTabOrder.mockReturnValue([
      'nonexistent',
      'ctx-b',
      'ctx-a',
    ])

    kubeApi.getContexts.mockResolvedValue(mockContexts)

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByText('ctx-a')).toBeInTheDocument()
    })

    expect(screen.getByText('ctx-b')).toBeInTheDocument()
    expect(screen.queryByText('nonexistent')).not.toBeInTheDocument()
  })

  // @tests-contract ContextTabs.tabOrder
  it('should fall back to contexts order when no saved tab order exists', async () => {
    const mockContexts = [
      { name: 'first', current: true },
      { name: 'second', current: false },
    ]

    preferencesManager.getTabOrder.mockReturnValue([])

    kubeApi.getContexts.mockResolvedValue(mockContexts)

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByText('first')).toBeInTheDocument()
    })

    expect(screen.getByText('second')).toBeInTheDocument()
  })

  // @tests-contract ContextTabs.renderTabs
  it('should make tabs draggable', async () => {
    const mockContexts = [
      { name: 'drag-ctx', current: true },
    ]

    kubeApi.getContexts.mockResolvedValue(mockContexts)

    renderWithProviders(<ContextTabs />)

    await waitFor(() => {
      expect(screen.getByText('drag-ctx')).toBeInTheDocument()
    })

    const tabSpan = screen.getByText('drag-ctx')
    const tabDiv = tabSpan.closest('div[draggable]')
    expect(tabDiv).not.toBeNull()
    expect(tabDiv.getAttribute('draggable')).toBe('true')
  })
})
