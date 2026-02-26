const express = require('express')
const WebSocket = require('ws')
const k8s = require('@kubernetes/client-node')
const stream = require('stream')

const router = express.Router()

// Store active exec sessions
const execSessions = new Map()

const isBamfMode = process.env.BAMF_ENABLED === 'true'

// Initialize Kubernetes client for non-exec operations (list, get, watch).
// In BAMF mode, ALL K8s operations go through the BAMF kube proxy chain.
// kubamf must NEVER talk to the K8s API directly — BAMF's RBAC controls
// what operations are allowed.
let kc
if (isBamfMode) {
  const { createBamfKubeConfig } = require('../bamf-kube-config')
  kc = createBamfKubeConfig()
  console.log('Exec route: using BAMF kube proxy')
} else {
  kc = new k8s.KubeConfig()
  try {
    if (process.env.KUBERNETES_SERVICE_HOST) {
      kc.loadFromCluster()
    } else {
      kc.loadFromDefault()
    }
  } catch (error) {
    console.error('Failed to load kubeconfig:', error)
  }
}

// Create a KubeConfig for exec/attach WebSocket operations.
// In BAMF mode, the k8s client's WebSocket creation loses AsyncLocalStorage
// context, so we create a per-request config with the token baked in.
function getExecKubeConfig(sessionToken) {
  if (isBamfMode && sessionToken) {
    const { createBamfKubeConfig } = require('../bamf-kube-config')
    return createBamfKubeConfig(sessionToken)
  }
  return kc
}

// Detect available shells in a container
router.post('/detect-shells', async (req, res) => {
  try {
    const { namespace, pod, container, context } = req.body

    // Get per-request KubeConfig with explicit token for WebSocket exec.
    // Must capture the token here (in the Express handler) before it's
    // lost during the k8s client's internal WebSocket creation.
    const execKc = getExecKubeConfig(req.bamfSessionToken)

    const exec = new k8s.Exec(execKc)
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
        // Create a promise to check if shell exists, with timeout
        const result = await Promise.race([
          new Promise((resolve) => {
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
          }),
          new Promise((resolve) => setTimeout(() => resolve(false), 10000))
        ])

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

  // Capture the session token from the upgrade request headers immediately.
  // AsyncLocalStorage context from server.js's requestContext.run() does NOT
  // propagate into ws.on('message') callbacks — they fire asynchronously
  // after the run() scope has exited. Reading from req.headers here (in the
  // closure) ensures the token is available when the first message arrives.
  const sessionToken = req.headers?.['x-bamf-session-token'] || null

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

        console.log(`[EXEC] Starting exec: ${namespace}/${pod}/${container} shell=${shell}`)

        sessionId = `${context}-${namespace}-${pod}-${container}-${Date.now()}`

        const execKc = getExecKubeConfig(sessionToken)

        const exec = new k8s.Exec(execKc)

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