import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import fs from 'node:fs'
import path from 'node:path'
import { desc, eq, or, and } from 'drizzle-orm'
import { sessionManager } from './baileys/session-manager.js'
import { db, chatMessages, waAccounts, users, katalogProduk, categories, orderHistory, userStores } from './db/database.js'
import { authMiddleware, adminMiddleware, type UserPayload } from './auth/auth.js'
import { orderEventEmitter, type OrderEventPayload } from './events/order-events.js'

export const apiRouter = new Hono<{ Variables: { user: UserPayload } }>()

/* ==========================================================================
   USER-CENTRIC 1-TO-1 WHATSAPP BOT ROUTES (Protected with authMiddleware)
   ========================================================================== */

// 1. Get current logged-in user's WhatsApp bot session
apiRouter.get('/my-session', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const sessionId = `user_${user.id}`

  try {
    let session = await sessionManager.getSessionInfo(sessionId)
    if (!session) {
      session = {
        sessionId,
        userName: user.name,
        phoneNumber: null,
        status: 'disconnected',
        qrCode: null,
        qrDataUrl: null,
      }
    }
    return c.json({ success: true, data: session })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// 2. Start / Connect current user's WhatsApp bot (Generate QR)
apiRouter.post('/my-session/start', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const sessionId = `user_${user.id}`

  try {
    const session = await sessionManager.startSession(sessionId, user.name)
    return c.json({ success: true, data: session })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// 3. SSE Stream for current user's WhatsApp bot (Real-time QR & connection status)
apiRouter.get('/my-session/events', authMiddleware, (c) => {
  const user = c.get('user') as UserPayload
  const sessionId = `user_${user.id}`

  return streamSSE(c, async (stream) => {
    // Send initial status
    const initialInfo = await sessionManager.getSessionInfo(sessionId)
    if (initialInfo) {
      await stream.writeSSE({
        event: 'init',
        data: JSON.stringify(initialInfo),
      })
    }

    const eventName = `session:${sessionId}`
    const listener = async (eventData: any) => {
      try {
        await stream.writeSSE({
          event: eventData.type || 'update',
          data: JSON.stringify(eventData),
        })
      } catch (err) {
        // Stream aborted
      }
    }

    sessionManager.on(eventName, listener)

    // Keep-alive heartbeat every 15s
    const interval = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: 'ping',
          data: JSON.stringify({ time: Date.now() }),
        })
      } catch {
        clearInterval(interval)
      }
    }, 15000)

    stream.onAbort(() => {
      clearInterval(interval)
      sessionManager.off(eventName, listener)
    })

    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve())
    })
  })
})

// 4. Send WhatsApp message from current user's bot
apiRouter.post('/my-session/send', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const sessionId = `user_${user.id}`

  try {
    const body = await c.req.json()
    const { to, message } = body

    if (!to || !message) {
      return c.json({ success: false, error: 'Kolom "to" dan "message" wajib diisi.' }, 400)
    }

    await sessionManager.sendMessage(sessionId, to, message)
    return c.json({ success: true, message: 'Pesan berhasil dikirim!' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// 5. Get chat message history for current user's bot via Drizzle ORM
apiRouter.get('/my-session/messages', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const sessionId = `user_${user.id}`

  try {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(60)

    return c.json({ success: true, data: rows.reverse() })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// 6. Restart current user's bot
apiRouter.post('/my-session/restart', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const sessionId = `user_${user.id}`

  try {
    const session = await sessionManager.startSession(sessionId, user.name)
    return c.json({ success: true, data: session })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// 7. Logout / Delete current user's bot session via Drizzle ORM
apiRouter.delete('/my-session', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const sessionId = `user_${user.id}`

  try {
    await sessionManager.deleteSession(sessionId)
    // Recreate placeholder wa_accounts record via Drizzle ORM
    await db
      .insert(waAccounts)
      .values({
        sessionId,
        userId: user.id,
        userName: user.name,
        status: 'disconnected',
      })
      .onDuplicateKeyUpdate({
        set: { status: 'disconnected', phoneNumber: null },
      })
    return c.json({ success: true, message: 'Sesi bot WhatsApp berhasil direset/keluar.' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

/* ==========================================================================
   GENERAL / ADMIN SESSION ROUTES
   ========================================================================== */

apiRouter.get('/sessions', async (c) => {
  try {
    const sessions = await sessionManager.getAllSessions()
    return c.json({ success: true, data: sessions })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

apiRouter.post('/sessions', async (c) => {
  try {
    const body = await c.req.json()
    const sessionId = (body.sessionId || '').trim()
    const userName = (body.userName || '').trim()

    if (!sessionId) {
      return c.json({ success: false, error: 'sessionId wajib diisi' }, 400)
    }

    const session = await sessionManager.startSession(sessionId, userName || sessionId)
    return c.json({ success: true, data: session })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

apiRouter.get('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id')
  try {
    const session = await sessionManager.getSessionInfo(sessionId)
    if (!session) {
      return c.json({ success: false, error: 'Session tidak ditemukan' }, 404)
    }
    return c.json({ success: true, data: session })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

apiRouter.get('/sessions/:id/events', (c) => {
  const sessionId = c.req.param('id')

  return streamSSE(c, async (stream) => {
    const initialInfo = await sessionManager.getSessionInfo(sessionId)
    if (initialInfo) {
      await stream.writeSSE({
        event: 'init',
        data: JSON.stringify(initialInfo),
      })
    }

    const eventName = `session:${sessionId}`
    const listener = async (eventData: any) => {
      try {
        await stream.writeSSE({
          event: eventData.type || 'update',
          data: JSON.stringify(eventData),
        })
      } catch (err) {}
    }

    sessionManager.on(eventName, listener)

    const interval = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: 'ping',
          data: JSON.stringify({ time: Date.now() }),
        })
      } catch {
        clearInterval(interval)
      }
    }, 15000)

    stream.onAbort(() => {
      clearInterval(interval)
      sessionManager.off(eventName, listener)
    })

    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve())
    })
  })
})

apiRouter.post('/sessions/:id/send', async (c) => {
  const sessionId = c.req.param('id')
  try {
    const body = await c.req.json()
    const { to, message } = body

    if (!to || !message) {
      return c.json({ success: false, error: 'Kolom "to" dan "message" wajib diisi.' }, 400)
    }

    await sessionManager.sendMessage(sessionId, to, message)
    return c.json({ success: true, message: 'Pesan berhasil dikirim.' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

apiRouter.get('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id')
  try {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(50)

    return c.json({ success: true, data: rows.reverse() })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

apiRouter.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id')
  try {
    await sessionManager.deleteSession(sessionId)
    return c.json({ success: true, message: `Sesi ${sessionId} dihapus.` })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

/* ==========================================================================
   ORDER HISTORY ROUTES (Protected with authMiddleware)
   ========================================================================== */

import { normalizeOrderCreatedAt } from './utils/date.js'

// GET /api/orders — retrieve all orders belonging to current logged-in store owner
apiRouter.get('/orders', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  try {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    if (!userUid) {
      return c.json({ success: true, data: [] })
    }

    const rows = await db
      .select()
      .from(orderHistory)
      .where(eq(orderHistory.userUid, userUid))
      .orderBy(desc(orderHistory.createdAt))

    // Exclude orders in "menunggu disetujui" if customer hasn't submitted both payment proof photo AND name
    const validRows = rows.filter((r) => {
      const st = String(r.orderStatus || '').toLowerCase().trim()
      const isMenunggu = st === 'menunggu disetujui' || st === 'menunggu'
      if (isMenunggu) {
        const hasProof = Boolean(r.paymentProofUrl && r.paymentProofUrl.trim() !== '')
        const hasName = Boolean(
          r.customerName &&
          r.customerName.trim() !== '' &&
          r.customerName.trim().toLowerCase() !== 'pelanggan'
        )
        return hasProof && hasName
      }
      return true
    })

    const parsed = validRows.map((r) => {
      let items: any[] = []
      try {
        items = typeof r.orderItems === 'string' ? JSON.parse(r.orderItems) : r.orderItems
      } catch {
        items = []
      }
      return {
        ...r,
        createdAt: normalizeOrderCreatedAt(r.createdAt),
        updatedAt: normalizeOrderCreatedAt(r.updatedAt),
        items,
      }
    })

    // Enrich items with modal (cost price) from katalog_produk
    const allProductIds = new Set<number>()
    for (const order of parsed) {
      if (Array.isArray(order.items)) {
        for (const it of order.items) {
          if (it.id && typeof it.id === 'number') allProductIds.add(it.id)
        }
      }
    }

    let modalMap: Record<number, number> = {}
    if (allProductIds.size > 0) {
      const products = await db
        .select({ id: katalogProduk.id, modal: katalogProduk.modal })
        .from(katalogProduk)
        .where(eq(katalogProduk.userUid, userUid))
      for (const p of products) {
        modalMap[p.id] = p.modal ?? 0
      }
    }

    // Attach modal to each item
    const enriched = parsed.map((order) => ({
      ...order,
      items: Array.isArray(order.items)
        ? order.items.map((it: any) => ({
            ...it,
            modal: it.id ? (modalMap[it.id] ?? 0) : 0,
          }))
        : order.items,
    }))

    return c.json({ success: true, data: enriched })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// GET /api/orders/events — Real-time Server-Sent Events (SSE) stream for order updates
apiRouter.get('/orders/events', authMiddleware, (c) => {
  const user = c.get('user') as UserPayload

  return streamSSE(c, async (stream) => {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    // Initial connection acknowledgment
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ status: 'connected', userUid, time: Date.now() }),
    })

    const listener = async (payload: OrderEventPayload) => {
      // If userUid matches or payload is global, stream to this connected merchant
      if (!userUid || !payload.userUid || payload.userUid === userUid) {
        try {
          await stream.writeSSE({
            event: 'order_update',
            data: JSON.stringify(payload),
          })
        } catch (err) {
          // Stream aborted
        }
      }
    }

    orderEventEmitter.on('order_change', listener)

    // Keep-alive heartbeat every 15s
    const interval = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: 'ping',
          data: JSON.stringify({ time: Date.now() }),
        })
      } catch {
        clearInterval(interval)
      }
    }, 15000)

    stream.onAbort(() => {
      clearInterval(interval)
      orderEventEmitter.off('order_change', listener)
    })

    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve())
    })
  })
})

// PUT /api/orders/:id/status — update order status or payment status
apiRouter.put('/orders/:id/status', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const idParam = c.req.param('id') || ''
  const numId = Number(idParam)
  try {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    if (!userUid) {
      return c.json({ success: false, error: 'UID pemilik tidak ditemukan' }, 400)
    }

    const body = await c.req.json()
    const { orderStatus, paymentStatus, paymentProofUrl } = body

    const cleanId = idParam.replace(/^#/, '').trim()
    const parsedNumId = Number(cleanId)

    const existing = await db
      .select()
      .from(orderHistory)
      .where(
        and(
          eq(orderHistory.userUid, userUid),
          or(
            eq(orderHistory.orderUid, idParam),
            eq(orderHistory.orderUid, cleanId),
            eq(orderHistory.orderUid, `#${cleanId}`),
            !isNaN(parsedNumId) ? eq(orderHistory.id, parsedNumId) : undefined
          )
        )
      )
      .limit(1)

    if (existing.length === 0) {
      console.warn(`[Orders] Order not found for ID: ${idParam} (userUid: ${userUid})`)
      return c.json({ success: false, error: 'Pesanan tidak ditemukan' }, 404)
    }

    const targetId = existing[0].id
    const targetStatus = orderStatus !== undefined ? String(orderStatus).toLowerCase().trim() : undefined

    await db
      .update(orderHistory)
      .set({
        ...(orderStatus !== undefined ? { orderStatus: targetStatus } : {}),
        ...(paymentStatus !== undefined ? { paymentStatus } : {}),
        ...(paymentProofUrl !== undefined ? { paymentProofUrl } : {}),
      })
      .where(eq(orderHistory.id, targetId))

    const [updated] = await db.select().from(orderHistory).where(eq(orderHistory.id, targetId)).limit(1)

    if (updated && userUid) {
      orderEventEmitter.notifyOrderChange({
        userUid,
        orderUid: updated.orderUid,
        type: 'status_changed',
      })
    }

    // If status changed to 'siap', notify customer via WhatsApp bot
    const targetPhoneJid = existing[0]?.phoneJid
    const targetLidJid = existing[0]?.lidJid
    const recipientJid = targetPhoneJid || targetLidJid

    if (targetStatus === 'siap' && recipientJid) {
      try {
        let sessionId = `user_${user.id}`
        // Verify if user has a custom session mapped in waAccounts
        const waAcc = await db.select().from(waAccounts).where(eq(waAccounts.userId, user.id)).limit(1)
        if (waAcc.length > 0 && waAcc[0].sessionId) {
          sessionId = waAcc[0].sessionId
        }

        // If not connected, fallback to any currently connected WhatsApp bot session
        if (!sessionManager.isSessionConnected(sessionId)) {
          const allSessions = await sessionManager.getAllSessions()
          const connectedSession = allSessions.find((s) => s.status === 'connected')
          if (connectedSession) {
            sessionId = connectedSession.sessionId
          }
        }

        const custName = existing[0].customerName && existing[0].customerName !== 'Pelanggan'
          ? existing[0].customerName
          : 'Pelanggan'
        const orderUid = existing[0].orderUid

        // Fetch store name
        const dbUsers = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
        const storeName = dbUsers[0]?.storeName || dbUsers[0]?.name || 'Toko Kami'

        // Parse items summary
        let itemsSummary = ''
        try {
          const items = typeof existing[0].orderItems === 'string'
            ? JSON.parse(existing[0].orderItems)
            : existing[0].orderItems
          if (Array.isArray(items)) {
            itemsSummary = items.map((it: any) => `• ${it.name} (${it.qty}x)`).join('\n')
          }
        } catch {}

        const formatRupiah = (val: number) =>
          new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            maximumFractionDigits: 0,
          }).format(val || 0)

        const readyMsg =
          `Halo *${custName}*! 👋\n` +
          `Pesanan *#${orderUid}* di *${storeName}* telah *SIAP*.\n\n` +
          (itemsSummary ? `${itemsSummary}\n` : '') +
          `💰 Total: *${formatRupiah(existing[0].totalPrice)}*\n\n` +
          `Pesanan siap diambil atau menunggu kurir. Terima kasih!`

        console.log(`[Orders] Mengirim notifikasi pesanan siap ke ${recipientJid} (Session: ${sessionId})...`)

        let sent = false
        try {
          await sessionManager.sendMessage(sessionId, recipientJid, readyMsg)
          sent = true
        } catch (firstErr) {
          console.warn(`[Orders] Pengiriman pertama ke ${recipientJid} gagal:`, firstErr)
          // Fallback to alternate JID if available
          const altJid = recipientJid === targetPhoneJid ? targetLidJid : targetPhoneJid
          if (altJid && altJid !== recipientJid) {
            console.log(`[Orders] Mencoba fallback kirim ke ${altJid}...`)
            await sessionManager.sendMessage(sessionId, altJid, readyMsg)
            sent = true
          } else {
            throw firstErr
          }
        }

        if (sent) {
          console.log(`[Orders] Notifikasi pesanan siap berhasil terkirim ke ${recipientJid}`)
        }
      } catch (waErr) {
        console.error('[Orders] Gagal mengirim notifikasi pesanan siap WhatsApp:', waErr)
      }
    }

    const sanitizedUpdated = updated
      ? {
          ...updated,
          createdAt: normalizeOrderCreatedAt(updated.createdAt),
          updatedAt: normalizeOrderCreatedAt(updated.updatedAt),
        }
      : updated

    return c.json({ success: true, data: sanitizedUpdated, message: 'Status pesanan berhasil diperbarui' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

/* ==========================================================================
   KATALOG PRODUK ROUTES (Protected with authMiddleware)
   ========================================================================== */

// 1. Get all products belonging to current logged-in user (by user_uid)
const getKatalogHandler = async (c: any) => {
  const user = c.get('user') as UserPayload
  try {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    if (!userUid) {
      return c.json({ success: true, data: [] })
    }

    // Look up user's store
    const storeRows = await db
      .select()
      .from(userStores)
      .where(eq(userStores.storeUseruid, userUid))
      .limit(1)
    const userStore = storeRows && storeRows.length > 0 ? storeRows[0] : null

    const items = await db
      .select()
      .from(katalogProduk)
      .where(
        userStore
          ? or(eq(katalogProduk.storeId, userStore.id), eq(katalogProduk.userUid, userUid))
          : eq(katalogProduk.userUid, userUid)
      )
      .orderBy(desc(katalogProduk.createdAt))

    return c.json({ success: true, data: items, store: userStore })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
}
apiRouter.get('/katalog', authMiddleware, getKatalogHandler)
apiRouter.get('/catalog', authMiddleware, getKatalogHandler)

/* ==========================================================================
   CATEGORY CRUD ROUTES
   ========================================================================== */

// GET /categories — list categories owned by user
apiRouter.get('/categories', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  try {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }
    if (!userUid) return c.json({ success: true, data: [] })

    const items = await db.select().from(categories).where(eq(categories.uid, userUid)).orderBy(categories.name)
    return c.json({ success: true, data: items })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// POST /categories — create new category
apiRouter.post('/categories', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  try {
    const body = await c.req.json()
    const { name } = body
    if (!name?.trim()) return c.json({ success: false, error: 'Nama kategori wajib diisi' }, 400)

    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }
    if (!userUid) return c.json({ success: false, error: 'UID pemilik tidak ditemukan' }, 400)

    const [result] = await db.insert(categories).values({ uid: userUid, name: name.trim() })
    const [inserted] = await db.select().from(categories).where(eq(categories.id, result.insertId)).limit(1)
    return c.json({ success: true, data: inserted, message: 'Kategori berhasil ditambahkan' }, 201)
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// PUT /categories/:id — update category name
apiRouter.put('/categories/:id', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const id = Number(c.req.param('id'))
  try {
    const body = await c.req.json()
    const { name } = body
    if (!name?.trim()) return c.json({ success: false, error: 'Nama kategori wajib diisi' }, 400)

    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }
    if (!userUid) return c.json({ success: false, error: 'UID pemilik tidak ditemukan' }, 400)

    // Get old category name for product migration
    const [existing] = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.uid, userUid))).limit(1)
    if (!existing) return c.json({ success: false, error: 'Kategori tidak ditemukan' }, 404)

    const oldName = existing.name
    await db.update(categories).set({ name: name.trim() }).where(eq(categories.id, id))

    // Update products that use this category name
    await db.update(katalogProduk).set({ category: name.trim() }).where(
      and(eq(katalogProduk.category, oldName), eq(katalogProduk.userUid, userUid))
    )

    const [updated] = await db.select().from(categories).where(eq(categories.id, id)).limit(1)
    return c.json({ success: true, data: updated, message: 'Kategori berhasil diperbarui' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// DELETE /categories/:id — delete category, set products to "Umum"
apiRouter.delete('/categories/:id', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const id = Number(c.req.param('id'))
  try {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }
    if (!userUid) return c.json({ success: false, error: 'UID pemilik tidak ditemukan' }, 400)

    const [existing] = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.uid, userUid))).limit(1)
    if (!existing) return c.json({ success: false, error: 'Kategori tidak ditemukan' }, 404)

    // Move products in this category to "Umum"
    await db.update(katalogProduk).set({ category: 'Umum' }).where(
      and(eq(katalogProduk.category, existing.name), eq(katalogProduk.userUid, userUid))
    )

    await db.delete(categories).where(eq(categories.id, id))
    return c.json({ success: true, message: 'Kategori berhasil dihapus' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

/* ==========================================================================
   PRODUCT IMAGE UPLOAD
   ========================================================================== */
apiRouter.post('/upload/product', authMiddleware, async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body['image'] || body['file']
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'File gambar produk tidak ditemukan' }, 400)
    }

    const fileObj = file as File
    const buffer = Buffer.from(await fileObj.arrayBuffer())
    const originalName = fileObj.name || 'product.jpg'
    const ext = path.extname(originalName) || '.jpg'
    const filename = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`

    // Ensure server media directory exists
    const serverDir = path.resolve(process.cwd(), 'media/product')
    const webDir = path.resolve(process.cwd(), '../web/public/media/product')

    if (!fs.existsSync(serverDir)) fs.mkdirSync(serverDir, { recursive: true })
    if (!fs.existsSync(webDir)) fs.mkdirSync(webDir, { recursive: true })

    const serverPath = path.join(serverDir, filename)
    fs.writeFileSync(serverPath, buffer)

    try {
      const webPath = path.join(webDir, filename)
      fs.writeFileSync(webPath, buffer)
    } catch {
      // Ignored if web directory cannot be reached directly
    }

    const url = `/media/product/${filename}`
    return c.json({
      success: true,
      url,
      filename,
      message: 'Foto produk berhasil diunggah',
    })
  } catch (err: any) {
    console.error('[Upload] Error uploading product image:', err)
    return c.json({ success: false, error: err.message }, 500)
  }
})

// Upload payment proof receipt (bukti transfer)
apiRouter.post('/upload/payment-proof', authMiddleware, async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body['image'] || body['file']
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'File bukti transfer tidak ditemukan' }, 400)
    }

    const fileObj = file as File
    const buffer = Buffer.from(await fileObj.arrayBuffer())
    const originalName = fileObj.name || 'proof.jpg'
    const ext = path.extname(originalName) || '.jpg'
    const filename = `proof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`

    // Ensure server media directory exists
    const serverDir = path.resolve(process.cwd(), 'media/bukti')
    const webDir = path.resolve(process.cwd(), '../web/public/media/bukti')

    if (!fs.existsSync(serverDir)) fs.mkdirSync(serverDir, { recursive: true })
    if (!fs.existsSync(webDir)) fs.mkdirSync(webDir, { recursive: true })

    const serverPath = path.join(serverDir, filename)
    fs.writeFileSync(serverPath, buffer)

    try {
      const webPath = path.join(webDir, filename)
      fs.writeFileSync(webPath, buffer)
    } catch {
      // Ignored if web directory cannot be reached directly
    }

    const url = `/media/bukti/${filename}`
    return c.json({
      success: true,
      url,
      filename,
      message: 'Bukti transfer berhasil diunggah',
    })
  } catch (err: any) {
    console.error('[Upload] Error uploading payment proof:', err)
    return c.json({ success: false, error: err.message }, 500)
  }
})

// 2. Add a new product to catalog (automatically assigns user_uid = user.uid and syncs to WA)
const postKatalogHandler = async (c: any) => {
  const user = c.get('user') as UserPayload
  try {
    const body = await c.req.json()
    const { sku, name, category, modal, price, stock, active, imageUrl, description } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return c.json({ success: false, error: 'Nama produk wajib diisi' }, 400)
    }

    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    if (!userUid) {
      return c.json({ success: false, error: 'UID pemilik tidak ditemukan' }, 400)
    }

    // Check if user has an approved store
    const storeRows = await db
      .select()
      .from(userStores)
      .where(eq(userStores.storeUseruid, userUid))
      .limit(1)
    const userStore = storeRows && storeRows.length > 0 ? storeRows[0] : null

    if (!userStore || userStore.status !== 'approved') {
      return c.json({
        success: false,
        error: 'Toko Anda belum disetujui oleh admin. Fitur tambah produk terkunci hingga toko disetujui.',
      }, 403)
    }

    let newSku = sku?.trim()
    if (!newSku) {
      const existingItems = await db
        .select({ sku: katalogProduk.sku })
        .from(katalogProduk)
        .where(
          or(eq(katalogProduk.storeId, userStore.id), eq(katalogProduk.userUid, userUid))
        )

      let maxNum = 0
      existingItems.forEach((item) => {
        const match = item.sku?.match(/^PRD-(\d+)$/i)
        if (match) {
          const num = parseInt(match[1], 10)
          if (!isNaN(num) && num > maxNum) maxNum = num
        }
      })
      let nextNum = maxNum + 1
      newSku = `PRD-${String(nextNum).padStart(3, '0')}`
      while (existingItems.some((item) => item.sku?.toUpperCase() === newSku.toUpperCase())) {
        nextNum++
        newSku = `PRD-${String(nextNum).padStart(3, '0')}`
      }
    }

    const [result] = await db.insert(katalogProduk).values({
      storeId: userStore.id,
      userUid: userUid,
      sku: newSku,
      name,
      category: category || 'Umum',
      modal: Number(modal) || 0,
      price: Number(price) || 0,
      stock: Number(stock) || 0,
      active: active !== undefined ? Boolean(active) : true,
      imageUrl: imageUrl || null,
      description: description || null,
    })

    const newId = result.insertId
    const [inserted] = await db.select().from(katalogProduk).where(eq(katalogProduk.id, newId)).limit(1)

    // Sync to WhatsApp Business in background if session is connected
    const sessionId = `user_${user.id}`
    if (sessionManager.isSessionConnected(sessionId)) {
      sessionManager.syncProductToWhatsApp(sessionId, {
        id: newId,
        name,
        sku: newSku,
        price: Number(price) || 0,
        description,
        imageUrl,
      }).then(async (waId) => {
        if (waId) {
          await db.update(katalogProduk).set({ waProductId: waId }).where(eq(katalogProduk.id, newId))
          console.log(`[Katalog] Background WA sync succeeded for product ${newId}, waProductId: ${waId}`)
        }
      }).catch((waErr) => {
        console.warn('[Katalog] Background WA sync error:', waErr)
      })
    }

    return c.json({ success: true, data: inserted, message: 'Produk berhasil ditambahkan' }, 201)
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
}
apiRouter.post('/katalog', authMiddleware, postKatalogHandler)
apiRouter.post('/catalog', authMiddleware, postKatalogHandler)

// 3. Update product and sync to WA Business
const putKatalogHandler = async (c: any) => {
  const user = c.get('user') as UserPayload
  const id = Number(c.req.param('id'))
  try {
    const body = await c.req.json()
    const { sku, name, category, modal, price, stock, active, imageUrl, description } = body

    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    // Verify ownership via storeId or userUid
    const storeRows = await db.select().from(userStores).where(eq(userStores.storeUseruid, userUid!)).limit(1)
    const userStore = storeRows && storeRows.length > 0 ? storeRows[0] : null

    const existing = await db
      .select()
      .from(katalogProduk)
      .where(
        and(
          eq(katalogProduk.id, id),
          userStore
            ? or(eq(katalogProduk.userUid, userUid!), eq(katalogProduk.storeId, userStore.id))
            : eq(katalogProduk.userUid, userUid!)
        )
      )
      .limit(1)

    if (!existing || existing.length === 0) {
      return c.json({ success: false, error: 'Produk tidak ditemukan atau bukan milik Anda' }, 404)
    }

    await db
      .update(katalogProduk)
      .set({
        ...(sku !== undefined ? { sku } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(modal !== undefined ? { modal: Number(modal) } : {}),
        ...(price !== undefined ? { price: Number(price) } : {}),
        ...(stock !== undefined ? { stock: Number(stock) } : {}),
        ...(active !== undefined ? { active: Boolean(active) } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        ...(description !== undefined ? { description } : {}),
      })
      .where(eq(katalogProduk.id, id))

    const [updated] = await db.select().from(katalogProduk).where(eq(katalogProduk.id, id)).limit(1)

    // Sync to WhatsApp Business in background if session is connected
    const sessionId = `user_${user.id}`
    if (sessionManager.isSessionConnected(sessionId)) {
      sessionManager.syncProductToWhatsApp(sessionId, {
        id,
        name: updated.name,
        sku: updated.sku,
        price: updated.price,
        description: updated.description,
        imageUrl: updated.imageUrl,
        waProductId: existing[0].waProductId,
      }).then(async (waId) => {
        if (waId && waId !== existing[0].waProductId) {
          await db.update(katalogProduk).set({ waProductId: waId }).where(eq(katalogProduk.id, id))
          console.log(`[Katalog] Background WA update succeeded for product ${id}, waProductId: ${waId}`)
        }
      }).catch((waErr) => {
        console.warn('[Katalog] Background WA update error:', waErr)
      })
    }

    return c.json({ success: true, data: updated, message: 'Produk berhasil diperbarui' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
}
apiRouter.put('/katalog/:id', authMiddleware, putKatalogHandler)
apiRouter.put('/catalog/:id', authMiddleware, putKatalogHandler)

// 4. Delete product and remove from WA Business
const deleteKatalogHandler = async (c: any) => {
  const user = c.get('user') as UserPayload
  const id = Number(c.req.param('id'))
  try {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    // Verify ownership via storeId or userUid
    const storeRows = await db.select().from(userStores).where(eq(userStores.storeUseruid, userUid!)).limit(1)
    const userStore = storeRows && storeRows.length > 0 ? storeRows[0] : null

    const existing = await db
      .select()
      .from(katalogProduk)
      .where(
        and(
          eq(katalogProduk.id, id),
          userStore
            ? or(eq(katalogProduk.userUid, userUid!), eq(katalogProduk.storeId, userStore.id))
            : eq(katalogProduk.userUid, userUid!)
        )
      )
      .limit(1)

    if (!existing || existing.length === 0) {
      return c.json({ success: false, error: 'Produk tidak ditemukan atau bukan milik Anda' }, 404)
    }

    // Delete from WA Business in background if waProductId exists
    const sessionId = `user_${user.id}`
    if (existing[0].waProductId && sessionManager.isSessionConnected(sessionId)) {
      sessionManager.deleteProductFromWhatsApp(sessionId, existing[0].waProductId).catch((waErr) => {
        console.warn('[Katalog] Background WA delete error:', waErr)
      })
    }

    await db.delete(katalogProduk).where(eq(katalogProduk.id, id))
    return c.json({ success: true, message: 'Produk berhasil dihapus' })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
}
apiRouter.delete('/katalog/:id', authMiddleware, deleteKatalogHandler)
apiRouter.delete('/catalog/:id', authMiddleware, deleteKatalogHandler)

// 5. Batch sync all database catalog items to WhatsApp Business
const syncWaKatalogHandler = async (c: any) => {
  const user = c.get('user') as UserPayload
  const sessionId = `user_${user.id}`

  if (!sessionManager.isSessionConnected(sessionId)) {
    return c.json({
      success: false,
      error: 'WhatsApp Bot belum terhubung. Silakan hubungkan WhatsApp Bisnis pada menu Akun WA terlebih dahulu.'
    }, 400)
  }

  try {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    if (!userUid) {
      return c.json({ success: false, error: 'UID pemilik tidak ditemukan' }, 400)
    }

    const items = await db
      .select()
      .from(katalogProduk)
      .where(eq(katalogProduk.userUid, userUid))

    if (items.length === 0) {
      return c.json({ success: true, message: 'Tidak ada produk untuk disinkronkan.', data: { synced: 0, total: 0 } })
    }

    // Fetch existing WA catalog to avoid duplicate entries
    const existingWaProducts = await sessionManager.getWhatsAppCatalog(sessionId)

    let synced = 0
    let failed = 0

    for (const item of items) {
      try {
        let currentWaId = item.waProductId
        if (!currentWaId && existingWaProducts.length > 0) {
          const match = existingWaProducts.find((p: any) => p.retailerId === item.sku || p.name === item.name)
          if (match?.id) {
            currentWaId = match.id
          }
        }

        const waId = await sessionManager.syncProductToWhatsApp(sessionId, {
          id: item.id,
          name: item.name,
          sku: item.sku,
          price: item.price,
          description: item.description,
          imageUrl: item.imageUrl,
          waProductId: currentWaId,
        })

        if (waId) {
          synced++
          if (waId !== item.waProductId) {
            await db.update(katalogProduk).set({ waProductId: waId }).where(eq(katalogProduk.id, item.id))
          }
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    return c.json({
      success: true,
      data: { synced, failed, total: items.length },
      message: `Sinkronisasi selesai: ${synced} produk berhasil disinkronkan ke WhatsApp Bisnis.`,
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
}
apiRouter.post('/katalog/sync-wa', authMiddleware, syncWaKatalogHandler)
apiRouter.post('/catalog/sync-wa', authMiddleware, syncWaKatalogHandler)

// Fetch WhatsApp Business catalog items directly (for "under review" display)
apiRouter.get('/katalog/wa-catalog', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  const sessionId = `user_${user.id}`

  if (!sessionManager.isSessionConnected(sessionId)) {
    return c.json({ success: true, data: [] })
  }

  try {
    const products = await sessionManager.getWhatsAppCatalog(sessionId)
    return c.json({ success: true, data: products })
  } catch (err: any) {
    return c.json({ success: true, data: [] })
  }
})

/* ==========================================================================
   USER STORE ROUTES (Buat Toko Saya & Info Toko)
   ========================================================================== */

// GET /api/user-store - Ambil data toko milik user yang sedang login
apiRouter.get('/user-store', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  try {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    if (!userUid) {
      return c.json({ success: true, data: null })
    }

    const rows = await db
      .select()
      .from(userStores)
      .where(eq(userStores.storeUseruid, userUid))
      .limit(1)

    const store = rows.length > 0 ? rows[0] : null
    return c.json({ success: true, data: store, store })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// POST /api/user-store - Daftarkan toko baru ("Buat Toko Saya")
apiRouter.post('/user-store', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  try {
    const body = await c.req.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const location = typeof body.location === 'string' ? body.location.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''

    if (!name) {
      return c.json({ success: false, error: 'Nama toko wajib diisi.' }, 400)
    }

    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    if (!userUid) {
      return c.json({ success: false, error: 'UID pengguna tidak ditemukan.' }, 400)
    }

    // Periksa apakah user sudah memiliki toko
    const existing = await db
      .select()
      .from(userStores)
      .where(eq(userStores.storeUseruid, userUid))
      .limit(1)

    if (existing.length > 0) {
      return c.json(
        {
          success: false,
          error: `Anda sudah memiliki toko terdaftar (${existing[0].name}) dengan status: ${existing[0].status}.`,
          data: existing[0],
          store: existing[0],
        },
        400
      )
    }

    const [insertResult] = await db.insert(userStores).values({
      storeUseruid: userUid,
      name,
      location: location || null,
      description: description || null,
      status: 'pending',
    })

    const newId = insertResult.insertId
    const [created] = await db.select().from(userStores).where(eq(userStores.id, newId)).limit(1)

    // Sinkronkan nama toko ke kolom storeName tabel users
    await db.update(users).set({ storeName: name }).where(eq(users.id, user.id))

    return c.json(
      {
        success: true,
        message: 'Pendaftaran toko berhasil diajukan dan sedang menunggu persetujuan admin.',
        data: created,
        store: created,
      },
      201
    )
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// PUT /api/user-store - Update data & pengaturan toko milik user yang sedang login
apiRouter.put('/user-store', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  try {
    let userUid = user.uid
    if (!userUid) {
      const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
      userUid = dbUsers[0]?.uid || undefined
    }

    if (!userUid) {
      return c.json({ success: false, error: 'UID pengguna tidak ditemukan.' }, 400)
    }

    const existing = await db
      .select()
      .from(userStores)
      .where(eq(userStores.storeUseruid, userUid))
      .limit(1)

    if (existing.length === 0) {
      return c.json({ success: false, error: 'Toko belum terdaftar.' }, 404)
    }

    const currentStore = existing[0]
    const body = await c.req.json()

    const updateData: Partial<typeof userStores.$inferInsert> = {}

    if (typeof body.name === 'string' && body.name.trim()) {
      updateData.name = body.name.trim()
    }
    if (body.location !== undefined) {
      updateData.location = typeof body.location === 'string' ? body.location.trim() || null : null
    }
    if (body.description !== undefined) {
      updateData.description = typeof body.description === 'string' ? body.description.trim() || null : null
    }
    if (body.telegramBotToken !== undefined) {
      updateData.telegramBotToken = typeof body.telegramBotToken === 'string' ? body.telegramBotToken.trim() || null : null
    }
    if (body.telegramBotUsername !== undefined) {
      let uname = typeof body.telegramBotUsername === 'string' ? body.telegramBotUsername.trim() : null
      if (uname && uname.startsWith('@')) uname = uname.substring(1)
      updateData.telegramBotUsername = uname || null
    }
    if (body.telegramActive !== undefined) {
      updateData.telegramActive = Boolean(body.telegramActive)
    }

    if (Object.keys(updateData).length > 0) {
      await db.update(userStores).set(updateData).where(eq(userStores.id, currentStore.id))

      // Sinkronkan nama toko ke kolom storeName tabel users jika nama toko berubah
      if (updateData.name) {
        await db.update(users).set({ storeName: updateData.name }).where(eq(users.id, user.id))
      }
    }

    const [updated] = await db.select().from(userStores).where(eq(userStores.id, currentStore.id)).limit(1)

    return c.json({
      success: true,
      message: 'Pengaturan toko berhasil disimpan.',
      data: updated,
      store: updated,
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// POST /api/user-store/test-telegram - Uji validitas token Telegram Bot
apiRouter.post('/user-store/test-telegram', authMiddleware, async (c) => {
  const user = c.get('user') as UserPayload
  try {
    const body = await c.req.json().catch(() => ({}))
    let token = typeof body.token === 'string' ? body.token.trim() : ''

    // Jika tidak dikirim dalam body, gunakan token dari database
    if (!token) {
      let userUid = user.uid
      if (!userUid) {
        const dbUsers = await db.select({ uid: users.uid }).from(users).where(eq(users.id, user.id)).limit(1)
        userUid = dbUsers[0]?.uid || undefined
      }
      if (userUid) {
        const [store] = await db.select().from(userStores).where(eq(userStores.storeUseruid, userUid)).limit(1)
        if (store?.telegramBotToken) {
          token = store.telegramBotToken
        }
      }
    }

    if (!token) {
      return c.json({ success: false, error: 'Token Telegram Bot belum diisi.' }, 400)
    }

    // Panggil Telegram API getMe
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    const tgData = (await tgRes.json()) as any
    if (tgData && tgData.ok) {
      return c.json({
        success: true,
        message: 'Koneksi ke bot Telegram berhasil!',
        bot: {
          id: tgData.result.id,
          name: tgData.result.first_name,
          username: tgData.result.username,
          canJoinGroups: tgData.result.can_join_groups,
          canReadAllGroupMessages: tgData.result.can_read_all_group_messages,
          supportsInlineQueries: tgData.result.supports_inline_queries,
        },
      })
    } else {
      return c.json(
        {
          success: false,
          error: tgData?.description || 'Token Telegram Bot tidak valid.',
        },
        400
      )
    }
  } catch (err: any) {
    return c.json({ success: false, error: err.message || 'Gagal menghubungi server Telegram.' }, 500)
  }
})


/* ==========================================================================
   ADMIN MANAGEMENT ROUTES (Protected with authMiddleware + adminMiddleware)
   ========================================================================== */

// GET /api/admin/stats - Ringkasan KPI Admin
apiRouter.get('/admin/stats', authMiddleware, adminMiddleware, async (c) => {
  try {
    const allStores = await db.select().from(userStores)
    const allUsers = await db.select({ id: users.id }).from(users)

    const totalStores = allStores.length
    const pendingStores = allStores.filter((s) => s.status === 'pending').length
    const approvedStores = allStores.filter((s) => s.status === 'approved').length
    const rejectedStores = allStores.filter((s) => s.status === 'rejected').length
    const totalUsers = allUsers.length

    return c.json({
      success: true,
      data: {
        totalStores,
        pendingStores,
        approvedStores,
        rejectedStores,
        totalUsers,
      },
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// GET /api/admin/stores - Daftar seluruh toko beserta informasi pemilik
apiRouter.get('/admin/stores', authMiddleware, adminMiddleware, async (c) => {
  try {
    const statusQuery = c.req.query('status')
    const storeRows = await db.select().from(userStores).orderBy(desc(userStores.createdAt))
    const userRows = await db
      .select({
        id: users.id,
        uid: users.uid,
        name: users.name,
        username: users.username,
        email: users.email,
        profileUrl: users.profileUrl,
      })
      .from(users)

    const userMap = new Map(userRows.map((u) => [u.uid, u]))

    let results = storeRows.map((s) => ({
      ...s,
      owner: s.storeUseruid ? userMap.get(s.storeUseruid) || null : null,
    }))

    if (statusQuery && statusQuery !== 'all') {
      results = results.filter((s) => s.status === statusQuery)
    }

    return c.json({ success: true, data: results })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// PUT /api/admin/stores/:id/status - Menyetujui atau menolak toko
apiRouter.put('/admin/stores/:id/status', authMiddleware, adminMiddleware, async (c) => {
  const id = Number(c.req.param('id'))
  try {
    const body = await c.req.json()
    const status = body.status
    if (status !== 'approved' && status !== 'rejected' && status !== 'pending') {
      return c.json({ success: false, error: 'Status tidak valid. Harus approved, rejected, atau pending.' }, 400)
    }

    const [existing] = await db.select().from(userStores).where(eq(userStores.id, id)).limit(1)
    if (!existing) {
      return c.json({ success: false, error: 'Toko tidak ditemukan.' }, 404)
    }

    await db.update(userStores).set({ status }).where(eq(userStores.id, id))
    const [updated] = await db.select().from(userStores).where(eq(userStores.id, id)).limit(1)

    // Jika disetujui, sinkronkan nama toko ke akun pengguna pemilik
    if (status === 'approved' && existing.storeUseruid) {
      await db.update(users).set({ storeName: existing.name }).where(eq(users.uid, existing.storeUseruid))
    }

    return c.json({
      success: true,
      message: `Status toko "${existing.name}" berhasil diubah menjadi "${status}".`,
      data: updated,
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// GET /api/admin/users - Daftar seluruh pengguna beserta data toko mereka
apiRouter.get('/admin/users', authMiddleware, adminMiddleware, async (c) => {
  try {
    const userRows = await db
      .select({
        id: users.id,
        uid: users.uid,
        name: users.name,
        username: users.username,
        email: users.email,
        role: users.role,
        storeName: users.storeName,
        profileUrl: users.profileUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))

    const storeRows = await db.select().from(userStores)
    const storeMap = new Map(storeRows.map((s) => [s.storeUseruid, s]))

    const results = userRows.map((u) => ({
      ...u,
      store: u.uid ? storeMap.get(u.uid) || null : null,
    }))

    return c.json({ success: true, data: results })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// PUT /api/admin/users/:id/role - Ubah role pengguna
apiRouter.put('/admin/users/:id/role', authMiddleware, adminMiddleware, async (c) => {
  const id = Number(c.req.param('id'))
  try {
    const body = await c.req.json()
    const role = body.role
    if (role !== 'admin' && role !== 'user') {
      return c.json({ success: false, error: 'Role harus admin atau user.' }, 400)
    }

    await db.update(users).set({ role }).where(eq(users.id, id))
    return c.json({ success: true, message: `Role pengguna berhasil diubah menjadi ${role}.` })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

