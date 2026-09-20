import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  getAuthToken,
  getRefreshToken,
  setTokens,
  removeTokens,
  getStoredUser,
  getStoredStore,
  setStoredStore,
  decodeJwt,
  type JwtPayload,
} from '../lib/jwt'
import { apiFetch } from '../lib/api'
import type { User, UserStore } from '../components/types'

interface AuthContextType {
  user: User | null
  store: UserStore | null
  token: string | null
  authToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (identifier: string, password: string) => Promise<void>
  register: (data: { name: string; username: string; email: string; phone: string; password: string }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  refreshStore: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => getStoredUser<User>())
  const [store, setStore] = useState<UserStore | null>(() => getStoredStore<UserStore>())
  const [authToken, setAuthTokenState] = useState<string | null>(() => getAuthToken())
  const [refreshToken, setRefreshTokenState] = useState<string | null>(() => getRefreshToken())
  const [isLoading, setIsLoading] = useState(true)

  // Validate or refresh user session against server
  const refreshUser = async () => {
    const currentToken = getAuthToken()
    if (!currentToken) {
      setUser(null)
      setStore(null)
      setAuthTokenState(null)
      setRefreshTokenState(null)
      setIsLoading(false)
      return
    }

    try {
      const res = await apiFetch<any>('/auth/me')
      if (res.success && res.user) {
        setUser(res.user)
        setStore(res.store || null)
        const updatedAuthToken = getAuthToken()
        setAuthTokenState(updatedAuthToken)
        setRefreshTokenState(getRefreshToken())
        setTokens({ auth_token: updatedAuthToken || currentToken }, res.user, res.store || null)
      } else if (res.status === 401) {
        await logout()
      }
    } catch {
      // Keep existing localStorage session if server is momentarily unreachable
    } finally {
      setIsLoading(false)
    }
  }

  const refreshStore = async () => {
    try {
      const res = await apiFetch<any>('/user-store')
      if (res.success) {
        const storeData = res.store !== undefined ? res.store : (res.data !== undefined ? res.data : null)
        setStore(storeData)
        setStoredStore(storeData)
      }
    } catch {
      // Keep existing store if request fails
    }
  }

  useEffect(() => {
    const storedAuthToken = getAuthToken()
    const storedRefreshToken = getRefreshToken()
    const storedUser = getStoredUser<User>()
    const storedStore = getStoredStore<UserStore>()

    if (storedAuthToken) {
      setAuthTokenState(storedAuthToken)
      setRefreshTokenState(storedRefreshToken)
      if (storedUser) {
        setUser(storedUser)
      } else {
        const decoded = decodeJwt<JwtPayload>(storedAuthToken)
        if (decoded && decoded.id) {
          const u: User = {
            id: decoded.id,
            name: decoded.name,
            username: decoded.username,
            email: decoded.email,
            role: decoded.role || 'user',
          }
          setUser(u)
          setTokens({ auth_token: storedAuthToken }, u)
        }
      }
      if (storedStore) {
        setStore(storedStore)
      }
      refreshUser()
    } else {
      setIsLoading(false)
    }

    const handleUnauthorized = () => {
      logout()
    }

    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized)
    }
  }, [])

  const login = async (identifier: string, password: string) => {
    const res = await apiFetch<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    })

    if (!res.success) {
      throw new Error(res.error || 'Login gagal.')
    }

    const newAuthToken = res.auth_token || res.accessToken || res.token
    const newRefreshToken = res.refresh_token || res.refreshToken

    if (!newAuthToken) {
      throw new Error('Token otentikasi tidak diterima dari server.')
    }

    // Persist auth_token, refresh_token, user, and store directly to localStorage
    setTokens(
      {
        auth_token: newAuthToken,
        refresh_token: newRefreshToken,
      },
      res.user,
      res.store || null
    )

    setAuthTokenState(newAuthToken)
    setRefreshTokenState(newRefreshToken || null)
    setUser(res.user)
    setStore(res.store || null)
  }

  const register = async (data: { name: string; username: string; email: string; phone: string; password: string }) => {
    const res = await apiFetch<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })

    if (!res.success) {
      throw new Error(res.error || 'Registrasi gagal.')
    }

    const newAuthToken = res.auth_token || res.accessToken || res.token
    const newRefreshToken = res.refresh_token || res.refreshToken

    if (!newAuthToken) {
      throw new Error('Token otentikasi tidak diterima dari server.')
    }

    // Persist auth_token, refresh_token, user, and store directly to localStorage
    setTokens(
      {
        auth_token: newAuthToken,
        refresh_token: newRefreshToken,
      },
      res.user,
      res.store || null
    )

    setAuthTokenState(newAuthToken)
    setRefreshTokenState(newRefreshToken || null)
    setUser(res.user)
    setStore(res.store || null)
  }

  const logout = async () => {
    const currentRefreshToken = getRefreshToken()
    try {
      if (currentRefreshToken) {
        await apiFetch('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: currentRefreshToken }),
        })
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      removeTokens()
      setUser(null)
      setStore(null)
      setAuthTokenState(null)
      setRefreshTokenState(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        store,
        token: authToken,
        authToken,
        refreshToken,
        isAuthenticated: Boolean(user && authToken),
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        refreshStore,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
