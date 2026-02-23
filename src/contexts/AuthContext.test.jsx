import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { AuthProvider, useAuth, ProtectedRoute } from './AuthContext'
import axios from 'axios'

// @tests-contract AuthContext.electronSkip
// @tests-contract AuthContext.webInit
// @tests-contract AuthContext.bamfAuth
// @tests-contract AuthContext.isAuthenticated

vi.mock('axios')
vi.mock('../utils/config', () => ({
  frontendConfig: {
    isElectron: vi.fn(() => false),
    getApiBaseUrl: vi.fn(() => 'http://localhost:3001/api')
  }
}))

// Test component that exposes auth context values
const TestConsumer = () => {
  const auth = useAuth()
  return (
    <div>
      <div data-testid="user">{JSON.stringify(auth.user)}</div>
      <div data-testid="isLoading">{auth.isLoading.toString()}</div>
      <div data-testid="error">{auth.error || 'none'}</div>
      <div data-testid="isElectron">{auth.isElectron.toString()}</div>
      <div data-testid="isAuthenticated">{auth.isAuthenticated().toString()}</div>
      <div data-testid="authInfo">{JSON.stringify(auth.authInfo)}</div>
      <div data-testid="hasRole-admin">{auth.hasRole('admin').toString()}</div>
      <div data-testid="hasGroup-devs">{auth.hasGroup('devs').toString()}</div>
    </div>
  )
}

describe('AuthContext', () => {
  let configModule

  beforeEach(async () => {
    vi.clearAllMocks()
    configModule = await import('../utils/config')
    configModule.frontendConfig.isElectron.mockReturnValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    axios.get.mockResolvedValue({ data: { enabled: false } })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // @tests-contract AuthContext.electronSkip
  describe('electron mode', () => {
    it('should skip auth and set electron-user in Electron mode', async () => {
      configModule.frontendConfig.isElectron.mockReturnValue(true)

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('isElectron')).toHaveTextContent('true')
      const user = JSON.parse(screen.getByTestId('user').textContent)
      expect(user.username).toBe('electron-user')
      expect(user.provider).toBe('electron')
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
      expect(screen.getByTestId('isLoading')).toHaveTextContent('false')
    })

    it('should not call axios in Electron mode', async () => {
      configModule.frontendConfig.isElectron.mockReturnValue(true)

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(axios.get).not.toHaveBeenCalled()
    })
  })

  // @tests-contract AuthContext.webInit
  describe('web init', () => {
    it('should fetch /auth/info and initialize auth in web mode', async () => {
      axios.get.mockResolvedValue({ data: { enabled: false } })

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(axios.get).toHaveBeenCalledWith('/auth/info')
      expect(screen.getByTestId('isLoading')).toHaveTextContent('false')
    })

    it('should set error when /auth/info fails', async () => {
      axios.get.mockRejectedValue(new Error('Network error'))

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('error')).toHaveTextContent('Failed to initialize authentication')
    })

    it('should set authInfo when /auth/info succeeds', async () => {
      axios.get.mockResolvedValue({ data: { enabled: true, provider: 'bamf' } })

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      const authInfo = JSON.parse(screen.getByTestId('authInfo').textContent)
      expect(authInfo.enabled).toBe(true)
      expect(authInfo.provider).toBe('bamf')
    })
  })

  // @tests-contract AuthContext.bamfAuth
  describe('bamf mode', () => {
    it('should set user from /auth/info response in bamf mode', async () => {
      axios.get.mockResolvedValue({
        data: {
          enabled: true,
          provider: 'bamf',
          user: { email: 'user@example.com', username: 'user', roles: ['admin'], groups: ['engineering'] }
        }
      })

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      const user = JSON.parse(screen.getByTestId('user').textContent)
      expect(user.email).toBe('user@example.com')
      expect(user.username).toBe('user')
      expect(user.roles).toContain('admin')
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
    })

    it('should not set user when /auth/info has no user (unauthenticated)', async () => {
      axios.get.mockResolvedValue({
        data: { enabled: true, provider: 'bamf', user: null }
      })

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('user')).toHaveTextContent('null')
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false')
    })
  })

  // @tests-contract AuthContext.isAuthenticated
  describe('isAuthenticated', () => {
    it('should return true for electron mode', async () => {
      configModule.frontendConfig.isElectron.mockReturnValue(true)

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
    })

    it('should return true when auth is disabled', async () => {
      axios.get.mockResolvedValue({ data: { enabled: false } })

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true')
    })
  })

  describe('hasRole', () => {
    it('should return true in electron mode', async () => {
      configModule.frontendConfig.isElectron.mockReturnValue(true)

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('hasRole-admin')).toHaveTextContent('true')
    })

    it('should check user roles when auth is enabled', async () => {
      axios.get.mockResolvedValue({
        data: {
          enabled: true,
          provider: 'bamf',
          user: { email: 'user@test.com', roles: ['viewer'], groups: [] }
        }
      })

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('hasRole-admin')).toHaveTextContent('false')
    })
  })

  describe('hasGroup', () => {
    it('should return true in electron mode', async () => {
      configModule.frontendConfig.isElectron.mockReturnValue(true)

      await act(async () => {
        render(
          <AuthProvider>
            <TestConsumer />
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('hasGroup-devs')).toHaveTextContent('true')
    })
  })

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      const TestWithoutProvider = () => {
        useAuth()
        return <div>Test</div>
      }

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      expect(() => render(<TestWithoutProvider />)).toThrow(
        'useAuth must be used within an AuthProvider'
      )
      consoleSpy.mockRestore()
    })
  })

  describe('ProtectedRoute', () => {
    it('should render children when auth is disabled', async () => {
      axios.get.mockResolvedValue({ data: { enabled: false } })

      await act(async () => {
        render(
          <AuthProvider>
            <ProtectedRoute>
              <div data-testid="protected-content">Protected</div>
            </ProtectedRoute>
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    })

    it('should render children in electron mode', async () => {
      configModule.frontendConfig.isElectron.mockReturnValue(true)

      await act(async () => {
        render(
          <AuthProvider>
            <ProtectedRoute>
              <div data-testid="protected-content">Protected</div>
            </ProtectedRoute>
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    })

    it('should show access denied when auth enabled and user not authenticated', async () => {
      axios.get.mockResolvedValue({ data: { enabled: true, provider: 'bamf', user: null } })

      await act(async () => {
        render(
          <AuthProvider>
            <ProtectedRoute>
              <div data-testid="protected-content">Protected</div>
            </ProtectedRoute>
          </AuthProvider>
        )
      })

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
      expect(screen.getByText('Access Denied')).toBeInTheDocument()
    })

    it('should render children when requireAuth is false', async () => {
      axios.get.mockResolvedValue({ data: { enabled: true, provider: 'bamf', user: null } })

      await act(async () => {
        render(
          <AuthProvider>
            <ProtectedRoute requireAuth={false}>
              <div data-testid="protected-content">Protected</div>
            </ProtectedRoute>
          </AuthProvider>
        )
      })

      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    })

    it('should show loading spinner while checking auth', async () => {
      let resolveAuth
      const authPromise = new Promise(resolve => { resolveAuth = resolve })
      axios.get.mockReturnValue(authPromise)

      await act(async () => {
        render(
          <AuthProvider>
            <ProtectedRoute>
              <div data-testid="protected-content">Protected</div>
            </ProtectedRoute>
          </AuthProvider>
        )
      })

      expect(screen.getByText('Checking authentication...')).toBeInTheDocument()

      await act(async () => {
        resolveAuth({ data: { enabled: false } })
      })
    })
  })
})
