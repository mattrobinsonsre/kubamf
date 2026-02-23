// @tests-contract ResourceTree.loadPreferences
// @tests-contract ResourceTree.fetchCRDs
// @tests-contract ResourceTree.autoRefreshCRDs
// @tests-contract ResourceTree.toggleCategory
// @tests-contract ResourceTree.expandAll
// @tests-contract ResourceTree.collapseAll
// @tests-contract ResourceTree.resourceSelect
// @tests-contract ResourceTree.searchFilter
// @tests-contract ResourceTree.clearSearch
// @tests-contract ResourceTree.selectedHighlight
// @tests-contract ResourceTree.builtinCategories
// @tests-contract ResourceTree.customResourceSeparator

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'

// Mock dependencies before importing the component
vi.mock('../utils/api', () => ({
  kubeApi: {
    getCRDsStream: vi.fn()
  }
}))

vi.mock('../utils/preferences', () => {
  const mockPreferencesManager = {
    getExpandedCategories: vi.fn(() => new Set(['workloads'])),
    setExpandedCategories: vi.fn(() => Promise.resolve()),
  }
  return {
    default: mockPreferencesManager,
    preferencesManager: mockPreferencesManager,
  }
})

import ResourceTree from './ResourceTree'
import { kubeApi } from '../utils/api'
import preferencesManager from '../utils/preferences'

// Helper: render and flush all effects
const renderTree = async (props) => {
  let result
  await act(async () => {
    result = render(<ResourceTree {...props} />)
  })
  return result
}

describe('ResourceTree', () => {
  const defaultProps = {
    contextName: 'test-context',
    selectedResource: null,
    onResourceSelect: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    window.electronAPI = undefined
    preferencesManager.getExpandedCategories.mockReturnValue(new Set(['workloads']))
    preferencesManager.setExpandedCategories.mockResolvedValue()
    kubeApi.getCRDsStream.mockResolvedValue()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  // @tests-contract ResourceTree.builtinCategories
  describe('builtinCategories', () => {
    it('should render all 5 built-in resource categories', async () => {
      await renderTree(defaultProps)
      expect(screen.getByText('Workloads')).toBeInTheDocument()
      expect(screen.getByText('Services & Networking')).toBeInTheDocument()
      expect(screen.getByText('Config & Storage')).toBeInTheDocument()
      expect(screen.getByText('Security & Access')).toBeInTheDocument()
      expect(screen.getByText('Cluster')).toBeInTheDocument()
    })

    it('should show Workloads with 7 resources when expanded', async () => {
      await renderTree(defaultProps)
      expect(screen.getByText('Pods')).toBeInTheDocument()
      expect(screen.getByText('Deployments')).toBeInTheDocument()
      expect(screen.getByText('ReplicaSets')).toBeInTheDocument()
      expect(screen.getByText('StatefulSets')).toBeInTheDocument()
      expect(screen.getByText('DaemonSets')).toBeInTheDocument()
      expect(screen.getByText('Jobs')).toBeInTheDocument()
      expect(screen.getByText('CronJobs')).toBeInTheDocument()
    })

    it('should show Services & Networking with 4 resources when expanded', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['networking']))
      await renderTree(defaultProps)
      expect(screen.getByText('Services')).toBeInTheDocument()
      expect(screen.getByText('Ingresses')).toBeInTheDocument()
      expect(screen.getByText('NetworkPolicies')).toBeInTheDocument()
      expect(screen.getByText('Endpoints')).toBeInTheDocument()
    })

    it('should show Config & Storage with 5 resources when expanded', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['config']))
      await renderTree(defaultProps)
      expect(screen.getByText('ConfigMaps')).toBeInTheDocument()
      expect(screen.getByText('Secrets')).toBeInTheDocument()
      expect(screen.getByText('PersistentVolumes')).toBeInTheDocument()
      expect(screen.getByText('PersistentVolumeClaims')).toBeInTheDocument()
      expect(screen.getByText('StorageClasses')).toBeInTheDocument()
    })

    it('should show Security & Access with 5 resources when expanded', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['security']))
      await renderTree(defaultProps)
      expect(screen.getByText('ServiceAccounts')).toBeInTheDocument()
      expect(screen.getByText('Roles')).toBeInTheDocument()
      expect(screen.getByText('ClusterRoles')).toBeInTheDocument()
      expect(screen.getByText('RoleBindings')).toBeInTheDocument()
      expect(screen.getByText('ClusterRoleBindings')).toBeInTheDocument()
    })

    it('should show Cluster with 4 resources when expanded', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['cluster']))
      await renderTree(defaultProps)
      expect(screen.getByText('Nodes')).toBeInTheDocument()
      expect(screen.getByText('Namespaces')).toBeInTheDocument()
      expect(screen.getByText('Events')).toBeInTheDocument()
      expect(screen.getByText('CustomResourceDefinitions')).toBeInTheDocument()
    })
  })

  // @tests-contract ResourceTree.loadPreferences
  describe('loadPreferences', () => {
    it('should load expanded categories from preferences on mount', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['workloads', 'networking']))
      await renderTree(defaultProps)
      expect(preferencesManager.getExpandedCategories).toHaveBeenCalled()
      expect(screen.getByText('Pods')).toBeInTheDocument()
      expect(screen.getByText('Services')).toBeInTheDocument()
    })

    it('should show no expanded categories when preferences returns empty set', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set())
      await renderTree(defaultProps)
      expect(screen.queryByText('Pods')).not.toBeInTheDocument()
      expect(screen.queryByText('Services')).not.toBeInTheDocument()
    })

    it('should call getExpandedCategories once on mount', async () => {
      await renderTree(defaultProps)
      expect(preferencesManager.getExpandedCategories).toHaveBeenCalledTimes(1)
    })
  })

  // @tests-contract ResourceTree.fetchCRDs
  describe('fetchCRDs', () => {
    it('should fetch CRDs via Electron API when electronAPI is available', async () => {
      const getCRDsMock = vi.fn().mockResolvedValue({ success: true, data: { items: [] } })
      window.electronAPI = { kubectl: { getCRDs: getCRDsMock } }
      await renderTree(defaultProps)
      expect(getCRDsMock).toHaveBeenCalledWith('test-context')
    })

    it('should fetch CRDs via web streaming API when electronAPI is not available', async () => {
      await renderTree(defaultProps)
      expect(kubeApi.getCRDsStream).toHaveBeenCalledWith(
        'test-context',
        expect.any(Function),
        expect.any(Function)
      )
    })

    it('should not fetch CRDs when contextName is falsy', async () => {
      const getCRDsMock = vi.fn()
      window.electronAPI = { kubectl: { getCRDs: getCRDsMock } }
      await renderTree({ ...defaultProps, contextName: '' })
      expect(getCRDsMock).not.toHaveBeenCalled()
      expect(kubeApi.getCRDsStream).not.toHaveBeenCalled()
    })

    it('should handle fetch errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const getCRDsMock = vi.fn().mockRejectedValue(new Error('fetch failed'))
      window.electronAPI = { kubectl: { getCRDs: getCRDsMock } }
      await renderTree(defaultProps)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should organize CRDs into custom resource categories', async () => {
      const mockCRDs = [{
        spec: {
          group: 'example.com',
          versions: [{ name: 'v1' }],
          names: { plural: 'widgets', kind: 'Widget' },
          scope: 'Namespaced'
        }
      }]
      const getCRDsMock = vi.fn().mockResolvedValue({ success: true, data: { items: mockCRDs } })
      window.electronAPI = { kubectl: { getCRDs: getCRDsMock } }
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['workloads', 'api-example-com']))
      await renderTree(defaultProps)
      await waitFor(() => {
        expect(screen.getByText('example.com')).toBeInTheDocument()
        expect(screen.getByText('widgets')).toBeInTheDocument()
      })
    })

    it('should re-fetch CRDs when contextName changes', async () => {
      const getCRDsMock = vi.fn().mockResolvedValue({ success: true, data: { items: [] } })
      window.electronAPI = { kubectl: { getCRDs: getCRDsMock } }
      const { rerender } = await renderTree(defaultProps)
      expect(getCRDsMock).toHaveBeenCalledTimes(1)
      await act(async () => {
        rerender(<ResourceTree {...defaultProps} contextName="new-context" />)
      })
      expect(getCRDsMock).toHaveBeenCalledTimes(2)
      expect(getCRDsMock).toHaveBeenCalledWith('new-context')
    })
  })

  // @tests-contract ResourceTree.autoRefreshCRDs
  describe('autoRefreshCRDs', () => {
    it('should auto-refresh CRDs every 30 seconds', async () => {
      const getCRDsMock = vi.fn().mockResolvedValue({ success: true, data: { items: [] } })
      window.electronAPI = { kubectl: { getCRDs: getCRDsMock } }
      await renderTree(defaultProps)
      expect(getCRDsMock).toHaveBeenCalledTimes(1)
      await act(async () => { vi.advanceTimersByTime(30000) })
      expect(getCRDsMock).toHaveBeenCalledTimes(2)
      await act(async () => { vi.advanceTimersByTime(30000) })
      expect(getCRDsMock).toHaveBeenCalledTimes(3)
    })

    it('should clear interval on unmount', async () => {
      const getCRDsMock = vi.fn().mockResolvedValue({ success: true, data: { items: [] } })
      window.electronAPI = { kubectl: { getCRDs: getCRDsMock } }
      const { unmount } = await renderTree(defaultProps)
      expect(getCRDsMock).toHaveBeenCalledTimes(1)
      unmount()
      await act(async () => { vi.advanceTimersByTime(60000) })
      expect(getCRDsMock).toHaveBeenCalledTimes(1)
    })

    it('should not set up interval when contextName is empty', async () => {
      const getCRDsMock = vi.fn()
      window.electronAPI = { kubectl: { getCRDs: getCRDsMock } }
      await renderTree({ ...defaultProps, contextName: '' })
      await act(async () => { vi.advanceTimersByTime(60000) })
      expect(getCRDsMock).not.toHaveBeenCalled()
    })
  })

  // @tests-contract ResourceTree.toggleCategory
  describe('toggleCategory', () => {
    it('should expand a collapsed category when clicked', async () => {
      await renderTree(defaultProps)
      expect(screen.queryByText('Services')).not.toBeInTheDocument()
      await act(async () => { fireEvent.click(screen.getByText('Services & Networking')) })
      expect(screen.getByText('Services')).toBeInTheDocument()
    })

    it('should collapse an expanded category when clicked', async () => {
      await renderTree(defaultProps)
      expect(screen.getByText('Pods')).toBeInTheDocument()
      await act(async () => { fireEvent.click(screen.getByText('Workloads')) })
      expect(screen.queryByText('Pods')).not.toBeInTheDocument()
    })

    it('should save expanded categories to preferences after toggle', async () => {
      await renderTree(defaultProps)
      await act(async () => { fireEvent.click(screen.getByText('Services & Networking')) })
      expect(preferencesManager.setExpandedCategories).toHaveBeenCalled()
      const savedSet = preferencesManager.setExpandedCategories.mock.calls[0][0]
      expect(savedSet.has('networking')).toBe(true)
      expect(savedSet.has('workloads')).toBe(true)
    })
  })

  // @tests-contract ResourceTree.expandAll
  describe('expandAll', () => {
    it('should expand all categories when Expand All button is clicked', async () => {
      await renderTree(defaultProps)
      expect(screen.queryByText('Services')).not.toBeInTheDocument()
      await act(async () => { fireEvent.click(screen.getByTitle('Expand All')) })
      expect(screen.getByText('Pods')).toBeInTheDocument()
      expect(screen.getByText('Services')).toBeInTheDocument()
      expect(screen.getByText('ConfigMaps')).toBeInTheDocument()
      expect(screen.getByText('ServiceAccounts')).toBeInTheDocument()
      expect(screen.getByText('Nodes')).toBeInTheDocument()
    })

    it('should save all expanded categories to preferences', async () => {
      await renderTree(defaultProps)
      await act(async () => { fireEvent.click(screen.getByTitle('Expand All')) })
      expect(preferencesManager.setExpandedCategories).toHaveBeenCalledWith(expect.any(Set))
      const savedSet = preferencesManager.setExpandedCategories.mock.calls[0][0]
      expect(savedSet.has('workloads')).toBe(true)
      expect(savedSet.has('networking')).toBe(true)
      expect(savedSet.has('config')).toBe(true)
      expect(savedSet.has('security')).toBe(true)
      expect(savedSet.has('cluster')).toBe(true)
    })
  })

  // @tests-contract ResourceTree.collapseAll
  describe('collapseAll', () => {
    it('should collapse all categories when Collapse All button is clicked', async () => {
      await renderTree(defaultProps)
      expect(screen.getByText('Pods')).toBeInTheDocument()
      await act(async () => { fireEvent.click(screen.getByTitle('Collapse All')) })
      expect(screen.queryByText('Pods')).not.toBeInTheDocument()
    })

    it('should save empty set to preferences', async () => {
      await renderTree(defaultProps)
      await act(async () => { fireEvent.click(screen.getByTitle('Collapse All')) })
      expect(preferencesManager.setExpandedCategories).toHaveBeenCalledWith(new Set())
    })
  })

  // @tests-contract ResourceTree.resourceSelect
  describe('resourceSelect', () => {
    it('should call onResourceSelect when a resource is clicked', async () => {
      const onResourceSelect = vi.fn()
      await renderTree({ ...defaultProps, onResourceSelect })
      await act(async () => { fireEvent.click(screen.getByText('Pods')) })
      expect(onResourceSelect).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'Pods', kind: 'Pod' })
      )
    })

    it('should pass the full resource object to onResourceSelect', async () => {
      const onResourceSelect = vi.fn()
      await renderTree({ ...defaultProps, onResourceSelect })
      await act(async () => { fireEvent.click(screen.getByText('Deployments')) })
      expect(onResourceSelect).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'Deployments', kind: 'Deployment', scope: 'Namespaced' })
      )
    })
  })

  // @tests-contract ResourceTree.searchFilter
  describe('searchFilter', () => {
    it('should filter resources by type name', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(
        new Set(['workloads', 'networking', 'config', 'security', 'cluster'])
      )
      await renderTree(defaultProps)
      const searchInput = screen.getByPlaceholderText('Search')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'pod' } }) })
      expect(screen.getByText('Pods')).toBeInTheDocument()
      expect(screen.queryByText('Services')).not.toBeInTheDocument()
    })

    it('should be case insensitive', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['workloads']))
      await renderTree(defaultProps)
      const searchInput = screen.getByPlaceholderText('Search')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'POD' } }) })
      expect(screen.getByText('Pods')).toBeInTheDocument()
    })

    it('should hide categories with no matching resources', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['workloads', 'networking']))
      await renderTree(defaultProps)
      const searchInput = screen.getByPlaceholderText('Search')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'pod' } }) })
      expect(screen.getByText('Workloads')).toBeInTheDocument()
      expect(screen.queryByText('Services & Networking')).not.toBeInTheDocument()
    })

    it('should hide expand/collapse buttons during search', async () => {
      await renderTree(defaultProps)
      expect(screen.getByTitle('Expand All')).toBeInTheDocument()
      const searchInput = screen.getByPlaceholderText('Search')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'pod' } }) })
      expect(screen.queryByTitle('Expand All')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Collapse All')).not.toBeInTheDocument()
    })

    it('should match partial type names', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['workloads']))
      await renderTree(defaultProps)
      const searchInput = screen.getByPlaceholderText('Search')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'Set' } }) })
      expect(screen.getByText('ReplicaSets')).toBeInTheDocument()
      expect(screen.getByText('StatefulSets')).toBeInTheDocument()
      expect(screen.getByText('DaemonSets')).toBeInTheDocument()
      expect(screen.queryByText('Pods')).not.toBeInTheDocument()
    })
  })

  // @tests-contract ResourceTree.clearSearch
  describe('clearSearch', () => {
    it('should show clear button when search term is non-empty', async () => {
      await renderTree(defaultProps)
      const searchInput = screen.getByPlaceholderText('Search')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'pod' } }) })
      const buttons = screen.getAllByRole('button')
      const clearButton = buttons.find(btn => btn.className.includes('absolute right-2.5'))
      expect(clearButton).toBeTruthy()
    })

    it('should not show clear button when search term is empty', async () => {
      await renderTree(defaultProps)
      const buttons = screen.getAllByRole('button')
      const clearButton = buttons.find(btn => btn.className.includes('absolute right-2.5'))
      expect(clearButton).toBeFalsy()
    })

    it('should clear the search and restore all resources', async () => {
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['workloads', 'networking']))
      await renderTree(defaultProps)
      const searchInput = screen.getByPlaceholderText('Search')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'pod' } }) })
      expect(screen.queryByText('Services')).not.toBeInTheDocument()
      const buttons = screen.getAllByRole('button')
      const clearButton = buttons.find(btn => btn.className.includes('absolute right-2.5'))
      await act(async () => { fireEvent.click(clearButton) })
      expect(screen.getByText('Services')).toBeInTheDocument()
      expect(screen.getByText('Pods')).toBeInTheDocument()
    })

    it('should restore expand/collapse buttons after clearing search', async () => {
      await renderTree(defaultProps)
      const searchInput = screen.getByPlaceholderText('Search')
      await act(async () => { fireEvent.change(searchInput, { target: { value: 'pod' } }) })
      expect(screen.queryByTitle('Expand All')).not.toBeInTheDocument()
      const buttons = screen.getAllByRole('button')
      const clearButton = buttons.find(btn => btn.className.includes('absolute right-2.5'))
      await act(async () => { fireEvent.click(clearButton) })
      expect(screen.getByTitle('Expand All')).toBeInTheDocument()
    })
  })

  // @tests-contract ResourceTree.selectedHighlight
  describe('selectedHighlight', () => {
    it('should highlight the currently selected resource', async () => {
      await renderTree({ ...defaultProps, selectedResource: { type: 'Pods', kind: 'Pod' } })
      const podsButton = screen.getByText('Pods').closest('button')
      expect(podsButton.className).toContain('bg-blue-100')
    })

    it('should not highlight non-selected resources', async () => {
      await renderTree({ ...defaultProps, selectedResource: { type: 'Pods', kind: 'Pod' } })
      const deploymentsButton = screen.getByText('Deployments').closest('button')
      expect(deploymentsButton.className).not.toContain('bg-blue-100')
    })

    it('should not highlight anything when selectedResource is null', async () => {
      await renderTree({ ...defaultProps, selectedResource: null })
      const podsButton = screen.getByText('Pods').closest('button')
      expect(podsButton.className).not.toContain('bg-blue-100')
    })
  })

  // @tests-contract ResourceTree.customResourceSeparator
  describe('customResourceSeparator', () => {
    it('should show Custom Resources separator when custom resources exist', async () => {
      const mockCRDs = [{
        spec: {
          group: 'custom.example.com',
          versions: [{ name: 'v1' }],
          names: { plural: 'myresources', kind: 'MyResource' },
          scope: 'Namespaced'
        }
      }]
      const getCRDsMock = vi.fn().mockResolvedValue({ success: true, data: { items: mockCRDs } })
      window.electronAPI = { kubectl: { getCRDs: getCRDsMock } }
      preferencesManager.getExpandedCategories.mockReturnValue(new Set(['workloads', 'api-custom-example-com']))
      await renderTree(defaultProps)
      await waitFor(() => { expect(screen.getByText('Custom Resources')).toBeInTheDocument() })
    })

    it('should not show separator when there are no custom resources', async () => {
      await renderTree(defaultProps)
      expect(screen.queryByText('Custom Resources')).not.toBeInTheDocument()
    })
  })
})
