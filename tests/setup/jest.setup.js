// Jest setup for backend tests
const { performance } = require('perf_hooks')

// Mock kubectl command execution
jest.mock('child_process', () => ({
  spawn: jest.fn()
}))

// Mock file system operations
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn()
}))

// Mock OS module (spread real os to preserve functions like hostname, cpus, etc.)
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  homedir: jest.fn(() => '/home/test'),
  platform: jest.fn(() => 'linux'),
  arch: jest.fn(() => 'x64')
}))

// Global test utilities
global.createMockKubectlResponse = (stdout = '', stderr = '', exitCode = 0) => {
  const mockChild = {
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn(),
    kill: jest.fn()
  }

  // Simulate async behavior
  setTimeout(() => {
    if (stdout) {
      mockChild.stdout.on.mock.calls.forEach(call => {
        if (call[0] === 'data') call[1](stdout)
      })
    }
    if (stderr) {
      mockChild.stderr.on.mock.calls.forEach(call => {
        if (call[0] === 'data') call[1](stderr)
      })
    }
    mockChild.on.mock.calls.forEach(call => {
      if (call[0] === 'close') call[1](exitCode)
    })
  }, 0)

  return mockChild
}

// Performance testing utilities
global.measurePerformance = async (fn) => {
  const start = performance.now()
  const result = await fn()
  const end = performance.now()
  return {
    result,
    duration: end - start
  }
}

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks()
})