const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Kubectl operations via IPC
  kubectl: {
    getContexts: () => ipcRenderer.invoke('kubectl:getContexts'),
    checkConnection: (context) => ipcRenderer.invoke('kubectl:checkConnection', context),
    getNamespaces: (context) => ipcRenderer.invoke('kubectl:getNamespaces', context),
    getPods: (context, namespace) => ipcRenderer.invoke('kubectl:getPods', context, namespace),
    getPodContainers: (context, namespace, podName) => ipcRenderer.invoke('kubectl:getPodContainers', context, namespace, podName),
    getPodMetrics: (context, namespace, podName) => ipcRenderer.invoke('kubectl:getPodMetrics', context, namespace, podName),
    getServices: (context, namespace) => ipcRenderer.invoke('kubectl:getServices', context, namespace),
    getDeployments: (context, namespace) => ipcRenderer.invoke('kubectl:getDeployments', context, namespace),
    getConfigMaps: (context, namespace) => ipcRenderer.invoke('kubectl:getConfigMaps', context, namespace),
    getSecrets: (context, namespace) => ipcRenderer.invoke('kubectl:getSecrets', context, namespace),
    getNodes: (context) => ipcRenderer.invoke('kubectl:getNodes', context),
    getCRDs: (context) => ipcRenderer.invoke('kubectl:getCRDs', context),
    getResource: (context, resourceType, namespace) => ipcRenderer.invoke('kubectl:getResource', context, resourceType, namespace),
    getLogs: (context, namespace, podName, containerName) => ipcRenderer.invoke('kubectl:getLogs', context, namespace, podName, containerName),
    createResource: (context, resourceData) => ipcRenderer.invoke('kubectl:createResource', context, resourceData),
    deleteResource: (context, kind, name, namespace, apiVersion) => ipcRenderer.invoke('kubectl:deleteResource', context, kind, name, namespace, apiVersion),
    updateResource: (context, kind, name, namespace, resourceData) => ipcRenderer.invoke('kubectl:updateResource', context, kind, name, namespace, resourceData),
    removeFinalizers: (context, kind, name, namespace, apiVersion) => ipcRenderer.invoke('kubectl:removeFinalizers', context, kind, name, namespace, apiVersion),
    rollingRestart: (context, kind, name, namespace) => ipcRenderer.invoke('kubectl:rollingRestart', context, kind, name, namespace),
  },

  // Preferences management
  preferences: {
    load: () => ipcRenderer.invoke('preferences:load'),
    save: (preferences) => ipcRenderer.invoke('preferences:save', preferences),
  },

  // Menu events
  onMenuAction: (action, callback) => {
    ipcRenderer.on(action, callback)
    // Return cleanup function
    return () => ipcRenderer.removeListener(action, callback)
  }
})