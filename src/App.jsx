import React, { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Toolbar from './components/Toolbar'
import ContextTabs from './components/ContextTabs'
import { ThemeProvider } from './contexts/ThemeContext'
import { KubeConfigProvider } from './contexts/KubeConfigContext'
import './App.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <KubeConfigProvider>
          <div className="h-screen w-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
            {/* Header with toolbar */}
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10">
              <Toolbar />
            </header>

            {/* Main content area */}
            <main className="flex-1 flex overflow-y-hidden min-w-0">
              <ContextTabs />
            </main>
          </div>
        </KubeConfigProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App