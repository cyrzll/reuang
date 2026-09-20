import {
  mysqlTable,
  int,
  tinyint,
  varchar,
  text,
  timestamp,
  boolean,
  mysqlEnum,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/mysql-core'
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm'

/**
 * Users Table
 * Stores application user accounts for authentication
 */
export const users = mysqlTable(
  'users',
  {
    id: int('id').autoincrement().primaryKey(),
    uid: varchar('uid', { length: 64 }).unique(),
    name: varchar('name', { length: 100 }).notNull(),
    storeName: varchar('store_name', { length: 150 }).default('Toko Saya'),
    username: varchar('username', { length: 50 }).notNull().unique(),
    email: varchar('email', { length: 100 }).notNull().unique(),
    phone: varchar('phone', { length: 30 }),
    password: varchar('password', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).default('user').notNull(),
    refreshToken: text('refresh_token'),
    profileUrl: varchar('profile_url', { length: 255 })
      .default('/media/profile/default-profile.jpeg')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  }
)

export type User = InferSelectModel<typeof users>
export type NewUser = InferInsertModel<typeof users>

/**
 * User Stores Table
 * Stores physical/online stores registered by users and subject to admin approval
 */
export const userStores = mysqlTable(
  'user_stores',
  {
    id: int('id').autoincrement().primaryKey(),
    storeUseruid: varchar('store_useruid', { length: 64 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    location: varchar('location', { length: 255 }),
    description: text('description'),
    status: varchar('status', { length: 50 }).default('pending').notNull(), // 'pending' | 'approved' | 'rejected'
    telegramBotToken: varchar('telegram_bot_token', { length: 255 }),
    telegramBotUsername: varchar('telegram_bot_username', { length: 100 }),
    telegramActive: boolean('telegram_active').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('idx_user_stores_useruid').on(table.storeUseruid),
  ]
)

export type UserStore = InferSelectModel<typeof userStores>
export type NewUserStore = InferInsertModel<typeof userStores>

export const bankAccounts = mysqlTable('bank_accounts', {
  id: int('id').autoincrement().primaryKey(),
  uid: varchar('uid', { length: 64 }).notNull().references(() => users.uid, { onDelete: 'cascade' }),
  isQris: tinyint('is_qris').notNull().default(0),
  bankName: varchar('bank_name', { length: 100 }),
  accountNumber: varchar('account_number', { length: 50 }),
  accountHolder: varchar('account_holder', { length: 100 }),
  qrisUrl: varchar('qris_url', { length: 255 }),
  qrisSlot: tinyint('qris_slot').generatedAlwaysAs(
    sql`CASE WHEN is_qris = 1 THEN 1 ELSE NULL END`,
    { mode: 'stored' },
  ),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex('uq_bank_accounts_owner_bank_number').on(table.uid, table.bankName, table.accountNumber),
  uniqueIndex('uq_bank_accounts_owner_qris').on(table.uid, table.qrisSlot),
  check('ck_bank_accounts_type', sql`
    (${table.isQris} = 0 AND ${table.bankName} IS NOT NULL AND ${table.accountNumber} IS NOT NULL
      AND ${table.accountHolder} IS NOT NULL AND ${table.qrisUrl} IS NULL)
    OR (${table.isQris} = 1 AND ${table.bankName} IS NULL AND ${table.accountNumber} IS NULL
      AND ${table.accountHolder} IS NULL AND ${table.qrisUrl} IS NOT NULL AND ${table.qrisUrl} <> '')
  `),
])

export type BankAccount = InferSelectModel<typeof bankAccounts>
export type NewBankAccount = InferInsertModel<typeof bankAccounts>

/**
 * WhatsApp Accounts Table
 * Maps 1 user to their dedicated WhatsApp bot session
 */
export const waAccounts = mysqlTable(
  'wa_accounts',
  {
    sessionId: varchar('session_id', { length: 100 }).primaryKey(),
    userId: int('user_id').unique(),
    userName: varchar('user_name', { length: 100 }).notNull(),
    phoneNumber: varchar('phone_number', { length: 50 }),
    status: mysqlEnum('status', ['disconnected', 'connecting', 'qr_ready', 'connected'])
      .default('disconnected')
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  }
)

export type WaAccount = InferSelectModel<typeof waAccounts>
export type NewWaAccount = InferInsertModel<typeof waAccounts>

/**
 * WhatsApp Sessions Table
 * Stores Baileys multi-device auth credentials and key-value state
 */
export const waSessions = mysqlTable(
  'wa_sessions',
  {
    id: int('id').autoincrement().primaryKey(),
    sessionId: varchar('session_id', { length: 100 }).notNull(),
    dataKey: varchar('data_key', { length: 255 }).notNull(),
    dataVal: text('data_val').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_session_data_key').on(table.sessionId, table.dataKey),
    index('idx_session_id').on(table.sessionId),
  ]
)

export type WaSession = InferSelectModel<typeof waSessions>
export type NewWaSession = InferInsertModel<typeof waSessions>

/**
 * Chat Messages Table
 * Logs incoming and outgoing WhatsApp messages
 */
export const chatMessages = mysqlTable(
  'chat_messages',
  {
    id: int('id').autoincrement().primaryKey(),
    sessionId: varchar('session_id', { length: 100 }).notNull(),
    sender: varchar('sender', { length: 100 }).notNull(),
    recipient: varchar('recipient', { length: 100 }).notNull(),
    messageText: text('message_text').notNull(),
    isFromMe: boolean('is_from_me').default(false).notNull(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  (table) => [
    index('idx_session_msg').on(table.sessionId, table.timestamp),
  ]
)

export type ChatMessage = InferSelectModel<typeof chatMessages>
export type NewChatMessage = InferInsertModel<typeof chatMessages>

/**
 * Katalog Produk Table
 * Stores product catalog items owned by users
 * user_uid: stores owner's UID (uid pemilik)
 */
export const katalogProduk = mysqlTable(
  'katalog_produk',
  {
    id: int('id').autoincrement().primaryKey(),
    storeId: int('store_id'), // Relasi kepemilikan produk ke user_stores.id
    userUid: varchar('user_uid', { length: 64 }).notNull(), // UID Pemilik (relasi ke users.uid)
    sku: varchar('sku', { length: 50 }).notNull(),
    name: varchar('name', { length: 150 }).notNull(),
    category: varchar('category', { length: 100 }).default('Umum').notNull(),
    modal: int('modal').default(0).notNull(),
    price: int('price').default(0).notNull(),
    stock: int('stock').default(0).notNull(),
    active: boolean('active').default(true).notNull(),
    imageUrl: varchar('image_url', { length: 255 }),
    waProductId: varchar('wa_product_id', { length: 100 }),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('idx_katalog_store_id').on(table.storeId),
    index('idx_katalog_user_uid').on(table.userUid),
    index('idx_katalog_wa_product_id').on(table.waProductId),
  ]
)

export type KatalogProduk = InferSelectModel<typeof katalogProduk>
export type NewKatalogProduk = InferInsertModel<typeof katalogProduk>

/**
 * Categories Table
 * Stores product categories owned by users
 * uid: owner's UID (relasi ke users.uid)
 */
export const categories = mysqlTable(
  'categories',
  {
    id: int('id').autoincrement().primaryKey(),
    uid: varchar('uid', { length: 64 }).notNull(), // UID Pemilik
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    index('idx_categories_uid').on(table.uid),
  ]
)

export type Category = InferSelectModel<typeof categories>
export type NewCategory = InferInsertModel<typeof categories>

// Alias export for versatility
export const products = katalogProduk
export type Product = KatalogProduk
export type NewProduct = NewKatalogProduk

/**
 * Order History Table
 * Stores orders placed by customers via WhatsApp
 */
export const orderHistory = mysqlTable(
  'order_history',
  {
    id: int('id').autoincrement().primaryKey(),
    orderUid: varchar('order_uid', { length: 64 }).notNull().unique(),
    userUid: varchar('user_uid', { length: 64 }).notNull(), // relasi ke users.uid (toko)
    phoneJid: varchar('phone_jid', { length: 100 }),
    lidJid: varchar('lid_jid', { length: 100 }),
    customerName: varchar('customer_name', { length: 100 }).default('Pelanggan').notNull(),
    orderItems: text('order_items').notNull(), // JSON string: [{ id, name, price, qty, subtotal }]
    totalPrice: int('total_price').default(0).notNull(),
    paymentMethod: varchar('payment_method', { length: 50 }).default('transfer').notNull(),
    paymentStatus: varchar('payment_status', { length: 50 }).default('pending').notNull(),
    orderStatus: varchar('order_status', { length: 50 }).default('menunggu disetujui').notNull(),
    paymentProofUrl: varchar('payment_proof_url', { length: 255 }),
    shippingAddress: text('shipping_address'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_order_history_uid').on(table.orderUid),
    index('idx_order_history_user_uid').on(table.userUid),
    index('idx_order_history_phone_jid').on(table.phoneJid),
    index('idx_order_history_lid_jid').on(table.lidJid),
  ]
)

export type OrderHistory = InferSelectModel<typeof orderHistory>
export type NewOrderHistory = InferInsertModel<typeof orderHistory>

