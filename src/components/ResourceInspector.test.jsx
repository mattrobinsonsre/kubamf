// @tests-contract ResourceInspector.nullWhenClosed
// @tests-contract ResourceInspector.backdropClose
// @tests-contract ResourceInspector.closeButton
// @tests-contract ResourceInspector.resourceName
// @tests-contract ResourceInspector.podDetails
// @tests-contract ResourceInspector.deploymentDetails
// @tests-contract ResourceInspector.serviceDetails
// @tests-contract ResourceInspector.nodeDetails
// @tests-contract ResourceInspector.defaultDetails
// @tests-contract ResourceInspector.labels
// @tests-contract ResourceInspector.annotations
// @tests-contract ResourceInspector.rawYaml

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

// Mock yaml module
vi.mock('yaml', () => ({
  default: {
    stringify: vi.fn((obj) => JSON.stringify(obj, null, 2)),
  },
  stringify: vi.fn((obj) => JSON.stringify(obj, null, 2)),
}))

// Mock lucide-react icons with simple spans
vi.mock('lucide-react', () => ({
  X: (props) => React.createElement('span', { 'data-testid': 'icon-x', ...props }, 'X'),
  FileText: (props) => React.createElement('span', { 'data-testid': 'icon-filetext', ...props }, 'FileText'),
  Activity: (props) => React.createElement('span', { 'data-testid': 'icon-activity', ...props }, 'Activity'),
  Clock: (props) => React.createElement('span', { 'data-testid': 'icon-clock', ...props }, 'Clock'),
  Tag: (props) => React.createElement('span', { 'data-testid': 'icon-tag', ...props }, 'Tag'),
  Network: (props) => React.createElement('span', { 'data-testid': 'icon-network', ...props }, 'Network'),
  Shield: (props) => React.createElement('span', { 'data-testid': 'icon-shield', ...props }, 'Shield'),
  Package: (props) => React.createElement('span', { 'data-testid': 'icon-package', ...props }, 'Package'),
  Cpu: (props) => React.createElement('span', { 'data-testid': 'icon-cpu', ...props }, 'Cpu'),
  HardDrive: (props) => React.createElement('span', { 'data-testid': 'icon-harddrive', ...props }, 'HardDrive'),
  GitBranch: (props) => React.createElement('span', { 'data-testid': 'icon-gitbranch', ...props }, 'GitBranch'),
}))

import ResourceInspector from './ResourceInspector'

describe('ResourceInspector', () => {
  const baseResource = {
    metadata: {
      name: 'test-pod',
      namespace: 'default',
      creationTimestamp: '2024-01-01T00:00:00Z',
      labels: {
        app: 'myapp',
        env: 'production',
      },
      annotations: {},
    },
    spec: {},
    status: {},
  }

  const defaultProps = {
    resource: baseResource,
    resourceType: { kind: 'Pod' },
    isOpen: true,
    onClose: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // @tests-contract ResourceInspector.nullWhenClosed
  describe('nullWhenClosed', () => {
    it('should return null when isOpen is false', () => {
      const { container } = render(
        <ResourceInspector {...defaultProps} isOpen={false} />
      )
      expect(container.innerHTML).toBe('')
    })

    it('should return null when resource is null', () => {
      const { container } = render(
        <ResourceInspector {...defaultProps} resource={null} />
      )
      expect(container.innerHTML).toBe('')
    })

    it('should return null when both isOpen is false and resource is null', () => {
      const { container } = render(
        <ResourceInspector {...defaultProps} isOpen={false} resource={null} />
      )
      expect(container.innerHTML).toBe('')
    })

    it('should render content when isOpen is true and resource is provided', () => {
      const { container } = render(<ResourceInspector {...defaultProps} />)
      expect(container.innerHTML).not.toBe('')
    })
  })

  // @tests-contract ResourceInspector.backdropClose
  describe('backdropClose', () => {
    it('should call onClose when backdrop is clicked', () => {
      const onClose = vi.fn()
      render(<ResourceInspector {...defaultProps} onClose={onClose} />)

      // The backdrop is the first div with fixed inset-0
      const backdrop = document.querySelector('.fixed.inset-0')
      fireEvent.click(backdrop)

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // @tests-contract ResourceInspector.closeButton
  describe('closeButton', () => {
    it('should call onClose when header close button is clicked', () => {
      const onClose = vi.fn()
      render(<ResourceInspector {...defaultProps} onClose={onClose} />)

      // Find the X icon button in the header
      const xIcon = screen.getByTestId('icon-x')
      const headerCloseButton = xIcon.closest('button')
      fireEvent.click(headerCloseButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should call onClose when footer Close button is clicked', () => {
      const onClose = vi.fn()
      render(<ResourceInspector {...defaultProps} onClose={onClose} />)

      const closeButton = screen.getByText('Close')
      fireEvent.click(closeButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // @tests-contract ResourceInspector.resourceName
  describe('resourceName', () => {
    it('should display resource name in header', () => {
      render(<ResourceInspector {...defaultProps} />)
      expect(screen.getByText('test-pod')).toBeInTheDocument()
    })

    it('should display the details title', () => {
      render(<ResourceInspector {...defaultProps} />)
      expect(screen.getByText('Pod Details')).toBeInTheDocument()
    })
  })

  // @tests-contract ResourceInspector.podDetails
  describe('podDetails', () => {
    it('should show pod Status section', () => {
      const podResource = {
        ...baseResource,
        spec: {
          nodeName: 'node-1',
          containers: [
            {
              name: 'main',
              image: 'nginx:latest',
              ports: [{ containerPort: 80, protocol: 'TCP' }],
              resources: {
                requests: { cpu: '100m', memory: '128Mi' },
                limits: { cpu: '200m', memory: '256Mi' },
              },
            },
          ],
        },
        status: {
          phase: 'Running',
          podIP: '10.0.0.1',
          qosClass: 'Burstable',
          containerStatuses: [
            { ready: true, restartCount: 2 },
          ],
        },
      }

      render(
        <ResourceInspector
          resource={podResource}
          resourceType={{ kind: 'Pod' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('Phase:')).toBeInTheDocument()
      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.getByText('Ready:')).toBeInTheDocument()
      expect(screen.getByText('1/1')).toBeInTheDocument()
      expect(screen.getByText('Restarts:')).toBeInTheDocument()
      expect(screen.getByText('Node:')).toBeInTheDocument()
      expect(screen.getByText('node-1')).toBeInTheDocument()
      expect(screen.getByText('IP:')).toBeInTheDocument()
      expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
      expect(screen.getByText('QoS Class:')).toBeInTheDocument()
      expect(screen.getByText('Burstable')).toBeInTheDocument()
    })

    it('should show pod Containers section', () => {
      const podResource = {
        ...baseResource,
        spec: {
          containers: [
            {
              name: 'web',
              image: 'nginx:1.21',
              ports: [{ containerPort: 80, protocol: 'TCP' }],
              resources: {
                requests: { cpu: '100m', memory: '128Mi' },
                limits: { cpu: '200m', memory: '256Mi' },
              },
            },
          ],
        },
        status: {
          phase: 'Running',
          containerStatuses: [{ ready: true, restartCount: 0 }],
        },
      }

      render(
        <ResourceInspector
          resource={podResource}
          resourceType={{ kind: 'Pod' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('Containers')).toBeInTheDocument()
      expect(screen.getByText('web:')).toBeInTheDocument()
      expect(screen.getByText('nginx:1.21')).toBeInTheDocument()
    })
  })

  // @tests-contract ResourceInspector.deploymentDetails
  describe('deploymentDetails', () => {
    it('should show deployment-specific sections', () => {
      const deploymentResource = {
        ...baseResource,
        metadata: { ...baseResource.metadata, name: 'my-deployment' },
        spec: {
          strategy: {
            type: 'RollingUpdate',
            rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' },
          },
          selector: {
            matchLabels: { app: 'myapp' },
          },
        },
        status: {
          replicas: 3,
          readyReplicas: 3,
          updatedReplicas: 3,
          availableReplicas: 3,
          unavailableReplicas: 0,
        },
      }

      render(
        <ResourceInspector
          resource={deploymentResource}
          resourceType={{ kind: 'Deployment' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('my-deployment')).toBeInTheDocument()
      expect(screen.getByText('Deployment Details')).toBeInTheDocument()

      // Status section
      expect(screen.getByText('Replicas:')).toBeInTheDocument()
      expect(screen.getByText('3/3')).toBeInTheDocument()

      // Strategy section
      expect(screen.getByText('Strategy')).toBeInTheDocument()
      expect(screen.getByText('Type:')).toBeInTheDocument()
      expect(screen.getByText('RollingUpdate')).toBeInTheDocument()
      expect(screen.getByText('Max Surge:')).toBeInTheDocument()
      // Both Max Surge and Max Unavailable are 25%, so use getAllByText
      expect(screen.getAllByText('25%').length).toBe(2)
      expect(screen.getByText('Max Unavailable:')).toBeInTheDocument()

      // Selector section
      expect(screen.getByText('Selector')).toBeInTheDocument()
    })
  })

  // @tests-contract ResourceInspector.serviceDetails
  describe('serviceDetails', () => {
    it('should show service-specific sections', () => {
      const serviceResource = {
        ...baseResource,
        metadata: { ...baseResource.metadata, name: 'my-service' },
        spec: {
          type: 'ClusterIP',
          clusterIP: '10.96.0.1',
          externalIPs: null,
          sessionAffinity: 'None',
          ports: [
            { name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' },
          ],
          selector: { app: 'myapp' },
        },
      }

      render(
        <ResourceInspector
          resource={serviceResource}
          resourceType={{ kind: 'Service' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('my-service')).toBeInTheDocument()
      expect(screen.getByText('Service Details')).toBeInTheDocument()

      // Configuration section
      expect(screen.getByText('Configuration')).toBeInTheDocument()
      expect(screen.getByText('Cluster IP:')).toBeInTheDocument()
      expect(screen.getByText('10.96.0.1')).toBeInTheDocument()

      // Ports section
      expect(screen.getByText('Ports')).toBeInTheDocument()
      expect(screen.getByText('http:')).toBeInTheDocument()
      expect(screen.getByText('80:8080/TCP')).toBeInTheDocument()

      // Selector section
      expect(screen.getByText('Selector')).toBeInTheDocument()
    })
  })

  // @tests-contract ResourceInspector.nodeDetails
  describe('nodeDetails', () => {
    it('should show node-specific sections', () => {
      const nodeResource = {
        metadata: {
          name: 'worker-1',
          creationTimestamp: '2024-01-01T00:00:00Z',
          labels: {},
          annotations: {},
        },
        spec: {},
        status: {
          conditions: [{ type: 'Ready', status: 'True' }],
          nodeInfo: {
            kubeletVersion: 'v1.28.0',
            containerRuntimeVersion: 'containerd://1.7.0',
            operatingSystem: 'linux',
            architecture: 'amd64',
          },
          capacity: {
            cpu: '4',
            memory: '16Gi',
            pods: '110',
            'ephemeral-storage': '100Gi',
          },
          addresses: [
            { type: 'InternalIP', address: '192.168.1.10' },
            { type: 'Hostname', address: 'worker-1' },
          ],
        },
      }

      render(
        <ResourceInspector
          resource={nodeResource}
          resourceType={{ kind: 'Node' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      // worker-1 appears in header AND in Addresses (Hostname), so use getAllByText
      expect(screen.getAllByText('worker-1').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Node Details')).toBeInTheDocument()

      // Status section
      expect(screen.getByText('Ready:')).toBeInTheDocument()
      expect(screen.getByText('True')).toBeInTheDocument()
      expect(screen.getByText('Kubelet Version:')).toBeInTheDocument()
      expect(screen.getByText('v1.28.0')).toBeInTheDocument()

      // Capacity section
      expect(screen.getByText('Capacity')).toBeInTheDocument()
      expect(screen.getByText('CPU:')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
      expect(screen.getByText('Memory:')).toBeInTheDocument()
      expect(screen.getByText('16Gi')).toBeInTheDocument()

      // Addresses section
      expect(screen.getByText('Addresses')).toBeInTheDocument()
      expect(screen.getByText('InternalIP:')).toBeInTheDocument()
      expect(screen.getByText('192.168.1.10')).toBeInTheDocument()
    })
  })

  // @tests-contract ResourceInspector.defaultDetails
  describe('defaultDetails', () => {
    it('should show generic metadata/spec/status for unknown types', () => {
      const unknownResource = {
        metadata: {
          name: 'my-custom-resource',
          namespace: 'custom-ns',
          uid: 'abc-123',
          resourceVersion: '12345',
          creationTimestamp: '2024-01-01T00:00:00Z',
          labels: {},
          annotations: {},
        },
        spec: {
          replicas: 2,
          selector: 'app=test',
        },
        status: {
          ready: true,
          phase: 'Active',
        },
      }

      render(
        <ResourceInspector
          resource={unknownResource}
          resourceType={{ kind: 'MyCustomKind' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      // my-custom-resource appears in header AND in Metadata Name field, so use getAllByText
      expect(screen.getAllByText('my-custom-resource').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('MyCustomKind Details')).toBeInTheDocument()

      // Metadata section
      expect(screen.getByText('Metadata')).toBeInTheDocument()
      expect(screen.getByText('Name:')).toBeInTheDocument()
      expect(screen.getByText('UID:')).toBeInTheDocument()

      // Spec section
      expect(screen.getByText('Spec')).toBeInTheDocument()

      // Status section - find the section heading
      const statusHeadings = screen.getAllByText('Status')
      expect(statusHeadings.length).toBeGreaterThanOrEqual(1)
    })

    it('should handle unknown types with no resourceType kind', () => {
      const resource = {
        metadata: {
          name: 'unnamed-resource',
          creationTimestamp: '2024-01-01T00:00:00Z',
          labels: {},
          annotations: {},
        },
        spec: {},
        status: {},
      }

      render(
        <ResourceInspector
          resource={resource}
          resourceType={null}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      // unnamed-resource appears in header AND in Metadata Name field, so use getAllByText
      expect(screen.getAllByText('unnamed-resource').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Resource Details')).toBeInTheDocument()
    })
  })

  // @tests-contract ResourceInspector.labels
  describe('labels', () => {
    it('should display labels as badges', () => {
      const resource = {
        ...baseResource,
        metadata: {
          ...baseResource.metadata,
          labels: {
            app: 'myapp',
            env: 'production',
            tier: 'frontend',
          },
        },
      }

      render(
        <ResourceInspector
          resource={resource}
          resourceType={{ kind: 'Pod' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('Labels')).toBeInTheDocument()
      expect(screen.getByText('app: myapp')).toBeInTheDocument()
      expect(screen.getByText('env: production')).toBeInTheDocument()
      expect(screen.getByText('tier: frontend')).toBeInTheDocument()
    })

    it('should not show labels section when labels are empty', () => {
      const resource = {
        ...baseResource,
        metadata: {
          ...baseResource.metadata,
          labels: {},
        },
      }

      render(
        <ResourceInspector
          resource={resource}
          resourceType={{ kind: 'Pod' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.queryByText('Labels')).not.toBeInTheDocument()
    })
  })

  // @tests-contract ResourceInspector.annotations
  describe('annotations', () => {
    it('should show first 5 annotations', () => {
      const resource = {
        ...baseResource,
        metadata: {
          ...baseResource.metadata,
          annotations: {
            'key1': 'value1',
            'key2': 'value2',
            'key3': 'value3',
            'key4': 'value4',
            'key5': 'value5',
          },
        },
      }

      render(
        <ResourceInspector
          resource={resource}
          resourceType={{ kind: 'Pod' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('Annotations')).toBeInTheDocument()
      expect(screen.getByText('key1:')).toBeInTheDocument()
      expect(screen.getByText('value1')).toBeInTheDocument()
      expect(screen.getByText('key5:')).toBeInTheDocument()
      expect(screen.getByText('value5')).toBeInTheDocument()
    })

    it('should show +N more when there are more than 5 annotations', () => {
      const annotations = {}
      for (let i = 1; i <= 8; i++) {
        annotations['annotation-' + i] = 'val-' + i
      }

      const resource = {
        ...baseResource,
        metadata: {
          ...baseResource.metadata,
          annotations,
        },
      }

      render(
        <ResourceInspector
          resource={resource}
          resourceType={{ kind: 'Pod' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('Annotations')).toBeInTheDocument()
      expect(screen.getByText('+3 more...')).toBeInTheDocument()
    })

    it('should not show +N more when there are 5 or fewer annotations', () => {
      const resource = {
        ...baseResource,
        metadata: {
          ...baseResource.metadata,
          annotations: {
            'key1': 'value1',
            'key2': 'value2',
          },
        },
      }

      render(
        <ResourceInspector
          resource={resource}
          resourceType={{ kind: 'Pod' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.getByText('Annotations')).toBeInTheDocument()
      expect(screen.queryByText(/more...$/)).not.toBeInTheDocument()
    })

    it('should not show annotations section when annotations are empty', () => {
      const resource = {
        ...baseResource,
        metadata: {
          ...baseResource.metadata,
          annotations: {},
        },
      }

      render(
        <ResourceInspector
          resource={resource}
          resourceType={{ kind: 'Pod' }}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(screen.queryByText('Annotations')).not.toBeInTheDocument()
    })
  })

  // @tests-contract ResourceInspector.rawYaml
  describe('rawYaml', () => {
    it('should show collapsible raw YAML section', () => {
      render(<ResourceInspector {...defaultProps} />)

      const summary = screen.getByText('Raw YAML')
      expect(summary).toBeInTheDocument()

      // It should be inside a details/summary element
      const detailsElement = summary.closest('details')
      expect(detailsElement).toBeTruthy()
    })

    it('should contain the resource as YAML text', () => {
      render(<ResourceInspector {...defaultProps} />)

      // The pre tag inside details should contain a stringified version of the resource
      const detailsElement = screen.getByText('Raw YAML').closest('details')
      const preElement = detailsElement.querySelector('pre')
      expect(preElement).toBeTruthy()
      expect(preElement.textContent).toBeTruthy()
    })
  })
})
