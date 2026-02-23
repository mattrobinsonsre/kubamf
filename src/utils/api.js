import axios from 'axios'
import { frontendConfig } from './config'

// Use the centralized frontend configuration system
const getApiConfig = () => {
  const config = frontendConfig
  return {
    isElectron: config.isElectron(),
    apiBaseUrl: config.getApiUrl(),
    timeout: 30000
  }
}

const { isElectron, apiBaseUrl } = getApiConfig()

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 30000,
})

// Add request interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

// Helper function to handle Electron IPC vs HTTP API
const apiCall = async (electronMethod, httpCall) => {
  if (isElectron && window.electronAPI?.kubectl) {
    const result = await electronMethod()
    if (result.success) {
      return result.data
    } else {
      throw new Error(result.error)
    }
  } else {
    const response = await httpCall()
    return response.data
  }
}

export const kubeApi = {
  // Kubeconfig operations
  getContexts: async () => {
    return apiCall(
      () => window.electronAPI.kubectl.getContexts(),
      () => api.get('/kubeconfig/contexts')
    )
  },

  checkConnection: async (context) => {
    return apiCall(
      () => window.electronAPI.kubectl.checkConnection(context),
      () => api.post('/kubeconfig/check-connection', { context })
    )
  },

  // Resource operations
  getResources: async (context, resourceType, namespace = '', options = {}) => {
    const params = new URLSearchParams({ resourceType })
    if (namespace) params.append('namespace', namespace)

    // For streaming support
    if (options.stream) {
      params.append('stream', 'true')
    }

    // Regular non-streaming request
    if (!options.stream) {
      const response = await api.get(`/contexts/${context}/resources?${params}`)
      return response.data
    }

    // Return EventSource for streaming
    const url = `${apiBaseUrl}/contexts/${context}/resources?${params}`
    return new EventSource(url)
  },

  getResourcesStream: async (context, resourceType, namespace = '', onData, onComplete) => {
    const params = new URLSearchParams({ resourceType, stream: 'true' })
    if (namespace) params.append('namespace', namespace)

    const eventSource = new EventSource(`${apiBaseUrl}/contexts/${context}/resources?${params}`)

    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close()
        if (onComplete) onComplete()
      } else {
        try {
          const data = JSON.parse(event.data)
          if (onData) onData(data)
        } catch (error) {
          console.error('Error parsing SSE data:', error)
        }
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE error:', error)
      eventSource.close()
      if (onComplete) onComplete(error)
    }

    return eventSource
  },

  getNamespaces: async (context) => {
    return apiCall(
      () => window.electronAPI.kubectl.getNamespaces(context),
      () => api.get(`/contexts/${context}/resources/namespaces`)
    )
  },

  getNamespacesStream: async (context, onData, onComplete) => {
    const eventSource = new EventSource(`${apiBaseUrl}/contexts/${context}/resources/namespaces?stream=true`)

    let allItems = []
    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close()
        if (onComplete) onComplete({ items: allItems })
      } else {
        try {
          const data = JSON.parse(event.data)
          if (data.error) {
            throw new Error(data.error)
          }
          allItems = [...allItems, ...(data.items || [])]
          if (onData) onData({ items: allItems, progress: data.progress })
        } catch (error) {
          console.error('Error parsing SSE data:', error)
          eventSource.close()
          if (onComplete) onComplete(null, error)
        }
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE error:', error)
      eventSource.close()
      if (onComplete) onComplete(null, error)
    }

    return eventSource
  },

  getPods: async (context, namespace = '') => {
    return apiCall(
      () => window.electronAPI.kubectl.getPods(context, namespace),
      () => {
        const params = namespace ? new URLSearchParams({ namespace }) : ''
        return api.get(`/contexts/${context}/resources/pods${params ? `?${params}` : ''}`)
      }
    )
  },

  getPodContainers: async (context, namespace, podName) => {
    return apiCall(
      () => window.electronAPI.kubectl.getPodContainers(context, namespace, podName),
      () => api.get(`/contexts/${context}/resources/pods/${namespace}/${podName}/containers`)
    )
  },

  getServices: async (context, namespace = '') => {
    return apiCall(
      () => window.electronAPI.kubectl.getServices(context, namespace),
      () => {
        const params = namespace ? new URLSearchParams({ namespace }) : ''
        return api.get(`/contexts/${context}/resources/services${params ? `?${params}` : ''}`)
      }
    )
  },

  getDeployments: async (context, namespace = '') => {
    return apiCall(
      () => window.electronAPI.kubectl.getDeployments(context, namespace),
      () => {
        const params = namespace ? new URLSearchParams({ namespace }) : ''
        return api.get(`/contexts/${context}/resources/deployments${params ? `?${params}` : ''}`)
      }
    )
  },

  getConfigMaps: async (context, namespace = '') => {
    return apiCall(
      () => window.electronAPI.kubectl.getConfigMaps(context, namespace),
      () => {
        const params = namespace ? new URLSearchParams({ namespace }) : ''
        return api.get(`/contexts/${context}/resources/configmaps${params ? `?${params}` : ''}`)
      }
    )
  },

  getSecrets: async (context, namespace = '') => {
    return apiCall(
      () => window.electronAPI.kubectl.getSecrets(context, namespace),
      () => {
        const params = namespace ? new URLSearchParams({ namespace }) : ''
        return api.get(`/contexts/${context}/resources/secrets${params ? `?${params}` : ''}`)
      }
    )
  },

  getNodes: async (context) => {
    return apiCall(
      () => window.electronAPI.kubectl.getNodes(context),
      () => api.get(`/contexts/${context}/resources/nodes`)
    )
  },

  getCRDs: async (context) => {
    return apiCall(
      () => window.electronAPI.kubectl.getCRDs(context),
      () => api.get(`/contexts/${context}/resources/crds`)
    )
  },

  getCRDsStream: async (context, onData, onComplete) => {
    const eventSource = new EventSource(`${apiBaseUrl}/contexts/${context}/resources/crds?stream=true`)

    let allItems = []
    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        eventSource.close()
        if (onComplete) onComplete({ items: allItems })
      } else {
        try {
          const data = JSON.parse(event.data)
          if (data.error) {
            throw new Error(data.error)
          }
          allItems = [...allItems, ...(data.items || [])]
          if (onData) onData({ items: allItems, progress: data.progress })
        } catch (error) {
          console.error('Error parsing SSE data:', error)
          eventSource.close()
          if (onComplete) onComplete(null, error)
        }
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE error:', error)
      eventSource.close()
      if (onComplete) onComplete(null, error)
    }

    return eventSource
  },

  // Generic resource operations
  getResource: async (context, resourceType, name, namespace = '') => {
    const params = new URLSearchParams({ context, resourceType, name })
    if (namespace) params.append('namespace', namespace)

    const response = await api.get(`/resources/describe?${params}`)
    return response.data
  },

  getLogs: async (context, namespace, podName, containerName = '', follow = false) => {
    const params = new URLSearchParams()
    if (containerName) params.append('container', containerName)
    if (follow) params.append('follow', 'true')

    const response = await api.get(`/contexts/${context}/resources/logs/${namespace}/${podName}${params.toString() ? `?${params}` : ''}`)
    return response.data
  },
}

export default api