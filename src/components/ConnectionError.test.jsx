import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConnectionError from './ConnectionError'

describe('ConnectionError', () => {
  const defaultProps = {
    contextName: 'my-k8s-cluster',
    cluster: null,
    onRetry: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // @tests-contract ConnectionError.contextDisplay
  describe('contextDisplay', () => {
    it('should display the contextName in the error message', () => {
      render(<ConnectionError {...defaultProps} />)
      expect(screen.getByText(/my-k8s-cluster/)).toBeInTheDocument()
    })

    it('should display different context names correctly', () => {
      render(<ConnectionError {...defaultProps} contextName="production-cluster" />)
      expect(screen.getByText(/production-cluster/)).toBeInTheDocument()
    })

    it('should display "Connection Failed" heading', () => {
      render(<ConnectionError {...defaultProps} />)
      expect(screen.getByText('Connection Failed')).toBeInTheDocument()
    })

    it('should include the context name in the descriptive message', () => {
      render(<ConnectionError {...defaultProps} contextName="staging-ctx" />)
      expect(screen.getByText(/Unable to connect to the Kubernetes cluster/)).toBeInTheDocument()
      expect(screen.getByText(/staging-ctx/)).toBeInTheDocument()
    })
  })

  // @tests-contract ConnectionError.clusterDisplay
  describe('clusterDisplay', () => {
    it('should display cluster info when cluster prop is provided', () => {
      render(<ConnectionError {...defaultProps} cluster="https://api.k8s.example.com:6443" />)
      expect(screen.getByText('Cluster:')).toBeInTheDocument()
      expect(screen.getByText('https://api.k8s.example.com:6443')).toBeInTheDocument()
    })

    it('should not display cluster section when cluster is null', () => {
      render(<ConnectionError {...defaultProps} cluster={null} />)
      expect(screen.queryByText('Cluster:')).not.toBeInTheDocument()
    })

    it('should not display cluster section when cluster is undefined', () => {
      render(<ConnectionError contextName="test" onRetry={vi.fn()} />)
      expect(screen.queryByText('Cluster:')).not.toBeInTheDocument()
    })

    it('should not display cluster section when cluster is empty string', () => {
      render(<ConnectionError {...defaultProps} cluster="" />)
      expect(screen.queryByText('Cluster:')).not.toBeInTheDocument()
    })
  })

  // @tests-contract ConnectionError.retryButton
  describe('retryButton', () => {
    it('should render a retry button with "Retry Connection" text', () => {
      render(<ConnectionError {...defaultProps} />)
      expect(screen.getByText('Retry Connection')).toBeInTheDocument()
    })

    it('should call onRetry when the retry button is clicked', () => {
      const onRetry = vi.fn()
      render(<ConnectionError {...defaultProps} onRetry={onRetry} />)

      const retryButton = screen.getByText('Retry Connection')
      fireEvent.click(retryButton)

      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('should call onRetry on each click', () => {
      const onRetry = vi.fn()
      render(<ConnectionError {...defaultProps} onRetry={onRetry} />)

      const retryButton = screen.getByText('Retry Connection')
      fireEvent.click(retryButton)
      fireEvent.click(retryButton)

      expect(onRetry).toHaveBeenCalledTimes(2)
    })
  })

  // @tests-contract ConnectionError.errorCauses
  describe('errorCauses', () => {
    it('should display "Possible causes:" heading', () => {
      render(<ConnectionError {...defaultProps} />)
      expect(screen.getByText('Possible causes:')).toBeInTheDocument()
    })

    it('should list "Cluster is unreachable" as a possible cause', () => {
      render(<ConnectionError {...defaultProps} />)
      expect(screen.getByText(/Cluster is unreachable/)).toBeInTheDocument()
    })

    it('should list "Invalid credentials" as a possible cause', () => {
      render(<ConnectionError {...defaultProps} />)
      expect(screen.getByText(/Invalid credentials/)).toBeInTheDocument()
    })

    it('should list "Network connectivity issues" as a possible cause', () => {
      render(<ConnectionError {...defaultProps} />)
      expect(screen.getByText(/Network connectivity issues/)).toBeInTheDocument()
    })

    it('should list "kubectl configuration problems" as a possible cause', () => {
      render(<ConnectionError {...defaultProps} />)
      expect(screen.getByText(/kubectl configuration problems/)).toBeInTheDocument()
    })

    it('should display exactly 4 possible causes', () => {
      render(<ConnectionError {...defaultProps} />)
      const listItems = screen.getAllByRole('listitem')
      expect(listItems).toHaveLength(4)
    })
  })
})
