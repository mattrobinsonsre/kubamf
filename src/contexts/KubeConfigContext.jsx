import React, { createContext, useContext, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { kubeApi } from '../utils/api'
import sseManager from '../utils/sse'

const KubeConfigContext = createContext()

export const useKubeConfig = () => {
  const context = useContext(KubeConfigContext)
  if (!context) {
    throw new Error('useKubeConfig must be used within a KubeConfigProvider')
  }
  return context
}

export const KubeConfigProvider = ({ children }) => {
  const [currentContext, setCurrentContext] = useState('')
  const [connectionStates, setConnectionStates] = useState({})
  const [sseStatus, setSseStatus] = useState({ connected: false, type: 'none' })
  const queryClient = useQueryClient()

  // Check if running in Electron
  const isElectron = window.electronAPI?.isElectron || false
  const kubectlAPI = window.electronAPI?.kubectl

  // Fetch kubeconfig contexts
  const { data: kubeConfigData, isLoading, error } = useQuery({
    queryKey: ['kubeconfig'],
    queryFn: kubeApi.getContexts,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const contexts = kubeConfigData || []

  // Set initial context
  useEffect(() => {
    if (contexts.length > 0 && !currentContext) {
      const saved = localStorage.getItem('kubamf-current-context')
      const defaultContext = saved && contexts.find(c => c.name === saved)
        ? saved
        : contexts.find(c => c.current)?.name || contexts[0]?.name

      if (defaultContext) {
        setCurrentContext(defaultContext)
      }
    }
  }, [contexts, currentContext])

  // Initialize SSE connection
  useEffect(() => {
    // Connect to SSE (only in web mode, not Electron)
    sseManager.connect()

    // Set up SSE event listeners
    const unsubscribeStatus = sseManager.on('connection-status', (data) => {
      setSseStatus(prev => ({ ...prev, connected: data.connected }))
    })

    const unsubscribeClusterStatus = sseManager.on('cluster-status', (data) => {
      setConnectionStates(prev => ({
        ...prev,
        [data.context]: data.connected
      }))
    })

    const unsubscribeContextList = sseManager.on('context-list-update', (data) => {
      // Invalidate kubeconfig query to refresh context list
      queryClient.invalidateQueries({ queryKey: ['kubeconfig'] })
    })

    const unsubscribeResourceChange = sseManager.on('resource-change', (data) => {
      // Invalidate resource queries when resources change
      queryClient.invalidateQueries({ queryKey: ['resources'] })
    })

    // Get initial SSE status
    setSseStatus(sseManager.getStatus())

    // Cleanup function
    return () => {
      unsubscribeStatus()
      unsubscribeClusterStatus()
      unsubscribeContextList()
      unsubscribeResourceChange()
      sseManager.disconnect()
    }
  }, [])

  const switchContext = (contextName) => {
    setCurrentContext(contextName)
    localStorage.setItem('kubamf-current-context', contextName)
    // Invalidate all resource queries when switching context
    queryClient.invalidateQueries({ queryKey: ['resources'] })
  }

  const checkConnection = async (contextName) => {
    try {
      await kubeApi.checkConnection(contextName)
      setConnectionStates(prev => ({ ...prev, [contextName]: true }))
      return true
    } catch (error) {
      setConnectionStates(prev => ({ ...prev, [contextName]: false }))
      return false
    }
  }

  const value = {
    contexts,
    currentContext,
    connectionStates,
    sseStatus,
    isLoading,
    error,
    isElectron,
    kubectlAPI,
    switchContext,
    checkConnection,
  }

  return (
    <KubeConfigContext.Provider value={value}>
      {children}
    </KubeConfigContext.Provider>
  )
}