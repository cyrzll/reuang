/**
 * JWT Client Utilities for /web
 * Persists auth_token and refresh_token directly to localStorage
 */

export const AUTH_TOKEN_KEY = 'auth_token'
export const REFRESH_TOKEN_KEY = 'refresh_token'
export const TOKEN_KEY = 'token' // Backwards compatibility alias
export const USER_KEY = 'user'
export const STORE_KEY = 'store'

export interface JwtPayload {
  id: number
  username: string
  email: string
  name: string
  role?: 'admin' | 'user'
  type?: 'access' | 'refresh'
  exp?: number
  iat?: number
}

export interface StoredTokens {
  authToken: string | null
  refreshToken: string | null
}

/**
 * Decode JWT token payload without external dependencies
 */
export function decodeJwt<T = JwtPayload>(token: string): T | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )

    return JSON.parse(jsonPayload) as T
  } catch {
    return null
  }
}

/**
 * Check if a JWT token is expired
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwt<JwtPayload>(token)
  if (!payload || !payload.exp) return false

  const currentTime = Math.floor(Date.now() / 1000)
  return payload.exp < currentTime
}

/**
 * Retrieve active JWT auth_token (Access Token) directly from localStorage
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null

  return (
    localStorage.getItem(AUTH_TOKEN_KEY) ||
    localStorage.getItem(TOKEN_KEY) ||
    localStorage.getItem('wa_token') ||
    null
  )
}

/**
 * Retrieve active JWT refresh_token directly from localStorage
 */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null

  return localStorage.getItem(REFRESH_TOKEN_KEY) || null
}

/**
 * Alias for getAuthToken to maintain backwards compatibility
 */
export function getToken(): string | null {
  return getAuthToken()
}

/**
 * Retrieve stored user profile from localStorage
 */
export function getStoredUser<T = any>(): T | null {
  if (typeof window === 'undefined') return null

  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Retrieve stored store profile from localStorage
 */
export function getStoredStore<T = any>(): T | null {
  if (typeof window === 'undefined') return null

  const raw = localStorage.getItem(STORE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Set stored store profile in localStorage
 */
export function setStoredStore(store: any): void {
  if (typeof window === 'undefined') return
  if (store) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } else {
    localStorage.removeItem(STORE_KEY)
  }
}

/**
 * Save auth_token and refresh_token into localStorage
 */
export function setTokens(
  tokens: {
    accessToken?: string
    refreshToken?: string
    auth_token?: string
    refresh_token?: string
    token?: string
  },
  user?: any,
  store?: any
): void {
  if (typeof window === 'undefined') return

  const authToken = tokens.auth_token || tokens.accessToken || tokens.token
  const refreshToken = tokens.refresh_token || tokens.refreshToken

  if (authToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, authToken)
    localStorage.setItem(TOKEN_KEY, authToken)
    localStorage.setItem('wa_token', authToken)
  }

  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }

  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  }

  if (store !== undefined) {
    setStoredStore(store)
  }
}

/**
 * Save single auth token (backwards compatibility)
 */
export function setToken(token: string, user?: any, store?: any): void {
  setTokens({ auth_token: token }, user, store)
}

/**
 * Set refresh token explicitly
 */
export function setRefreshToken(refreshToken: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

/**
 * Remove all JWT tokens and user profile from localStorage (Logout)
 */
export function removeTokens(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('wa_token')
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(STORE_KEY)
}

/**
 * Alias for removeTokens to maintain backwards compatibility
 */
export function removeToken(): void {
  removeTokens()
}
