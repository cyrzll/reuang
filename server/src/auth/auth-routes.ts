import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { eq, or } from 'drizzle-orm'
import { db, users, waAccounts, userStores } from '../db/database.js'
import {
  hashPassword,
  verifyPassword,
  createTokenPair,
  verifyAuthToken,
  verifyRefreshToken,
  authMiddleware,
  type UserPayload,
} from './auth.js'
import { sessionManager } from '../baileys/session-manager.js'

export const authRouter = new Hono()

// Register new user
authRouter.post('/register', async (c) => {
  try {
    const body = await c.req.json()
    const name = (body.name || '').trim()
    const username = (body.username || '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '')
    const email = (body.email || '').toLowerCase().trim()
    const phone = (body.phone || body.nomorHp || '').trim()
    const password = body.password || ''

    if (!name || !username || !email || !password || !phone) {
      return c.json({ success: false, error: 'Semua bidang (nama, username, email, nomor HP, password) wajib diisi.' }, 400)
    }

    if (password.length < 6) {
      return c.json({ success: false, error: 'Password minimal 6 karakter.' }, 400)
    }

    // Check if username or email already exists using Drizzle ORM
    const existing = await db
      .select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(or(eq(users.username, username), eq(users.email, email)))
      .limit(1)

    if (existing && existing.length > 0) {
      const match = existing[0]
      if (match.username === username) {
        return c.json({ success: false, error: 'Username sudah digunakan.' }, 409)
      }
      if (match.email === email) {
        return c.json({ success: false, error: 'Email sudah terdaftar.' }, 409)
      }
    }

    // Hash password and insert user via Drizzle ORM
    const hashed = hashPassword(password)
    const defaultProfileUrl = '/media/profile/default-profile.jpeg'
    const userUid = randomUUID()
    const [insertResult] = await db.insert(users).values({
      uid: userUid,
      name,
      storeName: (body.storeName || 'Toko Saya').trim(),
      username,
      email,
      phone: phone || null,
      password: hashed,
      role: 'user',
      profileUrl: defaultProfileUrl,
    })

    const userId = insertResult.insertId
    const sessionId = `user_${userId}`

    // Automatically create 1 WhatsApp session account for this user via Drizzle ORM upsert
    await db
      .insert(waAccounts)
      .values({
        sessionId,
        userId,
        userName: name,
        status: 'disconnected',
      })
      .onDuplicateKeyUpdate({
        set: { userName: name },
      })

    const userPayload: UserPayload = {
      id: userId,
      uid: userUid,
      username,
      email,
      phone: phone || null,
      name,
      role: 'user',
      storeName: (body.storeName || 'Toko Saya').trim(),
      profileUrl: defaultProfileUrl,
    }
    const tokens = await createTokenPair(userPayload)

    // Save refresh_token to user record via Drizzle ORM
    await db
      .update(users)
      .set({ refreshToken: tokens.refreshToken })
      .where(eq(users.id, userId))

    return c.json(
      {
        success: true,
        message: 'Registrasi berhasil.',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        auth_token: tokens.auth_token,
        refresh_token: tokens.refresh_token,
        token: tokens.accessToken,
        user: userPayload,
        store: null,
        sessionId,
      },
      201
    )
  } catch (err: any) {
    console.error('[Auth Register Error]:', err)
    return c.json({ success: false, error: err.message || 'Terjadi kesalahan saat registrasi.' }, 500)
  }
})

// Login user
authRouter.post('/login', async (c) => {
  try {
    const body = await c.req.json()
    const identifier = (body.identifier || body.email || body.username || '').toLowerCase().trim()
    const password = body.password || ''

    if (!identifier || !password) {
      return c.json({ success: false, error: 'Email/username dan password wajib diisi.' }, 400)
    }

    // Find user by username or email via Drizzle ORM
    const rows = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
      .limit(1)

    if (!rows || rows.length === 0) {
      return c.json({ success: false, error: 'Email/Username atau password salah.' }, 401)
    }

    const user = rows[0]
    const isValid = verifyPassword(password, user.password)
    if (!isValid) {
      return c.json({ success: false, error: 'Email/Username atau password salah.' }, 401)
    }

    const userId = user.id
    const sessionId = `user_${userId}`

    // Ensure session entry exists in wa_accounts via Drizzle ORM
    await db
      .insert(waAccounts)
      .values({
        sessionId,
        userId,
        userName: user.name,
        status: 'disconnected',
      })
      .onDuplicateKeyUpdate({
        set: { userName: user.name },
      })

    let userUid = user.uid
    if (!userUid) {
      userUid = randomUUID()
      await db.update(users).set({ uid: userUid }).where(eq(users.id, user.id))
    }

    const userPayload: UserPayload = {
      id: user.id,
      uid: userUid,
      username: user.username,
      email: user.email,
      phone: user.phone || null,
      name: user.name,
      role: user.role || 'user',
      storeName: user.storeName || 'Toko Saya',
      profileUrl: user.profileUrl || '/media/profile/default-profile.jpeg',
    }

    // Fetch user store if exists
    const storeRows = await db
      .select()
      .from(userStores)
      .where(eq(userStores.storeUseruid, userUid))
      .limit(1)
    const store = storeRows && storeRows.length > 0 ? storeRows[0] : null

    const tokens = await createTokenPair(userPayload)

    // Save refresh_token to user record via Drizzle ORM
    await db
      .update(users)
      .set({ refreshToken: tokens.refreshToken })
      .where(eq(users.id, userId))

    return c.json({
      success: true,
      message: 'Login berhasil.',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      auth_token: tokens.auth_token,
      refresh_token: tokens.refresh_token,
      token: tokens.accessToken,
      user: userPayload,
      store,
      sessionId,
    })
  } catch (err: any) {
    console.error('[Auth Login Error]:', err)
    return c.json({ success: false, error: err.message || 'Terjadi kesalahan saat login.' }, 500)
  }
})

// Refresh access token using refresh_token
authRouter.post('/refresh', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const authHeader = c.req.header('Authorization')
    let refreshToken = (body.refreshToken || body.refresh_token || '').trim()

    if (!refreshToken && authHeader && authHeader.startsWith('Bearer ')) {
      refreshToken = authHeader.substring(7).trim()
    }

    if (!refreshToken) {
      return c.json({ success: false, error: 'Refresh token wajib disertakan.' }, 400)
    }

    const decoded = await verifyRefreshToken(refreshToken)
    if (!decoded || !decoded.id) {
      return c.json({ success: false, error: 'Refresh token tidak valid atau sudah kedaluwarsa.' }, 401)
    }

    // Verify against database via Drizzle ORM
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.id))
      .limit(1)

    if (!rows || rows.length === 0) {
      return c.json({ success: false, error: 'Pengguna tidak ditemukan.' }, 401)
    }

    const user = rows[0]

    // Verify token matches stored token
    if (user.refreshToken !== refreshToken) {
      return c.json({ success: false, error: 'Sesi refresh token tidak valid atau telah dicabut.' }, 401)
    }

    const userPayload: UserPayload = {
      id: user.id,
      uid: user.uid || undefined,
      username: user.username,
      email: user.email,
      phone: user.phone || null,
      name: user.name,
      role: user.role || 'user',
      storeName: user.storeName || 'Toko Saya',
      profileUrl: user.profileUrl || '/media/profile/default-profile.jpeg',
    }

    // Fetch user store if exists
    let store = null
    if (user.uid) {
      const storeRows = await db
        .select()
        .from(userStores)
        .where(eq(userStores.storeUseruid, user.uid))
        .limit(1)
      if (storeRows && storeRows.length > 0) {
        store = storeRows[0]
      }
    }

    // Issue rotated token pair
    const tokens = await createTokenPair(userPayload)

    // Update refresh token in DB via Drizzle ORM
    await db
      .update(users)
      .set({ refreshToken: tokens.refreshToken })
      .where(eq(users.id, user.id))

    return c.json({
      success: true,
      message: 'Token berhasil diperbarui.',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      auth_token: tokens.auth_token,
      refresh_token: tokens.refresh_token,
      token: tokens.accessToken,
      user: userPayload,
      store,
    })
  } catch (err: any) {
    console.error('[Auth Refresh Error]:', err)
    return c.json({ success: false, error: err.message || 'Gagal memperbarui token.' }, 500)
  }
})

// Logout user and invalidate refresh_token
authRouter.post('/logout', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const authHeader = c.req.header('Authorization')
    const refreshToken = (body.refreshToken || body.refresh_token || '').trim()

    let userId: number | null = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim()
      const user = await verifyAuthToken(token)
      if (user) userId = user.id
    }

    if (!userId && refreshToken) {
      const decoded = await verifyRefreshToken(refreshToken)
      if (decoded) userId = decoded.id
    }

    if (userId) {
      // Invalidate refresh token via Drizzle ORM
      await db
        .update(users)
        .set({ refreshToken: null })
        .where(eq(users.id, userId))
    }

    return c.json({ success: true, message: 'Logout berhasil, sesi telah dihapus.' })
  } catch (err: any) {
    console.error('[Auth Logout Error]:', err)
    return c.json({ success: false, error: err.message || 'Gagal memproses logout.' }, 500)
  }
})

// Get current user profile and their WA bot session
authRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user' as any) as UserPayload
  const sessionId = `user_${user.id}`

  const rows = await db
    .select({
      id: users.id,
      uid: users.uid,
      name: users.name,
      role: users.role,
      storeName: users.storeName,
      username: users.username,
      email: users.email,
      phone: users.phone,
      profileUrl: users.profileUrl,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  const dbUser = rows && rows.length > 0 ? rows[0] : null
  const effectiveUid = dbUser?.uid || user.uid
  const userPayload: UserPayload = {
    id: user.id,
    uid: effectiveUid,
    username: user.username,
    email: user.email,
    phone: dbUser?.phone || null,
    name: user.name,
    role: dbUser?.role || user.role || 'user',
    storeName: dbUser?.storeName || 'Toko Saya',
    profileUrl: dbUser?.profileUrl || user.profileUrl || '/media/profile/default-profile.jpeg',
  }

  // Fetch store associated with user uid
  let store = null
  if (effectiveUid) {
    const storeRows = await db
      .select()
      .from(userStores)
      .where(eq(userStores.storeUseruid, effectiveUid))
      .limit(1)
    if (storeRows && storeRows.length > 0) {
      store = storeRows[0]
    }
  }

  const session = await sessionManager.getSessionInfo(sessionId)

  return c.json({
    success: true,
    user: userPayload,
    store,
    session: session || {
      sessionId,
      userName: user.name,
      phoneNumber: null,
      status: 'disconnected',
      qrCode: null,
      qrDataUrl: null,
    },
  })
})

// Update user profile (name, storeName, phone)
authRouter.put('/profile', authMiddleware, async (c) => {
  const user = c.get('user' as any) as UserPayload
  try {
    const body = await c.req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const storeName = typeof body.storeName === 'string' ? body.storeName.trim() : undefined
    const phone = typeof body.phone === 'string' ? body.phone.trim() : typeof body.nomorHp === 'string' ? body.nomorHp.trim() : undefined

    const updateData: Record<string, any> = {}
    if (name) updateData.name = name
    if (storeName !== undefined) updateData.storeName = storeName || 'Toko Saya'
    if (phone !== undefined) updateData.phone = phone || null

    if (Object.keys(updateData).length > 0) {
      await db.update(users).set(updateData).where(eq(users.id, user.id))
    }

    const rows = await db
      .select({
        id: users.id,
        uid: users.uid,
        name: users.name,
        storeName: users.storeName,
        username: users.username,
        email: users.email,
        phone: users.phone,
        profileUrl: users.profileUrl,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)

    const dbUser = rows[0]
    const userPayload: UserPayload = {
      id: user.id,
      uid: dbUser?.uid || user.uid,
      username: dbUser?.username || user.username,
      email: dbUser?.email || user.email,
      phone: dbUser?.phone || null,
      name: dbUser?.name || user.name,
      storeName: dbUser?.storeName || 'Toko Saya',
      profileUrl: dbUser?.profileUrl || user.profileUrl || '/media/profile/default-profile.jpeg',
    }

    return c.json({
      success: true,
      message: 'Profil berhasil diperbarui.',
      user: userPayload,
    })
  } catch (err: any) {
    console.error('[Auth Update Profile Error]:', err)
    return c.json({ success: false, error: err.message || 'Gagal memperbarui profil.' }, 500)
  }
})
