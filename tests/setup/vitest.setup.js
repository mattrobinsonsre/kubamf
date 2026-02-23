import { vi, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Automatically clean up DOM after each test
afterEach(() => {
  cleanup()
})

// Mock EventSource for server-sent events
global.EventSource = vi.fn(() => ({
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: 0,
  url: '',
  withCredentials: false,
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
  onerror: null,
  onmessage: null,
  onopen: null,
  dispatchEvent: vi.fn(),
}))

// Mock window.electronAPI for Electron environment tests
Object.defineProperty(window, 'electronAPI', {
  writable: true,
  configurable: true,
  value: {
    isElectron: false,
    platform: 'linux',
    kubectl: {
      getContexts: vi.fn(),
      checkConnection: vi.fn(),
      getNamespaces: vi.fn(),
      getPods: vi.fn(),
      getPodContainers: vi.fn(),
      getServices: vi.fn(),
      getDeployments: vi.fn(),
      getConfigMaps: vi.fn(),
      getSecrets: vi.fn(),
      getNodes: vi.fn(),
      getCRDs: vi.fn(),
      getResource: vi.fn(),
      getLogs: vi.fn(),
    }
  }
})

// Mock global constants injected by Vite
Object.defineProperty(window, '__STATIC_HOSTING__', {
  writable: true,
  configurable: true,
  value: false
})

Object.defineProperty(window, 'KUBAMF_API_HOST', {
  writable: true,
  configurable: true,
  value: 'http://localhost:3001/api'
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
}))

// Mock localStorage with functional store/retrieve behavior
const createLocalStorageMock = () => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value) }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
    get length() { return Object.keys(store).length },
    key: vi.fn((index) => Object.keys(store)[index] ?? null),
  }
}
const localStorageMock = createLocalStorageMock()
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})