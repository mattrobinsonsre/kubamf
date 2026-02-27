const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development'

// Import IPC handlers for kubectl operations
let setupKubectlIpc
try {
  // The IPC handlers should work in both dev and production since they use kubectl directly
  setupKubectlIpc = require('../backend/ipc-handlers').setupKubectlIpc
} catch (error) {
  console.warn('Could not load IPC handlers:', error.message)
  // Create a minimal fallback
  setupKubectlIpc = () => {
    console.log('IPC handlers not available - app will have limited functionality')
  }
}

function createWindow() {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
  })


  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // Open DevTools in development
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/frontend/index.html'))
  }

  // Log renderer console messages to terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    console.log(`[Renderer ${levels[level] || level}] ${message} (${sourceId}:${line})`)
  })

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    app.quit()
  })

  return mainWindow
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Setup IPC handlers for kubectl operations
  setupKubectlIpc()
  const mainWindow = createWindow()

  const openSettings = () => {
    mainWindow.webContents.send('open-settings')
  }

  const addResource = () => {
    mainWindow.webContents.send('add-resource')
  }

  const deleteResource = () => {
    mainWindow.webContents.send('delete-resource')
  }

  const openDocumentation = () => {
    mainWindow.webContents.send('open-documentation')
  }

  const inspectResource = () => {
    mainWindow.webContents.send('inspect-resource')
  }

  const editResource = () => {
    mainWindow.webContents.send('edit-resource')
  }

  const removeFinalizers = () => {
    mainWindow.webContents.send('remove-finalizers')
  }

  const rollingRestart = () => {
    mainWindow.webContents.send('rolling-restart')
  }

  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: (menuItem, browserWindow) => {
            if (browserWindow) browserWindow.reload()
          }
        },
        { type: 'separator' },
        ...process.platform !== 'darwin' ? [
          {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: openSettings
          },
          { type: 'separator' }
        ] : [],
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Inspect Resource',
          accelerator: 'CmdOrCtrl+I',
          click: inspectResource
        },
        {
          label: 'Edit Resource',
          accelerator: 'CmdOrCtrl+E',
          click: editResource
        },
        { type: 'separator' },
        {
          label: 'Add Resource',
          accelerator: 'CmdOrCtrl+N',
          click: addResource
        },
        {
          label: 'Delete Resource',
          accelerator: process.platform === 'darwin' ? 'Cmd+Backspace' : 'Delete',
          click: deleteResource
        },
        { type: 'separator' },
        {
          label: 'Remove Finalizers',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: removeFinalizers
        },
        {
          label: 'Rolling Restart',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: rollingRestart
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        {
          label: 'Refresh Current View',
          accelerator: 'F5',
          click: (menuItem, browserWindow) => {
            if (browserWindow) browserWindow.reload()
          }
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          accelerator: 'CmdOrCtrl+Shift+?',
          click: openDocumentation
        },
        {
          label: 'View API Documentation',
          click: () => {
            require('electron').shell.openExternal('http://localhost:5173/api/docs')
          }
        },
        { type: 'separator' },
        {
          label: 'Learn More',
          click: () => {
            require('electron').shell.openExternal('https://github.com/yourusername/kubamf')
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            require('electron').shell.openExternal('https://github.com/yourusername/kubamf/issues')
          }
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'Cmd+,',
          click: openSettings
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  // Clean up IPC handlers if needed
  console.log('Shutting down Electron app')
})