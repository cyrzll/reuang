import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  type WASocket,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import QRCode from 'qrcode'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { and, desc, eq, inArray, or, isNotNull } from 'drizzle-orm'
import {
  db,
  dbPool,
  waAccounts,
  waSessions,
  chatMessages,
  users,
  categories,
  katalogProduk,
  bankAccounts,
  orderHistory,
} from '../db/database.js'
import { useMySQLAuthState } from './mysql-auth.js'
import { formatJakartaDate } from '../utils/date.js'
import { orderEventEmitter } from '../events/order-events.js'

export interface SessionInfo {
  sessionId: string
  userName: string
  phoneNumber: string | null
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
  qrCode: string | null
  qrDataUrl: string | null
  isBusiness?: boolean
  errorMessage?: string | null
  updatedAt?: Date
}

export interface ChatMessage {
  id?: number
  sessionId: string
  sender: string
  recipient: string
  messageText: string
  isFromMe: boolean
  timestamp?: Date
}

export interface CartItem {
  id: number
  sku?: string
  name: string
  price: number
  qty: number
  subtotal: number
}

export interface PendingOrderItem {
  productId: number
  sku?: string
  name: string
  price: number
  maxStock: number
}

class SessionManager extends EventEmitter {
  private sockets: Map<string, WASocket> = new Map()
  private sessionData: Map<string, SessionInfo> = new Map()
  private reconnectTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private userActiveCategory: Map<string, string> = new Map()
  private userCarts: Map<string, CartItem[]> = new Map()
  private userPendingOrder: Map<string, PendingOrderItem> = new Map()
  private userAwaitingName: Map<string, number> = new Map()
  private lidToPhone: Map<string, string> = new Map()
  private phoneToLid: Map<string, string> = new Map()

  constructor() {
    super()
  }

  /**
   * Get all registered accounts and their current statuses via Drizzle ORM
   */
  public async getAllSessions(): Promise<SessionInfo[]> {
    const rows = await db.select().from(waAccounts).orderBy(desc(waAccounts.createdAt))

    return rows.map((row) => {
      const activeMem = this.sessionData.get(row.sessionId)
      return {
        sessionId: row.sessionId,
        userName: row.userName,
        phoneNumber: activeMem?.phoneNumber || row.phoneNumber || null,
        status: (activeMem?.status || row.status || 'disconnected') as any,
        qrCode: activeMem?.qrCode || null,
        qrDataUrl: activeMem?.qrDataUrl || null,
        isBusiness: activeMem?.isBusiness,
        errorMessage: activeMem?.errorMessage || null,
        updatedAt: row.updatedAt,
      }
    })
  }

  /**
   * Get specific session info via Drizzle ORM
   */
  public async getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
    const activeMem = this.sessionData.get(sessionId)
    if (activeMem) return activeMem

    const rows = await db
      .select()
      .from(waAccounts)
      .where(eq(waAccounts.sessionId, sessionId))
      .limit(1)

    if (!rows || rows.length === 0) return null

    const row = rows[0]
    return {
      sessionId: row.sessionId,
      userName: row.userName,
      phoneNumber: row.phoneNumber || null,
      status: (row.status || 'disconnected') as any,
      qrCode: null,
      qrDataUrl: null,
      isBusiness: false,
      errorMessage: null,
      updatedAt: row.updatedAt,
    }
  }

  /**
   * Start or create a WhatsApp session for a given user
   */
  public async startSession(sessionId: string, userName?: string): Promise<SessionInfo> {
    // Clear any pending reconnects
    if (this.reconnectTimeouts.has(sessionId)) {
      clearTimeout(this.reconnectTimeouts.get(sessionId))
      this.reconnectTimeouts.delete(sessionId)
    }

    // Ensure session is registered in wa_accounts table via Drizzle ORM
    if (userName) {
      await db
        .insert(waAccounts)
        .values({
          sessionId,
          userName,
          status: 'connecting',
        })
        .onDuplicateKeyUpdate({
          set: { userName, status: 'connecting' },
        })
    } else {
      const rows = await db
        .select({ userName: waAccounts.userName })
        .from(waAccounts)
        .where(eq(waAccounts.sessionId, sessionId))
        .limit(1)

      if (rows.length === 0) {
        await db
          .insert(waAccounts)
          .values({ sessionId, userName: 'User ' + sessionId, status: 'connecting' })
      } else {
        await db
          .update(waAccounts)
          .set({ status: 'connecting' })
          .where(eq(waAccounts.sessionId, sessionId))
      }
    }

    // Existing session info in memory
    const existing = this.sessionData.get(sessionId)
    const currentInfo: SessionInfo = {
      sessionId,
      userName: userName || existing?.userName || 'User ' + sessionId,
      phoneNumber: existing?.phoneNumber || null,
      status: 'connecting',
      qrCode: null,
      qrDataUrl: null,
    }
    this.sessionData.set(sessionId, currentInfo)
    this.emit(`session:${sessionId}`, { type: 'status', status: 'connecting' })

    // Existing socket cleanup if any
    const oldSock = this.sockets.get(sessionId)
    if (oldSock) {
      try {
        oldSock.end(undefined)
      } catch (err) {
        console.error(`[SessionManager] Error closing old socket for ${sessionId}:`, err)
      }
      this.sockets.delete(sessionId)
    }

    // Initialize MySQL auth state for Baileys
    const { state, saveCreds, clearAuth } = await useMySQLAuthState(sessionId)
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1017531287] as [number, number, number],
    }))

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['WhatsApp Multi-User Bot', 'Chrome', '1.0.0'],
      syncFullHistory: false,
    })

    this.sockets.set(sessionId, sock)

    // Handle connection updates (QR code, open, close)
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        currentInfo.status = 'qr_ready'
        currentInfo.qrCode = qr
        try {
          currentInfo.qrDataUrl = await QRCode.toDataURL(qr)
        } catch (err) {
          console.error(`[SessionManager] QR Code generation error:`, err)
        }

        await db
          .update(waAccounts)
          .set({ status: 'qr_ready' })
          .where(eq(waAccounts.sessionId, sessionId))

        this.emit(`session:${sessionId}`, {
          type: 'qr',
          qr: currentInfo.qrCode,
          qrDataUrl: currentInfo.qrDataUrl,
          status: 'qr_ready',
        })
      }

      if (connection === 'open') {
        const phone = sock.user?.id ? sock.user.id.split(':')[0] : null
        const ownJid = sock.user?.id ? `${sock.user.id.split(':')[0]}@s.whatsapp.net` : null

        console.log(`[SessionManager] Sesi ${sessionId} terbuka (${phone}). Memverifikasi profil WhatsApp Bisnis...`)

        // Verifikasi apakah akun adalah WhatsApp Bisnis
        let isBusiness = false
        if (ownJid) {
          // Beri jeda singkat agar socket stabil sebelum mengirim query IQ
          await new Promise((resolve) => setTimeout(resolve, 800))
          try {
            const bizProfile = await sock.getBusinessProfile(ownJid)
            if (bizProfile && (bizProfile.wid || bizProfile.description !== undefined)) {
              isBusiness = true
            }
          } catch (err: any) {
            console.log(`[SessionManager] Verifikasi WA Bisnis untuk ${phone}: bukan akun bisnis (${err?.message || err})`)
            isBusiness = false
          }
        }

        // Jika BUKAN WhatsApp Bisnis, tolak koneksi dan putuskan sesi
        if (!isBusiness) {
          console.warn(`[SessionManager] DITOLAK: Sesi ${sessionId} (${phone}) BUKAN akun WhatsApp Bisnis. Memutuskan sesi...`)

          currentInfo.status = 'disconnected'
          currentInfo.qrCode = null
          currentInfo.qrDataUrl = null
          currentInfo.phoneNumber = null
          currentInfo.isBusiness = false
          currentInfo.errorMessage = 'Hanya menerima scan dari akun WhatsApp Bisnis. Akun WhatsApp personal ditolak.'

          await db
            .update(waAccounts)
            .set({ status: 'disconnected', phoneNumber: null })
            .where(eq(waAccounts.sessionId, sessionId))

          this.emit(`session:${sessionId}`, {
            type: 'error',
            status: 'disconnected',
            message: 'Hanya menerima scan dari akun WhatsApp Bisnis. Akun WhatsApp personal ditolak.',
            errorMessage: 'Hanya menerima scan dari akun WhatsApp Bisnis. Akun WhatsApp personal ditolak.',
          })

          try {
            await sock.logout('Only WhatsApp Business allowed')
          } catch {}
          await clearAuth()
          this.sockets.delete(sessionId)
          return
        }

        // Akun terverifikasi sebagai WhatsApp Bisnis
        currentInfo.status = 'connected'
        currentInfo.qrCode = null
        currentInfo.qrDataUrl = null
        currentInfo.phoneNumber = phone
        currentInfo.isBusiness = true
        currentInfo.errorMessage = null

        await db
          .update(waAccounts)
          .set({ status: 'connected', phoneNumber: phone })
          .where(eq(waAccounts.sessionId, sessionId))

        console.log(`[SessionManager] Sesi ${sessionId} terhubung sebagai WhatsApp Bisnis! Nomor: ${phone}`)
        this.emit(`session:${sessionId}`, {
          type: 'connected',
          status: 'connected',
          phoneNumber: phone,
          isBusiness: true,
        })
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        console.log(
          `[SessionManager] Session ${sessionId} closed. Reason: ${statusCode}. Reconnecting: ${shouldReconnect}`
        )

        if (shouldReconnect) {
          currentInfo.status = 'connecting'
          await db
            .update(waAccounts)
            .set({ status: 'connecting' })
            .where(eq(waAccounts.sessionId, sessionId))

          this.emit(`session:${sessionId}`, { type: 'status', status: 'connecting' })

          // Schedule reconnection
          const timeout = setTimeout(() => {
            this.startSession(sessionId, currentInfo.userName).catch((err) => {
              console.error(`[SessionManager] Reconnect error for ${sessionId}:`, err)
            })
          }, 4000)
          this.reconnectTimeouts.set(sessionId, timeout)
        } else {
          // Logged out
          currentInfo.status = 'disconnected'
          currentInfo.qrCode = null
          currentInfo.qrDataUrl = null
          await db
            .update(waAccounts)
            .set({ status: 'disconnected', phoneNumber: null })
            .where(eq(waAccounts.sessionId, sessionId))

          await clearAuth()
          this.sockets.delete(sessionId)
          this.emit(`session:${sessionId}`, { type: 'status', status: 'disconnected' })
        }
      }
    })

    // Handle credentials update
    sock.ev.on('creds.update', saveCreds)

    // Handle incoming messages & auto-replies
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        if (!msg.message) continue

        const remoteJid = msg.key.remoteJid || ''
        const isFromMe = Boolean(msg.key.fromMe)

        // Extract text message content and check if image message
        const hasImage = Boolean(msg.message?.imageMessage)
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          ''

        // If customer sends a photo (bukti transfer)
        if (!isFromMe && hasImage && !remoteJid.includes('@broadcast')) {
          try {
            const ownerInfo = await this.getOwnerInfo(sessionId)
            const { phoneJid, lidJid } = await this.resolveJidMapping(sock, msg.key, remoteJid)

            if (ownerInfo.userUid && (phoneJid || lidJid)) {
              const jidConditions = []
              if (phoneJid) jidConditions.push(eq(orderHistory.phoneJid, phoneJid))
              if (lidJid) jidConditions.push(eq(orderHistory.lidJid, lidJid))

              const latestOrder = await db
                .select()
                .from(orderHistory)
                .where(
                  and(
                    eq(orderHistory.userUid, ownerInfo.userUid),
                    or(...jidConditions)!
                  )
                )
                .orderBy(desc(orderHistory.id))
                .limit(1)

              if (latestOrder.length > 0) {
                const mediaBuffer = await downloadMediaMessage(msg, 'buffer', {})
                if (mediaBuffer && Buffer.isBuffer(mediaBuffer)) {
                  const filename = `proof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`
                  const serverDir = path.resolve(process.cwd(), 'media/bukti')
                  const webDir = path.resolve(process.cwd(), '../web/public/media/bukti')
                  if (!fs.existsSync(serverDir)) fs.mkdirSync(serverDir, { recursive: true })
                  if (!fs.existsSync(webDir)) fs.mkdirSync(webDir, { recursive: true })
                  fs.writeFileSync(path.join(serverDir, filename), mediaBuffer)
                  try {
                    fs.writeFileSync(path.join(webDir, filename), mediaBuffer)
                  } catch {}

                  const proofUrl = `/media/bukti/${filename}`
                  await db
                    .update(orderHistory)
                    .set({ paymentProofUrl: proofUrl })
                    .where(eq(orderHistory.id, latestOrder[0].id))

                  orderEventEmitter.notifyOrderChange({
                    userUid: ownerInfo.userUid,
                    orderUid: latestOrder[0].orderUid,
                    type: 'proof_uploaded',
                  })

                  const chatKey = `${sessionId}:${remoteJid}`
                  this.userAwaitingName.set(chatKey, latestOrder[0].id)

                  const replyProof =
                    `✅ *Bukti transfer diterima*\n` +
                    `No. Pesanan: *#${latestOrder[0].orderUid}*\n\n` +
                    `Silakan kirim nama Anda (contoh: *Budi Santoso*).`

                  await sock.sendMessage(remoteJid, { text: replyProof })

                  await db.insert(chatMessages).values({
                    sessionId,
                    sender: sock.user?.id || 'me',
                    recipient: remoteJid,
                    messageText: replyProof,
                    isFromMe: true,
                  })
                  continue
                }
              }
            }
          } catch (proofErr) {
            console.error('[SessionManager] Error handling payment proof photo:', proofErr)
          }
        }

        if (!text.trim()) continue

        // Save to chat_messages database table via Drizzle ORM
        try {
          await db.insert(chatMessages).values({
            sessionId,
            sender: remoteJid,
            recipient: isFromMe ? remoteJid : sock.user?.id || 'me',
            messageText: text,
            isFromMe,
          })
        } catch (dbErr) {
          console.error(`[SessionManager] Failed to save chat message:`, dbErr)
        }

        this.emit(`session:${sessionId}`, {
          type: 'message',
          message: {
            sessionId,
            sender: remoteJid,
            recipient: isFromMe ? remoteJid : sock.user?.id || 'me',
            text,
            isFromMe,
            timestamp: new Date(),
          },
        })

        // Bot Auto-Reply (Only for incoming messages from others, and ignore status broadcast)
        if (!isFromMe && !remoteJid.includes('@broadcast')) {
          await this.handleBotReply(
            sock,
            sessionId,
            currentInfo.userName,
            remoteJid,
            text.trim(),
            msg.key,
            (msg as any).pushName || undefined
          )
        }
      }
    })

    return currentInfo
  }

  /**
   * Resolve phone_jid and lid_jid for incoming or outgoing interactions
   */
  public async resolveJidMapping(
    sock: any,
    msgKey?: any,
    rawJid?: string
  ): Promise<{ phoneJid: string | null; lidJid: string | null }> {
    const remoteJid = msgKey?.remoteJid || rawJid || ''
    const altJid = msgKey?.remoteJidAlt || msgKey?.participantAlt || ''

    let phoneJid: string | null = null
    let lidJid: string | null = null

    if (remoteJid.endsWith('@lid')) {
      lidJid = remoteJid
    } else if (remoteJid.endsWith('@s.whatsapp.net')) {
      phoneJid = remoteJid
    } else if (remoteJid && !remoteJid.includes('@')) {
      const cleaned = remoteJid.replace(/[^0-9]/g, '')
      if (cleaned.length >= 14 && !cleaned.startsWith('62') && !cleaned.startsWith('08')) {
        lidJid = `${cleaned}@lid`
      } else if (cleaned) {
        const formatted = cleaned.startsWith('0') ? '62' + cleaned.slice(1) : cleaned
        phoneJid = `${formatted}@s.whatsapp.net`
      }
    }

    if (altJid.endsWith('@lid')) {
      lidJid = altJid
    } else if (altJid.endsWith('@s.whatsapp.net')) {
      phoneJid = altJid
    }

    // 1. In-memory cache lookup
    if (lidJid && !phoneJid && this.lidToPhone.has(lidJid)) {
      phoneJid = this.lidToPhone.get(lidJid)!
    }
    if (phoneJid && !lidJid && this.phoneToLid.has(phoneJid)) {
      lidJid = this.phoneToLid.get(phoneJid)!
    }

    // 2. Baileys internal signalRepository.lidMapping
    if (lidJid && !phoneJid && sock?.signalRepository?.lidMapping?.getPNForLID) {
      try {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(lidJid)
        if (pn) {
          phoneJid = pn.includes('@') ? pn : `${pn}@s.whatsapp.net`
        }
      } catch {}
    }
    if (phoneJid && !lidJid && sock?.signalRepository?.lidMapping?.getLIDForPN) {
      try {
        const lid = await sock.signalRepository.lidMapping.getLIDForPN(phoneJid)
        if (lid) {
          lidJid = lid.includes('@') ? lid : `${lid}@lid`
        }
      } catch {}
    }

    // 3. MySQL wa_sessions table lookup (key: lid-mapping-{pn} and lid-mapping-{lid}_reverse)
    if (lidJid && !phoneJid) {
      try {
        const lidNum = lidJid.replace(/[^0-9]/g, '')
        const [rows] = await dbPool.query<any[]>(
          'SELECT data_val FROM wa_sessions WHERE data_key = ? LIMIT 1',
          [`lid-mapping-${lidNum}_reverse`]
        )
        if (rows && rows.length > 0 && rows[0]?.data_val) {
          const rawPn = JSON.parse(rows[0].data_val)
          if (rawPn) {
            phoneJid = String(rawPn).includes('@') ? String(rawPn) : `${String(rawPn)}@s.whatsapp.net`
          }
        }
      } catch {}
    }
    if (phoneJid && !lidJid) {
      try {
        const pnNum = phoneJid.replace(/[^0-9]/g, '')
        const [rows] = await dbPool.query<any[]>(
          'SELECT data_val FROM wa_sessions WHERE data_key = ? LIMIT 1',
          [`lid-mapping-${pnNum}`]
        )
        if (rows && rows.length > 0 && rows[0]?.data_val) {
          const rawLid = JSON.parse(rows[0].data_val)
          if (rawLid) {
            lidJid = String(rawLid).includes('@') ? String(rawLid) : `${String(rawLid)}@lid`
          }
        }
      } catch {}
    }

    // 4. Past orders in order_history table
    if (lidJid && !phoneJid) {
      try {
        const rows = await db
          .select({ phoneJid: orderHistory.phoneJid })
          .from(orderHistory)
          .where(and(eq(orderHistory.lidJid, lidJid), isNotNull(orderHistory.phoneJid)))
          .limit(1)
        if (rows.length > 0 && rows[0].phoneJid) {
          phoneJid = rows[0].phoneJid
        }
      } catch {}
    }
    if (phoneJid && !lidJid) {
      try {
        const rows = await db
          .select({ lidJid: orderHistory.lidJid })
          .from(orderHistory)
          .where(and(eq(orderHistory.phoneJid, phoneJid), isNotNull(orderHistory.lidJid)))
          .limit(1)
        if (rows.length > 0 && rows[0].lidJid) {
          lidJid = rows[0].lidJid
        }
      } catch {}
    }

    // Cache results in memory if both exist
    if (lidJid && phoneJid) {
      this.lidToPhone.set(lidJid, phoneJid)
      this.phoneToLid.set(phoneJid, lidJid)
    }

    return { phoneJid, lidJid }
  }

  /**
   * Resolve owner user info (uid and storeName) from sessionId
   */
  private async getOwnerInfo(sessionId: string): Promise<{
    userUid: string | null
    storeName: string
  }> {
    try {
      let userRecord: { uid: string | null; name: string; storeName: string | null } | null = null

      const waAcc = await db
        .select()
        .from(waAccounts)
        .where(eq(waAccounts.sessionId, sessionId))
        .limit(1)

      if (waAcc.length > 0 && waAcc[0].userId) {
        const u = await db.select().from(users).where(eq(users.id, waAcc[0].userId)).limit(1)
        if (u.length > 0) {
          userRecord = u[0]
        }
      }

      if (!userRecord && sessionId.startsWith('user_')) {
        const parsedId = parseInt(sessionId.replace('user_', ''), 10)
        if (!isNaN(parsedId)) {
          const u = await db.select().from(users).where(eq(users.id, parsedId)).limit(1)
          if (u.length > 0) {
            userRecord = u[0]
          }
        }
      }

      if (userRecord) {
        return {
          userUid: userRecord.uid,
          storeName: userRecord.storeName?.trim() || userRecord.name || 'Toko Kami',
        }
      }
    } catch (err) {
      console.error(`[SessionManager] getOwnerInfo error for ${sessionId}:`, err)
    }

    return {
      userUid: null,
      storeName: 'Toko Kami',
    }
  }

  /**
   * Fetch available product categories for a given user UID
   */
  private async getAvailableCategories(userUid: string | null): Promise<string[]> {
    if (!userUid) return []

    try {
      // 1. Fetch categories from categories table
      const catRecords = await db
        .select({ name: categories.name })
        .from(categories)
        .where(eq(categories.uid, userUid))

      // 2. Fetch distinct categories from katalogProduk where active = true
      const prodRecords = await db
        .select({ category: katalogProduk.category })
        .from(katalogProduk)
        .where(and(eq(katalogProduk.userUid, userUid), eq(katalogProduk.active, true)))

      const catSet = new Set<string>()
      for (const c of catRecords) {
        const name = c.name?.trim()
        if (name) catSet.add(name)
      }
      for (const p of prodRecords) {
        const name = p.category?.trim()
        if (name) catSet.add(name)
      }

      return Array.from(catSet).sort((a, b) => a.localeCompare(b, 'id'))
    } catch (err) {
      console.error(`[SessionManager] getAvailableCategories error for ${userUid}:`, err)
      return []
    }
  }

  /**
   * Helper to retrieve product image Buffer from local storage
   */
  private getProductImageBuffer(imageUrl?: string | null): Buffer | null {
    if (!imageUrl) return null
    const cleanPath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl
    const candidates = [
      path.resolve(process.cwd(), cleanPath),
      path.resolve(process.cwd(), 'server', cleanPath),
      path.resolve(process.cwd(), '../server', cleanPath),
      path.resolve(process.cwd(), 'web/public', cleanPath),
      path.resolve(process.cwd(), '../web/public', cleanPath),
      path.resolve(process.cwd(), 'public', cleanPath),
      path.resolve('/Users/rizal/projek/whatsapp-order/server', cleanPath),
      path.resolve('/Users/rizal/projek/whatsapp-order/web/public', cleanPath),
    ]

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          return fs.readFileSync(p)
        } catch (err) {
          console.error(`[SessionManager] Error reading product image from ${p}:`, err)
        }
      }
    }
    return null
  }

  /**
   * Helper to format cart items into a clean WhatsApp message
   */
  private formatCartMessage(cart: CartItem[], storeName: string): string {
    if (!cart || cart.length === 0) {
      return `🛒 *Keranjang Kosong*\nKetik *menu* untuk melihat produk.`
    }

    const formatRupiah = (val: number) =>
      new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(val || 0)

    const lines = cart
      .map((it, idx) => `${idx + 1}. *${it.name}* (${it.qty}x) - ${formatRupiah(it.subtotal)}`)
      .join('\n')

    const total = cart.reduce((acc, it) => acc + it.subtotal, 0)

    return (
      `🛒 *Keranjang - ${storeName}*\n\n` +
      `${lines}\n\n` +
      `*Total:* *${formatRupiah(total)}*\n\n` +
      `• Ketik *bayar* untuk checkout\n` +
      `• Ketik *ubah [no] [qty]* / *hapus [no]*\n` +
      `• Ketik *menu* untuk tambah produk`
    )
  }

  /**
   * Handle built-in bot logic and auto-responses
   */
  private async handleBotReply(
    sock: WASocket,
    sessionId: string,
    userName: string,
    remoteJid: string,
    incomingText: string,
    msgKey?: any,
    pushName?: string
  ): Promise<void> {
    const lower = incomingText.toLowerCase()
    const trimmed = incomingText.trim()
    const chatKey = `${sessionId}:${remoteJid}`
    let reply: string | null = null

    const { phoneJid, lidJid } = await this.resolveJidMapping(sock, msgKey, remoteJid)

    const formatRupiah = (val: number) =>
      new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(val || 0)

    // Get store and owner information
    const { userUid, storeName } = await this.getOwnerInfo(sessionId)
    const effectiveStore = storeName || userName || 'Toko Kami'

    // =========================================================================
    // 0. AWAITING CUSTOMER NAME (after sending payment proof)
    // =========================================================================
    const awaitingOrderId = this.userAwaitingName.get(chatKey)
    const pendingOrder = this.userPendingOrder.get(chatKey)
    if (
      awaitingOrderId &&
      lower !== 'menu' &&
      lower !== '!menu' &&
      lower !== '/menu' &&
      lower !== '#menu' &&
      trimmed !== '0' &&
      trimmed !== '!0' &&
      trimmed !== '88' &&
      trimmed !== '99' &&
      !lower.startsWith('order ') &&
      !lower.startsWith('detail ') &&
      !lower.startsWith('beli#')
    ) {
      this.userAwaitingName.delete(chatKey)
      let cleanedName = trimmed
      if (lower.startsWith('nama#') || lower.startsWith('!nama#')) {
        cleanedName = trimmed.split('#').slice(1).join('#').trim()
      }

      if (cleanedName) {
        try {
          await db
            .update(orderHistory)
            .set({ customerName: cleanedName })
            .where(eq(orderHistory.id, awaitingOrderId))

          const [updated] = await db
            .select()
            .from(orderHistory)
            .where(eq(orderHistory.id, awaitingOrderId))
            .limit(1)

          if (userUid && updated) {
            orderEventEmitter.notifyOrderChange({
              userUid,
              orderUid: updated.orderUid,
              type: 'name_updated',
            })
          }

          reply =
            `✅ *Nama disimpan: ${cleanedName}*\n` +
            `No. Pesanan: *#${updated?.orderUid || awaitingOrderId}*\n\n` +
            `Pesanan sedang diverifikasi.\n` +
            `Ketik *88* untuk riwayat pesanan.`
        } catch (dbNameErr) {
          console.error('[SessionManager] Error updating customer name:', dbNameErr)
          reply = `✅ Nama *${cleanedName}* telah dicatat.`
        }
      }
    } else if (pendingOrder) {
      const qty = parseInt(trimmed, 10)

      if (lower === 'batal' || lower === '!batal') {
        this.userPendingOrder.delete(chatKey)
        reply = `❌ Pemesanan *${pendingOrder.name}* dibatalkan.\nKetik *menu* untuk melihat produk.`
      } else if (!isNaN(qty) && qty > 0 && String(qty) === trimmed) {
        this.userPendingOrder.delete(chatKey)
        let cart = this.userCarts.get(chatKey) || []
        const existingIdx = cart.findIndex((c) => c.id === pendingOrder.productId)

        if (existingIdx >= 0) {
          cart[existingIdx].qty += qty
          cart[existingIdx].subtotal = cart[existingIdx].qty * cart[existingIdx].price
        } else {
          cart.push({
            id: pendingOrder.productId,
            sku: pendingOrder.sku,
            name: pendingOrder.name,
            price: pendingOrder.price,
            qty: qty,
            subtotal: qty * pendingOrder.price,
          })
        }
        this.userCarts.set(chatKey, cart)

        const cartLines = cart
          .map((it, idx) => `${idx + 1}. *${it.name}* (${it.qty}x) - ${formatRupiah(it.subtotal)}`)
          .join('\n')
        const total = cart.reduce((acc, it) => acc + it.subtotal, 0)

        reply =
          `🛒 *Keranjang (${cart.length} item)*\n\n` +
          `${cartLines}\n\n` +
          `*Total:* *${formatRupiah(total)}*\n\n` +
          `Ketik *99* untuk checkout atau *menu* untuk tambah produk.`
      } else {
        reply = `Masukkan angka jumlah pesanan (contoh: *1* atau *2*), atau ketik *batal*.`
      }
    } else if (lower === 'ping' || lower === '!ping') {
      reply = `🏓 *Pong!* Bot aktif untuk *${effectiveStore}*.`
    } else if (
      lower === 'menu' ||
      lower === '!menu' ||
      lower === '/menu' ||
      lower === '#menu' ||
      trimmed === '0' ||
      trimmed === '!0'
    ) {
      this.userActiveCategory.delete(chatKey)
      this.userPendingOrder.delete(chatKey)
      this.userAwaitingName.delete(chatKey)
      const catList = await this.getAvailableCategories(userUid)
      const cart = this.userCarts.get(chatKey) || []
      const totalItems = cart.reduce((acc, it) => acc + it.qty, 0)

      if (catList.length === 0) {
        reply =
          `📋 *Kategori Produk - ${effectiveStore}*\n\n` +
          `Saat ini belum ada kategori produk yang tersedia.\n` +
          `Silakan hubungi admin kami untuk informasi produk.`
      } else {
        const categoryLines = catList.map((cat, index) => `${index + 1}. ${cat}`).join('\n')
        let cartNotice = `\n\n88. 📦 Riwayat Pesanan`
        cartNotice += `\n99. 🛒 Keranjang`
        if (totalItems > 0) {
          cartNotice += ` (${totalItems})`
        }

        reply =
          `📋 *Menu - ${effectiveStore}*\n\n` +
          `${categoryLines}` +
          `${cartNotice}\n\n` +
          `Ketik nomor untuk memilih.`
      }
    } else if (
      trimmed === '88' ||
      lower === 'riwayat' ||
      lower === '!riwayat' ||
      lower === 'history' ||
      lower === 'pesanan'
    ) {
      this.userPendingOrder.delete(chatKey)
      this.userAwaitingName.delete(chatKey)

      if (!userUid) {
        reply = `⚠️ Layanan toko sedang tidak tersedia.`
      } else {
        try {
          const jidConditions = []
          if (phoneJid) jidConditions.push(eq(orderHistory.phoneJid, phoneJid))
          if (lidJid) jidConditions.push(eq(orderHistory.lidJid, lidJid))
          if (jidConditions.length === 0) {
            jidConditions.push(eq(orderHistory.lidJid, remoteJid), eq(orderHistory.phoneJid, remoteJid))
          }

          const userOrders = await db
            .select()
            .from(orderHistory)
            .where(
              and(
                eq(orderHistory.userUid, userUid),
                or(...jidConditions)!
              )
            )
            .orderBy(desc(orderHistory.id))
            .limit(5)

          if (userOrders.length === 0) {
            reply =
              `📦 *Riwayat Pesanan - ${effectiveStore}*\n\n` +
              `Belum ada pesanan.\n\n` +
              `Ketik *menu* untuk melihat produk.`
          } else {
            const listText = userOrders
              .map((o, idx) => {
                let itemsStr = ''
                try {
                  const items = typeof o.orderItems === 'string' ? JSON.parse(o.orderItems) : o.orderItems
                  if (Array.isArray(items)) {
                    itemsStr = items.map((it: any) => `${it.name} (${it.qty}x)`).join(', ')
                  }
                } catch {
                  itemsStr = 'Pesanan Produk'
                }

                let statusBadge = 'Menunggu'
                const st = String(o.orderStatus || '').toLowerCase()
                if (st === 'selesai' || st === 'completed') {
                  statusBadge = '✅ Selesai'
                } else if (st === 'siap') {
                  statusBadge = 'Siap'
                } else if (st === 'disetujui' || st === 'diproses' || st === 'dikirim') {
                  statusBadge = 'Disetujui'
                } else if (st === 'dibatalkan' || st === 'cancelled') {
                  statusBadge = 'Dibatalkan'
                }

                const dateStr = formatJakartaDate(o.createdAt)

                const nameLine =
                  o.customerName && o.customerName.trim() && o.customerName.trim() !== '-'
                    ? `   👤 *${o.customerName.trim()}*\n`
                    : ''

                return (
                  `${idx + 1}. *#${o.orderUid}*\n` +
                  nameLine +
                  `   📅 ${dateStr}\n` +
                  `   🛍️ ${itemsStr}\n` +
                  `   💰 *${formatRupiah(o.totalPrice)}*\n` +
                  `   Status: *${statusBadge}*`
                )
              })
              .join('\n\n')

            reply =
              `📦 *Riwayat Pesanan - ${effectiveStore}*\n\n` +
              `${listText}\n\n` +
              `Ketik *menu* untuk kembali ke katalog.`
          }
        } catch (dbErr) {
          console.error('[SessionManager] Error fetching order history for customer:', dbErr)
          reply = `⚠️ Gagal memuat riwayat pesanan. Silakan coba beberapa saat lagi.`
        }
      }
    } else if (
      trimmed === '99' ||
      lower === 'keranjang' ||
      lower === '!keranjang' ||
      lower === 'cart' ||
      lower === '!cart'
    ) {
      this.userPendingOrder.delete(chatKey)
      const cart = this.userCarts.get(chatKey) || []
      reply = this.formatCartMessage(cart, effectiveStore)
    } else if (lower === 'bersihkan' || lower === 'clear' || lower === '!bersihkan') {
      this.userCarts.delete(chatKey)
      this.userPendingOrder.delete(chatKey)
      reply = `🗑️ Keranjang dikosongkan.\nKetik *menu* untuk melihat produk.`
    } else if (lower.startsWith('hapus ') || lower.startsWith('delete ') || lower.startsWith('remove ')) {
      const matchHapus = trimmed.match(/^(?:hapus|delete|remove)\s+(\d+)$/i)
      if (matchHapus) {
        const idx = parseInt(matchHapus[1], 10) - 1
        let cart = this.userCarts.get(chatKey) || []
        if (idx >= 0 && idx < cart.length) {
          const removed = cart.splice(idx, 1)[0]
          this.userCarts.set(chatKey, cart)
          reply =
            `✅ *${removed.name}* dihapus.\n\n` +
            this.formatCartMessage(cart, effectiveStore)
        } else {
          reply = `⚠️ Nomor item tidak ditemukan.\n\n` + this.formatCartMessage(cart, effectiveStore)
        }
      } else {
        reply = `Format: *hapus [nomor]* (contoh: *hapus 1*)`
      }
    } else if (lower.startsWith('ubah ') || lower.startsWith('edit ') || lower.startsWith('update ')) {
      const matchUbah = trimmed.match(/^(?:ubah|edit|update)\s+(\d+)\s+(\d+)$/i)
      if (matchUbah) {
        const idx = parseInt(matchUbah[1], 10) - 1
        const newQty = parseInt(matchUbah[2], 10)
        let cart = this.userCarts.get(chatKey) || []

        if (idx >= 0 && idx < cart.length) {
          if (newQty <= 0) {
            const removed = cart.splice(idx, 1)[0]
            this.userCarts.set(chatKey, cart)
            reply =
              `✅ *${removed.name}* dihapus.\n\n` +
              this.formatCartMessage(cart, effectiveStore)
          } else {
            cart[idx].qty = newQty
            cart[idx].subtotal = newQty * cart[idx].price
            this.userCarts.set(chatKey, cart)
            reply =
              `✅ *${cart[idx].name}* diubah ke ${newQty} pcs.\n\n` +
              this.formatCartMessage(cart, effectiveStore)
          }
        } else {
          reply = `⚠️ Nomor item tidak ditemukan.\n\n` + this.formatCartMessage(cart, effectiveStore)
        }
      } else {
        reply = `Format: *ubah [nomor] [jumlah]* (contoh: *ubah 1 3*)`
      }
    } else if (lower === 'bayar' || lower === '!bayar' || lower === 'checkout' || lower === '!checkout') {
      const cart = this.userCarts.get(chatKey) || []
      if (cart.length === 0) {
        reply = `🛒 *Keranjang Kosong*\nKetik *menu* untuk memilih produk.`
      } else if (userUid) {
        const orderUid = `ORD-${Date.now().toString(36).toUpperCase()}`
        const totalPrice = cart.reduce((acc, it) => acc + it.subtotal, 0)
        const orderItemsJson = JSON.stringify(cart)

        // 1. Save order into order_history table (initial customerName: 'Pelanggan' pending name confirmation)
        try {
          await db.insert(orderHistory).values({
            orderUid,
            userUid,
            phoneJid: phoneJid || null,
            lidJid: lidJid || null,
            customerName: 'Pelanggan',
            orderItems: orderItemsJson,
            totalPrice,
            paymentMethod: 'transfer',
            paymentStatus: 'pending',
            orderStatus: 'menunggu disetujui',
          })

          orderEventEmitter.notifyOrderChange({
            userUid,
            orderUid,
            type: 'created',
          })
        } catch (dbOrderErr) {
          console.error('[SessionManager] Error saving to order_history:', dbOrderErr)
        }

        // 2. Fetch owner bank accounts and QRIS
        let accounts: any[] = []
        try {
          accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.uid, userUid))
        } catch (bankErr) {
          console.error('[SessionManager] Error querying bankAccounts:', bankErr)
        }

        const bankList = accounts.filter((a) => a.isQris === 0)
        const qrisAccount = accounts.find((a) => a.isQris === 1 && a.qrisUrl)

        const cartLines = cart
          .map((item, idx) => `${idx + 1}. ${item.name} (${item.qty}x) - ${formatRupiah(item.subtotal)}`)
          .join('\n')

        let paymentSection = ''
        if (bankList.length > 0) {
          paymentSection += `\n🏧 *Transfer Bank:*\n`
          bankList.forEach((b) => {
            paymentSection += `• *${b.bankName}*: ${b.accountNumber} (a.n ${b.accountHolder})\n`
          })
        }

        if (qrisAccount) {
          paymentSection += `\n📱 *QRIS:* Scan kode QRIS terlampir.\n`
        }

        if (!paymentSection) {
          paymentSection = `\nSilakan hubungi admin untuk metode pembayaran.\n`
        }

        const billMessage =
          `🧾 *Tagihan Pesanan*\n` +
          `*${effectiveStore}*\n` +
          `No. Pesanan: *#${orderUid}*\n\n` +
          `${cartLines}\n\n` +
          `*Total:* *${formatRupiah(totalPrice)}*\n` +
          `${paymentSection}\n` +
          `Kirim bukti transfer & nama Anda ke chat ini.`

        // Empty customer cart
        this.userCarts.delete(chatKey)

        // Check if QRIS image exists to send as photo message
        let qrisBuffer: Buffer | null = null
        if (qrisAccount?.qrisUrl) {
          qrisBuffer = this.getProductImageBuffer(qrisAccount.qrisUrl)
        }

        if (qrisBuffer) {
          try {
            await sock.sendMessage(remoteJid, {
              image: qrisBuffer,
              caption: billMessage,
            })
            await db.insert(chatMessages).values({
              sessionId,
              sender: sock.user?.id || 'me',
              recipient: remoteJid,
              messageText: `[QRIS] ${billMessage}`,
              isFromMe: true,
            })
            return
          } catch (qrisErr) {
            console.error('[SessionManager] Failed to send QRIS photo:', qrisErr)
            reply = billMessage
          }
        } else {
          reply = billMessage
        }
      }
    } else if (lower.startsWith('nama#') || lower.startsWith('!nama#')) {
      const parts = trimmed.split('#')
      const custName = parts.slice(1).join('#').trim()

      if (userUid && custName) {
        try {
          const jidConditions = []
          if (phoneJid) jidConditions.push(eq(orderHistory.phoneJid, phoneJid))
          if (lidJid) jidConditions.push(eq(orderHistory.lidJid, lidJid))
          if (jidConditions.length === 0) {
            jidConditions.push(eq(orderHistory.lidJid, remoteJid), eq(orderHistory.phoneJid, remoteJid))
          }

          const latest = await db
            .select()
            .from(orderHistory)
            .where(and(eq(orderHistory.userUid, userUid), or(...jidConditions)!))
            .orderBy(desc(orderHistory.id))
            .limit(1)

          if (latest.length > 0) {
            await db
              .update(orderHistory)
              .set({ customerName: custName })
              .where(eq(orderHistory.id, latest[0].id))

            reply =
              `✅ *Nama disimpan: ${custName}*\n` +
              `No. Pesanan: *#${latest[0].orderUid}*\n` +
              `Pesanan sedang diverifikasi.`
          } else {
            reply = `👤 *Nama:* ${custName}\nKetik *menu* untuk mulai memesan.`
          }
        } catch (err) {
          console.error('[SessionManager] Error saving customer name:', err)
          reply = `✅ Nama diterima: ${custName}`
        }
      } else {
        reply = `Format: *NAMA#Nama Lengkap Anda*`
      }
    } else if (lower.startsWith('alamat#') || lower.startsWith('!alamat#')) {
      const parts = trimmed.split('#')
      const address = parts.slice(1).join('#').trim()

      if (userUid && address) {
        try {
          const jidConditions = []
          if (phoneJid) jidConditions.push(eq(orderHistory.phoneJid, phoneJid))
          if (lidJid) jidConditions.push(eq(orderHistory.lidJid, lidJid))
          if (jidConditions.length === 0) {
            jidConditions.push(eq(orderHistory.lidJid, remoteJid), eq(orderHistory.phoneJid, remoteJid))
          }

          const latest = await db
            .select()
            .from(orderHistory)
            .where(and(eq(orderHistory.userUid, userUid), or(...jidConditions)!))
            .orderBy(desc(orderHistory.id))
            .limit(1)

          if (latest.length > 0) {
            await db
              .update(orderHistory)
              .set({ shippingAddress: address })
              .where(eq(orderHistory.id, latest[0].id))

            reply =
              `✅ *Alamat disimpan: ${address}*\n` +
              `No. Pesanan: *#${latest[0].orderUid}*`
          } else {
            reply = `📍 *Alamat:* ${address}\nKetik *menu* untuk mulai memesan.`
          }
        } catch (err) {
          console.error('[SessionManager] Error saving shipping address:', err)
          reply = `✅ Alamat diterima: ${address}`
        }
      } else {
        reply = `Format: *ALAMAT#Alamat Lengkap Anda*`
      }
    } else if (
      lower === 'help' ||
      lower === '!help' ||
      lower === 'bantuan' ||
      lower === 'halo' ||
      lower === 'hai'
    ) {
      reply =
        `👋 *${effectiveStore}*\n\n` +
        `• Ketik *menu* untuk melihat produk\n` +
        `• Ketik *99* untuk keranjang\n` +
        `• Ketik *88* untuk riwayat pesanan`
    } else if (lower === 'info' || lower === '!info') {
      reply =
        `ℹ️ *Informasi Layanan*\n` +
        `- Toko: ${effectiveStore}\n` +
        `- Sesi WhatsApp: ${sessionId}\n` +
        `- Status: Aktif (Multi-User Engine)`
    } else if (lower.startsWith('beli#')) {
      const parts = incomingText.split('#')
      if (parts.length >= 4) {
        const item = parts[1]?.trim()
        const qty = parts[2]?.trim()
        const address = parts.slice(3).join('#').trim()
        const qtyNum = parseInt(qty, 10) || 1
        const orderUid = `ORD-${Date.now().toString(36).toUpperCase()}`
        const custName = 'Pelanggan'

        if (userUid) {
          try {
            await db.insert(orderHistory).values({
              orderUid,
              userUid,
              phoneJid: phoneJid || null,
              lidJid: lidJid || null,
              customerName: custName,
              orderItems: JSON.stringify([{ name: item, qty: qtyNum, price: 0, subtotal: 0 }]),
              totalPrice: 0,
              paymentMethod: 'transfer',
              paymentStatus: 'pending',
              orderStatus: 'menunggu disetujui',
              shippingAddress: address,
            })

            orderEventEmitter.notifyOrderChange({
              userUid,
              orderUid,
              type: 'created',
            })
          } catch (dbErr) {
            console.error('[SessionManager] Error saving direct beli# order:', dbErr)
          }
        }

        reply =
          `✅ *Pesanan Berhasil Dicatat!*\n` +
          `No. Pesanan: *#${orderUid}*\n\n` +
          `📦 *Barang:* ${item}\n` +
          `🔢 *Jumlah:* ${qty}\n` +
          `📍 *Alamat:* ${address}\n\n` +
          `Terima kasih! Admin *${effectiveStore}* akan segera memverifikasi pesanan Anda.`
      } else {
        reply = `⚠️ Format belum lengkap. Gunakan format:\n*BELI#NamaBarang#Jumlah#Alamat*`
      }
    } else {
      // Check if user is asking for:
      // A. "order [nomor]" -> start ordering prompt for quantity
      // B. "detail [nomor]" -> view product details with photo
      // C. category selection by number or category name
      const orderMatch = trimmed.match(/^(?:!|\/|#)?order(?:\s+(.+))?$/i)
      const detailMatch = trimmed.match(/^(?:!|\/|#)?detail(?:\s+(.+))?$/i)

      if (orderMatch) {
        const orderParam = orderMatch[1]?.trim()
        if (!orderParam) {
          reply = `🛒 Ketik *order 1* untuk memesan produk nomor 1 dari daftar kategori.`
        } else if (userUid) {
          let targetProduct: any = null
          const itemNum = parseInt(orderParam, 10)

          if (!isNaN(itemNum) && itemNum > 0) {
            let activeCategory = this.userActiveCategory.get(chatKey) || null
            if (activeCategory) {
              const catProds = await db
                .select()
                .from(katalogProduk)
                .where(
                  and(
                    eq(katalogProduk.userUid, userUid),
                    eq(katalogProduk.category, activeCategory),
                    eq(katalogProduk.active, true)
                  )
                )
              if (itemNum <= catProds.length) {
                targetProduct = catProds[itemNum - 1]
              }
            }

            if (!targetProduct) {
              const allProds = await db
                .select()
                .from(katalogProduk)
                .where(and(eq(katalogProduk.userUid, userUid), eq(katalogProduk.active, true)))
              if (itemNum <= allProds.length) {
                targetProduct = allProds[itemNum - 1]
              }
            }
          } else {
            const allProds = await db
              .select()
              .from(katalogProduk)
              .where(and(eq(katalogProduk.userUid, userUid), eq(katalogProduk.active, true)))
            targetProduct = allProds.find((p) => p.name.toLowerCase().includes(orderParam.toLowerCase()))
          }

          if (targetProduct) {
            this.userPendingOrder.set(chatKey, {
              productId: targetProduct.id,
              sku: targetProduct.sku,
              name: targetProduct.name,
              price: targetProduct.price,
              maxStock: targetProduct.stock,
            })

            reply =
              `📦 *${targetProduct.name}* (${formatRupiah(targetProduct.price)})\n` +
              `Berapa jumlah yang ingin dipesan? (contoh: *1* atau *2*)`
          } else {
            reply = `⚠️ Produk "${orderParam}" tidak ditemukan. Ketik *menu* untuk melihat produk.`
          }
        }
      } else if (detailMatch) {
        const detailParam = detailMatch[1]?.trim()

        if (!detailParam) {
          reply = `Ketik *detail 1* untuk melihat detail produk nomor 1.`
        } else if (userUid) {
          let targetProduct: any = null
          const itemNum = parseInt(detailParam, 10)

          if (!isNaN(itemNum) && itemNum > 0) {
            let activeCategory = this.userActiveCategory.get(chatKey) || null
            if (activeCategory) {
              const catProds = await db
                .select()
                .from(katalogProduk)
                .where(
                  and(
                    eq(katalogProduk.userUid, userUid),
                    eq(katalogProduk.category, activeCategory),
                    eq(katalogProduk.active, true)
                  )
                )
              if (itemNum <= catProds.length) {
                targetProduct = catProds[itemNum - 1]
              }
            }

            if (!targetProduct) {
              const allProds = await db
                .select()
                .from(katalogProduk)
                .where(and(eq(katalogProduk.userUid, userUid), eq(katalogProduk.active, true)))
              if (itemNum <= allProds.length) {
                targetProduct = allProds[itemNum - 1]
              }
            }
          } else {
            const allProds = await db
              .select()
              .from(katalogProduk)
              .where(and(eq(katalogProduk.userUid, userUid), eq(katalogProduk.active, true)))
            targetProduct = allProds.find((p) => p.name.toLowerCase().includes(detailParam.toLowerCase()))
          }

          if (targetProduct) {
            const detailCaption =
              `*${targetProduct.name}*\n` +
              `💰 ${formatRupiah(targetProduct.price)} | Stok: ${targetProduct.stock}\n\n` +
              (targetProduct.description?.trim() ? `${targetProduct.description.trim()}\n\n` : '') +
              `• Ketik *order ${itemNum || 1}* untuk pesan\n` +
              `• Ketik *menu* untuk kembali`

            const imageBuf = this.getProductImageBuffer(targetProduct.imageUrl)

            if (imageBuf) {
              try {
                await sock.sendMessage(remoteJid, {
                  image: imageBuf,
                  caption: detailCaption,
                })
                await db.insert(chatMessages).values({
                  sessionId,
                  sender: sock.user?.id || 'me',
                  recipient: remoteJid,
                  messageText: `[Foto] ${detailCaption}`,
                  isFromMe: true,
                })
                return
              } catch (imgErr) {
                console.error('[SessionManager] Failed to send product image via WA:', imgErr)
                reply = detailCaption
              }
            } else {
              reply = detailCaption
            }
          } else {
            reply = `⚠️ Produk tidak ditemukan. Ketik *menu* untuk melihat produk.`
          }
        }
      } else if (userUid) {
        // Check if user is typing a category number or category name to view products
        const catList = await this.getAvailableCategories(userUid)
        let matchedCategory: string | null = null

        const num = parseInt(trimmed, 10)
        if (!isNaN(num) && num >= 1 && num <= catList.length && String(num) === trimmed) {
          matchedCategory = catList[num - 1]
        } else {
          const found = catList.find((c) => c.toLowerCase() === lower)
          if (found) {
            matchedCategory = found
          }
        }

        if (matchedCategory) {
          this.userActiveCategory.set(chatKey, matchedCategory)

          const prods = await db
            .select()
            .from(katalogProduk)
            .where(
              and(
                eq(katalogProduk.userUid, userUid),
                eq(katalogProduk.category, matchedCategory),
                eq(katalogProduk.active, true)
              )
            )

          if (prods.length === 0) {
            reply =
              `📦 *${matchedCategory}*\n\n` +
              `Belum ada produk.\n` +
              `Ketik *menu* untuk kembali.`
          } else {
            const prodLines = prods
              .map((p, idx) => `${idx + 1}. *${p.name}* - ${formatRupiah(p.price || 0)}`)
              .join('\n')

            reply =
              `📦 *${matchedCategory}*\n\n` +
              `${prodLines}\n\n` +
              `• Ketik *order [no]* untuk beli (contoh: *order 1*)\n` +
              `• Ketik *detail [no]* untuk info (contoh: *detail 1*)\n` +
              `• Ketik *menu* untuk kembali`
          }
        }
      }
    }

    if (reply) {
      try {
        await sock.sendMessage(remoteJid, { text: reply })
        // Save bot outgoing reply to database via Drizzle ORM
        await db.insert(chatMessages).values({
          sessionId,
          sender: sock.user?.id || 'me',
          recipient: remoteJid,
          messageText: reply,
          isFromMe: true,
        })
      } catch (err) {
        console.error(`[SessionManager] Failed to send bot reply:`, err)
      }
    }
  }

  /**
   * Send WhatsApp message manually via API
   */
  public async sendMessage(sessionId: string, to: string, text: string): Promise<boolean> {
    const sock = this.sockets.get(sessionId)
    if (!sock) {
      throw new Error(`Session ${sessionId} is not active or connected.`)
    }

    // Format destination jid
    let jid = to.trim()
    if (jid.endsWith('@lid') || jid.endsWith('@s.whatsapp.net')) {
      // Valid WhatsApp JID as-is
    } else {
      let formattedTo = jid.replace(/[^0-9]/g, '')
      if (formattedTo.startsWith('0')) {
        formattedTo = '62' + formattedTo.slice(1)
      }
      jid = formattedTo.includes('@s.whatsapp.net') ? formattedTo : `${formattedTo}@s.whatsapp.net`
    }

    await sock.sendMessage(jid, { text })

    // Save outgoing message to DB via Drizzle ORM
    await db.insert(chatMessages).values({
      sessionId,
      sender: sock.user?.id || 'me',
      recipient: jid,
      messageText: text,
      isFromMe: true,
    })

    this.emit(`session:${sessionId}`, {
      type: 'message',
      message: {
        sessionId,
        sender: sock.user?.id || 'me',
        recipient: jid,
        text,
        isFromMe: true,
        timestamp: new Date(),
      },
    })

    return true
  }

  /**
   * Get active socket for a session
   */
  public getSocket(sessionId: string): WASocket | undefined {
    return this.sockets.get(sessionId)
  }

  /**
   * Check if a session has an active connected socket
   */
  public isSessionConnected(sessionId: string): boolean {
    const sock = this.sockets.get(sessionId)
    const session = this.sessionData.get(sessionId)
    return Boolean(sock && session?.status === 'connected')
  }

  /**
   * Get all products currently in WhatsApp Business catalog (with timeout)
   */
  public async getWhatsAppCatalog(sessionId: string): Promise<any[]> {
    const sock = this.sockets.get(sessionId)
    if (!sock) return []
    try {
      const catalogPromise = sock.getCatalog({ limit: 100 })
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('getCatalog timeout after 15000ms')), 15000)
      )
      const res = (await Promise.race([catalogPromise, timeoutPromise])) as any
      return res?.products || []
    } catch (err: any) {
      console.warn(`[SessionManager] getWhatsAppCatalog notice:`, err?.message || err)
      return []
    }
  }

  /**
   * Sync a product to WhatsApp Business catalog via Baileys
   */
  public async syncProductToWhatsApp(
    sessionId: string,
    product: {
      id: number
      name: string
      sku: string
      price: number
      description?: string | null
      imageUrl?: string | null
      waProductId?: string | null
    }
  ): Promise<string | null> {
    const logDebug = (msg: string) => {
      try {
        fs.appendFileSync('/tmp/wa-sync.log', `[${new Date().toISOString()}] ${msg}\n`)
      } catch {}
    }

    logDebug(`syncProductToWhatsApp called for "${product.name}" (id: ${product.id}, sku: ${product.sku}, waProductId: ${product.waProductId})`)

    const sock = this.sockets.get(sessionId)
    if (!sock) {
      logDebug(`Cannot sync product: socket for ${sessionId} is not available.`)
      console.warn(`[SessionManager] Cannot sync product: socket for ${sessionId} is not available.`)
      return null
    }

    try {
      // Find image file to upload
      const images: any[] = []
      let imageBuffer: Buffer | null = null

      if (product.imageUrl) {
        const cleanPath = product.imageUrl.startsWith('/') ? product.imageUrl.slice(1) : product.imageUrl
        const candidatePaths = [
          path.resolve(process.cwd(), cleanPath),
          path.resolve(process.cwd(), 'server', cleanPath),
          path.resolve(process.cwd(), 'web/public', cleanPath),
          path.resolve(process.cwd(), '..', cleanPath),
        ]
        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            imageBuffer = fs.readFileSync(p)
            break
          }
        }
      }

      // Fallback to default media image if none uploaded
      if (!imageBuffer) {
        const fallbackCandidates = [
          path.resolve(process.cwd(), 'media/profile/default-profile.jpeg'),
          path.resolve(process.cwd(), 'server/media/profile/default-profile.jpeg'),
          path.resolve(process.cwd(), 'public/media/profile/default-profile.jpeg'),
          path.resolve(process.cwd(), 'web/public/media/profile/default-profile.jpeg'),
        ]
        for (const fb of fallbackCandidates) {
          if (fs.existsSync(fb)) {
            imageBuffer = fs.readFileSync(fb)
            break
          }
        }
      }

      if (imageBuffer) {
        images.push(imageBuffer)
      }

      const waPrice = Math.round(product.price * 1000)

      // If waProductId already exists, attempt to update
      if (product.waProductId) {
        try {
          console.log(`[SessionManager] Updating WA catalog item ${product.waProductId} for session ${sessionId}...`)
          const updated = await sock.productUpdate(product.waProductId, {
            name: product.name,
            retailerId: product.sku || String(product.id),
            description: product.description || product.name,
            price: waPrice,
            currency: 'IDR',
            images,
          })
          return updated?.id || product.waProductId
        } catch (updateErr: any) {
          console.warn(`[SessionManager] productUpdate notice:`, updateErr?.message || updateErr)
        }
      }

      // Create new product in WA Business catalog
      console.log(`[SessionManager] Creating WA catalog item "${product.name}" for session ${sessionId}...`)
      let createdId: string | null = null
      try {
        const createPayload: any = {
          name: product.name,
          retailerId: product.sku || String(product.id),
          description: product.description || product.name,
          price: waPrice,
          currency: 'IDR',
          images,
        }
        const created = await sock.productCreate(createPayload)
        fs.appendFileSync('/tmp/wa-sync.log', `[${new Date().toISOString()}] sock.productCreate returned: ${JSON.stringify(created)}\n`)
        createdId = created?.id || null
      } catch (createErr: any) {
        fs.appendFileSync('/tmp/wa-sync.log', `[${new Date().toISOString()}] sock.productCreate caught error: ${createErr?.stack || createErr?.message || createErr}\n`)
        console.warn(`[SessionManager] productCreate notice:`, createErr?.message || createErr)
      }

      // Fallback: If not returned directly, verify in catalog
      if (!createdId) {
        try {
          fs.appendFileSync('/tmp/wa-sync.log', `[${new Date().toISOString()}] Checking WA catalog fallback...\n`)
          console.log(`[SessionManager] Checking WA catalog for "${product.name}"...`)
          const catalog = await this.getWhatsAppCatalog(sessionId)
          fs.appendFileSync('/tmp/wa-sync.log', `[${new Date().toISOString()}] Catalog has ${catalog?.length} items\n`)
          const match = catalog?.find((p: any) =>
            (p.retailerId && p.retailerId === (product.sku || String(product.id))) ||
            p.name === product.name
          )
          if (match?.id) {
            createdId = match.id
            fs.appendFileSync('/tmp/wa-sync.log', `[${new Date().toISOString()}] Found match in catalog: ${match.id}\n`)
            console.log(`[SessionManager] Verified created product in WA catalog: ${match.name} (id: ${match.id})`)
          }
        } catch (catErr: any) {
          fs.appendFileSync('/tmp/wa-sync.log', `[${new Date().toISOString()}] Catalog lookup error: ${catErr?.message || catErr}\n`)
        }
      }

      fs.appendFileSync('/tmp/wa-sync.log', `[${new Date().toISOString()}] Final createdId: ${createdId}\n`)
      return createdId || null
    } catch (err: any) {
      fs.appendFileSync('/tmp/wa-sync.log', `[${new Date().toISOString()}] syncProductToWhatsApp top-level error: ${err?.stack || err?.message || err}\n`)
      console.error(`[SessionManager] Error syncing product "${product.name}" to WhatsApp:`, err)
      return null
    }
  }

  /**
   * Delete a product from WhatsApp Business catalog via Baileys
   */
  public async deleteProductFromWhatsApp(sessionId: string, waProductId: string): Promise<boolean> {
    const sock = this.sockets.get(sessionId)
    if (!sock) return false

    try {
      console.log(`[SessionManager] Deleting WA product ${waProductId} for session ${sessionId}...`)
      await sock.productDelete([waProductId])
      return true
    } catch (err: any) {
      console.error(`[SessionManager] Error deleting product ${waProductId} from WhatsApp:`, err)
      return false
    }
  }

  /**
   * Disconnect and remove session entirely
   */
  public async deleteSession(sessionId: string): Promise<void> {
    if (this.reconnectTimeouts.has(sessionId)) {
      clearTimeout(this.reconnectTimeouts.get(sessionId))
      this.reconnectTimeouts.delete(sessionId)
    }

    const sock = this.sockets.get(sessionId)
    if (sock) {
      try {
        await sock.logout()
      } catch (e) {
        sock.end(undefined)
      }
      this.sockets.delete(sessionId)
    }

    this.sessionData.delete(sessionId)

    // Remove from database via Drizzle ORM
    await db.delete(waSessions).where(eq(waSessions.sessionId, sessionId))
    await db.delete(waAccounts).where(eq(waAccounts.sessionId, sessionId))
    await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId))

    this.emit(`session:${sessionId}`, { type: 'deleted' })
  }

  /**
   * Auto-restore active sessions on server boot
   */
  public async restoreActiveSessions(): Promise<void> {
    try {
      const accounts = await db
        .select({
          sessionId: waAccounts.sessionId,
          userName: waAccounts.userName,
          status: waAccounts.status,
        })
        .from(waAccounts)
        .where(inArray(waAccounts.status, ['connected', 'connecting', 'qr_ready']))

      console.log(`[SessionManager] Found ${accounts.length} session(s) to restore on boot.`)
      for (const account of accounts) {
        this.startSession(account.sessionId, account.userName).catch((err) => {
          console.error(`[SessionManager] Error restoring session ${account.sessionId}:`, err)
        })
      }
    } catch (err) {
      console.error(`[SessionManager] Failed to restore sessions:`, err)
    }
  }
}

export const sessionManager = new SessionManager()
