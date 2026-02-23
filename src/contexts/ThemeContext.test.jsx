import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'

// Test component to access theme context
const TestComponent = () => {
  const { theme, isDark, setTheme } = useTheme()
  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <div data-testid="is-dark">{isDark.toString()}</div>
      <button data-testid="set-light" onClick={() => setTheme('light')}>
        Light
      </button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>
        Dark
      </button>
      <button data-testid="set-system" onClick={() => setTheme('system')}>
        System
      </button>
    </div>
  )
}

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('ThemeProvider', () => {
    it('should provide default theme as system', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toHaveTextContent('system')
    })

    it('should load saved theme from localStorage', () => {
      localStorage.setItem('kubamf-theme', 'dark')

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toHaveTextContent('dark')
      expect(screen.getByTestId('is-dark')).toHaveTextContent('true')
    })

    it('should handle light theme setting', async () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      const lightButton = screen.getByTestId('set-light')

      await act(async () => {
        lightButton.click()
      })

      expect(screen.getByTestId('theme')).toHaveTextContent('light')
      expect(screen.getByTestId('is-dark')).toHaveTextContent('false')
      expect(localStorage.getItem('kubamf-theme')).toBe('light')
    })

    it('should handle dark theme setting', async () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      const darkButton = screen.getByTestId('set-dark')

      await act(async () => {
        darkButton.click()
      })

      expect(screen.getByTestId('theme')).toHaveTextContent('dark')
      expect(screen.getByTestId('is-dark')).toHaveTextContent('true')
      expect(localStorage.getItem('kubamf-theme')).toBe('dark')
    })

    it('should handle system theme with light preference', () => {
      // Mock system preference for light theme
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: false, // light theme
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      })

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toHaveTextContent('system')
      expect(screen.getByTestId('is-dark')).toHaveTextContent('false')
    })

    it('should handle system theme with dark preference', () => {
      // Mock system preference for dark theme
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(query => ({
          matches: true, // dark theme
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      })

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toHaveTextContent('system')
      expect(screen.getByTestId('is-dark')).toHaveTextContent('true')
    })

    it('should update system theme when media query changes', async () => {
      let mediaQueryCallback = null
      const mockMediaQuery = {
        matches: false,
        addEventListener: vi.fn((event, callback) => {
          if (event === 'change') {
            mediaQueryCallback = callback
          }
        }),
        removeEventListener: vi.fn(),
      }

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockReturnValue(mockMediaQuery),
      })

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      // Initially light
      expect(screen.getByTestId('is-dark')).toHaveTextContent('false')

      // Simulate system theme change to dark
      await act(async () => {
        mockMediaQuery.matches = true
        if (mediaQueryCallback) {
          mediaQueryCallback()
        }
      })

      expect(screen.getByTestId('is-dark')).toHaveTextContent('true')
    })

    it('should add dark class to document element when dark theme', async () => {
      const mockClassList = {
        toggle: vi.fn(),
      }
      Object.defineProperty(document.documentElement, 'classList', {
        value: mockClassList,
        configurable: true,
      })

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      const darkButton = screen.getByTestId('set-dark')

      await act(async () => {
        darkButton.click()
      })

      expect(mockClassList.toggle).toHaveBeenCalledWith('dark', true)
    })

    it('should remove dark class from document element when light theme', async () => {
      const mockClassList = {
        toggle: vi.fn(),
      }
      Object.defineProperty(document.documentElement, 'classList', {
        value: mockClassList,
        configurable: true,
      })

      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      const lightButton = screen.getByTestId('set-light')

      await act(async () => {
        lightButton.click()
      })

      expect(mockClassList.toggle).toHaveBeenCalledWith('dark', false)
    })
  })

  describe('useTheme hook', () => {
    it('should throw error when used outside ThemeProvider', () => {
      const TestComponentWithoutProvider = () => {
        useTheme()
        return <div>Test</div>
      }

      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestComponentWithoutProvider />)
      }).toThrow('useTheme must be used within a ThemeProvider')

      consoleSpy.mockRestore()
    })

    it('should provide theme context when used within ThemeProvider', () => {
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toBeInTheDocument()
      expect(screen.getByTestId('is-dark')).toBeInTheDocument()
    })
  })
})