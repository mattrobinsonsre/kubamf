import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { AttachAddon } from '@xterm/addon-attach'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { X, Minimize2, Maximize2, Terminal as TerminalIcon, AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import '@xterm/xterm/css/xterm.css'

const ContainerShell = ({
  pod,
  container,
  namespace,
  contextName,
  isOpen,
  onClose
}) => {
  const { theme } = useTheme()
  const [isMinimized, setIsMinimized] = useState(false)
  const [isConnecting, setIsConnecting] = useState(true)
  const [error, setError] = useState(null)
  const [connectionClosed, setConnectionClosed] = useState(false)
  const [selectedShell, setSelectedShell] = useState(null)
  const [availableShells, setAvailableShells] = useState([])
  const [reconnectKey, setReconnectKey] = useState(0)

  const terminalRef = useRef(null)
  const terminalInstanceRef = useRef(null)
  const fitAddonRef = useRef(null)
  const wsRef = useRef(null)

  // Shell detection priority order
  const shellPriority = [
    '/bin/bash',
    '/bin/zsh',
    '/bin/sh',
    '/bin/ash',  // Alpine
    '/bin/dash',
    'bash',
    'sh'
  ]

  // Detect available shells in container
  const detectShells = async () => {
    try {
      const response = await fetch(`/api/exec/detect-shells`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace,
          pod: pod.metadata.name,
          container: container?.name || pod.spec.containers[0]?.name,
          context: contextName
        })
      })

      if (!response.ok) throw new Error('Failed to detect shells')

      const { shells } = await response.json()
      setAvailableShells(shells)

      // Select the best available shell
      for (const preferredShell of shellPriority) {
        if (shells.includes(preferredShell)) {
          setSelectedShell(preferredShell)
          return preferredShell
        }
      }

      // Fallback to first available or /bin/sh
      const fallback = shells[0] || '/bin/sh'
      setSelectedShell(fallback)
      return fallback
    } catch (err) {
      console.error('Shell detection failed:', err)
      setSelectedShell('/bin/sh')
      return '/bin/sh'
    }
  }

  // Reconnect handler
  const handleReconnect = useCallback(() => {
    // Cleanup existing connection
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose()
      terminalInstanceRef.current = null
    }
    setConnectionClosed(false)
    setError(null)
    setReconnectKey(k => k + 1)
  }, [])

  // Initialize terminal
  useEffect(() => {
    if (!isOpen || isMinimized || !terminalRef.current) return

    const initTerminal = async () => {
      setIsConnecting(true)
      setError(null)
      setConnectionClosed(false)

      try {
        // Detect available shells
        const shell = await detectShells()

        // Create terminal instance
        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: theme === 'dark' ? {
            background: '#1f2937',
            foreground: '#d1d5db',
            cursor: '#60a5fa',
            black: '#1f2937',
            red: '#ef4444',
            green: '#10b981',
            yellow: '#f59e0b',
            blue: '#3b82f6',
            magenta: '#8b5cf6',
            cyan: '#06b6d4',
            white: '#e5e7eb',
            brightBlack: '#4b5563',
            brightRed: '#f87171',
            brightGreen: '#34d399',
            brightYellow: '#fbbf24',
            brightBlue: '#60a5fa',
            brightMagenta: '#a78bfa',
            brightCyan: '#22d3ee',
            brightWhite: '#f9fafb'
          } : {
            background: '#ffffff',
            foreground: '#1f2937',
            cursor: '#3b82f6',
            black: '#1f2937',
            red: '#dc2626',
            green: '#059669',
            yellow: '#d97706',
            blue: '#2563eb',
            magenta: '#7c3aed',
            cyan: '#0891b2',
            white: '#f3f4f6',
            brightBlack: '#6b7280',
            brightRed: '#ef4444',
            brightGreen: '#10b981',
            brightYellow: '#f59e0b',
            brightBlue: '#3b82f6',
            brightMagenta: '#8b5cf6',
            brightCyan: '#06b6d4',
            brightWhite: '#ffffff'
          },
          allowProposedApi: true
        })

        // Add addons
        const fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)

        const webLinksAddon = new WebLinksAddon()
        terminal.loadAddon(webLinksAddon)

        // Open terminal in DOM
        if (terminalRef.current) {
          terminal.open(terminalRef.current)
          // Defer fit to next tick to ensure dimensions are available
          setTimeout(() => {
            if (fitAddonRef.current && terminalRef.current) {
              fitAddonRef.current.fit()
            }
          }, 10)
        } else {
          throw new Error('Terminal container not ready')
        }

        // Store references
        terminalInstanceRef.current = terminal
        fitAddonRef.current = fitAddon

        // Connect WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/api/exec/stream`

        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          // Send connection parameters
          ws.send(JSON.stringify({
            namespace,
            pod: pod.metadata.name,
            container: container?.name || pod.spec.containers[0]?.name,
            context: contextName,
            shell,
            cols: terminal.cols,
            rows: terminal.rows
          }))

          // Attach terminal to WebSocket
          const attachAddon = new AttachAddon(ws)
          terminal.loadAddon(attachAddon)

          setIsConnecting(false)

          // Send resize events
          terminal.onResize(({ cols, rows }) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'resize', cols, rows }))
            }
          })
        }

        ws.onerror = (err) => {
          console.error('WebSocket error:', err)
          setError('Connection failed')
          setIsConnecting(false)
          setConnectionClosed(true)
        }

        ws.onclose = () => {
          terminal.write('\r\n\r\nConnection closed\r\n')
          setIsConnecting(false)
          setConnectionClosed(true)
        }

        // Handle window resize
        const handleResize = () => {
          if (fitAddonRef.current) {
            fitAddonRef.current.fit()
          }
        }
        window.addEventListener('resize', handleResize)

        return () => {
          window.removeEventListener('resize', handleResize)
          ws.close()
          terminal.dispose()
        }
      } catch (err) {
        console.error('Terminal initialization failed:', err)
        setError(err.message)
        setIsConnecting(false)
      }
    }

    initTerminal()

    // Add window resize handler
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen, isMinimized, pod, container, namespace, contextName, theme, reconnectKey])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose()
      }
    }
  }, [])

  if (!isOpen) return null

  const containerName = container?.name || pod.spec.containers[0]?.name

  return (
    <div className={`fixed ${isMinimized ? 'bottom-0 right-4' : 'inset-0'} z-50`} style={{WebkitAppRegion: 'no-drag'}}>
      {/* Backdrop (only when not minimized) */}
      {!isMinimized && (
        <div
          className="absolute inset-0 bg-black bg-opacity-30"
          onClick={onClose}
        />
      )}

      {/* Terminal Panel */}
      <div className={`
        ${isMinimized
          ? 'w-96 h-12 rounded-t-lg shadow-2xl'
          : 'absolute inset-4 rounded-lg shadow-2xl'
        }
        bg-white dark:bg-gray-900 flex flex-col transition-all duration-300
      `}>
        {/* Header */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
          <div className="flex items-center justify-between gap-4">
            {/* Left side - title and info */}
            <div className="flex items-center gap-3 min-w-0 overflow-hidden">
              <TerminalIcon className="text-green-500 flex-shrink-0" size={20} />
              <div className="truncate">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {pod.metadata.name}
                </h2>
                {!isMinimized && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Container: {containerName} • Namespace: {namespace}
                    {selectedShell && ` • Shell: ${selectedShell}`}
                  </p>
                )}
              </div>

              {!isMinimized && availableShells.length > 1 && (
                <select
                  value={selectedShell}
                  onChange={(e) => {
                    setSelectedShell(e.target.value)
                    // Reconnect with new shell
                    handleReconnect()
                  }}
                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {availableShells.map(shell => (
                    <option key={shell} value={shell}>{shell}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Right side - action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {isConnecting && !isMinimized && (
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Loader2 className="animate-spin" size={16} />
                  <span className="text-xs">Connecting...</span>
                </div>
              )}

              {error && !isMinimized && (
                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertCircle size={16} />
                  <span className="text-xs">{error}</span>
                </div>
              )}

              {connectionClosed && !isConnecting && !isMinimized && (
                <button
                  onClick={handleReconnect}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors"
                  title="Reconnect"
                  aria-label="Reconnect terminal"
                >
                  <RotateCcw size={14} />
                  Reconnect
                </button>
              )}

              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors shadow-sm"
                title={isMinimized ? 'Maximize' : 'Minimize'}
                aria-label={isMinimized ? 'Maximize terminal' : 'Minimize terminal'}
              >
                {isMinimized ? <Maximize2 size={18} className="text-white" /> : <Minimize2 size={18} className="text-white" />}
              </button>

              <button
                onClick={onClose}
                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors shadow-sm"
                title="Close"
                aria-label="Close terminal"
              >
                <X size={18} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Terminal Content (hidden when minimized) */}
        {!isMinimized && (
          <div className="flex-1 p-2 bg-black overflow-hidden">
            <div
              ref={terminalRef}
              className="h-full w-full"
              style={{ minHeight: '400px' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default ContainerShell