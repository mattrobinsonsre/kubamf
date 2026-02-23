import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContainerRow from './ContainerRow'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Terminal: ({ size, ...props }) => <svg data-testid="terminal-icon" data-size={size} {...props} />,
  FileText: ({ size, ...props }) => <svg data-testid="filetext-icon" data-size={size} {...props} />,
}))

// Mock resourceHelpers
vi.mock('../utils/resourceHelpers', () => ({
  formatCpuValue: vi.fn((val) => val || '-'),
  formatMemoryValue: vi.fn((val) => val || '-'),
  getResourceColor: vi.fn(() => 'text-gray-500'),
  parseContainerState: vi.fn((state) => {
    if (state?.running) return 'Running'
    if (state?.waiting) return 'Waiting'
    return 'Terminated'
  }),
  getResourceWarningIndicator: vi.fn(() => null),
}))

// Helper to render ContainerRow inside a table structure
const renderInTable = (ui) => {
  return render(
    <table>
      <tbody>
        {ui}
      </tbody>
    </table>
  )
}

describe('ContainerRow', () => {
  const baseContainer = {
    name: 'my-container',
    ready: true,
    restartCount: 3,
    state: { running: { startedAt: '2024-01-01T00:00:00Z' } },
    resources: {
      requests: { cpu: '100m', memory: '128Mi' },
      limits: { cpu: '500m', memory: '512Mi' },
    },
  }

  const basePod = {
    metadata: { name: 'my-pod', namespace: 'default' },
  }

  const defaultProps = {
    container: baseContainer,
    index: 0,
    totalCount: 2,
    podMetric: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // @tests-contract ContainerRow.shellButton
  describe('shellButton', () => {
    it('should render shell button when onOpenShell and pod are both provided', () => {
      const onOpenShell = vi.fn()
      renderInTable(
        <ContainerRow {...defaultProps} pod={basePod} onOpenShell={onOpenShell} />
      )
      expect(screen.getByTitle(`Open shell in ${baseContainer.name}`)).toBeInTheDocument()
      expect(screen.getByTestId('terminal-icon')).toBeInTheDocument()
    })

    it('should call onOpenShell with pod and container when shell button is clicked', () => {
      const onOpenShell = vi.fn()
      renderInTable(
        <ContainerRow {...defaultProps} pod={basePod} onOpenShell={onOpenShell} />
      )

      const shellButton = screen.getByTitle(`Open shell in ${baseContainer.name}`)
      fireEvent.click(shellButton)

      expect(onOpenShell).toHaveBeenCalledTimes(1)
      expect(onOpenShell).toHaveBeenCalledWith(basePod, baseContainer)
    })

    it('should stop propagation when shell button is clicked', () => {
      const onOpenShell = vi.fn()
      const parentClick = vi.fn()
      render(
        <table onClick={parentClick}>
          <tbody>
            <ContainerRow {...defaultProps} pod={basePod} onOpenShell={onOpenShell} />
          </tbody>
        </table>
      )

      const shellButton = screen.getByTitle(`Open shell in ${baseContainer.name}`)
      fireEvent.click(shellButton)

      expect(parentClick).not.toHaveBeenCalled()
    })

    it('should not render shell button when onOpenShell is provided but pod is null', () => {
      const onOpenShell = vi.fn()
      renderInTable(
        <ContainerRow {...defaultProps} pod={null} onOpenShell={onOpenShell} />
      )
      expect(screen.queryByTitle(`Open shell in ${baseContainer.name}`)).not.toBeInTheDocument()
    })
  })

  // @tests-contract ContainerRow.logsButton
  describe('logsButton', () => {
    it('should render logs button when onViewLogs and pod are both provided', () => {
      const onViewLogs = vi.fn()
      renderInTable(
        <ContainerRow {...defaultProps} pod={basePod} onViewLogs={onViewLogs} />
      )
      expect(screen.getByTitle(`View logs for ${baseContainer.name}`)).toBeInTheDocument()
      expect(screen.getByTestId('filetext-icon')).toBeInTheDocument()
    })

    it('should call onViewLogs with pod and container when logs button is clicked', () => {
      const onViewLogs = vi.fn()
      renderInTable(
        <ContainerRow {...defaultProps} pod={basePod} onViewLogs={onViewLogs} />
      )

      const logsButton = screen.getByTitle(`View logs for ${baseContainer.name}`)
      fireEvent.click(logsButton)

      expect(onViewLogs).toHaveBeenCalledTimes(1)
      expect(onViewLogs).toHaveBeenCalledWith(basePod, baseContainer)
    })

    it('should stop propagation when logs button is clicked', () => {
      const onViewLogs = vi.fn()
      const parentClick = vi.fn()
      render(
        <table onClick={parentClick}>
          <tbody>
            <ContainerRow {...defaultProps} pod={basePod} onViewLogs={onViewLogs} />
          </tbody>
        </table>
      )

      const logsButton = screen.getByTitle(`View logs for ${baseContainer.name}`)
      fireEvent.click(logsButton)

      expect(parentClick).not.toHaveBeenCalled()
    })

    it('should not render logs button when onViewLogs is provided but pod is null', () => {
      const onViewLogs = vi.fn()
      renderInTable(
        <ContainerRow {...defaultProps} pod={null} onViewLogs={onViewLogs} />
      )
      expect(screen.queryByTitle(`View logs for ${baseContainer.name}`)).not.toBeInTheDocument()
    })
  })

  // @tests-contract ContainerRow.noButtons
  describe('noButtons', () => {
    it('should not render shell button when onOpenShell is null', () => {
      renderInTable(
        <ContainerRow {...defaultProps} pod={basePod} onOpenShell={null} />
      )
      expect(screen.queryByTitle(`Open shell in ${baseContainer.name}`)).not.toBeInTheDocument()
      expect(screen.queryByTestId('terminal-icon')).not.toBeInTheDocument()
    })

    it('should not render logs button when onViewLogs is null', () => {
      renderInTable(
        <ContainerRow {...defaultProps} pod={basePod} onViewLogs={null} />
      )
      expect(screen.queryByTitle(`View logs for ${baseContainer.name}`)).not.toBeInTheDocument()
      expect(screen.queryByTestId('filetext-icon')).not.toBeInTheDocument()
    })

    it('should not render either button when both callbacks are null and pod is provided', () => {
      renderInTable(
        <ContainerRow {...defaultProps} pod={basePod} onOpenShell={null} onViewLogs={null} />
      )
      expect(screen.queryByTestId('terminal-icon')).not.toBeInTheDocument()
      expect(screen.queryByTestId('filetext-icon')).not.toBeInTheDocument()
    })

    it('should not render either button when callbacks are provided but pod is null', () => {
      renderInTable(
        <ContainerRow {...defaultProps} pod={null} onOpenShell={vi.fn()} onViewLogs={vi.fn()} />
      )
      expect(screen.queryByTestId('terminal-icon')).not.toBeInTheDocument()
      expect(screen.queryByTestId('filetext-icon')).not.toBeInTheDocument()
    })
  })

  // @tests-contract ContainerRow.containerName
  describe('containerName', () => {
    it('should display the container name', () => {
      renderInTable(<ContainerRow {...defaultProps} />)
      expect(screen.getByText('my-container')).toBeInTheDocument()
    })

    it('should display tree-branch prefix for non-last container (index < totalCount - 1)', () => {
      renderInTable(
        <ContainerRow {...defaultProps} index={0} totalCount={3} />
      )
      expect(screen.getByText('\u251C\u2500')).toBeInTheDocument()
    })

    it('should display tree-branch end prefix for last container (index === totalCount - 1)', () => {
      renderInTable(
        <ContainerRow {...defaultProps} index={2} totalCount={3} />
      )
      expect(screen.getByText('\u2514\u2500')).toBeInTheDocument()
    })

    it('should display end branch when it is the only container', () => {
      renderInTable(
        <ContainerRow {...defaultProps} index={0} totalCount={1} />
      )
      expect(screen.getByText('\u2514\u2500')).toBeInTheDocument()
    })
  })

  // @tests-contract ContainerRow.stateDisplay
  describe('stateDisplay', () => {
    it('should show "Running" state with green classes for a running container', () => {
      renderInTable(<ContainerRow {...defaultProps} />)
      const stateBadge = screen.getByText('Running')
      expect(stateBadge).toBeInTheDocument()
      expect(stateBadge).toHaveClass('bg-green-100', 'text-green-800')
    })

    it('should show "Waiting" state with yellow classes for a waiting container', () => {
      const waitingContainer = {
        ...baseContainer,
        state: { waiting: { reason: 'CrashLoopBackOff' } },
      }
      renderInTable(
        <ContainerRow {...defaultProps} container={waitingContainer} />
      )
      const stateBadge = screen.getByText('Waiting')
      expect(stateBadge).toBeInTheDocument()
      expect(stateBadge).toHaveClass('bg-yellow-100', 'text-yellow-800')
    })

    it('should show "Terminated" state with red classes for a terminated container', () => {
      const terminatedContainer = {
        ...baseContainer,
        state: { terminated: { exitCode: 1 } },
      }
      renderInTable(
        <ContainerRow {...defaultProps} container={terminatedContainer} />
      )
      const stateBadge = screen.getByText('Terminated')
      expect(stateBadge).toBeInTheDocument()
      expect(stateBadge).toHaveClass('bg-red-100', 'text-red-800')
    })
  })

  // @tests-contract ContainerRow.readyIndicator
  describe('readyIndicator', () => {
    it('should show checkmark when container is ready', () => {
      renderInTable(
        <ContainerRow {...defaultProps} container={{ ...baseContainer, ready: true }} />
      )
      expect(screen.getByText('\u2713')).toBeInTheDocument()
    })

    it('should show x-mark when container is not ready', () => {
      renderInTable(
        <ContainerRow {...defaultProps} container={{ ...baseContainer, ready: false }} />
      )
      expect(screen.getByText('\u2717')).toBeInTheDocument()
    })
  })

  describe('resource display', () => {
    it('should display resource requests and limits', () => {
      renderInTable(<ContainerRow {...defaultProps} />)
      expect(screen.getByText('CPU: 100m/500m | Mem: 128Mi/512Mi')).toBeInTheDocument()
    })

    it('should display dashes when resources are not defined', () => {
      const noResourceContainer = { ...baseContainer, resources: {} }
      renderInTable(
        <ContainerRow {...defaultProps} container={noResourceContainer} />
      )
      expect(screen.getByText('CPU: -/- | Mem: -/-')).toBeInTheDocument()
    })

    it('should display restart count', () => {
      renderInTable(<ContainerRow {...defaultProps} />)
      expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('should display 0 when restartCount is not set', () => {
      const noRestartContainer = { ...baseContainer, restartCount: undefined }
      renderInTable(
        <ContainerRow {...defaultProps} container={noRestartContainer} />
      )
      expect(screen.getByText('0')).toBeInTheDocument()
    })
  })
})
