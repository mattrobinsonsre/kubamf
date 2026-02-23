import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import SettingsDialog from './SettingsDialog'

// @tests-contract SettingsDialog.nullWhenClosed
// @tests-contract SettingsDialog.tabSwitching
// @tests-contract SettingsDialog.themeChange
// @tests-contract SettingsDialog.defaultNamespace
// @tests-contract SettingsDialog.refreshInterval
// @tests-contract SettingsDialog.autoRefresh
// @tests-contract SettingsDialog.devMode
// @tests-contract SettingsDialog.verboseLogging
// @tests-contract SettingsDialog.clearData
// @tests-contract SettingsDialog.saveButton
// @tests-contract SettingsDialog.cancelButton
// @tests-contract SettingsDialog.backdropClose
// @tests-contract SettingsDialog.closeButton

const { mockSetTheme, mockPreferencesManager } = vi.hoisted(() => {
  const mockSetTheme = vi.fn()
  const mockPreferencesManager = {
    get: vi.fn((key, defaultValue) => defaultValue),
    set: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
  }
  return { mockSetTheme, mockPreferencesManager }
})

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: vi.fn(() => ({ theme: 'system', setTheme: mockSetTheme }))
}))

vi.mock('../utils/preferences', () => ({
  default: mockPreferencesManager,
  preferencesManager: mockPreferencesManager,
}))

describe('SettingsDialog', () => {
  let onClose

  beforeEach(() => {
    vi.clearAllMocks()
    mockPreferencesManager.get.mockImplementation((key, defaultValue) => defaultValue)
    mockPreferencesManager.set.mockResolvedValue(undefined)
    mockPreferencesManager.reset.mockResolvedValue(undefined)
    onClose = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  // @tests-contract SettingsDialog.nullWhenClosed
  describe('nullWhenClosed', () => {
    it('should return null when isOpen is false', () => {
      const { container } = render(
        <SettingsDialog isOpen={false} onClose={onClose} />
      )
      expect(container.innerHTML).toBe('')
    })

    it('should render content when isOpen is true', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  // @tests-contract SettingsDialog.tabSwitching
  describe('tabSwitching', () => {
    it('should render all three tab buttons', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      const buttons = nav.querySelectorAll('button')
      expect(buttons).toHaveLength(3)
      expect(buttons[0].textContent).toContain('Appearance')
      expect(buttons[1].textContent).toContain('Kubernetes')
      expect(buttons[2].textContent).toContain('Advanced')
    })

    it('should show Appearance tab content by default', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      expect(screen.getByText('Theme')).toBeInTheDocument()
    })

    it('should switch to Kubernetes tab when clicked', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      const kubeTab = nav.querySelectorAll('button')[1]
      fireEvent.click(kubeTab)
      expect(screen.getByText('Kubernetes Configuration')).toBeInTheDocument()
      expect(screen.getByText('Default Namespace')).toBeInTheDocument()
    })

    it('should switch to Advanced tab when clicked', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      const advancedTab = nav.querySelectorAll('button')[2]
      fireEvent.click(advancedTab)
      expect(screen.getByText('Advanced Settings')).toBeInTheDocument()
      expect(screen.getByText('Enable developer mode')).toBeInTheDocument()
    })

    it('should switch back to Appearance from another tab', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      const tabs = nav.querySelectorAll('button')
      fireEvent.click(tabs[1]) // Kubernetes
      expect(screen.getByText('Kubernetes Configuration')).toBeInTheDocument()
      fireEvent.click(tabs[0]) // Back to Appearance
      expect(screen.getByText('Theme')).toBeInTheDocument()
    })

    it('should highlight the active tab', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      const tabs = nav.querySelectorAll('button')
      expect(tabs[0]).toHaveClass('bg-blue-100')
      expect(tabs[1]).not.toHaveClass('bg-blue-100')
    })
  })

  // @tests-contract SettingsDialog.themeChange
  describe('themeChange (WORKING)', () => {
    it('should render all three theme radio buttons', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const radios = screen.getAllByRole('radio')
      expect(radios).toHaveLength(3)
      expect(screen.getByText('Light')).toBeInTheDocument()
      expect(screen.getByText('Dark')).toBeInTheDocument()
      expect(screen.getByText('System')).toBeInTheDocument()
    })

    it('should have system radio checked by default', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const radios = screen.getAllByRole('radio')
      const systemRadio = radios.find(r => r.value === 'system')
      expect(systemRadio).toBeChecked()
    })

    it('should call setTheme when dark radio is selected', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const radios = screen.getAllByRole('radio')
      const darkRadio = radios.find(r => r.value === 'dark')
      fireEvent.click(darkRadio)
      expect(mockSetTheme).toHaveBeenCalledWith('dark')
    })

    it('should call setTheme when light radio is selected', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const radios = screen.getAllByRole('radio')
      const lightRadio = radios.find(r => r.value === 'light')
      fireEvent.click(lightRadio)
      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })
  })

  // @tests-contract SettingsDialog.defaultNamespace
  describe('defaultNamespace', () => {
    it('should render namespace input field', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[1])
      const input = screen.getByPlaceholderText('default')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'text')
    })

    it('should have empty default value from preferences', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[1])
      const input = screen.getByPlaceholderText('default')
      expect(input).toHaveValue('')
    })

    it('should update value when typed into', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[1])
      const input = screen.getByPlaceholderText('default')
      fireEvent.change(input, { target: { value: 'kube-system' } })
      expect(input).toHaveValue('kube-system')
    })
  })

  // @tests-contract SettingsDialog.refreshInterval
  describe('refreshInterval', () => {
    it('should render refresh interval select with options', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[1])
      expect(screen.getByText('Resource Refresh Interval')).toBeInTheDocument()
      expect(screen.getByText('5 seconds')).toBeInTheDocument()
      expect(screen.getByText('10 seconds')).toBeInTheDocument()
      expect(screen.getByText('30 seconds')).toBeInTheDocument()
      expect(screen.getByText('1 minute')).toBeInTheDocument()
    })

    it('should update value when changed', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[1])
      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: '10' } })
      expect(select).toHaveValue('10')
    })
  })

  // @tests-contract SettingsDialog.autoRefresh
  describe('autoRefresh', () => {
    it('should render auto-refresh checkbox', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[1])
      const checkbox = screen.getByRole('checkbox', { name: /auto-refresh/i })
      expect(checkbox).toBeInTheDocument()
    })

    it('should be checked by default and togglable', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[1])
      const checkbox = screen.getByRole('checkbox', { name: /auto-refresh/i })
      expect(checkbox).toBeChecked()
      fireEvent.click(checkbox)
      expect(checkbox).not.toBeChecked()
    })
  })

  // @tests-contract SettingsDialog.devMode
  describe('devMode', () => {
    it('should render developer mode checkbox', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[2])
      const checkbox = screen.getByRole('checkbox', { name: /developer mode/i })
      expect(checkbox).toBeInTheDocument()
    })

    it('should be unchecked by default and togglable', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[2])
      const checkbox = screen.getByRole('checkbox', { name: /developer mode/i })
      expect(checkbox).not.toBeChecked()
      fireEvent.click(checkbox)
      expect(checkbox).toBeChecked()
    })
  })

  // @tests-contract SettingsDialog.verboseLogging
  describe('verboseLogging', () => {
    it('should render verbose logging checkbox', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[2])
      const checkbox = screen.getByRole('checkbox', { name: /verbose logging/i })
      expect(checkbox).toBeInTheDocument()
    })

    it('should be unchecked by default and togglable', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[2])
      const checkbox = screen.getByRole('checkbox', { name: /verbose logging/i })
      expect(checkbox).not.toBeChecked()
      fireEvent.click(checkbox)
      expect(checkbox).toBeChecked()
    })
  })

  // @tests-contract SettingsDialog.clearData
  describe('clearData', () => {
    it('should render Clear All Data button', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[2])
      expect(screen.getByText('Clear All Data')).toBeInTheDocument()
    })

    it('should call preferencesManager.reset when confirmed', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[2])
      const clearButton = screen.getByText('Clear All Data').closest('button')
      fireEvent.click(clearButton)
      expect(window.confirm).toHaveBeenCalled()
      expect(mockPreferencesManager.reset).toHaveBeenCalled()
      window.confirm.mockRestore()
    })

    it('should not reset when confirm is cancelled', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[2])
      const clearButton = screen.getByText('Clear All Data').closest('button')
      fireEvent.click(clearButton)
      expect(window.confirm).toHaveBeenCalled()
      expect(mockPreferencesManager.reset).not.toHaveBeenCalled()
      window.confirm.mockRestore()
    })

    it('should show description text', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const nav = document.querySelector('nav')
      fireEvent.click(nav.querySelectorAll('button')[2])
      expect(screen.getByText('This will reset all settings and cached data')).toBeInTheDocument()
    })
  })

  // @tests-contract SettingsDialog.saveButton
  describe('saveButton', () => {
    it('should render Save Changes button', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })

    it('should persist settings and call onClose when clicked', async () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      fireEvent.click(screen.getByText('Save Changes'))
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1)
      })
      expect(mockPreferencesManager.set).toHaveBeenCalled()
    })
  })

  // @tests-contract SettingsDialog.cancelButton
  describe('cancelButton', () => {
    it('should render Cancel button', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('should call onClose when clicked', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      fireEvent.click(screen.getByText('Cancel'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // @tests-contract SettingsDialog.backdropClose
  describe('backdropClose', () => {
    it('should call onClose when backdrop is clicked', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const backdrop = document.querySelector('.bg-gray-500.bg-opacity-75')
      expect(backdrop).not.toBeNull()
      fireEvent.click(backdrop)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // @tests-contract SettingsDialog.closeButton
  describe('closeButton', () => {
    it('should render close X button in header', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      // The close button contains an SVG with the X path
      const svg = document.querySelector('svg.w-5.h-5')
      expect(svg).not.toBeNull()
      const closeButton = svg.closest('button')
      expect(closeButton).toBeInTheDocument()
    })

    it('should call onClose when X button is clicked', () => {
      render(<SettingsDialog isOpen={true} onClose={onClose} />)
      const svg = document.querySelector('svg.w-5.h-5')
      const closeButton = svg.closest('button')
      fireEvent.click(closeButton)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
