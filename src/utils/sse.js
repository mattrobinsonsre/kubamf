// Server-Sent Events utility for real-time updates in web app mode
import { frontendConfig } from './config'

class SSEManager {
  constructor() {
    this.isElectron = frontendConfig.isElectron()
    this.eventSource = null
    this.listeners = new Map()
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000 // Start with 1 second
    this.connected = false
  }

  // Initialize SSE connection (only for web app, not Electron)
  connect() {
    if (this.isElectron || this.eventSource) {
      return
    }

    try {
      this.eventSource = new EventSource('/api/events')

      this.eventSource.onopen = () => {
        console.log('SSE connection opened')
        this.connected = true
        this.reconnectAttempts = 0
        this.reconnectDelay = 1000
        this.emit('connection-status', { connected: true })
      }

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        } catch (error) {
          console.warn('Failed to parse SSE message:', error)
        }
      }

      this.eventSource.onerror = (error) => {
        console.error('SSE connection error:', error)
        this.connected = false
        this.emit('connection-status', { connected: false })

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.attemptReconnect()
        }
      }

      // Listen for specific event types
      this.setupEventListeners()
    } catch (error) {
      console.error('Failed to establish SSE connection:', error)
      this.attemptReconnect()
    }
  }

  setupEventListeners() {
    if (!this.eventSource) return

    // Resource update events
    this.eventSource.addEventListener('resource-update', (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emit('resource-update', data)
      } catch (error) {
        console.warn('Failed to parse resource-update event:', error)
      }
    })

    // Context change events
    this.eventSource.addEventListener('context-change', (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emit('context-change', data)
      } catch (error) {
        console.warn('Failed to parse context-change event:', error)
      }
    })

    // Namespace change events
    this.eventSource.addEventListener('namespace-change', (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emit('namespace-change', data)
      } catch (error) {
        console.warn('Failed to parse namespace-change event:', error)
      }
    })

    // Cluster connection events
    this.eventSource.addEventListener('cluster-status', (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emit('cluster-status', data)
      } catch (error) {
        console.warn('Failed to parse cluster-status event:', error)
      }
    })
  }

  handleMessage(data) {
    const { type, payload } = data

    switch (type) {
      case 'ping':
        // Server heartbeat
        break
      case 'resource-created':
      case 'resource-updated':
      case 'resource-deleted':
        this.emit('resource-change', { type, ...payload })
        break
      case 'namespace-created':
      case 'namespace-deleted':
        this.emit('namespace-list-change', { type, ...payload })
        break
      default:
        this.emit(type, payload)
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // Exponential backoff

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    setTimeout(() => {
      this.disconnect()
      this.connect()
    }, delay)
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
      this.connected = false
    }
  }

  // Event listener management
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType).add(callback)

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(eventType)
      if (callbacks) {
        callbacks.delete(callback)
        if (callbacks.size === 0) {
          this.listeners.delete(eventType)
        }
      }
    }
  }

  off(eventType, callback) {
    const callbacks = this.listeners.get(eventType)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.listeners.delete(eventType)
      }
    }
  }

  emit(eventType, data) {
    const callbacks = this.listeners.get(eventType)
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in SSE event callback for ${eventType}:`, error)
        }
      })
    }
  }

  // Check if SSE is available and connected
  isConnected() {
    return this.connected && this.eventSource?.readyState === EventSource.OPEN
  }

  // Get connection status
  getStatus() {
    if (this.isElectron) {
      return { type: 'electron', connected: true }
    }

    return {
      type: 'sse',
      connected: this.connected,
      readyState: this.eventSource?.readyState,
      reconnectAttempts: this.reconnectAttempts
    }
  }
}

// Create singleton instance
export const sseManager = new SSEManager()
export default sseManager