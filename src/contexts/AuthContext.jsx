import React, { createContext, useContext, useState, useEffect } from 'react'
import { frontendConfig } from '../utils/config'
import axios from 'axios'

// @contract AuthContext.electronSkip - Must skip auth and set electron-user in Electron mode
// @contract AuthContext.webInit - Must fetch /auth/info and initialize auth in web mode
// @contract AuthContext.bamfAuth - In bamf mode, user info comes from proxy headers via /auth/info
// @contract AuthContext.isAuthenticated - Must return true for electron/disabled auth, check user otherwise
const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authInfo, setAuthInfo] = useState(null)
  const [error, setError] = useState(null)

  const isElectron = frontendConfig.isElectron()

  useEffect(() => {
    if (isElectron) {
      // No authentication needed for Electron desktop
      setIsLoading(false)
      setUser({ username: 'electron-user', provider: 'electron' })
      return
    }

    // Initialize authentication for web (bamf mode)
    initializeAuth()
  }, [isElectron])

  const initializeAuth = async () => {
    try {
      const authResponse = await axios.get('/auth/info')
      setAuthInfo(authResponse.data)

      if (!authResponse.data.enabled) {
        // No authentication required (shouldn't happen in web mode, but handle gracefully)
        setIsLoading(false)
        return
      }

      // In bamf mode, the user is already authenticated via proxy headers.
      // The /auth/info endpoint returns the user from those headers.
      if (authResponse.data.user) {
        setUser(authResponse.data.user)
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error)
      setError('Failed to initialize authentication')
    } finally {
      setIsLoading(false)
    }
  }

  const hasRole = (role) => {
    if (isElectron || !authInfo?.enabled) return true
    if (!user?.roles) return false
    return user.roles.includes(role)
  }

  const hasGroup = (group) => {
    if (isElectron || !authInfo?.enabled) return true
    if (!user?.groups) return false
    return user.groups.includes(group)
  }

  const isAuthenticated = () => {
    if (isElectron || !authInfo?.enabled) return true
    return !!user
  }

  const value = {
    user,
    isLoading,
    error,
    authInfo,
    isElectron,
    hasRole,
    hasGroup,
    isAuthenticated
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Helper component for protecting routes (simplified for bamf mode)
export const ProtectedRoute = ({ children, requireAuth = true, requireRoles = [], requireGroups = [] }) => {
  const { isAuthenticated, hasRole, hasGroup, isLoading, authInfo } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Checking authentication...</p>
        </div>
      </div>
    )
  }

  if (requireAuth && authInfo?.enabled && !isAuthenticated()) {
    return <AccessDenied message="Authentication required. Please ensure you are accessing this through bamf." />
  }

  if (requireRoles.length > 0 && !requireRoles.every(role => hasRole(role))) {
    return <AccessDenied message="Insufficient roles" />
  }

  if (requireGroups.length > 0 && !requireGroups.every(group => hasGroup(group))) {
    return <AccessDenied message="Insufficient group membership" />
  }

  return children
}

const AccessDenied = ({ message = 'Access denied' }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
          Access Denied
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {message}
        </p>
      </div>
    </div>
  )
}
