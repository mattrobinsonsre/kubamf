import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { KubeConfigProvider, useKubeConfig } from './KubeConfigContext'
import { kubeApi } from '../utils/api'

// Mock the kubeApi
vi.mock('../utils/api', () => ({
  kubeApi: {
    getContexts: vi.fn(),
    checkConnection: vi.fn(),
  }
}))

// Test component to access kubeconfig context
const TestComponent = () => {
  const {
    contexts,
    currentContext,
    connectionStates,
    isLoading,
    error,
    switchContext,
    checkConnection,
  } = useKubeConfig()

  return (
    <div>
      <div data-testid="contexts">{JSON.stringify(contexts)}</div>
      <div data-testid="current-context">{currentContext}</div>
      <div data-testid="connection-states">{JSON.stringify(connectionStates)}</div>
      <div data-testid="is-loading">{isLoading.toString()}</div>
      <div data-testid="error">{error?.message || 'null'}</div>
      <button
        data-testid="switch-context"
        onClick={() => switchContext('test-context-2')}
      >
        Switch Context
      </button>
      <button
        data-testid="check-connection"
        onClick={() => checkConnection('test-context')}
      >
        Check Connection
      </button>
    </div>
  )
}

const renderWithQueryClient = (component) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

describe('KubeConfigContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('KubeConfigProvider', () => {
    it('should provide kubeconfig context with loading state', () => {
      kubeApi.getContexts.mockImplementation(() => new Promise(() => {})) // Never resolves

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      expect(screen.getByTestId('is-loading')).toHaveTextContent('true')
      expect(screen.getByTestId('contexts')).toHaveTextContent('[]')
      expect(screen.getByTestId('current-context')).toHaveTextContent('')
    })

    it('should load contexts successfully', async () => {
      const mockContexts = [
        { name: 'context1', current: false },
        { name: 'context2', current: true },
      ]

      kubeApi.getContexts.mockResolvedValue(mockContexts)

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false')
      })

      expect(screen.getByTestId('contexts')).toHaveTextContent(
        JSON.stringify(mockContexts)
      )

      await waitFor(() => {
        expect(screen.getByTestId('current-context')).toHaveTextContent('context2')
      })
    })

    it('should set first context as current when no current context marked', async () => {
      const mockContexts = [
        { name: 'context1', current: false },
        { name: 'context2', current: false },
      ]

      kubeApi.getContexts.mockResolvedValue(mockContexts)

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('current-context')).toHaveTextContent('context1')
      })
    })

    it('should load saved context from localStorage', async () => {
      localStorage.setItem('kubamf-current-context', 'saved-context')

      const mockContexts = [
        { name: 'context1', current: false },
        { name: 'saved-context', current: false },
      ]

      kubeApi.getContexts.mockResolvedValue(mockContexts)

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('current-context')).toHaveTextContent('saved-context')
      })
    })

    it('should handle context loading error', async () => {
      const error = new Error('Failed to load contexts')
      kubeApi.getContexts.mockRejectedValue(error)

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to load contexts')
      })
    })

    it('should switch context and save to localStorage', async () => {
      const mockContexts = [
        { name: 'context1', current: true },
        { name: 'test-context-2', current: false },
      ]

      kubeApi.getContexts.mockResolvedValue(mockContexts)

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('current-context')).toHaveTextContent('context1')
      })

      const switchButton = screen.getByTestId('switch-context')

      await act(async () => {
        switchButton.click()
      })

      expect(screen.getByTestId('current-context')).toHaveTextContent('test-context-2')
      expect(localStorage.getItem('kubamf-current-context')).toBe('test-context-2')
    })

    it('should check connection successfully', async () => {
      const mockContexts = [{ name: 'test-context', current: true }]
      kubeApi.getContexts.mockResolvedValue(mockContexts)
      kubeApi.checkConnection.mockResolvedValue({ connected: true })

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('current-context')).toHaveTextContent('test-context')
      })

      const checkButton = screen.getByTestId('check-connection')

      await act(async () => {
        checkButton.click()
      })

      await waitFor(() => {
        const connectionStates = JSON.parse(screen.getByTestId('connection-states').textContent)
        expect(connectionStates['test-context']).toBe(true)
      })
    })

    it('should handle connection check failure', async () => {
      const mockContexts = [{ name: 'test-context', current: true }]
      kubeApi.getContexts.mockResolvedValue(mockContexts)
      kubeApi.checkConnection.mockRejectedValue(new Error('Connection failed'))

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('current-context')).toHaveTextContent('test-context')
      })

      const checkButton = screen.getByTestId('check-connection')

      await act(async () => {
        checkButton.click()
      })

      await waitFor(() => {
        const connectionStates = JSON.parse(screen.getByTestId('connection-states').textContent)
        expect(connectionStates['test-context']).toBe(false)
      })
    })

    it('should not set current context when contexts array is empty', async () => {
      kubeApi.getContexts.mockResolvedValue([])

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('is-loading')).toHaveTextContent('false')
      })

      expect(screen.getByTestId('current-context')).toHaveTextContent('')
    })

    it('should ignore invalid saved context from localStorage', async () => {
      localStorage.setItem('kubamf-current-context', 'invalid-context')

      const mockContexts = [
        { name: 'context1', current: false },
        { name: 'context2', current: true },
      ]

      kubeApi.getContexts.mockResolvedValue(mockContexts)

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('current-context')).toHaveTextContent('context2')
      })
    })
  })

  describe('useKubeConfig hook', () => {
    it('should throw error when used outside KubeConfigProvider', () => {
      const TestComponentWithoutProvider = () => {
        useKubeConfig()
        return <div>Test</div>
      }

      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderWithQueryClient(<TestComponentWithoutProvider />)
      }).toThrow('useKubeConfig must be used within a KubeConfigProvider')

      consoleSpy.mockRestore()
    })

    it('should provide kubeconfig context when used within KubeConfigProvider', async () => {
      kubeApi.getContexts.mockResolvedValue([])

      renderWithQueryClient(
        <KubeConfigProvider>
          <TestComponent />
        </KubeConfigProvider>
      )

      expect(screen.getByTestId('contexts')).toBeInTheDocument()
      expect(screen.getByTestId('current-context')).toBeInTheDocument()
      expect(screen.getByTestId('connection-states')).toBeInTheDocument()
    })
  })
})