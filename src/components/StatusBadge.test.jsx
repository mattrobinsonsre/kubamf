import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  const mockGetStatusColor = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStatusColor.mockReturnValue('bg-green-100 text-green-800')
  })

  // @tests-contract StatusBadge.render
  describe('render', () => {
    it('should render the status text inside a span', () => {
      render(<StatusBadge status="Running" getStatusColor={mockGetStatusColor} />)
      expect(screen.getByText('Running')).toBeInTheDocument()
    })

    it('should render as an inline-flex span with rounded-full class', () => {
      render(<StatusBadge status="Running" getStatusColor={mockGetStatusColor} />)
      const badge = screen.getByText('Running')
      expect(badge.tagName).toBe('SPAN')
      expect(badge).toHaveClass('inline-flex', 'rounded-full')
    })

    it('should render different status texts correctly', () => {
      const { rerender } = render(<StatusBadge status="Pending" getStatusColor={mockGetStatusColor} />)
      expect(screen.getByText('Pending')).toBeInTheDocument()

      rerender(<StatusBadge status="Failed" getStatusColor={mockGetStatusColor} />)
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })
  })

  // @tests-contract StatusBadge.sizes
  describe('sizes', () => {
    it('should apply normal size classes by default (px-1.5 py-0.5 text-xs font-semibold)', () => {
      render(<StatusBadge status="Running" getStatusColor={mockGetStatusColor} />)
      const badge = screen.getByText('Running')
      expect(badge).toHaveClass('px-1.5', 'py-0.5', 'text-xs', 'font-semibold')
    })

    it('should apply small size classes when size="small" (px-1 py-0.5 text-xs)', () => {
      render(<StatusBadge status="Running" getStatusColor={mockGetStatusColor} size="small" />)
      const badge = screen.getByText('Running')
      expect(badge).toHaveClass('px-1', 'py-0.5', 'text-xs')
      expect(badge).not.toHaveClass('font-semibold')
    })

    it('should apply normal size classes when size="normal"', () => {
      render(<StatusBadge status="Running" getStatusColor={mockGetStatusColor} size="normal" />)
      const badge = screen.getByText('Running')
      expect(badge).toHaveClass('px-1.5', 'py-0.5', 'text-xs', 'font-semibold')
    })
  })

  // @tests-contract StatusBadge.colorCallback
  describe('colorCallback', () => {
    it('should call getStatusColor with the status value', () => {
      render(<StatusBadge status="Running" getStatusColor={mockGetStatusColor} />)
      expect(mockGetStatusColor).toHaveBeenCalledWith('Running')
    })

    it('should apply the classes returned by getStatusColor', () => {
      mockGetStatusColor.mockReturnValue('bg-red-100 text-red-800')
      render(<StatusBadge status="Failed" getStatusColor={mockGetStatusColor} />)
      const badge = screen.getByText('Failed')
      expect(badge).toHaveClass('bg-red-100', 'text-red-800')
    })

    it('should call getStatusColor each time the component renders', () => {
      const { rerender } = render(<StatusBadge status="Running" getStatusColor={mockGetStatusColor} />)
      expect(mockGetStatusColor).toHaveBeenCalledTimes(1)

      rerender(<StatusBadge status="Pending" getStatusColor={mockGetStatusColor} />)
      expect(mockGetStatusColor).toHaveBeenCalledTimes(2)
      expect(mockGetStatusColor).toHaveBeenCalledWith('Pending')
    })
  })
})
