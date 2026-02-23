import { describe, it, expect } from 'vitest'
import {
  parseResourceValue,
  formatCpuValue,
  formatMemoryValue,
  getResourceColor,
  getResourceWarnings,
  getResourceWarningIndicator,
  getPodResourceWarnings,
  parseContainerState,
  createResourceHelpers
} from './resourceHelpers'

// @tests-contract parseResourceValue.cpu
describe('parseResourceValue - CPU', () => {
  it('should parse millicores (100m -> 100)', () => {
    expect(parseResourceValue('100m', 'cpu')).toBe(100)
  })
  it('should parse whole cores (2 -> 2000)', () => {
    expect(parseResourceValue('2', 'cpu')).toBe(2000)
  })
  it('should parse fractional cores (0.5 -> 500)', () => {
    expect(parseResourceValue('0.5', 'cpu')).toBe(500)
  })
  it('should parse 1 core to 1000 millicores', () => {
    expect(parseResourceValue('1', 'cpu')).toBe(1000)
  })
  it('should parse 250m to 250', () => {
    expect(parseResourceValue('250m', 'cpu')).toBe(250)
  })
  it('should return 0 for null', () => {
    expect(parseResourceValue(null, 'cpu')).toBe(0)
  })
  it('should return 0 for undefined', () => {
    expect(parseResourceValue(undefined, 'cpu')).toBe(0)
  })
  it('should return 0 for "-"', () => {
    expect(parseResourceValue('-', 'cpu')).toBe(0)
  })
  it('should return 0 for empty string', () => {
    expect(parseResourceValue('', 'cpu')).toBe(0)
  })
})

// @tests-contract parseResourceValue.memory
describe('parseResourceValue - Memory', () => {
  it('should parse Ki values (1024Ki -> 1 Mi)', () => {
    expect(parseResourceValue('1024Ki', 'memory')).toBe(1)
  })
  it('should parse Mi values directly', () => {
    expect(parseResourceValue('256Mi', 'memory')).toBe(256)
  })
  it('should parse Gi values (1Gi -> 1024 Mi)', () => {
    expect(parseResourceValue('1Gi', 'memory')).toBe(1024)
  })
  it('should parse K values (same as Ki)', () => {
    expect(parseResourceValue('1024K', 'memory')).toBe(1)
  })
  it('should parse M values (same as Mi)', () => {
    expect(parseResourceValue('256M', 'memory')).toBe(256)
  })
  it('should parse G values (same as Gi)', () => {
    expect(parseResourceValue('2G', 'memory')).toBe(2048)
  })
  it('should return 0 for null', () => {
    expect(parseResourceValue(null, 'memory')).toBe(0)
  })
  it('should return 0 for "-"', () => {
    expect(parseResourceValue('-', 'memory')).toBe(0)
  })
  it('should parse small Ki values (512Ki -> 0.5)', () => {
    expect(parseResourceValue('512Ki', 'memory')).toBe(0.5)
  })
  it('should handle numeric input without unit', () => {
    expect(parseResourceValue('100', 'memory')).toBe(100)
  })
})

// @tests-contract formatCpuValue.nanocores
describe('formatCpuValue - nanocores', () => {
  it('should convert 1312875n to 1m', () => {
    expect(formatCpuValue('1312875n')).toBe('1m')
  })
  it('should convert 1000000n to 1m', () => {
    expect(formatCpuValue('1000000n')).toBe('1m')
  })
  it('should convert 500000000n to 500m', () => {
    expect(formatCpuValue('500000000n')).toBe('500m')
  })
  it('should round nanocores properly (1500000n -> 2m)', () => {
    expect(formatCpuValue('1500000n')).toBe('2m')
  })
  it('should handle very small nanocores (100n -> 0m)', () => {
    expect(formatCpuValue('100n')).toBe('0m')
  })
})

// @tests-contract formatCpuValue.millicores
describe('formatCpuValue - millicores', () => {
  it('should pass through 500m unchanged', () => {
    expect(formatCpuValue('500m')).toBe('500m')
  })
  it('should pass through 100m unchanged', () => {
    expect(formatCpuValue('100m')).toBe('100m')
  })
  it('should return "-" for null/undefined/0/"-"', () => {
    expect(formatCpuValue(null)).toBe('-')
    expect(formatCpuValue(undefined)).toBe('-')
    expect(formatCpuValue('0')).toBe('-')
    expect(formatCpuValue('-')).toBe('-')
  })
  it('should convert whole cores to millicores (2 -> 2000m)', () => {
    expect(formatCpuValue('2')).toBe('2000m')
  })
  it('should return raw value if no match', () => {
    expect(formatCpuValue('abc')).toBe('abc')
  })
})

// @tests-contract formatMemoryValue.ki
describe('formatMemoryValue - Ki to Mi', () => {
  it('should convert 207016Ki to 202Mi', () => {
    expect(formatMemoryValue('207016Ki')).toBe('202Mi')
  })
  it('should convert 1024Ki to 1Mi', () => {
    expect(formatMemoryValue('1024Ki')).toBe('1Mi')
  })
  it('should convert 512Ki to 1Mi (rounds)', () => {
    expect(formatMemoryValue('512Ki')).toBe('1Mi')
  })
  it('should pass through Mi values', () => {
    expect(formatMemoryValue('256Mi')).toBe('256Mi')
  })
  it('should return "-" for null/undefined/0/"-"', () => {
    expect(formatMemoryValue(null)).toBe('-')
    expect(formatMemoryValue(undefined)).toBe('-')
    expect(formatMemoryValue('0')).toBe('-')
    expect(formatMemoryValue('-')).toBe('-')
  })
})

// @tests-contract formatMemoryValue.gi
describe('formatMemoryValue - Gi to Mi', () => {
  it('should convert 1Gi to 1024Mi', () => {
    expect(formatMemoryValue('1Gi')).toBe('1024Mi')
  })
  it('should convert 2Gi to 2048Mi', () => {
    expect(formatMemoryValue('2Gi')).toBe('2048Mi')
  })
  it('should convert bytes to Mi (bare number treated as Ki)', () => {
    // Bare numbers default to Ki unit internally: 1048576Ki / 1024 = 1024Mi
    expect(formatMemoryValue('1048576')).toBe('1024Mi')
  })
  it('should convert B suffix to Mi', () => {
    // 1048576B = 1048576 / (1024*1024) = 1Mi
    expect(formatMemoryValue('1048576B')).toBe('1Mi')
  })
})

// @tests-contract getResourceColor.noUsage
describe('getResourceColor - no usage', () => {
  it('should return gray when usage is "-"', () => {
    expect(getResourceColor('-', '100m', '200m', 'cpu')).toContain('gray')
  })
  it('should return gray when both request and limit are "-"', () => {
    expect(getResourceColor('100m', '-', '-', 'cpu')).toContain('gray')
  })
  it('should return gray when request and limit are falsy', () => {
    expect(getResourceColor('100m', null, null, 'cpu')).toContain('gray')
  })
})

// @tests-contract getResourceColor.overLimit
describe('getResourceColor - over limit', () => {
  it('should return red when usage > 80% of limit', () => {
    expect(getResourceColor('900m', '500m', '1000m', 'cpu')).toContain('red')
  })
  it('should return red at 81% of limit', () => {
    expect(getResourceColor('810m', '500m', '1000m', 'cpu')).toContain('red')
  })
})

// @tests-contract getResourceColor.overRequest
describe('getResourceColor - over request', () => {
  it('should return orange when usage > 95% of request but under limit threshold', () => {
    expect(getResourceColor('960m', '1000m', '2000m', 'cpu')).toContain('orange')
  })
})

// @tests-contract getResourceColor.underRequest
describe('getResourceColor - under request', () => {
  it('should return blue when usage < 50% of request', () => {
    expect(getResourceColor('200m', '1000m', '2000m', 'cpu')).toContain('blue')
  })
})

// @tests-contract getResourceColor.healthy
describe('getResourceColor - healthy', () => {
  it('should return green for normal usage', () => {
    expect(getResourceColor('600m', '1000m', '2000m', 'cpu')).toContain('green')
  })
  it('should return yellow when parsed req/limit are 0', () => {
    expect(getResourceColor('100m', '0', '0', 'cpu')).toContain('yellow')
  })
})

// @tests-contract getResourceWarnings.missingRequest
describe('getResourceWarnings - missing request', () => {
  it('should warn when request is null', () => {
    const w = getResourceWarnings(null, '1000m', 'cpu')
    expect(w.some(x => x.includes('No cpu request'))).toBe(true)
  })
  it('should warn when request is "-"', () => {
    const w = getResourceWarnings('-', '1000m', 'cpu')
    expect(w.some(x => x.includes('No cpu request'))).toBe(true)
  })
})

// @tests-contract getResourceWarnings.missingLimit
describe('getResourceWarnings - missing limit', () => {
  it('should warn when limit is null', () => {
    const w = getResourceWarnings('100m', null, 'cpu')
    expect(w.some(x => x.includes('No cpu limit'))).toBe(true)
  })
  it('should warn when limit is "-"', () => {
    const w = getResourceWarnings('100m', '-', 'cpu')
    expect(w.some(x => x.includes('No cpu limit'))).toBe(true)
  })
  it('should warn for both missing', () => {
    const w = getResourceWarnings(null, null, 'memory')
    expect(w).toHaveLength(2)
  })
  it('should return no warnings when both properly set', () => {
    expect(getResourceWarnings('600m', '1000m', 'cpu')).toHaveLength(0)
  })
  it('should warn about CPU ratio when request < 50% of limit', () => {
    const w = getResourceWarnings('100m', '1000m', 'cpu')
    expect(w.some(x => x.includes('less than 50%'))).toBe(true)
  })
  it('should warn about memory ratio when request < 80% of limit', () => {
    const w = getResourceWarnings('100Mi', '1000Mi', 'memory')
    expect(w.some(x => x.includes('less than 80%'))).toBe(true)
  })
})

describe('getResourceWarningIndicator', () => {
  it('should return null when no warnings', () => {
    expect(getResourceWarningIndicator('600m', '1000m', 'cpu')).toBeNull()
  })
  it('should return yellow for missing resources', () => {
    const r = getResourceWarningIndicator(null, '1000m', 'cpu')
    expect(r).not.toBeNull()
    expect(r.color).toContain('yellow')
  })
  it('should return indigo for ratio warnings', () => {
    const r = getResourceWarningIndicator('100m', '1000m', 'cpu')
    expect(r).not.toBeNull()
    expect(r.color).toContain('indigo')
  })
  it('should include tooltip text', () => {
    const r = getResourceWarningIndicator(null, null, 'cpu')
    expect(r.tooltip).toContain('No')
  })
})

describe('getPodResourceWarnings', () => {
  it('should return {cpu: false, memory: false} for pod without containers', () => {
    expect(getPodResourceWarnings({})).toEqual({ cpu: false, memory: false })
  })
  it('should detect cpu warnings when container has no cpu specs', () => {
    // Container has memory but no cpu at all -> cpu warning
    // Memory request 800Mi / limit 1000Mi = 80%, so no memory ratio warning
    const pod = { spec: { containers: [{ name: 'a', resources: { requests: { memory: '800Mi' }, limits: { memory: '1000Mi' } } }] } }
    expect(getPodResourceWarnings(pod).cpu).toBe(true)
    expect(getPodResourceWarnings(pod).memory).toBe(false)
  })
  it('should detect memory warnings when container has no memory specs', () => {
    // Container has cpu but no memory at all -> memory warning
    // CPU request 500m / limit 1000m = 50%, so no cpu ratio warning
    const pod = { spec: { containers: [{ name: 'a', resources: { requests: { cpu: '500m' }, limits: { cpu: '1000m' } } }] } }
    expect(getPodResourceWarnings(pod).cpu).toBe(false)
    expect(getPodResourceWarnings(pod).memory).toBe(true)
  })
  it('should detect warnings across multiple containers', () => {
    const pod = { spec: { containers: [
      { name: 'a', resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '200m', memory: '256Mi' } } },
      { name: 'b', resources: {} }
    ] } }
    expect(getPodResourceWarnings(pod).cpu).toBe(true)
    expect(getPodResourceWarnings(pod).memory).toBe(true)
  })
  it('should return no warnings when properly set', () => {
    const pod = { spec: { containers: [{ name: 'a', resources: { requests: { cpu: '500m', memory: '800Mi' }, limits: { cpu: '1000m', memory: '1000Mi' } } }] } }
    expect(getPodResourceWarnings(pod).cpu).toBe(false)
    expect(getPodResourceWarnings(pod).memory).toBe(false)
  })
})

// @tests-contract parseContainerState.string
describe('parseContainerState - string', () => {
  it('should return string as-is', () => {
    expect(parseContainerState('Running')).toBe('Running')
  })
  it('should return any string unchanged', () => {
    expect(parseContainerState('waiting')).toBe('waiting')
  })
})

// @tests-contract parseContainerState.object
describe('parseContainerState - object', () => {
  it('should capitalize key from {running: {}}', () => {
    expect(parseContainerState({ running: {} })).toBe('Running')
  })
  it('should handle waiting state', () => {
    expect(parseContainerState({ waiting: { reason: 'CrashLoopBackOff' } })).toBe('Waiting')
  })
  it('should handle terminated state', () => {
    expect(parseContainerState({ terminated: { exitCode: 0 } })).toBe('Terminated')
  })
  it('should return Unknown for empty object', () => {
    expect(parseContainerState({})).toBe('Unknown')
  })
})

// @tests-contract parseContainerState.null
describe('parseContainerState - null/undefined', () => {
  it('should return Unknown for null', () => { expect(parseContainerState(null)).toBe('Unknown') })
  it('should return Unknown for undefined', () => { expect(parseContainerState(undefined)).toBe('Unknown') })
  it('should return Unknown for 0', () => { expect(parseContainerState(0)).toBe('Unknown') })
  it('should return Unknown for false', () => { expect(parseContainerState(false)).toBe('Unknown') })
})

// @tests-contract createResourceHelpers.podStatus
describe('createResourceHelpers - pod status', () => {
  const helpers = createResourceHelpers('Pod', {})
  it('should return pod phase', () => { expect(helpers.getResourceStatus({ status: { phase: 'Running' } })).toBe('Running') })
  it('should return Unknown when phase missing', () => { expect(helpers.getResourceStatus({ status: {} })).toBe('Unknown') })
  it('should return Unknown when status missing', () => { expect(helpers.getResourceStatus({})).toBe('Unknown') })
  it('should handle Pending', () => { expect(helpers.getResourceStatus({ status: { phase: 'Pending' } })).toBe('Pending') })
  it('should handle Failed', () => { expect(helpers.getResourceStatus({ status: { phase: 'Failed' } })).toBe('Failed') })
  it('should handle Succeeded', () => { expect(helpers.getResourceStatus({ status: { phase: 'Succeeded' } })).toBe('Succeeded') })
})

// @tests-contract createResourceHelpers.deploymentStatus
describe('createResourceHelpers - deployment status', () => {
  const helpers = createResourceHelpers('Deployment', {})
  it('should return Ready when readyReplicas equals replicas', () => {
    expect(helpers.getResourceStatus({ status: { readyReplicas: 3, replicas: 3 } })).toBe('Ready')
  })
  it('should return NotReady when readyReplicas < replicas', () => {
    expect(helpers.getResourceStatus({ status: { readyReplicas: 1, replicas: 3 } })).toBe('NotReady')
  })
  it('should return NotReady when readyReplicas missing', () => {
    expect(helpers.getResourceStatus({ status: { replicas: 3 } })).toBe('NotReady')
  })
  it('should return Ready when both are 0', () => {
    expect(helpers.getResourceStatus({ status: { readyReplicas: 0, replicas: 0 } })).toBe('Ready')
  })
})

// @tests-contract createResourceHelpers.nodeStatus
describe('createResourceHelpers - node status', () => {
  const helpers = createResourceHelpers('Node', {})
  it('should return Ready when condition True', () => {
    expect(helpers.getResourceStatus({ status: { conditions: [{ type: 'Ready', status: 'True' }] } })).toBe('Ready')
  })
  it('should return NotReady when condition False', () => {
    expect(helpers.getResourceStatus({ status: { conditions: [{ type: 'Ready', status: 'False' }] } })).toBe('NotReady')
  })
  it('should return NotReady when no conditions', () => {
    expect(helpers.getResourceStatus({ status: { conditions: [] } })).toBe('NotReady')
  })
  it('should handle multiple conditions', () => {
    expect(helpers.getResourceStatus({ status: { conditions: [
      { type: 'MemoryPressure', status: 'False' },
      { type: 'Ready', status: 'True' }
    ] } })).toBe('Ready')
  })
})

describe('createResourceHelpers - getContainerReadyCount', () => {
  const helpers = createResourceHelpers('Pod', {})
  it('should return "-" when no container statuses', () => {
    expect(helpers.getContainerReadyCount({})).toBe('-')
    expect(helpers.getContainerReadyCount({ status: {} })).toBe('-')
  })
  it('should count ready containers', () => {
    expect(helpers.getContainerReadyCount({ status: { containerStatuses: [{ ready: true }, { ready: false }, { ready: true }] } })).toBe('2/3')
  })
})

describe('createResourceHelpers - getRestartCount', () => {
  const helpers = createResourceHelpers('Pod', {})
  it('should return "0" when no statuses', () => { expect(helpers.getRestartCount({})).toBe('0') })
  it('should sum restart counts', () => {
    expect(helpers.getRestartCount({ status: { containerStatuses: [{ restartCount: 3 }, { restartCount: 5 }] } })).toBe('8')
  })
  it('should handle missing restartCount', () => {
    expect(helpers.getRestartCount({ status: { containerStatuses: [{ restartCount: 3 }, {}] } })).toBe('3')
  })
})

describe('createResourceHelpers - formatPorts', () => {
  const helpers = createResourceHelpers('Service', {})
  it('should return "-" for null/empty', () => {
    expect(helpers.formatPorts(null)).toBe('-')
    expect(helpers.formatPorts([])).toBe('-')
  })
  it('should format port with protocol', () => { expect(helpers.formatPorts([{ port: 80, protocol: 'TCP' }])).toBe('80/TCP') })
  it('should format multiple ports', () => {
    expect(helpers.formatPorts([{ port: 80, protocol: 'TCP' }, { port: 443, protocol: 'TCP' }])).toBe('80/TCP, 443/TCP')
  })
  it('should handle port without protocol', () => { expect(helpers.formatPorts([{ port: 8080 }])).toBe('8080') })
})

describe('createResourceHelpers - getNodeRoles', () => {
  const helpers = createResourceHelpers('Node', {})
  it('should return "-" when no labels', () => {
    expect(helpers.getNodeRoles({})).toBe('-')
    expect(helpers.getNodeRoles({ metadata: {} })).toBe('-')
  })
  it('should detect control-plane', () => {
    // The code uses truthiness check, so the label value must be truthy
    expect(helpers.getNodeRoles({ metadata: { labels: { 'node-role.kubernetes.io/control-plane': 'true' } } })).toBe('control-plane')
  })
  it('should default to worker', () => {
    expect(helpers.getNodeRoles({ metadata: { labels: { 'some-label': 'v' } } })).toBe('worker')
  })
})

describe('createResourceHelpers - getParentResource', () => {
  const helpers = createResourceHelpers('Pod', {})
  it('should return "-" when no owner refs', () => {
    expect(helpers.getParentResource({})).toBe('-')
    expect(helpers.getParentResource({ metadata: {} })).toBe('-')
    expect(helpers.getParentResource({ metadata: { ownerReferences: [] } })).toBe('-')
  })
  it('should return controller owner', () => {
    expect(helpers.getParentResource({ metadata: { ownerReferences: [
      { kind: 'ReplicaSet', name: 'rs', controller: false },
      { kind: 'Deployment', name: 'dep', controller: true }
    ] } })).toBe('Deployment/dep')
  })
  it('should return first owner if no controller', () => {
    expect(helpers.getParentResource({ metadata: { ownerReferences: [{ kind: 'ReplicaSet', name: 'rs' }] } })).toBe('ReplicaSet/rs')
  })
})

describe('createResourceHelpers - getCpuUsage/getMemoryUsage', () => {
  const metrics = { 'default/my-pod': { cpu: '100m', memory: '256Mi' } }
  const helpers = createResourceHelpers('Pod', metrics)
  it('should return cpu from metrics', () => {
    expect(helpers.getCpuUsage({ metadata: { namespace: 'default', name: 'my-pod' } })).toBe('100m')
  })
  it('should return memory from metrics', () => {
    expect(helpers.getMemoryUsage({ metadata: { namespace: 'default', name: 'my-pod' } })).toBe('256Mi')
  })
  it('should return "-" when no metrics', () => {
    expect(helpers.getCpuUsage({ metadata: { namespace: 'default', name: 'x' } })).toBe('-')
  })
  it('should return "-" for non-Pod', () => {
    const h = createResourceHelpers('Deployment', metrics)
    expect(h.getCpuUsage({ metadata: { namespace: 'default', name: 'x' } })).toBe('-')
  })
})

describe('createResourceHelpers - getResourceInfo', () => {
  it('should return container ready count for Pod', () => {
    const h = createResourceHelpers('Pod', {})
    expect(h.getResourceInfo({ status: { containerStatuses: [{ ready: true }, { ready: true }] } })).toBe('2/2')
  })
  it('should return type for Service', () => {
    const h = createResourceHelpers('Service', {})
    expect(h.getResourceInfo({ spec: { type: 'ClusterIP' } })).toBe('ClusterIP')
  })
  it('should return replicas for Deployment', () => {
    const h = createResourceHelpers('Deployment', {})
    expect(h.getResourceInfo({ status: { readyReplicas: 3, replicas: 3 } })).toBe('3/3')
  })
  it('should return keys for ConfigMap', () => {
    const h = createResourceHelpers('ConfigMap', {})
    expect(h.getResourceInfo({ data: { k1: 'v', k2: 'v' } })).toBe('2 keys')
  })
  it('should return keys for Secret', () => {
    const h = createResourceHelpers('Secret', {})
    expect(h.getResourceInfo({ data: { k1: 'v' } })).toBe('1 keys')
  })
  it('should handle generic resource with replicas', () => {
    const h = createResourceHelpers('StatefulSet', {})
    expect(h.getResourceInfo({ spec: { replicas: 3 }, status: { readyReplicas: 2 } })).toBe('2/3')
  })
  it('should return "-" for unknown', () => {
    const h = createResourceHelpers('Unknown', {})
    expect(h.getResourceInfo({ status: {} })).toBe('-')
  })
})

describe('createResourceHelpers - generic status detection', () => {
  const helpers = createResourceHelpers('CustomResource', {})
  it('should detect Ready condition', () => {
    expect(helpers.getResourceStatus({ status: { conditions: [{ type: 'Ready', status: 'True' }] } })).toBe('Ready')
  })
  it('should detect Available condition', () => {
    expect(helpers.getResourceStatus({ status: { conditions: [{ type: 'Available', status: 'True' }] } })).toBe('Ready')
  })
  it('should detect phase field', () => {
    expect(helpers.getResourceStatus({ status: { phase: 'Active' } })).toBe('Active')
  })
  it('should detect state field', () => {
    expect(helpers.getResourceStatus({ status: { state: 'Bound' } })).toBe('Bound')
  })
  it('should detect ready boolean', () => {
    expect(helpers.getResourceStatus({ status: { ready: true } })).toBe('Ready')
  })
  it('should detect replica-based status', () => {
    expect(helpers.getResourceStatus({ status: { readyReplicas: 2, replicas: 3 } })).toBe('NotReady')
  })
  it('should detect keywords in status JSON', () => {
    expect(helpers.getResourceStatus({ status: { someField: 'is running' } })).toBe('Running')
  })
  it('should default to Active', () => {
    expect(helpers.getResourceStatus({ status: { foo: 'bar' } })).toBe('Active')
  })
})
