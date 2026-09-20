import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import sharp from 'sharp'
import { authMiddleware, type UserPayload } from './auth/auth.js'
import { dbPool } from './db/database.js'

const MAX_QRIS_SIZE = 5 * 1024 * 1024
const QRIS_DIRECTORY = path.resolve(process.cwd(), 'media/qris')
const QRIS_URL_PREFIX = '/media/qris/'
const IMAGE_FORMATS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
}

interface AccountOwner extends RowDataPacket {
  uid: string | null
}

interface QrisAccount extends RowDataPacket {
  id: number
  qrisUrl: string | null
}

interface BankAccountFields {
  bankName: string
  accountNumber: string
  accountHolder: string
}

interface BankAccount extends BankAccountFields, RowDataPacket {
  id: number
}

function validateBankAccount(body: unknown): { data: BankAccountFields; error?: never } | { data?: never; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Data rekening tidak valid.' }
  }
  const fields = body as Record<string, unknown>
  if (typeof fields.bankName !== 'string' || typeof fields.accountNumber !== 'string' || typeof fields.accountHolder !== 'string') {
    return { error: 'Lengkapi nama bank, nomor rekening, dan atas nama.' }
  }
  const bankName = fields.bankName.trim()
  const accountNumber = fields.accountNumber.trim()
  const accountHolder = fields.accountHolder.trim()
  if (!bankName || !accountNumber || !accountHolder) {
    return { error: 'Lengkapi nama bank, nomor rekening, dan atas nama.' }
  }
  if (bankName.length > 100 || accountNumber.length > 50 || accountHolder.length > 100) {
    return { error: 'Data rekening melebihi batas panjang yang diizinkan.' }
  }
  if (!/^\d+$/.test(accountNumber)) {
    return { error: 'Nomor rekening hanya boleh berisi angka.' }
  }
  return { data: { bankName, accountNumber, accountHolder } }
}

function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function parseBankAccountId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null
}

async function removeQrisFile(url: string | null): Promise<void> {
  // Only filenames generated here can be removed, never arbitrary stored paths.
  if (!url?.startsWith(QRIS_URL_PREFIX)) return
  const filename = url.slice(QRIS_URL_PREFIX.length)
  if (!/^[0-9a-f-]{36}\.png$/.test(filename)) return
  try {
    await unlink(path.join(QRIS_DIRECTORY, filename))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[Account Settings] Failed to remove QRIS image:', error)
    }
  }
}

export const accountSettingsRouter = new Hono<{ Variables: { user: UserPayload; accountUid: string } }>()

accountSettingsRouter.use('*', authMiddleware)

accountSettingsRouter.use('*', async (c, next) => {
  try {
    // Resolve ownership from the authenticated ID, including tokens without a UID.
    const [owners] = await dbPool.execute<AccountOwner[]>(
      'SELECT uid FROM users WHERE id = ? LIMIT 1',
      [c.get('user').id],
    )
    if (!owners.length) {
      return c.json({ success: false, error: 'Akun tidak ditemukan.' }, 404)
    }
    const uid = owners[0].uid
    if (typeof uid !== 'string' || !uid.trim()) {
      return c.json({ success: false, error: 'UID akun tidak tersedia.' }, 500)
    }
    c.set('accountUid', uid)
  } catch (error) {
    console.error('[Account Settings] Failed to resolve account owner:', error)
    return c.json({ success: false, error: 'Data akun gagal dimuat.' }, 500)
  }
  await next()
})

accountSettingsRouter.get('/', async (c) => {
  try {
    const accountUid = c.get('accountUid')
    const [[rows], [bankAccounts]] = await Promise.all([
      dbPool.execute<QrisAccount[]>(
        'SELECT id, qris_url AS qrisUrl FROM bank_accounts WHERE uid = ? AND is_qris = 1',
        [accountUid],
      ),
      dbPool.execute<BankAccount[]>(
        `SELECT id, bank_name AS bankName, account_number AS accountNumber,
                account_holder AS accountHolder
         FROM bank_accounts WHERE uid = ? AND is_qris = 0 ORDER BY id ASC`,
        [accountUid],
      ),
    ])
    return c.json({ success: true, data: { bankAccounts, qrisUrl: rows[0]?.qrisUrl ?? null } })
  } catch (error) {
    console.error('[Account Settings] Failed to load settings:', error)
    return c.json({ success: false, error: 'Rekening gagal dimuat.' }, 500)
  }
})

const bankAccountBodyLimit = bodyLimit({
  maxSize: 16 * 1024,
  onError: (c) => c.json({ success: false, error: 'Data rekening terlalu besar.' }, 413),
})

accountSettingsRouter.post('/bank-accounts', bankAccountBodyLimit, async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: 'Data rekening tidak valid.' }, 400)
  }
  const result = validateBankAccount(body)
  if (result.error !== undefined) return c.json({ success: false, error: result.error }, 400)
  const { bankName, accountNumber, accountHolder } = result.data
  try {
    const [inserted] = await dbPool.execute<ResultSetHeader>(
      'INSERT INTO bank_accounts (uid, is_qris, bank_name, account_number, account_holder) VALUES (?, 0, ?, ?, ?)',
      [c.get('accountUid'), bankName, accountNumber, accountHolder],
    )
    return c.json({ success: true, data: { id: inserted.insertId, bankName, accountNumber, accountHolder } }, 201)
  } catch (error) {
    if (hasDatabaseErrorCode(error, 'ER_DUP_ENTRY')) {
      return c.json({ success: false, error: 'Rekening dengan bank dan nomor yang sama sudah tersimpan.' }, 409)
    }
    if (hasDatabaseErrorCode(error, 'ER_NO_REFERENCED_ROW_2')) {
      return c.json({ success: false, error: 'Akun tidak ditemukan.' }, 404)
    }
    console.error('[Account Settings] Failed to add bank account:', error)
    return c.json({ success: false, error: 'Rekening gagal ditambahkan.' }, 500)
  }
})

accountSettingsRouter.put('/bank-accounts/:id', bankAccountBodyLimit, async (c) => {
  const id = parseBankAccountId(c.req.param('id'))
  if (id === null) return c.json({ success: false, error: 'Rekening tidak ditemukan.' }, 404)
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: 'Data rekening tidak valid.' }, 400)
  }
  const result = validateBankAccount(body)
  if (result.error !== undefined) return c.json({ success: false, error: result.error }, 400)
  const { bankName, accountNumber, accountHolder } = result.data
  const accountUid = c.get('accountUid')
  try {
    const [updated] = await dbPool.execute<ResultSetHeader>(
      `UPDATE bank_accounts SET bank_name = ?, account_number = ?, account_holder = ?
       WHERE id = ? AND uid = ? AND is_qris = 0`,
      [bankName, accountNumber, accountHolder, id, accountUid],
    )
    if (updated.affectedRows === 0) {
      // Some database configurations report zero for an unchanged record.
      const [existing] = await dbPool.execute<RowDataPacket[]>(
        'SELECT id FROM bank_accounts WHERE id = ? AND uid = ? AND is_qris = 0',
        [id, accountUid],
      )
      if (!existing.length) return c.json({ success: false, error: 'Rekening tidak ditemukan.' }, 404)
    }
    return c.json({ success: true, data: { id, bankName, accountNumber, accountHolder } })
  } catch (error) {
    if (hasDatabaseErrorCode(error, 'ER_DUP_ENTRY')) {
      return c.json({ success: false, error: 'Rekening dengan bank dan nomor yang sama sudah tersimpan.' }, 409)
    }
    console.error('[Account Settings] Failed to update bank account:', error)
    return c.json({ success: false, error: 'Rekening gagal diperbarui.' }, 500)
  }
})

accountSettingsRouter.delete('/bank-accounts/:id', async (c) => {
  const id = parseBankAccountId(c.req.param('id'))
  if (id === null) return c.json({ success: false, error: 'Rekening tidak ditemukan.' }, 404)
  try {
    const [deleted] = await dbPool.execute<ResultSetHeader>(
      'DELETE FROM bank_accounts WHERE id = ? AND uid = ? AND is_qris = 0',
      [id, c.get('accountUid')],
    )
    if (!deleted.affectedRows) return c.json({ success: false, error: 'Rekening tidak ditemukan.' }, 404)
    return c.json({ success: true })
  } catch (error) {
    console.error('[Account Settings] Failed to delete bank account:', error)
    return c.json({ success: false, error: 'Rekening gagal dihapus.' }, 500)
  }
})

accountSettingsRouter.put(
  '/',
  bodyLimit({
    maxSize: MAX_QRIS_SIZE + 64 * 1024,
    onError: (c) => c.json({ success: false, error: 'Ukuran foto QRIS maksimal 5 MB.' }, 413),
  }),
  async (c) => {
    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      return c.json({ success: false, error: 'Data QRIS tidak valid.' }, 400)
    }

    // Preserve duplicate fields so a crafted request cannot submit multiple photos.
    const files = Array.from(form.entries()).filter(([, value]) => typeof value !== 'string')
    const qrisEntries = form.getAll('qris')
    if (files.length > 1 || qrisEntries.length > 1) {
      return c.json({ success: false, error: 'Hanya satu foto QRIS yang dapat diunggah.' }, 400)
    }
    if (files.some(([key]) => key !== 'qris') || typeof qrisEntries[0] === 'string') {
      return c.json({ success: false, error: 'File foto QRIS tidak valid.' }, 400)
    }

    const removeEntries = form.getAll('removeQris')
    if (removeEntries.length > 1 || removeEntries.some((value) => typeof value !== 'string')) {
      return c.json({ success: false, error: 'Data QRIS tidak valid.' }, 400)
    }

    const removeQris = form.get('removeQris') === 'true'
    const file = qrisEntries[0]

    if (removeQris && file) {
      return c.json({ success: false, error: 'Pilih unggah atau hapus foto QRIS.' }, 400)
    }
    if (!removeQris && !file) {
      return c.json({ success: false, error: 'Pilih foto QRIS terlebih dahulu.' }, 400)
    }

    let image: Buffer | null = null
    if (file && typeof file !== 'string') {
      if (file.size === 0 || file.size > MAX_QRIS_SIZE) {
        return c.json({ success: false, error: 'Ukuran foto QRIS harus antara 1 byte dan 5 MB.' }, 400)
      }
      const expectedFormat = IMAGE_FORMATS[file.type]
      if (!expectedFormat) {
        return c.json({ success: false, error: 'Foto QRIS harus berformat PNG, JPG, atau WebP.' }, 400)
      }
      try {
        const source = sharp(Buffer.from(await file.arrayBuffer()), {
          failOn: 'warning',
          limitInputPixels: 40_000_000,
        })
        const metadata = await source.metadata()
        if (metadata.format !== expectedFormat || (metadata.pages ?? 1) !== 1) {
          return c.json({ success: false, error: 'Unggah satu foto QRIS PNG, JPG, atau WebP yang valid.' }, 400)
        }
        // Decode and re-encode to verify image content and strip uploaded metadata.
        image = await source.rotate().png().toBuffer()
      } catch {
        return c.json({ success: false, error: 'Foto QRIS tidak valid atau tidak dapat dibaca.' }, 400)
      }
    }

    const connection = await dbPool.getConnection().catch((error: unknown) => {
      console.error('[Account Settings] Failed to connect to database:', error)
      return null
    })
    if (!connection) {
      return c.json({ success: false, error: 'QRIS gagal disimpan.' }, 500)
    }

    let newQrisUrl: string | null = null
    let oldQrisUrl: string | null = null
    let committed = false
    let commitAttempted = false
    const accountUid = c.get('accountUid')
    try {
      await connection.beginTransaction()
      // Lock the owner even on first save, serializing concurrent replacements.
      const [owners] = await connection.execute<AccountOwner[]>(
        'SELECT uid FROM users WHERE id = ? FOR UPDATE',
        [c.get('user').id],
      )
      if (!owners.length) {
        await connection.rollback()
        return c.json({ success: false, error: 'Akun tidak ditemukan.' }, 404)
      }
      if (owners[0].uid !== accountUid) {
        await connection.rollback()
        return c.json({ success: false, error: 'Data akun berubah. Muat ulang lalu coba lagi.' }, 409)
      }
      const [current] = await connection.execute<QrisAccount[]>(
        'SELECT id, qris_url AS qrisUrl FROM bank_accounts WHERE uid = ? AND is_qris = 1 FOR UPDATE',
        [accountUid],
      )
      const currentQris = current[0]
      oldQrisUrl = currentQris?.qrisUrl ?? null
      let qrisUrl = removeQris ? null : oldQrisUrl

      if (image) {
        const filename = `${randomUUID()}.png`
        newQrisUrl = `${QRIS_URL_PREFIX}${filename}`
        await mkdir(QRIS_DIRECTORY, { recursive: true })
        await writeFile(path.join(QRIS_DIRECTORY, filename), image, { flag: 'wx' })
        qrisUrl = newQrisUrl
      }

      if (removeQris) {
        if (currentQris) {
          await connection.execute(
            'DELETE FROM bank_accounts WHERE id = ? AND uid = ? AND is_qris = 1',
            [currentQris.id, accountUid],
          )
        }
      } else if (newQrisUrl) {
        if (currentQris) {
          await connection.execute(
            `UPDATE bank_accounts SET qris_url = ?, bank_name = NULL,
               account_number = NULL, account_holder = NULL
             WHERE id = ? AND uid = ? AND is_qris = 1`,
            [newQrisUrl, currentQris.id, accountUid],
          )
        } else {
          await connection.execute(
            `INSERT INTO bank_accounts (uid, is_qris, bank_name, account_number, account_holder, qris_url)
             VALUES (?, 1, NULL, NULL, NULL, ?)`,
            [accountUid, newQrisUrl],
          )
        }
      }
      commitAttempted = true
      await connection.commit()
      committed = true
      if (oldQrisUrl !== qrisUrl) await removeQrisFile(oldQrisUrl)

      return c.json({ success: true, data: { qrisUrl } })
    } catch (error) {
      await connection.rollback().catch(() => {})
      console.error('[Account Settings] Failed to save settings:', error)
      return c.json({ success: false, error: 'QRIS gagal disimpan.' }, 500)
    } finally {
      connection.release()
      // If COMMIT lost its response, retain the file in case the write succeeded.
      if (!committed && !commitAttempted) await removeQrisFile(newQrisUrl)
    }
  },
)
