import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import DocumentationViewer from './DocumentationViewer'

// @tests-contract DocumentationViewer.nullWhenClosed
// @tests-contract DocumentationViewer.fetchOnOpen
// @tests-contract DocumentationViewer.loadingState
// @tests-contract DocumentationViewer.errorState
// @tests-contract DocumentationViewer.categoryNav
// @tests-contract DocumentationViewer.categorySwitch
// @tests-contract DocumentationViewer.apiDocs
// @tests-contract DocumentationViewer.docContent
// @tests-contract DocumentationViewer.closeButtons

// Mock lucide-react icons
vi.mock('lucide-react', () => {
  const React = require('react')
  return {
    X: (props) => React.createElement('span', { 'data-testid': 'icon-x', ...props }),
    ChevronLeft: (props) => React.createElement('span', { 'data-testid': 'icon-chevron-left', ...props }),
    Home: (props) => React.createElement('span', { 'data-testid': 'icon-home', ...props }),
    Book: (props) => React.createElement('span', { 'data-testid': 'icon-book', ...props }),
    Code: (props) => React.createElement('span', { 'data-testid': 'icon-code', ...props }),
    Rocket: (props) => React.createElement('span', { 'data-testid': 'icon-rocket', ...props }),
    Shield: (props) => React.createElement('span', { 'data-testid': 'icon-shield', ...props }),
  }
})

const mockUiDocs = {
  general: [
    { title: 'Getting Started Guide', content: '<h1>Welcome</h1><p>Hello world</p>' },
    { title: 'Quick Start', content: '<h1>Quick Start</h1><p>Quick guide</p>' },
  ],
  deployment: [
    { title: 'Docker Deployment', content: '<h1>Docker</h1><p>Deploy with Docker</p>' },
  ],
  security: [
    { title: 'Security Best Practices', content: '<h1>Security</h1><p>Stay safe</p>' },
  ],
}

const mockApiDocs = {
  title: 'Kubamf API',
  version: '1.0.0',
  endpoints: [
    {
      method: 'GET',
      path: '/api/pods',
      description: 'List all pods',
      params: { namespace: 'string' },
      query: { limit: 'number' },
      response: { items: [] },
      streaming: { type: 'SSE' },
    },
    {
      method: 'POST',
      path: '/api/apply',
      description: 'Apply a resource',
    },
  ],
}

describe('DocumentationViewer', () => {
  let onClose

  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    onClose = vi.fn()
    global.fetch = vi.fn()
  })

  const setupFetchSuccess = () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/docs/ui') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockUiDocs),
        })
      }
      if (url === '/api/docs') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockApiDocs),
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })
  }

  const setupFetchFailure = () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      })
    )
  }

  // @tests-contract DocumentationViewer.nullWhenClosed
  describe('nullWhenClosed', () => {
    it('should return null when isOpen is false', () => {
      const { container } = render(
        <DocumentationViewer isOpen={false} onClose={onClose} />
      )
      expect(container.innerHTML).toBe('')
    })

    it('should render content when isOpen is true', () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)
      expect(screen.getByText('Documentation')).toBeInTheDocument()
    })
  })

  // @tests-contract DocumentationViewer.fetchOnOpen
  describe('fetchOnOpen', () => {
    it('should fetch /api/docs/ui and /api/docs when opened', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/docs/ui')
        expect(global.fetch).toHaveBeenCalledWith('/api/docs')
      })
    })

    it('should not fetch when isOpen is false', () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={false} onClose={onClose} />)
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  // @tests-contract DocumentationViewer.loadingState
  describe('loadingState', () => {
    it('should show loading message while fetching', () => {
      global.fetch = vi.fn(() => new Promise(() => {}))
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)
      expect(screen.getByText('Loading documentation...')).toBeInTheDocument()
    })
  })

  // @tests-contract DocumentationViewer.errorState
  describe('errorState', () => {
    it('should show error message if fetch fails', async () => {
      setupFetchFailure()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load documentation')).toBeInTheDocument()
      })
    })
  })

  // @tests-contract DocumentationViewer.categoryNav
  describe('categoryNav', () => {
    it('should render all 4 category buttons in sidebar', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(screen.getByText('Getting Started')).toBeInTheDocument()
      })

      expect(screen.getByText('Deployment')).toBeInTheDocument()
      expect(screen.getByText('API Reference')).toBeInTheDocument()
      expect(screen.getByText('Security')).toBeInTheDocument()
    })

    it('should show Getting Started as active by default', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        const gsButton = screen.getByText('Getting Started').closest('button')
        expect(gsButton).toHaveClass('bg-blue-100')
      })
    })
  })

  // @tests-contract DocumentationViewer.categorySwitch
  describe('categorySwitch', () => {
    it('should switch between categories when clicked', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading documentation...')).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Deployment'))
      const deployButton = screen.getByText('Deployment').closest('button')
      expect(deployButton).toHaveClass('bg-blue-100')
    })

    it('should switch to Security category', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading documentation...')).not.toBeInTheDocument()
      })

      const nav = document.querySelector('nav')
      const secButton = Array.from(nav.querySelectorAll('button')).find(b => b.textContent.includes('Security'))
      fireEvent.click(secButton)
      expect(secButton).toHaveClass('bg-blue-100')
    })
  })

  // @tests-contract DocumentationViewer.apiDocs
  describe('apiDocs', () => {
    it('should render API endpoint documentation when API category selected', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading documentation...')).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('API Reference'))

      await waitFor(() => {
        expect(screen.getByText('Kubamf API')).toBeInTheDocument()
      })

      expect(screen.getByText('Version: 1.0.0')).toBeInTheDocument()
      expect(screen.getByText('Endpoints')).toBeInTheDocument()
      expect(screen.getByText('GET')).toBeInTheDocument()
      expect(screen.getByText('List all pods')).toBeInTheDocument()
      expect(screen.getByText('POST')).toBeInTheDocument()
      expect(screen.getByText('Apply a resource')).toBeInTheDocument()
    })

    it('should show parameters, query, response and streaming sections', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading documentation...')).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('API Reference'))

      await waitFor(() => {
        expect(screen.getByText('Parameters:')).toBeInTheDocument()
      })

      expect(screen.getByText('Query Parameters:')).toBeInTheDocument()
      expect(screen.getByText('Response:')).toBeInTheDocument()
      expect(screen.getByText('Streaming Response (SSE):')).toBeInTheDocument()
    })
  })

  // @tests-contract DocumentationViewer.docContent
  describe('docContent', () => {
    it('should render doc content via dangerouslySetInnerHTML for non-API categories', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading documentation...')).not.toBeInTheDocument()
      })

      await waitFor(() => {
        expect(screen.getByText('Hello world')).toBeInTheDocument()
      })
    })

    it('should show sub-items in sidebar for active category', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading documentation...')).not.toBeInTheDocument()
      })

      await waitFor(() => {
        expect(screen.getByText('Getting Started Guide')).toBeInTheDocument()
        expect(screen.getByText('Quick Start')).toBeInTheDocument()
      })
    })

    it('should switch doc content when sub-item is clicked', async () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading documentation...')).not.toBeInTheDocument()
      })

      await waitFor(() => {
        expect(screen.getByText('Quick Start')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Quick Start'))

      await waitFor(() => {
        expect(screen.getByText('Quick guide')).toBeInTheDocument()
      })
    })
  })

  // @tests-contract DocumentationViewer.closeButtons
  describe('closeButtons', () => {
    it('should call onClose from back button', () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      const backButton = screen.getByTitle('Back to App')
      fireEvent.click(backButton)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose from close button', () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      const closeButton = screen.getByTitle('Close')
      fireEvent.click(closeButton)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose from backdrop', () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)

      const backdrop = document.querySelector('.bg-black.bg-opacity-50')
      expect(backdrop).not.toBeNull()
      fireEvent.click(backdrop)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('footer', () => {
    it('should show ESC hint in footer', () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)
      expect(screen.getByText('ESC')).toBeInTheDocument()
    })

    it('should show GitHub and API JSON links in footer', () => {
      setupFetchSuccess()
      render(<DocumentationViewer isOpen={true} onClose={onClose} />)
      expect(screen.getByText('GitHub')).toBeInTheDocument()
      expect(screen.getByText('API JSON')).toBeInTheDocument()
    })
  })
})
