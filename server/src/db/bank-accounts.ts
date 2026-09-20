import type { Connection, RowDataPacket } from 'mysql2/promise'

const ACCOUNT_TYPE_CHECK = `
  (is_qris = 0 AND bank_name IS NOT NULL AND account_number IS NOT NULL
    AND account_holder IS NOT NULL AND qris_url IS NULL)
  OR (is_qris = 1 AND bank_name IS NULL AND account_number IS NULL
    AND account_holder IS NULL AND qris_url IS NOT NULL AND qris_url <> '')
`

export const BANK_ACCOUNTS_CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS bank_accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uid VARCHAR(64) NOT NULL,
    is_qris TINYINT NOT NULL DEFAULT 0,
    bank_name VARCHAR(100) NULL,
    account_number VARCHAR(50) NULL,
    account_holder VARCHAR(100) NULL,
    qris_url VARCHAR(255) NULL,
    qris_slot TINYINT GENERATED ALWAYS AS (CASE WHEN is_qris = 1 THEN 1 ELSE NULL END) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bank_accounts_owner_bank_number (uid, bank_name, account_number),
    UNIQUE KEY uq_bank_accounts_owner_qris (uid, qris_slot),
    CONSTRAINT fk_bank_accounts_uid FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
    CONSTRAINT ck_bank_accounts_type CHECK (${ACCOUNT_TYPE_CHECK})
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`

interface LegacyAccount extends RowDataPacket {
  userId: number
  bankName: string
  accountNumber: string
  accountHolder: string
  qrisUrl: string | null
  bankAccountsMigrated: number
}

const quoteIdentifier = (value: string) => '`' + value.replace(/`/g, '``') + '`'

async function migrateAccountUid(
  connection: Connection,
  columnMap: Map<string, RowDataPacket>,
  uidDefinition: string,
): Promise<void> {
  if (!columnMap.has('user_id')) return

  if (!columnMap.has('uid')) {
    await connection.query(`ALTER TABLE bank_accounts ADD COLUMN uid ${uidDefinition} NULL AFTER user_id`)
  }
  const [foreignKeys] = await connection.query<RowDataPacket[]>(`
    SELECT DISTINCT CONSTRAINT_NAME AS name
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_accounts'
      AND COLUMN_NAME IN ('user_id', 'uid') AND REFERENCED_TABLE_NAME IS NOT NULL
  `)
  const [indexes] = await connection.query<RowDataPacket[]>(`
    SELECT INDEX_NAME AS name, COLUMN_NAME AS columnName, SEQ_IN_INDEX AS position
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_accounts'
    ORDER BY INDEX_NAME, SEQ_IN_INDEX
  `)
  const ownerIndexes = ['uq_bank_accounts_owner_bank_number', 'uq_bank_accounts_owner_qris']
  const changes = foreignKeys.map((key) => `DROP FOREIGN KEY ${quoteIdentifier(key.name)}`)
  for (const name of ownerIndexes) {
    if (indexes.some((index) => index.name === name)) changes.push(`DROP INDEX ${quoteIdentifier(name)}`)
  }
  changes.push(
    `MODIFY COLUMN uid ${uidDefinition} NOT NULL`,
    'ADD UNIQUE INDEX uq_bank_accounts_owner_bank_number (uid, bank_name, account_number)',
    'ADD UNIQUE INDEX uq_bank_accounts_owner_qris (uid, qris_slot)',
    'ADD CONSTRAINT fk_bank_accounts_uid FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE',
    'DROP COLUMN user_id',
  )

  await connection.query('SET SESSION autocommit = 0')
  let tablesLocked = false
  try {
    await connection.query('LOCK TABLES bank_accounts WRITE, users READ')
    tablesLocked = true
    const [accounts] = await connection.query<RowDataPacket[]>(`
      SELECT bank_accounts.id, bank_accounts.user_id AS userId, bank_accounts.uid AS existingUid,
        users.uid AS ownerUid
      FROM bank_accounts LEFT JOIN users ON users.id = bank_accounts.user_id
    `)
    for (const account of accounts) {
      if (typeof account.ownerUid !== 'string' || !account.ownerUid.trim()
        || (account.existingUid !== null && account.existingUid !== account.ownerUid)) {
        throw new Error('Account UID mapping is missing or conflicting; user_id was retained.')
      }
      await connection.execute(
        'UPDATE bank_accounts SET uid = ?, updated_at = updated_at WHERE id = ? AND user_id = ?',
        [account.ownerUid, account.id, account.userId],
      )
    }
    const [verified] = await connection.query<RowDataPacket[]>(`
      SELECT bank_accounts.id, bank_accounts.uid, users.uid AS ownerUid
      FROM bank_accounts LEFT JOIN users ON users.id = bank_accounts.user_id
    `)
    if (verified.length !== accounts.length || verified.some((account) => !account.uid || account.uid !== account.ownerUid)) {
      throw new Error('Account UID mapping could not be verified; user_id was retained.')
    }
    await connection.commit()
    // Replace ownership constraints and remove the old column in one DDL change.
    await connection.query(`ALTER TABLE bank_accounts ${changes.join(', ')}`)
  } catch (error) {
    await connection.rollback().catch(() => {})
    throw error
  } finally {
    if (tablesLocked) await connection.query('UNLOCK TABLES')
  }
}

/** Prepare one table for bank accounts (0) and a single QRIS per owner (1). */
export async function ensureBankAccountsTable(connection: Connection): Promise<void> {
  const [locks] = await connection.query<RowDataPacket[]>(
    "SELECT GET_LOCK('whatsapp-order:bank-accounts-schema', 10) AS acquired",
  )
  if (locks[0]?.acquired !== 1) throw new Error('Could not acquire bank account migration lock.')

  let session: RowDataPacket | undefined
  try {
    const [sessions] = await connection.query<RowDataPacket[]>(
      'SELECT @@SESSION.autocommit AS autocommit, @@SESSION.lock_wait_timeout AS lockWaitTimeout',
    )
    session = sessions[0]
    await connection.query('SET SESSION lock_wait_timeout = 10')
    const [userUidColumns] = await connection.query<RowDataPacket[]>(`
      SELECT COLUMN_TYPE AS type, CHARACTER_SET_NAME AS charsetName, COLLATION_NAME AS collationName
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'uid'
    `)
    const userUid = userUidColumns[0]
    if (userUid?.type !== 'varchar(64)' || !/^[a-zA-Z0-9_]+$/.test(userUid.charsetName || '')
      || !/^[a-zA-Z0-9_]+$/.test(userUid.collationName || '')) {
      throw new Error('users.uid must be a VARCHAR(64) column before migrating bank accounts.')
    }
    const [uidIndexes] = await connection.query<RowDataPacket[]>(`
      SELECT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND NON_UNIQUE = 0
      GROUP BY INDEX_NAME HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = 'uid'
    `)
    if (!uidIndexes.length) throw new Error('users.uid must have a unique index before migrating bank accounts.')
    const uidDefinition = `VARCHAR(64) CHARACTER SET ${userUid.charsetName} COLLATE ${userUid.collationName}`
    await connection.query(BANK_ACCOUNTS_CREATE_SQL.replace('uid VARCHAR(64) NOT NULL', `uid ${uidDefinition} NOT NULL`))
    const [columns] = await connection.query<RowDataPacket[]>(`
      SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_accounts'
    `)
    const columnMap = new Map(columns.map((column) => [column.name, column]))
    const ownerColumn = columnMap.has('user_id') ? 'user_id' : 'uid'
    const changes: string[] = []
    if (!columnMap.has('is_qris')) changes.push(`ADD COLUMN is_qris TINYINT NOT NULL DEFAULT 0 AFTER ${ownerColumn}`)
    if (!columnMap.has('qris_url')) changes.push('ADD COLUMN qris_url VARCHAR(255) NULL AFTER account_holder')
    for (const [name, length] of [['bank_name', 100], ['account_number', 50], ['account_holder', 100]] as const) {
      if (columnMap.get(name)?.nullable === 'NO') changes.push(`MODIFY COLUMN ${name} VARCHAR(${length}) NULL`)
    }
    if (!columnMap.has('qris_slot')) {
      changes.push('ADD COLUMN qris_slot TINYINT GENERATED ALWAYS AS (CASE WHEN is_qris = 1 THEN 1 ELSE NULL END) STORED')
    }

    const [indexes] = await connection.query<RowDataPacket[]>(`
      SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_accounts'
    `)
    const indexNames = new Set(indexes.map((index) => index.name))
    if (!indexNames.has('uq_bank_accounts_owner_bank_number')) {
      changes.push(`ADD UNIQUE INDEX uq_bank_accounts_owner_bank_number (${ownerColumn}, bank_name, account_number)`)
    }
    if (!indexNames.has('uq_bank_accounts_owner_qris')) {
      changes.push(`ADD UNIQUE INDEX uq_bank_accounts_owner_qris (${ownerColumn}, qris_slot)`)
    }
    const [checks] = await connection.query<RowDataPacket[]>(`
      SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_accounts' AND CONSTRAINT_TYPE = 'CHECK'
    `)
    if (!checks.some((check) => check.name === 'ck_bank_accounts_type')) {
      changes.push(`ADD CONSTRAINT ck_bank_accounts_type CHECK (${ACCOUNT_TYPE_CHECK})`)
    }
    if (changes.length) await connection.query(`ALTER TABLE bank_accounts ${changes.join(', ')}`)
    await migrateAccountUid(connection, columnMap, uidDefinition)

    const [legacyColumns] = await connection.query<RowDataPacket[]>(`
      SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'account_settings'
    `)
    if (!legacyColumns.length) return
    const hasMigrationMarker = legacyColumns.some((column) => column.name === 'bank_accounts_migrated')

    // Explicit table locks cover the copy, verification, and DROP, including the
    // implicit DDL commit, so an old server cannot write between those steps.
    await connection.query('SET SESSION autocommit = 0')
    let tablesLocked = false
    try {
      await connection.query('LOCK TABLES bank_accounts WRITE, account_settings WRITE, users READ')
      tablesLocked = true
      const [legacyAccounts] = await connection.query<LegacyAccount[]>(`
        SELECT user_id AS userId, bank_name AS bankName, account_number AS accountNumber,
          account_holder AS accountHolder, qris_url AS qrisUrl,
          ${hasMigrationMarker ? 'bank_accounts_migrated' : '0'} AS bankAccountsMigrated
        FROM account_settings
      `)
      for (const legacy of legacyAccounts) {
        const [owners] = await connection.execute<RowDataPacket[]>('SELECT uid FROM users WHERE id = ?', [legacy.userId])
        const uid = owners[0]?.uid
        if (typeof uid !== 'string' || !uid.trim()) {
          throw new Error('Legacy owner UID is missing; account_settings was retained.')
        }
        // Already migrated legacy bank fields may describe a deleted account.
        if (!legacy.bankAccountsMigrated && (legacy.bankName || legacy.accountNumber || legacy.accountHolder)) {
          await connection.execute(`
            INSERT INTO bank_accounts (uid, is_qris, bank_name, account_number, account_holder)
            VALUES (?, 0, ?, ?, ?)
            ON DUPLICATE KEY UPDATE id = id
          `, [uid, legacy.bankName, legacy.accountNumber, legacy.accountHolder])
          const [matches] = await connection.execute<RowDataPacket[]>(`
            SELECT bank_name AS bankName, account_number AS accountNumber, account_holder AS accountHolder
            FROM bank_accounts
            WHERE uid = ? AND is_qris = 0 AND bank_name = ? AND account_number = ?
          `, [uid, legacy.bankName, legacy.accountNumber])
          if (matches.length !== 1 || matches[0]?.bankName !== legacy.bankName
            || matches[0]?.accountNumber !== legacy.accountNumber || matches[0]?.accountHolder !== legacy.accountHolder) {
            throw new Error('Legacy bank account migration could not be verified; account_settings was retained.')
          }
        }

        if (legacy.qrisUrl) {
          // Keep an existing target row intact on a retry; verify before dropping
          // legacy data so conflicting QRIS values are never silently discarded.
          await connection.execute(`
            INSERT INTO bank_accounts (uid, is_qris, qris_url)
            VALUES (?, 1, ?)
            ON DUPLICATE KEY UPDATE id = id
          `, [uid, legacy.qrisUrl])
          const [matches] = await connection.execute<RowDataPacket[]>(`
            SELECT qris_url AS qrisUrl FROM bank_accounts WHERE uid = ? AND is_qris = 1
          `, [uid])
          if (matches.length !== 1 || matches[0]?.qrisUrl !== legacy.qrisUrl) {
            throw new Error('Legacy QRIS migration could not be verified; account_settings was retained.')
          }
        }
      }
      await connection.commit()
      await connection.query('DROP TABLE account_settings')
    } catch (error) {
      await connection.rollback().catch(() => {})
      throw error
    } finally {
      if (tablesLocked) await connection.query('UNLOCK TABLES')
    }
  } finally {
    try {
      if (session) {
        await connection.query('SET SESSION autocommit = ?', [session.autocommit])
        await connection.query('SET SESSION lock_wait_timeout = ?', [session.lockWaitTimeout])
      }
    } finally {
      await connection.query("SELECT RELEASE_LOCK('whatsapp-order:bank-accounts-schema')").catch(() => {})
    }
  }
}
