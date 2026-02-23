import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExpandButton from './ExpandButton'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronDown: ({ size, className, ...props }) => (
    <svg data-testid="chevron-down" data-size={size} className={className} {...props} />
  ),
  ChevronRight: ({ size, className, ...props }) => (
    <svg data-testid="chevron-right" data-size={size} className={className} {...props} />
  ),
}))

describe('ExpandButton', () => {
  const mockOnClick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // @tests-contract ExpandButton.expandedIcon
  describe('expandedIcon', () => {
    it('should show ChevronDown icon when isExpanded is true', () => {
      render(<ExpandButton isExpanded={true} onClick={mockOnClick} />)
      expect(screen.getByTestId('chevron-down')).toBeInTheDocument()
      expect(screen.queryByTestId('chevron-right')).not.toBeInTheDocument()
    })
  })

  // @tests-contract ExpandButton.collapsedIcon
  describe('collapsedIcon', () => {
    it('should show ChevronRight icon when isExpanded is false', () => {
      render(<ExpandButton isExpanded={false} onClick={mockOnClick} />)
      expect(screen.getByTestId('chevron-right')).toBeInTheDocument()
      expect(screen.queryByTestId('chevron-down')).not.toBeInTheDocument()
    })
  })

  // @tests-contract ExpandButton.stopPropagation
  describe('stopPropagation', () => {
    it('should stop event propagation when button is clicked', () => {
      const parentClickHandler = vi.fn()
      render(
        <div onClick={parentClickHandler}>
          <ExpandButton isExpanded={false} onClick={mockOnClick} />
        </div>
      )

      const button = screen.getByRole('button')
      fireEvent.click(button)

      expect(parentClickHandler).not.toHaveBeenCalled()
    })
  })

  // @tests-contract ExpandButton.callbackOnClick
  describe('callbackOnClick', () => {
    it('should call onClick callback when the button is clicked', () => {
      render(<ExpandButton isExpanded={false} onClick={mockOnClick} />)

      const button = screen.getByRole('button')
      fireEvent.click(button)

      expect(mockOnClick).toHaveBeenCalledTimes(1)
    })

    it('should call onClick on each click', () => {
      render(<ExpandButton isExpanded={false} onClick={mockOnClick} />)

      const button = screen.getByRole('button')
      fireEvent.click(button)
      fireEvent.click(button)

      expect(mockOnClick).toHaveBeenCalledTimes(2)
    })
  })

  describe('defaults', () => {
    it('should render with default className when not provided', () => {
      render(<ExpandButton isExpanded={false} onClick={mockOnClick} />)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('p-0.5', 'rounded', 'transition-colors')
    })

    it('should apply custom className when provided', () => {
      render(<ExpandButton isExpanded={false} onClick={mockOnClick} className="custom-class" />)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('custom-class')
    })

    it('should pass default size of 14 to the icon', () => {
      render(<ExpandButton isExpanded={false} onClick={mockOnClick} />)
      const icon = screen.getByTestId('chevron-right')
      expect(icon).toHaveAttribute('data-size', '14')
    })

    it('should pass custom size to the icon', () => {
      render(<ExpandButton isExpanded={false} onClick={mockOnClick} size={20} />)
      const icon = screen.getByTestId('chevron-right')
      expect(icon).toHaveAttribute('data-size', '20')
    })
  })
})
