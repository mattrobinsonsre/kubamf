/**
 * Built-in resource templates and CRD template generator
 */

const templates = {
  Deployment: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deployment
  namespace: default
  labels:
    app: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-container
          image: nginx:latest
          ports:
            - containerPort: 80
`,

  Service: `apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: default
spec:
  selector:
    app: my-app
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
  type: ClusterIP
`,

  ConfigMap: `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-configmap
  namespace: default
data:
  key1: value1
  key2: value2
`,

  Secret: `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: default
type: Opaque
stringData:
  username: admin
  password: changeme
`,

  Pod: `apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  namespace: default
  labels:
    app: my-app
spec:
  containers:
    - name: my-container
      image: nginx:latest
      ports:
        - containerPort: 80
`,

  Job: `apiVersion: batch/v1
kind: Job
metadata:
  name: my-job
  namespace: default
spec:
  template:
    spec:
      containers:
        - name: my-job
          image: busybox
          command: ["echo", "Hello from Job"]
      restartPolicy: Never
  backoffLimit: 4
`,

  CronJob: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: my-cronjob
  namespace: default
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: my-cronjob
              image: busybox
              command: ["echo", "Hello from CronJob"]
          restartPolicy: OnFailure
`,

  Ingress: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  namespace: default
spec:
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80
`,

  StatefulSet: `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: my-statefulset
  namespace: default
spec:
  serviceName: my-service
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-container
          image: nginx:latest
          ports:
            - containerPort: 80
`,

  DaemonSet: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: my-daemonset
  namespace: default
spec:
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-container
          image: nginx:latest
`,

  PersistentVolumeClaim: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
`,

  ServiceAccount: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-service-account
  namespace: default
`,

  Namespace: `apiVersion: v1
kind: Namespace
metadata:
  name: my-namespace
`,
}

/**
 * Get a built-in template for a given kind
 */
export const getTemplate = (kind) => {
  return templates[kind] || null
}

/**
 * Get all available built-in template kinds
 */
export const getTemplateKinds = () => {
  return Object.keys(templates)
}

/**
 * Category mapping for the template picker
 */
export const templateCategories = {
  Workloads: ['Deployment', 'Pod', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'],
  'Services & Networking': ['Service', 'Ingress'],
  'Config & Storage': ['ConfigMap', 'Secret', 'PersistentVolumeClaim'],
  'Cluster': ['Namespace', 'ServiceAccount'],
}

/**
 * Generate a template YAML from a CRD's OpenAPI v3 schema.
 * Walks the schema to produce an annotated skeleton YAML.
 */
export const generateCRDTemplate = (crd) => {
  if (!crd) return null

  const group = crd.spec?.group || ''
  const names = crd.spec?.names || {}
  const kind = names.kind || 'CustomResource'
  const versions = crd.spec?.versions || []
  const version = versions.find(v => v.served) || versions[0]
  const versionName = version?.name || 'v1'
  const scope = crd.spec?.scope || 'Namespaced'

  const apiVersion = group ? `${group}/${versionName}` : versionName
  const schema = version?.schema?.openAPIV3Schema

  // Build the base object
  const lines = [
    `apiVersion: ${apiVersion}`,
    `kind: ${kind}`,
    `metadata:`,
    `  name: my-${kind.toLowerCase()}`,
  ]

  if (scope === 'Namespaced') {
    lines.push(`  namespace: default`)
  }

  // Walk schema to generate spec fields
  if (schema?.properties?.spec) {
    lines.push(`spec:`)
    const specLines = generateSchemaFields(schema.properties.spec, 1, 5, schema.properties.spec.required || [])
    lines.push(...specLines)
  }

  return lines.join('\n') + '\n'
}

/**
 * Recursively generate YAML fields from an OpenAPI v3 schema.
 * Depth-limited to prevent infinite recursion.
 */
function generateSchemaFields(schema, depth, maxDepth, requiredFields = []) {
  if (depth > maxDepth || !schema) return []

  const indent = '  '.repeat(depth + 1)
  const lines = []
  const properties = schema.properties || {}

  // Sort: required fields first, then alphabetical
  const sortedKeys = Object.keys(properties).sort((a, b) => {
    const aRequired = requiredFields.includes(a)
    const bRequired = requiredFields.includes(b)
    if (aRequired && !bRequired) return -1
    if (!aRequired && bRequired) return 1
    return a.localeCompare(b)
  })

  for (const key of sortedKeys) {
    const prop = properties[key]
    const isRequired = requiredFields.includes(key)
    const description = prop.description ? ` # ${prop.description.split('\n')[0]}` : ''

    if (!isRequired && depth > 1) {
      // Add optional fields as comments after depth 1
      lines.push(`${indent}# ${key}: ${getPlaceholder(prop)}${description}`)
      continue
    }

    const type = prop.type || (prop.properties ? 'object' : 'string')

    switch (type) {
      case 'object':
        if (prop.properties) {
          lines.push(`${indent}${key}:${description}`)
          const childLines = generateSchemaFields(prop, depth + 1, maxDepth, prop.required || [])
          lines.push(...childLines)
        } else if (prop.additionalProperties) {
          lines.push(`${indent}${key}:${description}`)
          lines.push(`${indent}  key: value`)
        } else {
          lines.push(`${indent}${key}: {}${description}`)
        }
        break
      case 'array':
        lines.push(`${indent}${key}:${description}`)
        if (prop.items?.properties) {
          lines.push(`${indent}  -`)
          const itemLines = generateSchemaFields(prop.items, depth + 2, maxDepth, prop.items.required || [])
          // Adjust first line to be on the same line as the dash
          if (itemLines.length > 0) {
            const firstLine = itemLines[0].trimStart()
            lines[lines.length - 1] = `${indent}  - ${firstLine}`
            lines.push(...itemLines.slice(1))
          }
        } else {
          lines.push(`${indent}  - ${getPlaceholder(prop.items || {})}`)
        }
        break
      case 'string':
        lines.push(`${indent}${key}: "${getPlaceholder(prop)}"${description}`)
        break
      case 'integer':
      case 'number':
        lines.push(`${indent}${key}: ${prop.default || 0}${description}`)
        break
      case 'boolean':
        lines.push(`${indent}${key}: ${prop.default || false}${description}`)
        break
      default:
        lines.push(`${indent}${key}: ${getPlaceholder(prop)}${description}`)
    }
  }

  return lines
}

function getPlaceholder(prop) {
  if (!prop) return '""'
  if (prop.default !== undefined) return String(prop.default)
  if (prop.enum && prop.enum.length > 0) return prop.enum[0]
  switch (prop.type) {
    case 'string': return ''
    case 'integer': case 'number': return '0'
    case 'boolean': return 'false'
    case 'array': return '[]'
    case 'object': return '{}'
    default: return '""'
  }
}
