import React, { useState, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { X, Minimize2, Maximize2, FileText, AlertCircle, Loader2, Pause, Play, Download, Trash2, Search, Code2, Copy, CheckCheck, CopyCheck } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import '@xterm/xterm/css/xterm.css'

const LogViewer = ({
  pod,
  container,
  namespace,
  contextName,
  isOpen,
  onClose
}) => {
  const { theme } = useTheme()
  const [isMinimized, setIsMinimized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isPaused, setIsPaused] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [logLevel, setLogLevel] = useState('all') // all, info, warn, error
  const [prettifyJson, setPrettifyJson] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showPrevious, setShowPrevious] = useState(false)
  const [hasSelection, setHasSelection] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState(false)

  const terminalRef = useRef(null)
  const terminalInstanceRef = useRef(null)
  const fitAddonRef = useRef(null)
  const eventSourceRef = useRef(null)
  const logBufferRef = useRef([])

  // Initialize terminal for log display
  useEffect(() => {
    if (!isOpen || isMinimized || !terminalRef.current) return

    // Clean up previous terminal and SSE stream before creating new ones
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.dispose()
      terminalInstanceRef.current = null
    }
    logBufferRef.current = []

    const initLogViewer = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Create terminal instance for log display
        const terminal = new Terminal({
          cursorBlink: false,
          disableStdin: true,
          fontSize: 13,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: theme === 'dark' ? {
            background: '#1f2937',
            foreground: '#d1d5db',
            cursor: '#1f2937',
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
            brightWhite: '#f9fafb',
            selectionBackground: '#3b82f680',
            selectionForeground: '#ffffff',
            selectionInactiveBackground: '#3b82f640'
          } : {
            background: '#ffffff',
            foreground: '#1f2937',
            cursor: '#ffffff',
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
            brightWhite: '#ffffff',
            selectionBackground: '#3b82f650',
            selectionForeground: '#000000',
            selectionInactiveBackground: '#3b82f630'
          },
          scrollback: 10000,
          allowProposedApi: true,
          rightClickSelectsWord: true
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

        // Enable keyboard shortcuts for copy/select
        terminal.attachCustomKeyEventHandler((event) => {
          const isMeta = event.metaKey || event.ctrlKey
          if (isMeta && event.type === 'keydown') {
            if (event.key === 'c') {
              // Cmd+C / Ctrl+C: copy selection to clipboard
              const selection = terminal.getSelection()
              if (selection) {
                navigator.clipboard.writeText(selection).then(() => {
                  setCopyFeedback(true)
                  setTimeout(() => setCopyFeedback(false), 1500)
                })
              }
              return false // prevent xterm from processing
            }
            if (event.key === 'a') {
              // Cmd+A / Ctrl+A: select all terminal content
              terminal.selectAll()
              return false
            }
          }
          return true
        })

        // Track selection state for UI feedback
        terminal.onSelectionChange(() => {
          setHasSelection(terminal.hasSelection())
        })

        // First fetch last 1000 lines
        const containerName = container?.name || pod.spec.containers[0]?.name
        const fetchParams = {
          context: contextName,
          tailLines: 1000,
          timestamps: showTimestamps
        }
        if (showPrevious) fetchParams.previous = 'true'

        const historyResponse = await fetch(`/api/logs/${namespace}/${pod.metadata.name}/${containerName}?` + new URLSearchParams(fetchParams))

        if (!historyResponse.ok) {
          const errorData = await historyResponse.json().catch(() => null)
          const errorMsg = errorData?.error || historyResponse.statusText
          // Show a user-friendly message for "no previous container" errors
          if (showPrevious && (errorMsg.includes('previous') || historyResponse.status === 400)) {
            terminal.writeln('\x1b[33m⚠ No previous container logs available.\x1b[0m')
            terminal.writeln('\x1b[90mPrevious logs are only available when a container has restarted (restartCount > 0).\x1b[0m')
            setIsLoading(false)
            return () => { terminal.dispose() }
          }
          throw new Error(errorMsg)
        }

        const historyData = await historyResponse.json()
        if (historyData.logs) {
          const lines = historyData.logs.split('\n')
          lines.forEach(line => {
            if (line) {
              logBufferRef.current.push(line)
              writeLogLine(terminal, line)
            }
          })
        }

        setIsLoading(false)

        // Skip streaming for previous logs (can't tail a terminated container)
        if (showPrevious) {
          return () => {
            terminal.dispose()
          }
        }

        // Then start tailing logs with SSE
        const eventSource = new EventSource(`/api/logs/stream?` + new URLSearchParams({
          namespace,
          pod: pod.metadata.name,
          container: containerName,
          context: contextName,
          follow: true,
          timestamps: showTimestamps
        }))

        eventSourceRef.current = eventSource

        eventSource.onmessage = (event) => {
          if (!isPaused) {
            const logLine = event.data
            logBufferRef.current.push(logLine)

            // Keep buffer size manageable
            if (logBufferRef.current.length > 10000) {
              logBufferRef.current.shift()
            }

            writeLogLine(terminal, logLine)

            // Auto-scroll to bottom
            terminal.scrollToBottom()
          }
        }

        eventSource.onerror = (err) => {
          console.error('Log stream error:', err)
          setError('Log stream disconnected')
          eventSource.close()
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
          eventSource.close()
          terminal.dispose()
        }
      } catch (err) {
        console.error('Log viewer initialization failed:', err)
        setError(err.message)
        setIsLoading(false)
      }
    }

    initLogViewer()

    // Add window resize handler
    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose()
        terminalInstanceRef.current = null
      }
    }
  }, [isOpen, isMinimized, pod, container, namespace, contextName, theme, showTimestamps, showPrevious])

  // Helper function to write colored log lines
  const writeLogLine = (terminal, line) => {
    // Check if line should be filtered by search
    if (searchTerm && !line.toLowerCase().includes(searchTerm.toLowerCase())) {
      return
    }

    let formattedLine = line

    // Try to prettify JSON if enabled
    if (prettifyJson) {
      try {
        // Try to extract JSON from the line (might be prefixed with timestamp or other data)
        const jsonMatch = line.match(/\{.*\}|\[.*\]/)
        if (jsonMatch) {
          const jsonStr = jsonMatch[0]
          const jsonObj = JSON.parse(jsonStr)
          const prettyJson = JSON.stringify(jsonObj, null, 2)

          // Replace the JSON part with prettified version
          const prefix = line.substring(0, jsonMatch.index)
          formattedLine = prefix + '\n' + prettyJson.split('\n').map(l => '  ' + l).join('\n')
        }
      } catch (e) {
        // Not valid JSON, use original line
      }
    }

    // Apply log level coloring
    let coloredLine = formattedLine
    let shouldShow = true

    // Detect log level and apply colors
    if (line.match(/\b(ERROR|FATAL|CRITICAL)\b/i)) {
      coloredLine = `\x1b[31m${formattedLine}\x1b[0m` // Red
      if (logLevel !== 'all' && logLevel !== 'error') shouldShow = false
    } else if (line.match(/\b(WARN|WARNING)\b/i)) {
      coloredLine = `\x1b[33m${formattedLine}\x1b[0m` // Yellow
      if (logLevel === 'error') shouldShow = false
    } else if (line.match(/\b(INFO|INFORMATION)\b/i)) {
      coloredLine = `\x1b[36m${formattedLine}\x1b[0m` // Cyan
      if (logLevel === 'error') shouldShow = false
    } else if (line.match(/\b(DEBUG|TRACE)\b/i)) {
      coloredLine = `\x1b[90m${formattedLine}\x1b[0m` // Gray
      if (logLevel !== 'all') shouldShow = false
    }

    if (!shouldShow) return

    // Highlight search term if present
    if (searchTerm && !prettifyJson) {
      const regex = new RegExp(`(${searchTerm})`, 'gi')
      coloredLine = coloredLine.replace(regex, '\x1b[43m\x1b[30m$1\x1b[0m') // Yellow background
    }

    terminal.writeln(coloredLine)
  }

  // Re-filter and re-render all buffered logs when search or log level changes
  useEffect(() => {
    const terminal = terminalInstanceRef.current
    if (!terminal || !isOpen || isMinimized) return

    terminal.clear()
    logBufferRef.current.forEach(line => {
      writeLogLine(terminal, line)
    })
  }, [searchTerm, logLevel, prettifyJson])

  // Clear logs
  const handleClear = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.clear()
      logBufferRef.current = []
    }
  }

  // Download logs
  const handleDownload = () => {
    const logs = logBufferRef.current.join('\n')
    const blob = new Blob([logs], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pod.metadata.name}-${container?.name || 'container'}-logs.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Copy selection (or all logs if nothing selected) to clipboard
  const handleCopy = async () => {
    const terminal = terminalInstanceRef.current
    let text = terminal?.getSelection()
    if (!text) {
      // Nothing selected - copy entire log buffer
      text = logBufferRef.current.join('\n')
    }
    if (text) {
      await navigator.clipboard.writeText(text)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 1500)
    }
  }

  // Select all terminal content
  const handleSelectAll = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.selectAll()
    }
  }

  // Note: cleanup on unmount is handled by the main useEffect's cleanup function

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

      {/* Log Viewer Panel */}
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
              <FileText className="text-blue-500 flex-shrink-0" size={20} />
              <div className="truncate">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {pod.metadata.name} Logs
                </h2>
                {!isMinimized && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Container: {containerName} • Namespace: {namespace}
                  </p>
                )}
              </div>

              {!isMinimized && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Search */}
                  {showSearch ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search logs..."
                        className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-32"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          setShowSearch(false)
                          setSearchTerm('')
                        }}
                        className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        aria-label="Close search"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowSearch(true)}
                      className="p-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                      title="Search logs"
                    >
                      <Search size={14} />
                    </button>
                  )}

                  {/* Log Level Filter */}
                  <select
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value)}
                    className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="all">All</option>
                    <option value="info">Info+</option>
                    <option value="warn">Warn+</option>
                    <option value="error">Error</option>
                  </select>

                  {/* JSON Prettify Toggle */}
                  <button
                    onClick={() => setPrettifyJson(!prettifyJson)}
                    className={`p-1 rounded transition-colors ${
                      prettifyJson
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                    title="Prettify JSON"
                  >
                    <Code2 size={14} />
                  </button>

                  {/* Previous Logs Toggle */}
                  <button
                    onClick={() => setShowPrevious(!showPrevious)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      showPrevious
                        ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                    title="Show previous container logs"
                  >
                    Prev
                  </button>

                  {/* Timestamps Toggle */}
                  <button
                    onClick={() => setShowTimestamps(!showTimestamps)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      showTimestamps
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                    title="Toggle timestamps"
                  >
                    TS
                  </button>

                  {/* Pause/Resume */}
                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    className={`p-1 rounded transition-colors ${
                      isPaused
                        ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                    title={isPaused ? 'Resume' : 'Pause'}
                  >
                    {isPaused ? <Play size={14} /> : <Pause size={14} />}
                  </button>

                  {/* Copy */}
                  <button
                    onClick={handleCopy}
                    className={`p-1 rounded transition-colors ${
                      copyFeedback
                        ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                        : hasSelection
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    title={copyFeedback ? 'Copied!' : hasSelection ? 'Copy selection' : 'Copy all logs'}
                  >
                    {copyFeedback ? <CheckCheck size={14} /> : <Copy size={14} />}
                  </button>

                  {/* Select All */}
                  <button
                    onClick={handleSelectAll}
                    className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                    title="Select all log text"
                  >
                    Sel
                  </button>

                  {/* Clear Logs */}
                  <button
                    onClick={handleClear}
                    className="p-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                    title="Clear logs"
                  >
                    <Trash2 size={14} />
                  </button>

                  {/* Download Logs */}
                  <button
                    onClick={handleDownload}
                    className="p-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                    title="Download logs"
                  >
                    <Download size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Right side - action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {isLoading && !isMinimized && (
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Loader2 className="animate-spin" size={16} />
                  <span className="text-xs">Loading logs...</span>
                </div>
              )}

              {error && !isMinimized && (
                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertCircle size={16} />
                  <span className="text-xs">{error}</span>
                </div>
              )}

              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors shadow-sm"
                title={isMinimized ? 'Maximize' : 'Minimize'}
                aria-label={isMinimized ? 'Maximize log viewer' : 'Minimize log viewer'}
              >
                {isMinimized ? <Maximize2 size={18} className="text-white" /> : <Minimize2 size={18} className="text-white" />}
              </button>

              <button
                onClick={onClose}
                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors shadow-sm"
                title="Close"
                aria-label="Close log viewer"
              >
                <X size={18} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Log Content (hidden when minimized) */}
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

export default LogViewer