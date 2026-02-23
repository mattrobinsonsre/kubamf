import { describe, it, expect } from 'vitest'
import {
  cpuToMillicores,
  memoryToBytes,
  compareValues,
  sortResources
} from './resourceSorting'

describe('resourceSorting', () => {
  describe('cpuToMillicores', () => {
    // Test valid CPU values with various units
    const cpuTestCases = [
      // Millicores
      { input: '100m', expected: 100, description: '100 millicores' },
      { input: '500m', expected: 500, description: '500 millicores' },
      { input: '1500m', expected: 1500, description: '1500 millicores' },
      { input: '0m', expected: 0, description: '0 millicores' },
      { input: '0.5m', expected: 0.5, description: '0.5 millicores' },
      { input: '1234.56m', expected: 1234.56, description: 'decimal millicores' },

      // Cores
      { input: '1', expected: 1000, description: '1 core' },
      { input: '2', expected: 2000, description: '2 cores' },
      { input: '0.5', expected: 500, description: '0.5 cores' },
      { input: '2.5', expected: 2500, description: '2.5 cores' },
      { input: '0.1', expected: 100, description: '0.1 cores' },
      { input: '0.001', expected: 1, description: '0.001 cores' },

      // Nanocores
      { input: '1000000n', expected: 1, description: '1 millicore in nanocores' },
      { input: '500000n', expected: 0.5, description: '0.5 millicores in nanocores' },
      { input: '100000000n', expected: 100, description: '100 millicores in nanocores' },
      { input: '1000000000n', expected: 1000, description: '1 core in nanocores' },

      // Invalid values
      { input: '-', expected: -1, description: 'dash (no value)' },
      { input: null, expected: -1, description: 'null value' },
      { input: undefined, expected: -1, description: 'undefined value' },
      { input: '', expected: -1, description: 'empty string' },
      { input: 'invalid', expected: -1, description: 'invalid string' },
      { input: '100x', expected: -1, description: 'invalid unit' },
      { input: 'm100', expected: -1, description: 'unit before number' },
      { input: 'NaN', expected: -1, description: 'NaN string' },
      { input: '100Mi', expected: -1, description: 'memory unit used for CPU' },
    ]

    cpuTestCases.forEach(({ input, expected, description }) => {
      it(`should handle ${description}: ${input} -> ${expected}`, () => {
        expect(cpuToMillicores(input)).toBe(expected)
      })
    })
  })

  describe('memoryToBytes', () => {
    // Test valid memory values with various units
    const memoryTestCases = [
      // Binary units (base 1024)
      { input: '512Ki', expected: 512 * 1024, description: '512 kibibytes' },
      { input: '1024Ki', expected: 1024 * 1024, description: '1024 kibibytes' },
      { input: '1Ki', expected: 1024, description: '1 kibibyte' },
      { input: '128Mi', expected: 128 * 1024 * 1024, description: '128 mebibytes' },
      { input: '256Mi', expected: 256 * 1024 * 1024, description: '256 mebibytes' },
      { input: '512Mi', expected: 512 * 1024 * 1024, description: '512 mebibytes' },
      { input: '1Mi', expected: 1024 * 1024, description: '1 mebibyte' },
      { input: '1Gi', expected: 1024 * 1024 * 1024, description: '1 gibibyte' },
      { input: '2Gi', expected: 2 * 1024 * 1024 * 1024, description: '2 gibibytes' },
      { input: '0.5Gi', expected: 0.5 * 1024 * 1024 * 1024, description: '0.5 gibibytes' },
      { input: '1Ti', expected: 1024 * 1024 * 1024 * 1024, description: '1 tebibyte' },
      { input: '2Ti', expected: 2 * 1024 * 1024 * 1024 * 1024, description: '2 tebibytes' },
      { input: '1Pi', expected: Math.pow(1024, 5), description: '1 pebibyte' },
      { input: '1Ei', expected: Math.pow(1024, 6), description: '1 exbibyte' },

      // Decimal units (base 1000)
      { input: '1K', expected: 1000, description: '1 kilobyte' },
      { input: '1M', expected: 1000000, description: '1 megabyte' },
      { input: '1G', expected: 1000000000, description: '1 gigabyte' },
      { input: '1T', expected: 1000000000000, description: '1 terabyte' },

      // Bytes (no unit)
      { input: '1024', expected: 1024, description: '1024 bytes' },
      { input: '500', expected: 500, description: '500 bytes' },
      { input: '0', expected: 0, description: '0 bytes' },
      { input: '1234.56', expected: 1234.56, description: 'decimal bytes' },

      // Invalid values
      { input: '-', expected: -1, description: 'dash (no value)' },
      { input: null, expected: -1, description: 'null value' },
      { input: undefined, expected: -1, description: 'undefined value' },
      { input: '', expected: -1, description: 'empty string' },
      { input: 'invalid', expected: -1, description: 'invalid string' },
      { input: '100MB', expected: -1, description: 'invalid unit format' },
      { input: 'Mi100', expected: -1, description: 'unit before number' },
      { input: '100m', expected: -1, description: 'CPU unit used for memory' },
    ]

    memoryTestCases.forEach(({ input, expected, description }) => {
      it(`should handle ${description}: ${input} -> ${expected}`, () => {
        expect(memoryToBytes(input)).toBe(expected)
      })
    })
  })

  describe('compareValues', () => {
    it('should handle equal values', () => {
      expect(compareValues(1, 1)).toBe(0)
      expect(compareValues('a', 'a')).toBe(0)
      expect(compareValues(null, null)).toBe(0)
      expect(compareValues(undefined, undefined)).toBe(0)
      expect(compareValues(-1, -1)).toBe(0)
    })

    it('should put invalid values at the end', () => {
      expect(compareValues(null, 1)).toBe(1)
      expect(compareValues(1, null)).toBe(-1)
      expect(compareValues(undefined, 'test')).toBe(1)
      expect(compareValues('test', undefined)).toBe(-1)
      expect(compareValues(-1, 100)).toBe(1)
      expect(compareValues(100, -1)).toBe(-1)
      expect(compareValues('', 'test')).toBe(1)
      expect(compareValues('test', '')).toBe(-1)
    })

    it('should sort numbers correctly', () => {
      expect(compareValues(1, 2)).toBe(-1)
      expect(compareValues(2, 1)).toBe(1)
      expect(compareValues(100, 200)).toBe(-1)
      expect(compareValues(0.5, 0.6)).toBe(-1)
    })

    it('should sort strings correctly', () => {
      expect(compareValues('a', 'b')).toBeLessThan(0)
      expect(compareValues('b', 'a')).toBeGreaterThan(0)
      expect(compareValues('apple', 'banana')).toBeLessThan(0)
    })

    it('should respect sort order', () => {
      expect(compareValues(1, 2, 'asc')).toBe(-1)
      expect(compareValues(1, 2, 'desc')).toBe(1)
      expect(compareValues('a', 'b', 'asc')).toBeLessThan(0)
      expect(compareValues('a', 'b', 'desc')).toBeGreaterThan(0)
    })
  })

  describe('sortResources', () => {
    const mockPods = [
      {
        metadata: { name: 'pod-alpha', namespace: 'default', creationTimestamp: '2024-01-01T00:00:00Z' },
        status: { phase: 'Running', containerStatuses: [{ ready: true, restartCount: 0 }] }
      },
      {
        metadata: { name: 'pod-beta', namespace: 'kube-system', creationTimestamp: '2024-01-02T00:00:00Z' },
        status: { phase: 'Pending', containerStatuses: [{ ready: false, restartCount: 5 }] }
      },
      {
        metadata: { name: 'pod-gamma', namespace: 'test', creationTimestamp: '2024-01-03T00:00:00Z' },
        status: { phase: 'Failed', containerStatuses: [{ ready: false, restartCount: 10 }, { ready: false, restartCount: 2 }] }
      },
      {
        metadata: { name: 'pod-delta', namespace: 'default', creationTimestamp: '2024-01-04T00:00:00Z' },
        status: { phase: 'Succeeded', containerStatuses: [{ ready: true, restartCount: 0 }] }
      },
      {
        metadata: { name: 'pod-epsilon', namespace: 'monitoring', creationTimestamp: '2024-01-05T00:00:00Z' },
        status: { phase: 'Running', containerStatuses: [] }
      }
    ]

    const mockPodMetrics = {
      'default/pod-alpha': { cpu: '100m', memory: '256Mi' },
      'kube-system/pod-beta': { cpu: '50m', memory: '512Mi' },
      'test/pod-gamma': { cpu: '2', memory: '1Gi' },
      'default/pod-delta': { cpu: '250m', memory: '128Mi' },
      'monitoring/pod-epsilon': { cpu: '-', memory: '-' }
    }

    it('should sort by name', () => {
      const sorted = sortResources(mockPods, 'name', 'asc')
      const names = sorted.map(p => p.metadata.name)
      expect(names).toEqual(['pod-alpha', 'pod-beta', 'pod-delta', 'pod-epsilon', 'pod-gamma'])
    })

    it('should sort by name descending', () => {
      const sorted = sortResources(mockPods, 'name', 'desc')
      const names = sorted.map(p => p.metadata.name)
      expect(names).toEqual(['pod-gamma', 'pod-epsilon', 'pod-delta', 'pod-beta', 'pod-alpha'])
    })

    it('should sort by namespace', () => {
      const sorted = sortResources(mockPods, 'namespace', 'asc')
      const namespaces = sorted.map(p => p.metadata.namespace)
      expect(namespaces).toEqual(['default', 'default', 'kube-system', 'monitoring', 'test'])
    })

    it('should sort by status', () => {
      const sorted = sortResources(mockPods, 'status', 'asc')
      const statuses = sorted.map(p => p.status.phase)
      expect(statuses).toEqual(['Failed', 'Pending', 'Running', 'Running', 'Succeeded'])
    })

    it('should sort by restarts', () => {
      const sorted = sortResources(mockPods, 'restarts', 'asc')
      const restarts = sorted.map(p =>
        (p.status.containerStatuses || []).reduce((sum, c) => sum + c.restartCount, 0)
      )
      expect(restarts).toEqual([0, 0, 0, 5, 12])
    })

    it('should sort by CPU with podMetrics', () => {
      const sorted = sortResources(mockPods, 'cpu', 'asc', { podMetrics: mockPodMetrics })
      const names = sorted.map(p => p.metadata.name)
      // Order: beta (50m), alpha (100m), delta (250m), gamma (2000m), epsilon (-1, goes to end)
      expect(names).toEqual(['pod-beta', 'pod-alpha', 'pod-delta', 'pod-gamma', 'pod-epsilon'])
    })

    it('should sort by memory with podMetrics', () => {
      const sorted = sortResources(mockPods, 'memory', 'asc', { podMetrics: mockPodMetrics })
      const names = sorted.map(p => p.metadata.name)
      // Order: delta (128Mi), alpha (256Mi), beta (512Mi), gamma (1Gi), epsilon (-1, goes to end)
      expect(names).toEqual(['pod-delta', 'pod-alpha', 'pod-beta', 'pod-gamma', 'pod-epsilon'])
    })

    it('should sort by age', () => {
      const sorted = sortResources(mockPods, 'age', 'asc')
      const names = sorted.map(p => p.metadata.name)
      expect(names).toEqual(['pod-alpha', 'pod-beta', 'pod-gamma', 'pod-delta', 'pod-epsilon'])
    })

    it('should not mutate the original array', () => {
      const original = [...mockPods]
      const sorted = sortResources(mockPods, 'name', 'asc')
      expect(mockPods).toEqual(original)
      expect(sorted).not.toBe(mockPods)
    })
  })

  describe('Complex sorting scenarios', () => {
    it('should handle mixed valid and invalid CPU values', () => {
      const values = ['100m', null, '500m', undefined, '1', '-', '2', '', '50m', '0.5']
      const sorted = values.sort((a, b) => {
        const aValue = cpuToMillicores(a)
        const bValue = cpuToMillicores(b)
        return compareValues(aValue, bValue)
      })

      // Last 4 should be invalid values (returning -1), as they go to the end
      const lastFour = sorted.slice(-4)
      const invalidCount = lastFour.filter(v => cpuToMillicores(v) === -1).length
      expect(invalidCount).toBe(4)

      // First 6 should be sorted numerically
      const validValues = sorted.slice(0, 6).map(v => cpuToMillicores(v))
      expect(validValues).toEqual([50, 100, 500, 500, 1000, 2000])
    })

    it('should handle mixed valid and invalid memory values', () => {
      const values = ['256Mi', null, '1Gi', '-', '128Mi', undefined, '512Ki', '', '2Gi']
      const sorted = values.sort((a, b) => {
        const aValue = memoryToBytes(a)
        const bValue = memoryToBytes(b)
        return compareValues(aValue, bValue)
      })

      // Last 4 should be invalid values (returning -1), as they go to the end
      const lastFour = sorted.slice(-4)
      const invalidCount = lastFour.filter(v => memoryToBytes(v) === -1).length
      expect(invalidCount).toBe(4)

      // First 5 values should be sorted by size
      const validSorted = sorted.slice(0, 5)
      expect(validSorted[0]).toBe('512Ki') // Smallest
      expect(validSorted[validSorted.length - 1]).toBe('2Gi') // Largest
    })

    it('should handle edge cases in CPU values', () => {
      const edgeCases = [
        { input: '0m', expected: 0 },
        { input: '0.001m', expected: 0.001 },
        { input: '9999m', expected: 9999 },
        { input: '10', expected: 10000 },
        { input: '0.0001', expected: 0.1 },
        { input: '1000000000n', expected: 1000 }
      ]

      edgeCases.forEach(({ input, expected }) => {
        expect(cpuToMillicores(input)).toBe(expected)
      })
    })

    it('should handle edge cases in memory values', () => {
      const edgeCases = [
        { input: '0Ki', expected: 0 },
        { input: '0.5Mi', expected: 0.5 * 1024 * 1024 },
        { input: '1023Ki', expected: 1023 * 1024 },
        { input: '1.5Gi', expected: 1.5 * 1024 * 1024 * 1024 },
        { input: '0.001Ti', expected: 0.001 * 1024 * 1024 * 1024 * 1024 }
      ]

      edgeCases.forEach(({ input, expected }) => {
        expect(memoryToBytes(input)).toBe(expected)
      })
    })
  })
})