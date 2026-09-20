import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { sign, verify } from 'hono/jwt'
import type { Context, Next } from 'hono'

const JWT_SECRET = process.env.JWT_SECRET || 'wa_bot_jwt_secret_key_936f5138_change_in_prod'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'wa_bot_refresh_token_secret_key_936f5138_change_in_prod'

// Token expiration constants
export const ACCESS_TOKEN_EXPIRY = 60 * 60 // 1 hour in seconds
export const REFRESH_TOKEN_EXPIRY = 60 * 60 * 24 * 30 // 30 days in seconds

export interface UserPayload {
  [key: string]: unknown
  id: number
  uid?: string
  username: string
  email: string
  name: string
  role?: string
  storeName?: string
  phone?: string | null
  profileUrl?: string
  type?: string
}

export interface RefreshPayload {
  [key: string]: unknown
  id: number
  username: string
  type: 'refresh'
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  auth_token: string
  refresh_token: string
  expiresIn: number
}

/**
 * Hash plain password using Node's crypto.scryptSync with random salt
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derivedKey = scryptSync(password, salt, 64)
  return `${salt}:${derivedKey.toString('hex')}`
}

/**
 * Verify plain password against stored salt:hash
 */
export function verifyPassword(password: string, combinedHash: string): boolean {
  try {
    const [salt, key] = combinedHash.split(':')
    if (!salt || !key) return false

    const keyBuffer = Buffer.from(key, 'hex')
    const derivedKey = scryptSync(password, salt, 64)
    return timingSafeEqual(keyBuffer, derivedKey)
  } catch {
    return false
  }
}

/**
 * Generate short-lived Access Token (auth_token)
 */
export async function createAccessToken(user: UserPayload): Promise<string> {
  const payload = {
    id: user.id,
    uid: user.uid,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    type: 'access',
    exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRY,
  }
  return await sign(payload, JWT_SECRET, 'HS256')
}

/**
 * Generate long-lived Refresh Token (refresh_token)
 */
export async function createRefreshToken(user: { id: number; username: string }): Promise<string> {
  const payload: RefreshPayload & { exp: number } = {
    id: user.id,
    username: user.username,
    type: 'refresh',
    exp: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_EXPIRY,
  }
  return await sign(payload, JWT_REFRESH_SECRET, 'HS256')
}

/**
 * Generate both Access Token (auth_token) and Refresh Token (refresh_token)
 */
export async function createTokenPair(user: UserPayload): Promise<TokenPair> {
  const accessToken = await createAccessToken(user)
  const refreshToken = await createRefreshToken({ id: user.id, username: user.username })

  return {
    accessToken,
    refreshToken,
    auth_token: accessToken,
    refresh_token: refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  }
}

/**
 * Backwards compatibility alias for createAccessToken
 */
export async function createToken(user: UserPayload): Promise<string> {
  return await createAccessToken(user)
}

/**
 * Verify JWT auth_token (Access Token) and return payload
 */
export async function verifyAuthToken(token: string): Promise<UserPayload | null> {
  try {
    const payload = (await verify(token, JWT_SECRET, 'HS256')) as any
    if (!payload || !payload.id || payload.type === 'refresh') {
      return null
    }
    return {
      id: payload.id,
      uid: payload.uid,
      username: payload.username,
      email: payload.email,
      name: payload.name,
      role: payload.role || 'user',
    }
  } catch (err) {
    return null
  }
}

/**
 * Verify JWT refresh_token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshPayload | null> {
  try {
    const payload = (await verify(token, JWT_REFRESH_SECRET, 'HS256')) as any
    if (!payload || !payload.id || payload.type !== 'refresh') {
      return null
    }
    return {
      id: payload.id,
      username: payload.username,
      type: 'refresh',
    }
  } catch (err) {
    return null
  }
}

/**
 * Hono Middleware: Protect routes requiring authentication
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  let token = ''

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim()
  } else {
    // Also allow token from query params (useful for EventSource / SSE)
    token = c.req.query('token') || ''
  }

  if (!token) {
    return c.json({ success: false, error: 'Unauthorized: Token tidak ditemukan' }, 401)
  }

  const user = await verifyAuthToken(token)
  if (!user) {
    return c.json({ success: false, error: 'Unauthorized: Token tidak valid atau sudah kedaluwarsa' }, 401)
  }

  c.set('user' as any, user)
  await next()
}

/**
 * Hono Middleware: Protect routes requiring administrator privilege
 */
export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user' as any) as UserPayload | undefined
  if (!user || user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden: Akses khusus administrator' }, 403)
  }
  await next()
}
