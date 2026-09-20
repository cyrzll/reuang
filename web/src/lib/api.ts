import { getAuthToken, getRefreshToken, setTokens, removeTokens } from './jwt'

export const API_BASE =
  import.meta.env.PUBLIC_API_URL || 'http://localhost:3000/api'
export const SERVER_URL =
  import.meta.env.PUBLIC_SERVER_URL || 'http://localhost:3000'

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  status?: number
  [key: string]: any
}

// Track pending refresh promise to deduplicate concurrent refresh attempts
let refreshPromise: Promise<string | null> | null = null

/**
 * Attempt to refresh the access token using the stored refresh_token
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    if (!res.ok) {
      removeTokens()
      return null
    }

    const data = await res.json()
    if (data.success && (data.auth_token || data.accessToken || data.token)) {
      const newAuthToken = data.auth_token || data.accessToken || data.token
      const newRefreshToken = data.refresh_token || data.refreshToken || refreshToken
      setTokens({ auth_token: newAuthToken, refresh_token: newRefreshToken }, data.user)
      return newAuthToken
    }

    removeTokens()
    return null
  } catch {
    removeTokens()
    return null
  }
}

/**
 * Authenticated API Fetch client with automatic JWT auth_token header and refresh_token rotation
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit & { _isRetry?: boolean } = {}
): Promise<ApiResponse<T>> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`

  const headers = new Headers(options.headers || {})

  // Set default JSON Content-Type if body exists and not already set
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // Inject JWT Bearer auth_token from localStorage
  const token = getAuthToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    })

    // If 401 Unauthorized occurs on protected routes (not auth endpoints), attempt automatic token refresh
    const isAuthEndpoint =
      endpoint.includes('/auth/login') ||
      endpoint.includes('/auth/register') ||
      endpoint.includes('/auth/refresh')

    if (res.status === 401 && !isAuthEndpoint && !options._isRetry) {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null
        })
      }

      const newAuthToken = await refreshPromise

      if (newAuthToken) {
        // Retry original request with newly refreshed auth_token
        const retryHeaders = new Headers(options.headers || {})
        if (options.body && typeof options.body === 'string' && !retryHeaders.has('Content-Type')) {
          retryHeaders.set('Content-Type', 'application/json')
        }
        retryHeaders.set('Authorization', `Bearer ${newAuthToken}`)

        return apiFetch<T>(endpoint, {
          ...options,
          headers: retryHeaders,
          _isRetry: true,
        })
      } else {
        // Refresh failed, notify app of unauthorized state
        removeTokens()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'))
        }
      }
    }

    const json = await res.json().catch(() => ({}))

    return {
      ...json,
      status: res.status,
    } as ApiResponse<T>
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Gagal menghubungi server.',
    }
  }
}
