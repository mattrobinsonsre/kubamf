const express = require('express')
const WebSocket = require('ws')
const k8s = require('@kubernetes/client-node')
const stream = require('stream')

const router = express.Router()

// Store active exec sessions
const execSessions = new Map()

const { getRequestContext } = require('../request-context')

// Initialize Kubernetes client for exec operations
let kc = new k8s.KubeConfig()
try {
  if (process.env.KUBERNETES_SERVICE_HOST) {
    kc.loadFromCluster()
  } else {
    kc.loadFromDefault()
  }
} catch (error) {
  console.error('Failed to load kubeconfig:', error)
}

// In bamf mode, add impersonation headers to outgoing K8s API requests
if (process.env.BAMF_ENABLED === 'true') {
  const originalApplyToRequest = kc.applyToRequest.bind(kc)
  kc.applyToRequest = (opts) => {
    originalApplyToRequest(opts)
    const ctx = getRequestContext()
    if (ctx && ctx.user) {
      opts.headers = opts.headers || {}
      const username = ctx.user.email || ctx.user.username
      if (username) {
        opts.headers['Impersonate-User'] = username
      }
      if (ctx.user.groups && ctx.user.groups.length > 0) {
        opts.headers['Impersonate-Group'] = ctx.user.groups
      }
    }
    return opts
  }
  console.log('Exec route: using in-cluster config with user impersonation')
}

// Detect available shells in a container
router.post('/detect-shells', async (req, res) => {
  try {
    const { namespace, pod, container, context } = req.body

    // Set context if provided
    if (context && context !== 'in-cluster') {
      kc.setCurrentContext(context)
    }

    const exec = new k8s.Exec(kc)
    const shells = [
      '/bin/bash',
      '/bin/zsh',
      '/bin/sh',
      '/bin/ash',
      '/bin/dash',
      'bash',
      'sh'
    ]

    const availableShells = []

    for (const shell of shells) {
      try {
        // Create a promise to check if shell exists
        const result = await new Promise((resolve) => {
          const stdout = new stream.Writable({
            write: (chunk, encoding, callback) => {
              callback()
            }
          })

          const stderr = new stream.Writable({
            write: (chunk, encoding, callback) => {
              callback()
            }
          })

          exec.exec(
            namespace,
            pod,
            container,
            ['which', shell],
            stdout,
            stderr,
            null, // stdin
            false, // tty
            (status) => {
              resolve(status.status === 'Success')
            }
          ).catch(() => resolve(false))
        })

        if (result) {
          availableShells.push(shell)
        }
      } catch (error) {
        // Shell not found, continue checking others
      }
    }

    // Default to /bin/sh if no shells found
    if (availableShells.length === 0) {
      availableShells.push('/bin/sh')
    }

    res.json({ shells: availableShells })
  } catch (error) {
    console.error('Shell detection error:', error)
    res.status(500).json({ error: error.message })
  }
})

// WebSocket handler for exec sessions
function handleExecWebSocket(ws, req) {
  console.log('WebSocket connection established for exec')
  let sessionId = null
  let execStream = null

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString())
      console.log('Received WebSocket message:', data)

      if (data.type === 'resize') {
        // Terminal resize is handled by the PTY on the client side
        // The Kubernetes API doesn't support resize for exec
        return
      }

      // Initial connection
      if (!execStream) {
        const { namespace, pod, container, context, shell, cols, rows } = data

        // Set context if provided
        if (context && context !== 'in-cluster') {
          kc.setCurrentContext(context)
        }

        sessionId = `${context}-${namespace}-${pod}-${container}-${Date.now()}`

        const exec = new k8s.Exec(kc)

        // Create stdout stream that sends to WebSocket
        const stdout = new stream.Writable({
          write: (chunk, encoding, callback) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(chunk)
            }
            callback()
          }
        })

        // Create stderr stream that sends to WebSocket
        const stderr = new stream.Writable({
          write: (chunk, encoding, callback) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(chunk)
            }
            callback()
          }
        })

        // Create stdin stream that receives from WebSocket
        const stdin = new stream.PassThrough()

        // Store the stdin stream for later input
        execStream = stdin

        // Start the exec session with TTY
        exec.exec(
          namespace,
          pod,
          container,
          [shell || '/bin/sh'],
          stdout,
          stderr,
          stdin,
          true, // tty - this enables TTY mode
          (status) => {
            // Exec completed
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'exit', code: status.code || 0 }))
              ws.close()
            }
            if (sessionId) {
              execSessions.delete(sessionId)
            }
          }
        ).catch((error) => {
          console.error('Exec error:', error)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'error', message: error.message }))
            ws.close()
          }
        })

        execSessions.set(sessionId, { stdin, stdout, stderr })
      }
    } catch (error) {
      // Not JSON - assume it's terminal input from AttachAddon (raw bytes)
      if (execStream) {
        // Write input to the exec stdin stream
        execStream.write(message)
      } else {
        console.error('No exec stream to handle input')
      }
    }
  })

  ws.on('close', () => {
    // Clean up exec session
    if (execStream) {
      execStream.end()
    }
    if (sessionId) {
      execSessions.delete(sessionId)
    }
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
    if (execStream) {
      execStream.end()
    }
    if (sessionId) {
      execSessions.delete(sessionId)
    }
  })
}

module.exports = {
  router,
  handleExecWebSocket
}