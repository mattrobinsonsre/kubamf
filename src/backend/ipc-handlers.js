const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

// Import the shared Kubernetes service
const KubernetesService = require('../shared/kubernetes-service')

// Initialize shared services
let kubernetesService, preferencesPath, ensurePreferencesDir

try {
  kubernetesService = new KubernetesService()

  // Setup preferences management
  preferencesPath = path.join(os.homedir(), '.kubamf', 'preferences.json')

  ensurePreferencesDir = () => {
    const dir = path.dirname(preferencesPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

} catch (error) {
  console.error('Failed to initialize services:', error)
}

// Setup all IPC handlers
const setupKubectlIpc = () => {
  console.log('Setting up kubectl IPC handlers')

  // Kubeconfig handlers
  ipcMain.handle('kubectl:getContexts', async () => {
    try {
      console.log('🔍 IPC: getContexts called')
      const result = await kubernetesService.getContexts()
      console.log('✅ IPC: getContexts result:', result)
      return { success: true, data: result.contexts }
    } catch (error) {
      console.error('❌ IPC: getContexts error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:checkConnection', async (event, contextName) => {
    try {
      const result = await kubernetesService.checkConnection(contextName)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Resource handlers
  ipcMain.handle('kubectl:getNamespaces', async (event, context) => {
    try {
      const data = await kubernetesService.getNamespaces(context)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getPods', async (event, context, namespace = '') => {
    try {
      console.log(`🔍 IPC: getPods called with context="${context}", namespace="${namespace}"`)
      const data = await kubernetesService.getPods(context, namespace)
      console.log('✅ IPC: getPods result:', data)
      return { success: true, data }
    } catch (error) {
      console.error('❌ IPC: getPods error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getPodContainers', async (event, context, namespace, podName) => {
    try {
      const containers = await kubernetesService.getPodContainers(context, namespace, podName)
      return { success: true, data: containers }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getServices', async (event, context, namespace = '') => {
    try {
      const data = await kubernetesService.getServices(context, namespace)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getDeployments', async (event, context, namespace = '') => {
    try {
      const data = await kubernetesService.getDeployments(context, namespace)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getConfigMaps', async (event, context, namespace = '') => {
    try {
      const data = await kubernetesService.getConfigMaps(context, namespace)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getSecrets', async (event, context, namespace = '') => {
    try {
      const data = await kubernetesService.getSecrets(context, namespace)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getNodes', async (event, context) => {
    try {
      const data = await kubernetesService.getNodes(context)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getCRDs', async (event, context) => {
    try {
      const data = await kubernetesService.getCRDs(context)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getResource', async (event, context, resourceType, namespace = '') => {
    try {
      const data = await kubernetesService.getResource(context, resourceType, namespace)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getLogs', async (event, context, namespace, podName, containerName = '', options = {}) => {
    try {
      const data = await kubernetesService.getPodLogs(context, namespace, podName, containerName, options)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:getPodMetrics', async (event, context, namespace, podName) => {
    try {
      const data = await kubernetesService.getPodMetrics(context, namespace, podName)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Write operation handlers
  ipcMain.handle('kubectl:createResource', async (event, context, resourceData) => {
    try {
      const result = await kubernetesService.createResource(context, resourceData)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:deleteResource', async (event, context, kind, name, namespace, apiVersion) => {
    try {
      const result = await kubernetesService.deleteResource(context, kind, name, namespace, apiVersion)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:updateResource', async (event, context, kind, name, namespace, resourceData) => {
    try {
      const result = await kubernetesService.updateResource(context, kind, name, namespace, resourceData)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:removeFinalizers', async (event, context, kind, name, namespace, apiVersion) => {
    try {
      const result = await kubernetesService.removeFinalizers(context, kind, name, namespace, apiVersion)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('kubectl:rollingRestart', async (event, context, kind, name, namespace) => {
    try {
      const result = await kubernetesService.rollingRestart(context, kind, name, namespace)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // Preferences handlers
  ipcMain.handle('preferences:load', async () => {
    try {
      ensurePreferencesDir()

      if (fs.existsSync(preferencesPath)) {
        const content = fs.readFileSync(preferencesPath, 'utf8')
        const data = JSON.parse(content)
        return { success: true, data }
      } else {
        return { success: true, data: {} }
      }
    } catch (error) {
      console.error('Failed to load preferences:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('preferences:save', async (event, preferences) => {
    try {
      ensurePreferencesDir()

      const content = JSON.stringify(preferences, null, 2)
      fs.writeFileSync(preferencesPath, content, 'utf8')
      return { success: true }
    } catch (error) {
      console.error('Failed to save preferences:', error)
      return { success: false, error: error.message }
    }
  })
}

module.exports = { setupKubectlIpc }