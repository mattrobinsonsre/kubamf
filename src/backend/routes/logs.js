const express = require('express')
const k8s = require('@kubernetes/client-node')
const stream = require('stream')

const router = express.Router()

const { getRequestContext } = require('../request-context')

// Initialize Kubernetes client
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
  console.log('Logs route: using in-cluster config with user impersonation')
}

// Get logs with optional tail
router.get('/:namespace/:pod/:container', async (req, res) => {
  try {
    const { namespace, pod, container } = req.params
    const { context, tailLines = 1000, timestamps = 'true', previous = 'false' } = req.query

    // Set context if provided
    if (context && context !== 'in-cluster') {
      kc.setCurrentContext(context)
    }

    const k8sApi = kc.makeApiClient(k8s.CoreV1Api)

    const options = {
      tailLines: parseInt(tailLines),
      timestamps: timestamps === 'true',
      previous: previous === 'true'
    }

    // Fetch logs from Kubernetes API
    const response = await k8sApi.readNamespacedPodLog(
      pod,
      namespace,
      container,
      false, // follow
      undefined, // insecureSkipTLSVerifyBackend
      undefined, // limitBytes
      'false', // pretty
      options.previous,
      undefined, // sinceSeconds
      options.tailLines,
      options.timestamps
    )

    res.json({ logs: response.body })
  } catch (error) {
    console.error('Logs error:', error)
    // Parse Kubernetes API error body - may be a JSON string
    let errorMessage = 'Failed to fetch logs'
    try {
      if (error.body) {
        const body = typeof error.body === 'string' ? JSON.parse(error.body) : error.body
        errorMessage = body.message || errorMessage
      } else if (error.message) {
        errorMessage = error.message
      }
    } catch (e) {
      errorMessage = error.body || error.message || errorMessage
    }
    res.status(error.statusCode || 500).json({ error: errorMessage })
  }
})

// Stream logs using Server-Sent Events
router.get('/stream', async (req, res) => {
  const { namespace, pod, container, context, timestamps = 'true', follow = 'true' } = req.query

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })

  try {
    // Set context if provided
    if (context && context !== 'in-cluster') {
      kc.setCurrentContext(context)
    }

    const log = new k8s.Log(kc)

    // Create a writable stream that sends data via SSE
    const logStream = new stream.Writable({
      write: (chunk, encoding, callback) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim())
        lines.forEach(line => {
          res.write(`data: ${line}\n\n`)
        })
        callback()
      }
    })

    // Handle stream errors
    logStream.on('error', (err) => {
      console.error('Log stream error:', err)
      res.write(`event: error\ndata: ${err.message}\n\n`)
      res.end()
    })

    // Start streaming logs
    const logRequest = await log.log(
      namespace,
      pod,
      container,
      logStream,
      {
        follow: follow === 'true',
        tailLines: 100, // Start with last 100 lines
        timestamps: timestamps === 'true'
      }
    )

    // Clean up on client disconnect
    req.on('close', () => {
      logRequest.abort()
      logStream.destroy()
    })

  } catch (error) {
    console.error('Log stream setup error:', error)
    res.write(`event: error\ndata: ${error.message}\n\n`)
    res.end()
  }
})

module.exports = router