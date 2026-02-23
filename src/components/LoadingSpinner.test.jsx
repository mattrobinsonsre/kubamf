import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingSpinner from './LoadingSpinner'

describe('LoadingSpinner', () => {
  // @tests-contract LoadingSpinner.render
  describe('render', () => {
    it('should render a spinner element with role="status"', () => {
      render(<LoadingSpinner />)
      const spinner = screen.getByRole('status')
      expect(spinner).toBeInTheDocument()
    })

    it('should have aria-label="Loading"', () => {
      render(<LoadingSpinner />)
      const spinner = screen.getByRole('status')
      expect(spinner).toHaveAttribute('aria-label', 'Loading')
    })

    it('should contain a screen-reader-only "Loading..." text', () => {
      render(<LoadingSpinner />)
      const srText = screen.getByText('Loading...')
      expect(srText).toBeInTheDocument()
      expect(srText).toHaveClass('sr-only')
    })

    it('should render with animate-spin class for animation', () => {
      render(<LoadingSpinner />)
      const spinner = screen.getByRole('status')
      expect(spinner).toHaveClass('animate-spin')
    })
  })

  // @tests-contract LoadingSpinner.sizes
  describe('sizes', () => {
    it('should apply w-4 h-4 classes for small size', () => {
      render(<LoadingSpinner size="small" />)
      const spinner = screen.getByRole('status')
      expect(spinner).toHaveClass('w-4', 'h-4')
    })

    it('should apply w-6 h-6 classes for medium size', () => {
      render(<LoadingSpinner size="medium" />)
      const spinner = screen.getByRole('status')
      expect(spinner).toHaveClass('w-6', 'h-6')
    })

    it('should apply w-8 h-8 classes for large size', () => {
      render(<LoadingSpinner size="large" />)
      const spinner = screen.getByRole('status')
      expect(spinner).toHaveClass('w-8', 'h-8')
    })

    it('should apply w-12 h-12 classes for xlarge size', () => {
      render(<LoadingSpinner size="xlarge" />)
      const spinner = screen.getByRole('status')
      expect(spinner).toHaveClass('w-12', 'h-12')
    })
  })

  // @tests-contract LoadingSpinner.defaultSize
  describe('defaultSize', () => {
    it('should default to medium size (w-6 h-6) when no size prop is provided', () => {
      render(<LoadingSpinner />)
      const spinner = screen.getByRole('status')
      expect(spinner).toHaveClass('w-6', 'h-6')
    })
  })

  // @tests-contract LoadingSpinner.customClass
  describe('customClass', () => {
    it('should apply additional className to the wrapper div', () => {
      const { container } = render(<LoadingSpinner className="my-custom-class" />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('my-custom-class')
      expect(wrapper).toHaveClass('inline-flex', 'items-center', 'justify-center')
    })

    it('should not add extra classes when className is empty (default)', () => {
      const { container } = render(<LoadingSpinner />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('inline-flex', 'items-center', 'justify-center')
    })
  })
})
