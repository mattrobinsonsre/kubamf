const k8s = require('@kubernetes/client-node')
const { Metrics } = require('@kubernetes/client-node')
const fs = require('fs')
const os = require('os')
const path = require('path')
const yaml = require('yaml')

/**
 * Shared Kubernetes service that can be used by both web backend and Electron
 * Provides a clean abstraction over the Kubernetes JavaScript client
 */
class KubernetesService {
  constructor() {
    this.defaultKubeconfigPath = process.env.KUBECONFIG || path.join(os.homedir(), '.kube', 'config')
    this.currentKubeconfigPath = this.defaultKubeconfigPath
    this.kubeconfigCache = new Map()
    this.kc = new k8s.KubeConfig()
    this.isInCluster = false
    this.bamfMode = false

    // Check for bamf mode - use in-cluster config with impersonation
    if (process.env.BAMF_ENABLED === 'true') {
      this.kc = new k8s.KubeConfig()
      this.kc.loadFromCluster()
      this.bamfMode = true
      this.isInCluster = true
      // Override applyToRequest to inject impersonation headers per-request
      const originalApplyToRequest = this.kc.applyToRequest.bind(this.kc)
      this.kc.applyToRequest = (opts) => {
        originalApplyToRequest(opts)
        this._applyImpersonation(opts)
        return opts
      }
      console.log('Running in bamf mode - using in-cluster config with user impersonation')
    } else {
      this.loadKubeConfig()
    }
  }

  loadKubeConfig() {
    try {
      // Check if we're running in a Kubernetes cluster
      // In-cluster config is indicated by the presence of the service account token
      const inClusterTokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token'

      if (fs.existsSync(inClusterTokenPath)) {
        // Running inside Kubernetes cluster
        console.log('Detected in-cluster environment, using service account configuration')
        this.kc.loadFromCluster()
        this.isInCluster = true

        // Set a special context name for in-cluster
        // This allows the UI to show "In-Cluster" as the context
        this.currentContext = 'in-cluster'
      } else if (fs.existsSync(this.currentKubeconfigPath)) {
        // Running outside cluster with kubeconfig file
        console.log(`Loading kubeconfig from: ${this.currentKubeconfigPath}`)
        this.kc.loadFromFile(this.currentKubeconfigPath)
        this.isInCluster = false
      } else {
        // Try to load from default locations
        console.log('Loading kubeconfig from default locations')
        this.kc.loadFromDefault()
        this.isInCluster = false
      }
    } catch (error) {
      console.error('Error loading kubeconfig:', error)
      // If we can't load any config, we might still be in a cluster
      // but with improper permissions
      if (fs.existsSync('/var/run/secrets/kubernetes.io/serviceaccount')) {
        console.error('In-cluster service account detected but unable to load config.')
        console.error('Please ensure the pod has proper RBAC permissions.')
      }
      throw error
    }
  }

  getCurrentKubeconfigPath() {
    return this.currentKubeconfigPath
  }

  /**
   * Get all available contexts from the kubeconfig
   */
  async getContexts(kubeconfigPath = null) {
    // If running in cluster, return a special in-cluster context
    if (this.isInCluster) {
      return {
        contexts: ['in-cluster'],
        currentContext: 'in-cluster',
        isInCluster: true
      }
    }

    const pathToUse = kubeconfigPath || this.currentKubeconfigPath

    try {
      // Check cache first
      const cacheKey = `contexts:${pathToUse}`
      if (this.kubeconfigCache.has(cacheKey)) {
        const cached = this.kubeconfigCache.get(cacheKey)
        if (Date.now() - cached.timestamp < 30000) { // 30 seconds cache
          return cached.data
        }
      }

      if (!fs.existsSync(pathToUse)) {
        throw new Error(`Kubeconfig file not found: ${pathToUse}`)
      }

      const kubeconfigContent = fs.readFileSync(pathToUse, 'utf8')
      const kubeconfig = yaml.parse(kubeconfigContent)

      const contexts = kubeconfig.contexts?.map(ctx => ({
        name: ctx.name,
        cluster: ctx.context?.cluster || '',
        user: ctx.context?.user || '',
        namespace: ctx.context?.namespace || 'default',
        current: ctx.name === kubeconfig['current-context']
      })) || []

      const result = {
        contexts,
        currentContext: kubeconfig['current-context'] || '',
        kubeconfigPath: pathToUse,
        isDefault: pathToUse === this.defaultKubeconfigPath
      }

      // Cache the result
      this.kubeconfigCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      })

      return result
    } catch (error) {
      console.error('Error loading kubeconfig:', error)
      throw error
    }
  }

  /**
   * Check if a context is connected and accessible
   */
  async checkConnection(contextName) {
    try {
      // Set the current context
      this.kc.setCurrentContext(contextName)

      // Create a CoreV1Api client
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      // Try to get cluster info by listing namespaces with a timeout
      const response = await k8sApi.listNamespace(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 10)

      return {
        connected: true,
        info: `Connected to cluster with ${response.body.items.length} namespaces`
      }
    } catch (error) {
      throw new Error(`Connection failed: ${error.message}`)
    }
  }

  /**
   * Get all namespaces for a context
   */
  async getNamespaces(context) {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)
      const response = await k8sApi.listNamespace()

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get namespaces: ${error.message}`)
    }
  }

  /**
   * Get pods from a context and namespace
   */
  async getPods(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listPodForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedPod(namespace)
      }

      const pods = response.body.items || []

      // Return pods immediately without waiting for metrics
      return { items: pods }
    } catch (error) {
      throw new Error(`Failed to get pods: ${error.message}`)
    }
  }

  /**
   * Get services from a context and namespace
   */
  async getServices(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listServiceForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedService(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get services: ${error.message}`)
    }
  }

  /**
   * Get deployments from a context and namespace
   */
  async getDeployments(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.AppsV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listDeploymentForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedDeployment(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get deployments: ${error.message}`)
    }
  }

  /**
   * Get config maps from a context and namespace
   */
  async getConfigMaps(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listConfigMapForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedConfigMap(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get configmaps: ${error.message}`)
    }
  }

  /**
   * Get secrets from a context and namespace
   */
  async getSecrets(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listSecretForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedSecret(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get secrets: ${error.message}`)
    }
  }

  /**
   * Get nodes from a context
   */
  async getNodes(context) {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)
      const response = await k8sApi.listNode()

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get nodes: ${error.message}`)
    }
  }

  /**
   * Get logs from a pod
   */
  async getPodLogs(context, namespace, podName, containerName = '', options = {}) {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      const tailLines = options.tailLines || 500
      const previous = options.previous || false

      const response = await k8sApi.readNamespacedPodLog(
        podName,
        namespace,
        containerName,
        undefined,      // follow
        undefined,      // insecureSkipTLSVerifyBackend
        undefined,      // limitBytes
        undefined,      // pretty
        previous,       // previous
        undefined,      // sinceSeconds
        tailLines,
        undefined       // timestamps
      )

      return { logs: response.body }
    } catch (error) {
      // Preserve the Kubernetes API error details (e.g., "previous terminated container not found")
      let message = error.message
      try {
        if (error.body) {
          const body = typeof error.body === 'string' ? JSON.parse(error.body) : error.body
          message = body.message || message
        }
      } catch (e) {
        // body wasn't JSON, use original message
      }
      const err = new Error(message)
      err.statusCode = error.statusCode || 500
      throw err
    }
  }

  /**
   * Get containers for a specific pod
   */
  async getPodContainers(context, namespace, podName) {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      const response = await k8sApi.readNamespacedPod(podName, namespace)
      const pod = response.body

      if (!pod.spec?.containers) {
        return []
      }

      // Return container information with status
      const containers = pod.spec.containers.map(container => {
        const containerStatus = pod.status?.containerStatuses?.find(cs => cs.name === container.name)

        return {
          name: container.name,
          image: container.image,
          ready: containerStatus?.ready || false,
          restartCount: containerStatus?.restartCount || 0,
          state: containerStatus?.state || 'Unknown'
        }
      })

      return containers
    } catch (error) {
      throw new Error(`Failed to get pod containers: ${error.message}`)
    }
  }

  /**
   * Get persistent volumes from a context
   */
  async getPersistentVolumes(context) {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)
      const response = await k8sApi.listPersistentVolume()

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get persistent volumes: ${error.message}`)
    }
  }

  /**
   * Get persistent volume claims from a context and namespace
   */
  async getPersistentVolumeClaims(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listPersistentVolumeClaimForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedPersistentVolumeClaim(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get persistent volume claims: ${error.message}`)
    }
  }

  /**
   * Get storage classes from a context
   */
  async getStorageClasses(context) {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.StorageV1Api)
      const response = await k8sApi.listStorageClass()

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get storage classes: ${error.message}`)
    }
  }

  /**
   * Get Custom Resource Definitions
   */
  async getCRDs(context) {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.ApiextensionsV1Api)
      const response = await k8sApi.listCustomResourceDefinition()

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get CRDs: ${error.message}`)
    }
  }

  /**
   * Get custom resources for a specific CRD with pagination support
   */
  async* getCustomResourcePaginated(context, crd, namespace = '') {
    try {
      this.kc.setCurrentContext(context)

      const group = crd.spec?.group || ''
      const version = crd.spec?.versions?.[0]?.name || 'v1'
      const plural = crd.spec?.names?.plural || ''
      const scope = crd.spec?.scope || 'Namespaced'

      if (!plural) {
        throw new Error('CRD missing plural name')
      }

      // Create the custom objects API client
      const customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi)

      if (scope === 'Cluster' || scope === 'cluster') {
        // Cluster-scoped resources - fetch in one go
        const response = await customObjectsApi.listClusterCustomObject(group, version, plural)
        yield { items: response.body.items || [], done: true }
      } else {
        // Namespace-scoped resources
        if (!namespace || namespace === 'all' || namespace === '') {
          // List across all namespaces - fetch in batches
          const coreApi = this.kc.makeApiClient(k8s.CoreV1Api)
          const namespacesResponse = await coreApi.listNamespace()
          const namespaces = namespacesResponse.body.items || []

          // Process namespaces in batches of 5
          const batchSize = 5
          for (let i = 0; i < namespaces.length; i += batchSize) {
            const batch = namespaces.slice(i, i + batchSize)
            const batchItems = []

            // Fetch resources from this batch of namespaces in parallel
            const promises = batch.map(ns =>
              customObjectsApi.listNamespacedCustomObject(group, version, ns.metadata.name, plural)
                .then(response => response.body.items || [])
                .catch(error => {
                  console.debug(`Could not list ${plural} in namespace ${ns.metadata.name}: ${error.message}`)
                  return []
                })
            )

            const results = await Promise.all(promises)
            results.forEach(items => batchItems.push(...items))

            // Yield this batch of results
            yield {
              items: batchItems,
              done: i + batchSize >= namespaces.length,
              progress: Math.min(100, Math.round(((i + batchSize) / namespaces.length) * 100))
            }
          }
        } else {
          // Single namespace
          const response = await customObjectsApi.listNamespacedCustomObject(group, version, namespace, plural)
          yield { items: response.body.items || [], done: true }
        }
      }
    } catch (error) {
      throw new Error(`Failed to get custom resource ${crd.spec?.names?.kind}: ${error.message}`)
    }
  }

  /**
   * Get custom resources for a specific CRD (backward compatible)
   */
  async getCustomResource(context, crd, namespace = '') {
    const allItems = []
    for await (const batch of this.getCustomResourcePaginated(context, crd, namespace)) {
      allItems.push(...batch.items)
    }
    return { items: allItems }
  }

  /**
   * Get ReplicaSets from a context and namespace
   */
  async getReplicaSets(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.AppsV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listReplicaSetForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedReplicaSet(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get replicasets: ${error.message}`)
    }
  }

  /**
   * Get StatefulSets from a context and namespace
   */
  async getStatefulSets(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.AppsV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listStatefulSetForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedStatefulSet(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get statefulsets: ${error.message}`)
    }
  }

  /**
   * Get DaemonSets from a context and namespace
   */
  async getDaemonSets(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.AppsV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listDaemonSetForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedDaemonSet(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get daemonsets: ${error.message}`)
    }
  }

  /**
   * Get Jobs from a context and namespace
   */
  async getJobs(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.BatchV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listJobForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedJob(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get jobs: ${error.message}`)
    }
  }

  /**
   * Get CronJobs from a context and namespace
   */
  async getCronJobs(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.BatchV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listCronJobForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedCronJob(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get cronjobs: ${error.message}`)
    }
  }

  /**
   * Get ingresses from a context and namespace
   */
  async getIngresses(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.NetworkingV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listIngressForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedIngress(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get ingresses: ${error.message}`)
    }
  }

  /**
   * Get network policies from a context and namespace
   */
  async getNetworkPolicies(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.NetworkingV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listNetworkPolicyForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedNetworkPolicy(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get network policies: ${error.message}`)
    }
  }

  /**
   * Get endpoints from a context and namespace
   */
  async getEndpoints(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listEndpointsForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedEndpoints(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get endpoints: ${error.message}`)
    }
  }

  /**
   * Get service accounts from a context and namespace
   */
  async getServiceAccounts(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listServiceAccountForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedServiceAccount(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get service accounts: ${error.message}`)
    }
  }

  /**
   * Get roles from a context and namespace
   */
  async getRoles(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listRoleForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedRole(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get roles: ${error.message}`)
    }
  }

  /**
   * Get cluster roles
   */
  async getClusterRoles(context) {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api)

      const response = await k8sApi.listClusterRole()

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get cluster roles: ${error.message}`)
    }
  }

  /**
   * Get role bindings from a context and namespace
   */
  async getRoleBindings(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listRoleBindingForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedRoleBinding(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get role bindings: ${error.message}`)
    }
  }

  /**
   * Get cluster role bindings
   */
  async getClusterRoleBindings(context) {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.RbacAuthorizationV1Api)

      const response = await k8sApi.listClusterRoleBinding()

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get cluster role bindings: ${error.message}`)
    }
  }

  /**
   * Get events from a context and namespace
   */
  async getEvents(context, namespace = '') {
    try {
      this.kc.setCurrentContext(context)
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)

      let response
      if (!namespace || namespace === 'all') {
        response = await k8sApi.listEventForAllNamespaces()
      } else {
        response = await k8sApi.listNamespacedEvent(namespace)
      }

      return { items: response.body.items || [] }
    } catch (error) {
      throw new Error(`Failed to get events: ${error.message}`)
    }
  }

  /**
   * Get pod metrics asynchronously from the metrics API
   */
  async getPodMetrics(context, namespace, podName) {
    try {
      this.kc.setCurrentContext(context)

      // First, check if the pod is running
      // Metrics are only available for running pods
      const k8sApi = this.kc.makeApiClient(k8s.CoreV1Api)
      const podResponse = await k8sApi.readNamespacedPod(podName, namespace)
      const pod = podResponse.body

      // Check pod phase - metrics only available for Running pods
      if (pod.status?.phase !== 'Running') {
        return { cpu: '-', memory: '-', reason: `Pod is ${pod.status?.phase || 'Unknown'}` }
      }

      // Check if all containers are ready
      const allContainersReady = pod.status?.containerStatuses?.every(
        status => status.ready && status.state?.running
      ) ?? false

      if (!allContainersReady) {
        return { cpu: '-', memory: '-', reason: 'Not all containers ready' }
      }

      // Use the official Metrics client from kubernetes-client
      const metricsClient = new Metrics(this.kc)

      try {
        // Fetch metrics using the official client
        const podMetrics = await metricsClient.getPodMetrics(namespace, podName)

        // Calculate total CPU and memory usage from all containers
        let totalCpuUsage = 0
        let totalMemoryUsage = 0

        if (podMetrics.containers && podMetrics.containers.length > 0) {
          podMetrics.containers.forEach(container => {
            // Parse CPU usage (e.g., "2m" = 2 millicores, "1000000n" = 1 millicore)
            const cpuUsage = container.usage?.cpu || '0'
            const cpuMatch = cpuUsage.match(/^(\d+)([a-zA-Z]*)$/)
            if (cpuMatch) {
              const value = parseFloat(cpuMatch[1])
              const unit = cpuMatch[2] || ''
              if (unit === 'm') {
                // millicores
                totalCpuUsage += value
              } else if (unit === 'n') {
                // nanocores to millicores (1 millicore = 1,000,000 nanocores)
                totalCpuUsage += Math.round(value / 1000000)
              } else if (unit === '' || unit === 'u') {
                // cores or micro-cores
                // If no unit or 'u', likely cores
                totalCpuUsage += value * 1000
              }
            }

            // Parse memory usage (e.g., "64Mi" = 64 mebibytes, "65536Ki" = 64Mi)
            const memUsage = container.usage?.memory || '0'
            const memMatch = memUsage.match(/^(\d+)([a-zA-Z]*)$/)
            if (memMatch) {
              const value = parseFloat(memMatch[1])
              const unit = memMatch[2] || 'Ki' // Default to Ki if no unit
              if (unit === 'Mi') {
                totalMemoryUsage += value
              } else if (unit === 'Ki') {
                totalMemoryUsage += Math.round(value / 1024)
              } else if (unit === 'Gi') {
                totalMemoryUsage += value * 1024
              } else if (unit === '' || unit === 'B') {
                // bytes
                totalMemoryUsage += Math.round(value / (1024 * 1024))
              }
            }
          })

          // Also format per-container metrics for frontend use
          const containerMetrics = podMetrics.containers.map(container => ({
            name: container.name,
            cpu: container.usage?.cpu || '0',
            memory: container.usage?.memory || '0'
          }))

          return {
            cpu: totalCpuUsage > 0 ? `${totalCpuUsage}m` : '0m',
            memory: totalMemoryUsage > 0 ? `${totalMemoryUsage}Mi` : '0Mi',
            containers: containerMetrics
          }
        } else {
          // No containers or metrics available
          return { cpu: '-', memory: '-' }
        }
      } catch (metricsError) {
        // Handle metrics API errors gracefully
        const errorMessage = metricsError.body?.message || metricsError.message || 'Unknown error'

        // Don't log for expected cases like metrics-server not installed or pod just started
        if (!errorMessage.includes('metrics not available') &&
            !errorMessage.includes('does not implement metrics.k8s.io') &&
            !errorMessage.includes('NotFound')) {
          console.debug(`Metrics unavailable for ${podName}: ${errorMessage}`)
        }

        return { cpu: '-', memory: '-' }
      }
    } catch (error) {
      throw new Error(`Failed to get pod metrics: ${error.message}`)
    }
  }

  /**
   * Get parent resource information from owner references
   */
  getParentResource(resource) {
    const ownerReferences = resource.metadata?.ownerReferences
    if (!ownerReferences || ownerReferences.length === 0) {
      return null
    }

    // Find the most relevant owner (controller if available)
    const controller = ownerReferences.find(ref => ref.controller === true)
    const owner = controller || ownerReferences[0]

    return {
      kind: owner.kind,
      name: owner.name,
      apiVersion: owner.apiVersion
    }
  }

  /**
   * Get a generic resource type
   */
  async getResource(context, resourceType, namespace = '') {
    try {
      // First check if this is a known built-in resource type
      const knownResources = {
        // Plural forms (used in resource tree)
        'Pods': () => this.getPods(context, namespace),
        'Services': () => this.getServices(context, namespace),
        'Deployments': () => this.getDeployments(context, namespace),
        'ConfigMaps': () => this.getConfigMaps(context, namespace),
        'Secrets': () => this.getSecrets(context, namespace),
        'Nodes': () => this.getNodes(context),
        'Namespaces': () => this.getNamespaces(context),
        'CustomResourceDefinitions': () => this.getCRDs(context),
        'PersistentVolumes': () => this.getPersistentVolumes(context),
        'PersistentVolumeClaims': () => this.getPersistentVolumeClaims(context, namespace),
        'StorageClasses': () => this.getStorageClasses(context),

        // Additional workload resources
        'ReplicaSets': () => this.getReplicaSets(context, namespace),
        'StatefulSets': () => this.getStatefulSets(context, namespace),
        'DaemonSets': () => this.getDaemonSets(context, namespace),
        'Jobs': () => this.getJobs(context, namespace),
        'CronJobs': () => this.getCronJobs(context, namespace),

        // Network resources
        'Ingresses': () => this.getIngresses(context, namespace),
        'NetworkPolicies': () => this.getNetworkPolicies(context, namespace),
        'Endpoints': () => this.getEndpoints(context, namespace),

        // Security resources
        'ServiceAccounts': () => this.getServiceAccounts(context, namespace),
        'Roles': () => this.getRoles(context, namespace),
        'ClusterRoles': () => this.getClusterRoles(context),
        'RoleBindings': () => this.getRoleBindings(context, namespace),
        'ClusterRoleBindings': () => this.getClusterRoleBindings(context),

        // Events
        'Events': () => this.getEvents(context, namespace),
        'Event': () => this.getEvents(context, namespace),

        // Singular forms (matching k8s API conventions)
        'Pod': () => this.getPods(context, namespace),
        'Service': () => this.getServices(context, namespace),
        'Deployment': () => this.getDeployments(context, namespace),
        'ConfigMap': () => this.getConfigMaps(context, namespace),
        'Secret': () => this.getSecrets(context, namespace),
        'Node': () => this.getNodes(context),
        'Namespace': () => this.getNamespaces(context),
        'CustomResourceDefinition': () => this.getCRDs(context),
        'PersistentVolume': () => this.getPersistentVolumes(context),
        'PersistentVolumeClaim': () => this.getPersistentVolumeClaims(context, namespace),
        'StorageClass': () => this.getStorageClasses(context),
        'ReplicaSet': () => this.getReplicaSets(context, namespace),
        'StatefulSet': () => this.getStatefulSets(context, namespace),
        'DaemonSet': () => this.getDaemonSets(context, namespace),
        'Job': () => this.getJobs(context, namespace),
        'CronJob': () => this.getCronJobs(context, namespace),
        'Ingress': () => this.getIngresses(context, namespace),
        'NetworkPolicy': () => this.getNetworkPolicies(context, namespace),
        'Endpoint': () => this.getEndpoints(context, namespace),
        'ServiceAccount': () => this.getServiceAccounts(context, namespace),
        'Role': () => this.getRoles(context, namespace),
        'ClusterRole': () => this.getClusterRoles(context),
        'RoleBinding': () => this.getRoleBindings(context, namespace),
        'ClusterRoleBinding': () => this.getClusterRoleBindings(context)
      }

      // First try exact match
      if (knownResources[resourceType]) {
        return await knownResources[resourceType]()
      }

      // Then try without trailing 's' for plural forms (e.g., 'replicasets' -> 'ReplicaSet')
      const singularType = resourceType.replace(/s$/, '')
      if (knownResources[singularType]) {
        return await knownResources[singularType]()
      }

      // Try with first letter capitalized (e.g., 'replicasets' -> 'Replicasets')
      const capitalizedType = resourceType.charAt(0).toUpperCase() + resourceType.slice(1)
      if (knownResources[capitalizedType]) {
        return await knownResources[capitalizedType]()
      }

      // If not a known resource, try to find it as a custom resource
      const crdsResponse = await this.getCRDs(context)
      const crds = crdsResponse.items || []

      // Find the CRD that matches this resource type
      const matchingCrd = crds.find(crd => {
        const names = crd.spec?.names || {}
        return names.plural === resourceType || names.kind === resourceType
      })

      if (matchingCrd) {
        return await this.getCustomResource(context, matchingCrd, namespace)
      }

      // If no matching CRD found, return empty (will be handled by generic display)
      console.debug(`No specific implementation found for resource type: ${resourceType}, using generic fallback`)
      return { items: [] }
    } catch (error) {
      console.error(`Failed to get resource ${resourceType}:`, error)
      return { items: [] }
    }
  }
  /**
   * Apply impersonation headers to a K8s API request.
   * Reads the current user from the per-request AsyncLocalStorage context
   * and sets Impersonate-User and Impersonate-Group headers.
   */
  _applyImpersonation(opts) {
    try {
      const { getRequestContext } = require('../backend/request-context')
      const ctx = getRequestContext()
      if (ctx && ctx.user) {
        opts.headers = opts.headers || {}
        // Use email as the impersonated user identity
        const username = ctx.user.email || ctx.user.username
        if (username) {
          opts.headers['Impersonate-User'] = username
        }
        // Add group impersonation if available
        if (ctx.user.groups && ctx.user.groups.length > 0) {
          opts.headers['Impersonate-Group'] = ctx.user.groups
        }
      }
    } catch (e) {
      // request-context not available (e.g. Electron mode) — no impersonation needed
    }
  }

  /**
   * Map common Kind names to their apiVersion
   */
  _kindToApiVersion(kind) {
    const map = {
      Pod: 'v1', Service: 'v1', ConfigMap: 'v1', Secret: 'v1',
      Namespace: 'v1', Node: 'v1', PersistentVolume: 'v1',
      PersistentVolumeClaim: 'v1', ServiceAccount: 'v1',
      Endpoints: 'v1', Event: 'v1',
      Deployment: 'apps/v1', StatefulSet: 'apps/v1',
      DaemonSet: 'apps/v1', ReplicaSet: 'apps/v1',
      Job: 'batch/v1', CronJob: 'batch/v1',
      Ingress: 'networking.k8s.io/v1', NetworkPolicy: 'networking.k8s.io/v1',
      StorageClass: 'storage.k8s.io/v1',
      Role: 'rbac.authorization.k8s.io/v1', ClusterRole: 'rbac.authorization.k8s.io/v1',
      RoleBinding: 'rbac.authorization.k8s.io/v1', ClusterRoleBinding: 'rbac.authorization.k8s.io/v1',
      CustomResourceDefinition: 'apiextensions.k8s.io/v1'
    }
    return map[kind] || 'v1'
  }

  /**
   * Get a KubernetesObjectApi client for generic CRUD operations
   */
  _getObjectApi() {
    return k8s.KubernetesObjectApi.makeApiClient(this.kc)
  }

  // Delete a resource
  async deleteResource(context, kind, name, namespace, apiVersion) {
    try {
      this.kc.setCurrentContext(context)
      const objApi = this._getObjectApi()
      const spec = {
        apiVersion: apiVersion || this._kindToApiVersion(kind),
        kind,
        metadata: { name, ...(namespace ? { namespace } : {}) }
      }
      await objApi.delete(spec)
      return { success: true, message: `Deleted ${kind}/${name}` }
    } catch (error) {
      console.error(`Error deleting resource ${kind}/${name}:`, error)
      const message = error.body?.message || error.message || 'Unknown error'
      throw new Error(`Failed to delete ${kind}/${name}: ${message}`)
    }
  }

  // Update (replace) a resource
  async updateResource(context, kind, name, namespace, resourceData) {
    try {
      this.kc.setCurrentContext(context)
      const objApi = this._getObjectApi()

      // Ensure apiVersion and kind are set on the resource data
      if (!resourceData.apiVersion) {
        resourceData.apiVersion = this._kindToApiVersion(kind)
      }
      if (!resourceData.kind) {
        resourceData.kind = kind
      }

      const { body } = await objApi.replace(resourceData)
      return body
    } catch (error) {
      console.error(`Error updating resource ${kind}/${name}:`, error)
      const message = error.body?.message || error.message || 'Unknown error'
      throw new Error(`Failed to update ${kind}/${name}: ${message}`)
    }
  }

  // Create a new resource
  async createResource(context, resourceData) {
    try {
      this.kc.setCurrentContext(context)
      const objApi = this._getObjectApi()
      const { body } = await objApi.create(resourceData)
      return body
    } catch (error) {
      console.error(`Error creating resource:`, error)
      const message = error.body?.message || error.message || 'Unknown error'
      throw new Error(`Failed to create resource: ${message}`)
    }
  }

  // Remove finalizers from a resource
  async removeFinalizers(context, kind, name, namespace, apiVersion) {
    try {
      this.kc.setCurrentContext(context)
      const objApi = this._getObjectApi()
      const spec = {
        apiVersion: apiVersion || this._kindToApiVersion(kind),
        kind,
        metadata: { name, ...(namespace ? { namespace } : {}) }
      }

      // Read the current resource
      const { body } = await objApi.read(spec)
      // Clear finalizers
      body.metadata.finalizers = []
      // Replace the resource
      const result = await objApi.replace(body)
      return result.body
    } catch (error) {
      console.error(`Error removing finalizers from ${kind}/${name}:`, error)
      const message = error.body?.message || error.message || 'Unknown error'
      throw new Error(`Failed to remove finalizers from ${kind}/${name}: ${message}`)
    }
  }

  // Trigger rolling restart for various resource types
  async rollingRestart(context, kind, name, namespace) {
    try {
      this.kc.setCurrentContext(context)
      const timestamp = new Date().toISOString()

      if (kind === 'Pod') {
        // Delete pod to restart (controller will recreate)
        return this.deleteResource(context, kind, name, namespace, 'v1')
      }

      const rolloutResources = ['Deployment', 'StatefulSet', 'DaemonSet']
      if (!rolloutResources.includes(kind)) {
        throw new Error(`Rolling restart is not supported for ${kind} resources`)
      }

      // Use strategic merge patch to set restart annotation
      const appsApi = this.kc.makeApiClient(k8s.AppsV1Api)
      const patch = {
        spec: {
          template: {
            metadata: {
              annotations: {
                'kubectl.kubernetes.io/restartedAt': timestamp
              }
            }
          }
        }
      }

      const options = { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } }

      let result
      switch (kind) {
        case 'Deployment':
          result = await appsApi.patchNamespacedDeployment(name, namespace, patch, undefined, undefined, undefined, undefined, undefined, options)
          break
        case 'StatefulSet':
          result = await appsApi.patchNamespacedStatefulSet(name, namespace, patch, undefined, undefined, undefined, undefined, undefined, options)
          break
        case 'DaemonSet':
          result = await appsApi.patchNamespacedDaemonSet(name, namespace, patch, undefined, undefined, undefined, undefined, undefined, options)
          break
        default:
          throw new Error(`Rolling restart is not supported for ${kind} resources`)
      }

      return result.body
    } catch (error) {
      console.error(`Error triggering rolling restart for ${kind}/${name}:`, error)
      const message = error.body?.message || error.message || 'Unknown error'
      throw new Error(`Failed to restart ${kind}/${name}: ${message}`)
    }
  }
}

module.exports = KubernetesService