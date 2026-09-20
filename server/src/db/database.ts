import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { drizzle } from 'drizzle-orm/mysql2'
import * as schema from './schema.js'
import { ensureBankAccountsTable } from './bank-accounts.js'
import { hashPassword } from '../auth/auth.js'

// Ensure .env is loaded
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export const dbPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db_chat',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
})

// Drizzle ORM client instance
export const db = drizzle({ client: dbPool, schema, mode: 'default' })

// Re-export all schema definitions and models
export * from './schema.js'

export async function initDatabase(): Promise<void> {
  const connection = await dbPool.getConnection()
  try {
    // 1. users table: Stores user accounts for authentication
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uid VARCHAR(64) UNIQUE NULL,
        name VARCHAR(100) NOT NULL,
        store_name VARCHAR(150) NULL DEFAULT 'Toko Saya',
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(30) NULL,
        password VARCHAR(255) NOT NULL,
        refresh_token TEXT NULL,
        profile_url VARCHAR(255) DEFAULT '/media/profile/default-profile.jpeg',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // Ensure phone column exists in users table
    const [phoneCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone'
    `, [process.env.DB_NAME || 'db_chat'])

    if (phoneCols && phoneCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL AFTER email
      `)
      console.log('[Database] Added phone column to users table.')
    }

    // Ensure store_name column exists in users table
    const [storeCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'store_name'
    `, [process.env.DB_NAME || 'db_chat'])

    if (storeCols && storeCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE users ADD COLUMN store_name VARCHAR(150) NULL DEFAULT 'Toko Saya' AFTER name
      `)
    }

    // Set default store_name for existing users if empty
    await connection.query(`
      UPDATE users SET store_name = 'Toko Saya' WHERE store_name IS NULL OR store_name = ''
    `)

    // Ensure uid column exists in users table
    const [uidCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'uid'
    `, [process.env.DB_NAME || 'db_chat'])

    if (uidCols && uidCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE users ADD COLUMN uid VARCHAR(64) NULL UNIQUE AFTER id
      `)
    }

    // Populate unique uid for existing users if empty
    const [usersWithoutUid] = await connection.query<any[]>(`
      SELECT id FROM users WHERE uid IS NULL OR uid = ''
    `)
    for (const u of usersWithoutUid) {
      const generatedUid = randomUUID()
      await connection.query(`UPDATE users SET uid = ? WHERE id = ?`, [generatedUid, u.id])
    }

    // Ensure refresh_token column exists in users table if table was created previously
    const [userCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'refresh_token'
    `, [process.env.DB_NAME || 'db_chat'])

    if (userCols && userCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE users ADD COLUMN refresh_token TEXT NULL AFTER password
      `)
    }

    // Ensure profile_url column exists in users table
    const [profileCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_url'
    `, [process.env.DB_NAME || 'db_chat'])

    if (profileCols && profileCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE users ADD COLUMN profile_url VARCHAR(255) DEFAULT '/media/profile/default-profile.jpeg' AFTER refresh_token
      `)
    }

    // Set default profile URL for any existing users
    await connection.query(`
      UPDATE users SET profile_url = '/media/profile/default-profile.jpeg' WHERE profile_url IS NULL OR profile_url = ''
    `)

    // Ensure role column exists in users table
    const [roleCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'
    `, [process.env.DB_NAME || 'db_chat'])

    if (roleCols && roleCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' NOT NULL AFTER password
      `)
    }

    // Set default role for existing users if empty
    await connection.query(`
      UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''
    `)

    // 1.5. user_stores table: Stores stores registered by users and subject to admin approval
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_stores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        store_useruid VARCHAR(64) NOT NULL,
        name VARCHAR(150) NOT NULL,
        location VARCHAR(255) NULL,
        description TEXT NULL,
        status VARCHAR(50) DEFAULT 'pending' NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_stores_useruid (store_useruid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // Ensure telegram_bot_token, telegram_bot_username, telegram_active exist in user_stores
    const [tgCols] = await connection.query<any[]>(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_stores' AND COLUMN_NAME IN ('telegram_bot_token', 'telegram_bot_username', 'telegram_active')
    `, [process.env.DB_NAME || 'db_chat'])

    const existingTgCols = new Set((tgCols || []).map((c: any) => c.COLUMN_NAME))

    if (!existingTgCols.has('telegram_bot_token')) {
      await connection.query(`ALTER TABLE user_stores ADD COLUMN telegram_bot_token VARCHAR(255) NULL AFTER status`)
    }
    if (!existingTgCols.has('telegram_bot_username')) {
      await connection.query(`ALTER TABLE user_stores ADD COLUMN telegram_bot_username VARCHAR(100) NULL AFTER telegram_bot_token`)
    }
    if (!existingTgCols.has('telegram_active')) {
      await connection.query(`ALTER TABLE user_stores ADD COLUMN telegram_active TINYINT(1) DEFAULT 0 AFTER telegram_bot_username`)
    }

    // 2. wa_accounts table: Stores metadata for each user session (1 user = 1 wa session)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS wa_accounts (
        session_id VARCHAR(100) PRIMARY KEY,
        user_id INT NULL UNIQUE,
        user_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(50) NULL,
        status ENUM('disconnected', 'connecting', 'qr_ready', 'connected') DEFAULT 'disconnected',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // Ensure user_id column exists if table was previously created
    const [cols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'wa_accounts' AND COLUMN_NAME = 'user_id'
    `, [process.env.DB_NAME || 'db_chat'])

    if (cols && cols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE wa_accounts ADD COLUMN user_id INT NULL UNIQUE AFTER session_id
      `)
    }

    // 3. wa_sessions table: Stores Baileys authentication keys and credentials
    await connection.query(`
      CREATE TABLE IF NOT EXISTS wa_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        data_key VARCHAR(255) NOT NULL,
        data_val LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_session_data_key (session_id, data_key),
        INDEX idx_session_id (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // 4. chat_messages table: Stores incoming & outgoing messages log
    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        sender VARCHAR(100) NOT NULL,
        recipient VARCHAR(100) NOT NULL,
        message_text TEXT NOT NULL,
        is_from_me BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_msg (session_id, timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // 5. katalog_produk table: Stores product catalog items owned by user (user_uid = uid pemilik)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS katalog_produk (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_uid VARCHAR(64) NOT NULL,
        sku VARCHAR(50) NOT NULL,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(100) DEFAULT 'Umum' NOT NULL,
        modal INT DEFAULT 0 NOT NULL,
        price INT DEFAULT 0 NOT NULL,
        stock INT DEFAULT 0 NOT NULL,
        active BOOLEAN DEFAULT TRUE NOT NULL,
        image_url VARCHAR(255) NULL,
        wa_product_id VARCHAR(100) NULL,
        description TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_katalog_user_uid (user_uid),
        INDEX idx_katalog_wa_product_id (wa_product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // Ensure modal column exists in katalog_produk
    const [modalCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'katalog_produk' AND COLUMN_NAME = 'modal'
    `, [process.env.DB_NAME || 'db_chat'])

    if (modalCols && modalCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE katalog_produk ADD COLUMN modal INT DEFAULT 0 NOT NULL AFTER category
      `)
      console.log('[Database] Added modal column to katalog_produk.')
    }

    // Ensure wa_product_id column exists if table was previously created
    const [waProdCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'katalog_produk' AND COLUMN_NAME = 'wa_product_id'
    `, [process.env.DB_NAME || 'db_chat'])

    if (waProdCols && waProdCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE katalog_produk ADD COLUMN wa_product_id VARCHAR(100) NULL AFTER image_url
      `)
    }

    // Ensure user_uid column exists
    const [userUidCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'katalog_produk' AND COLUMN_NAME = 'user_uid'
    `, [process.env.DB_NAME || 'db_chat'])

    if (userUidCols && userUidCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE katalog_produk ADD COLUMN user_uid VARCHAR(64) NULL AFTER id
      `)
      await connection.query(`
        ALTER TABLE katalog_produk ADD INDEX idx_katalog_user_uid (user_uid)
      `)
    }

    // Ensure store_id column exists in katalog_produk
    const [storeIdCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'katalog_produk' AND COLUMN_NAME = 'store_id'
    `, [process.env.DB_NAME || 'db_chat'])

    if (storeIdCols && storeIdCols[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE katalog_produk ADD COLUMN store_id INT NULL AFTER id
      `)
      await connection.query(`
        ALTER TABLE katalog_produk ADD INDEX idx_katalog_store_id (store_id)
      `)
    }

    // Check if legacy produk_uid column exists and drop it
    const [prodUidCols] = await connection.query<any[]>(`
      SELECT COUNT(*) as cnt 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'katalog_produk' AND COLUMN_NAME = 'produk_uid'
    `, [process.env.DB_NAME || 'db_chat'])

    if (prodUidCols && prodUidCols[0]?.cnt > 0) {
      // Sync any missing user_uid values from produk_uid
      await connection.query(`
        UPDATE katalog_produk SET user_uid = produk_uid WHERE (user_uid IS NULL OR user_uid = '') AND produk_uid IS NOT NULL
      `)
      // Drop index idx_katalog_produk_uid if exists
      const [idxRows] = await connection.query<any[]>(`
        SELECT COUNT(*) as cnt 
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'katalog_produk' AND INDEX_NAME = 'idx_katalog_produk_uid'
      `, [process.env.DB_NAME || 'db_chat'])
      if (idxRows && idxRows[0]?.cnt > 0) {
        await connection.query(`ALTER TABLE katalog_produk DROP INDEX idx_katalog_produk_uid`)
      }
      // Drop produk_uid column
      await connection.query(`ALTER TABLE katalog_produk DROP COLUMN produk_uid`)
      console.log('[Database] Dropped legacy produk_uid column from katalog_produk.')
    }


    // 6. categories table: Stores product categories owned by users
    await connection.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uid VARCHAR(64) NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_categories_uid (uid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    await ensureBankAccountsTable(connection)

    // 7. order_history table: Stores orders placed by WhatsApp customers
    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_uid VARCHAR(64) NOT NULL UNIQUE,
        user_uid VARCHAR(64) NOT NULL,
        phone_jid VARCHAR(100) NULL,
        lid_jid VARCHAR(100) NULL,
        customer_name VARCHAR(100) DEFAULT 'Pelanggan' NOT NULL,
        order_items TEXT NOT NULL,
        total_price INT DEFAULT 0 NOT NULL,
        payment_method VARCHAR(50) DEFAULT 'transfer' NOT NULL,
        payment_status VARCHAR(50) DEFAULT 'pending' NOT NULL,
        order_status VARCHAR(50) DEFAULT 'menunggu disetujui' NOT NULL,
        payment_proof_url VARCHAR(255) NULL,
        shipping_address TEXT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_history_user_uid (user_uid),
        INDEX idx_order_history_phone_jid (phone_jid),
        INDEX idx_order_history_lid_jid (lid_jid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    // Migration for order_history: ensure phone_jid & lid_jid exist and remove customer_phone
    const currentDbName = process.env.DB_NAME || 'db_chat'
    const [existingCols] = await connection.query<any[]>(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'order_history'
    `, [currentDbName])
    const colNames = (existingCols || []).map((c: any) => c.COLUMN_NAME)

    if (!colNames.includes('phone_jid')) {
      await connection.query(`ALTER TABLE order_history ADD COLUMN phone_jid VARCHAR(100) NULL AFTER user_uid`)
    }
    if (!colNames.includes('lid_jid')) {
      await connection.query(`ALTER TABLE order_history ADD COLUMN lid_jid VARCHAR(100) NULL AFTER phone_jid`)
    }

    if (colNames.includes('customer_phone')) {
      // Migrate existing customer_phone data before dropping column
      // 1. If customer_phone looks like LID (14-16 digits, not starting with standard 62 or 08), map to lid_jid
      await connection.query(`
        UPDATE order_history 
        SET lid_jid = CASE 
          WHEN customer_phone LIKE '%@lid' THEN customer_phone 
          ELSE CONCAT(customer_phone, '@lid') 
        END 
        WHERE (lid_jid IS NULL OR lid_jid = '') AND customer_phone IS NOT NULL AND customer_phone != ''
      `)

      // 2. Cross-match with wa_sessions to backfill phone_jid from LID mapping
      try {
        await connection.query(`
          UPDATE order_history oh 
          JOIN wa_sessions ws ON ws.data_key = CONCAT('lid-mapping-', REPLACE(REPLACE(oh.lid_jid, '@lid', ''), '@s.whatsapp.net', ''), '_reverse')
          SET oh.phone_jid = CONCAT(REPLACE(ws.data_val, '"', ''), '@s.whatsapp.net')
          WHERE (oh.phone_jid IS NULL OR oh.phone_jid = '') AND oh.lid_jid IS NOT NULL
        `)
      } catch (wsErr) {
        console.warn('[Database] Warning mapping wa_sessions LID to PN:', wsErr)
      }

      // 3. Drop index if exists
      try {
        await connection.query(`ALTER TABLE order_history DROP INDEX idx_order_history_cust_phone`)
      } catch {}

      // 4. Drop customer_phone column
      await connection.query(`ALTER TABLE order_history DROP COLUMN customer_phone`)
      console.log('[Database] Kolom customer_phone berhasil dihapus dan dimigrasi ke phone_jid & lid_jid')
    }

    // Ensure indexes exist for phone_jid and lid_jid
    const [existingIndexes] = await connection.query<any[]>(`
      SHOW INDEX FROM order_history WHERE Key_name IN ('idx_order_history_phone_jid', 'idx_order_history_lid_jid')
    `)
    const indexNames = (existingIndexes || []).map((idx: any) => idx.Key_name)
    if (!indexNames.includes('idx_order_history_phone_jid')) {
      try {
        await connection.query(`ALTER TABLE order_history ADD INDEX idx_order_history_phone_jid (phone_jid)`)
      } catch {}
    }
    if (!indexNames.includes('idx_order_history_lid_jid')) {
      try {
        await connection.query(`ALTER TABLE order_history ADD INDEX idx_order_history_lid_jid (lid_jid)`)
      } catch {}
    }

    // Ensure payment_proof_url column exists in order_history
    if (!colNames.includes('payment_proof_url')) {
      await connection.query(`
        ALTER TABLE order_history ADD COLUMN payment_proof_url VARCHAR(255) NULL AFTER order_status
      `)
    }

    // 8. Seed default admin user if no admin exists
    const [adminCheck] = await connection.query<any[]>(`
      SELECT id FROM users WHERE role = 'admin' OR username = 'admin' LIMIT 1
    `)
    if (adminCheck && adminCheck.length === 0) {
      const adminUid = randomUUID()
      const hashedAdminPass = hashPassword('admin123')
      await connection.query(`
        INSERT INTO users (uid, name, store_name, username, email, password, role)
        VALUES (?, 'Administrator', 'Admin System', 'admin', 'admin@reuang.com', ?, 'admin')
      `, [adminUid, hashedAdminPass])
      console.log('[Database] Default admin user initialized: admin / admin123')
    }

    // 9. Auto-migrate user_stores for existing users and link existing products
    const [allUsers] = await connection.query<any[]>(`
      SELECT id, uid, store_name FROM users WHERE uid IS NOT NULL AND role = 'user'
    `)
    for (const u of allUsers) {
      const [existingStore] = await connection.query<any[]>(`
        SELECT id FROM user_stores WHERE store_useruid = ?
      `, [u.uid])

      let storeId: number
      if (existingStore.length === 0) {
        const storeName = u.store_name && u.store_name.trim() ? u.store_name.trim() : 'Toko Saya'
        const [insertRes] = await connection.query<any>(`
          INSERT INTO user_stores (store_useruid, name, location, status)
          VALUES (?, ?, 'Indonesia', 'approved')
        `, [u.uid, storeName])
        storeId = insertRes.insertId
      } else {
        storeId = existingStore[0].id
      }

      // Link any unassigned products of this user to this store_id
      await connection.query(`
        UPDATE katalog_produk SET store_id = ? WHERE (store_id IS NULL OR store_id = 0) AND user_uid = ?
      `, [storeId, u.uid])
    }

    console.log('[Database] Tables (users, user_stores, wa_accounts, wa_sessions, chat_messages, katalog_produk, categories, bank_accounts, order_history) initialized.')
  } catch (error) {
    console.error('[Database] Failed to initialize database tables:', error)
    throw error
  } finally {
    connection.release()
  }
}
