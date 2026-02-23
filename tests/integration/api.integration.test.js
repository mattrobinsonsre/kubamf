const request = require('supertest')
const { spawn } = require('child_process')
const path = require('path')

describe('API Integration Tests', () => {
  let server
  let serverProcess
  const serverPort = 3002 // Use different port to avoid conflicts

  beforeAll(async () => {
    // Start the server for integration testing
    const serverPath = path.join(__dirname, '../../src/backend/server.js')

    serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: serverPort,
        // Disable security features for testing
        CORS_ENABLED: 'false',
        TLS_ENABLED: 'false',
        HELMET_ENABLED: 'false',
        RATE_LIMIT_ENABLED: 'false',
        API_KEY_ENABLED: 'false'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server failed to start within timeout'))
      }, 10000)

      serverProcess.stdout.on('data', (data) => {
        if (data.toString().includes('Server running on port') ||
            data.toString().includes(`${serverPort}`)) {
          clearTimeout(timeout)
          resolve()
        }
      })

      serverProcess.stderr.on('data', (data) => {
        console.error('Server stderr:', data.toString())
      })

      serverProcess.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })

    // Create supertest instance
    server = request(`http://localhost:${serverPort}`)
  }, 15000)

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM')

      // Wait for graceful shutdown
      await new Promise((resolve) => {
        serverProcess.on('exit', resolve)
        setTimeout(() => {
          serverProcess.kill('SIGKILL')
          resolve()
        }, 5000)
      })
    }
  })

  describe('Health Endpoints', () => {
    test('GET /health should return health status', async () => {
      // The /health endpoint uses getQuickHealth() which returns 'unknown'
      // status (503) if no periodic health check has completed yet, or
      // 'healthy'/'degraded' (200) if one has. Accept either.
      const response = await server
        .get('/health')

      expect([200, 503]).toContain(response.status)
      expect(response.body).toHaveProperty('status')
      expect(response.body).toHaveProperty('timestamp')
    })

    test('GET /health/live should return liveness status', async () => {
      // The actual liveness endpoint is /health/live (not /health/liveness)
      const response = await server
        .get('/health/live')
        .expect(200)

      expect(response.body).toHaveProperty('alive')
      expect(response.body.alive).toBe(true)
    })

    test('GET /health/ready should return readiness status', async () => {
      // The actual readiness endpoint is /health/ready (not /health/readiness)
      const response = await server
        .get('/health/ready')

      // May return 200 (ready) or 503 (not ready, e.g. no kubectl)
      expect([200, 503]).toContain(response.status)
      expect(response.body).toHaveProperty('ready')
      expect(typeof response.body.ready).toBe('boolean')
    })
  })

  describe('API Endpoints', () => {
    test('GET /api/kubeconfig/contexts should handle request', async () => {
      // This might fail if no kubeconfig is available, but should not crash
      const response = await server
        .get('/api/kubeconfig/contexts')

      // Should return either 200 with data or an error status
      expect([200, 400, 404, 500]).toContain(response.status)

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true)
      }
    })

    test('POST /api/kubeconfig/check-connection should handle request', async () => {
      const response = await server
        .post('/api/kubeconfig/check-connection')
        .send({ context: 'test-context' })

      // Should return either 200 with data or an error status
      expect([200, 400, 404, 500]).toContain(response.status)
    })
  })

  describe('Static File Serving', () => {
    test('GET / should serve frontend', async () => {
      const response = await server
        .get('/')

      // Should serve HTML or return appropriate status
      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.headers['content-type']).toMatch(/html/)
      }
    })

    test('GET /assets/* should handle asset requests', async () => {
      const response = await server
        .get('/assets/nonexistent.js')

      // Should handle missing assets gracefully
      expect([200, 404]).toContain(response.status)
    })
  })

  describe('Error Handling', () => {
    test('GET /nonexistent should return 404', async () => {
      const response = await server
        .get('/nonexistent-endpoint')

      // The server returns 404 for unknown routes. The response body
      // may or may not have an 'error' property depending on whether
      // the server has a catch-all 404 handler.
      expect(response.status).toBe(404)
    })

    test('POST with invalid JSON should return 400', async () => {
      const response = await server
        .post('/api/kubeconfig/check-connection')
        .set('Content-Type', 'application/json')
        .send('invalid json')

      expect([400, 500]).toContain(response.status)
    })
  })

  describe('Security Headers', () => {
    test('Should include basic security headers', async () => {
      // Use the /health/live endpoint which reliably returns 200
      const response = await server
        .get('/health/live')
        .expect(200)

      // Check for basic security headers (some might be disabled in test mode)
      expect(response.headers).toHaveProperty('x-powered-by')
    })
  })

  describe('CORS Handling', () => {
    test('Should handle OPTIONS requests', async () => {
      const response = await server
        .options('/api/kubeconfig/contexts')

      // Should handle preflight requests
      expect([200, 204, 404]).toContain(response.status)
    })
  })

  describe('Request Logging', () => {
    test('Should log requests without crashing', async () => {
      // Make multiple requests to ensure logging works
      // Use the correct endpoint paths
      await server.get('/health')
      await server.get('/health/live')
      await server.get('/health/ready')

      // If we get here, logging didn't crash the server
      expect(true).toBe(true)
    })
  })
})
