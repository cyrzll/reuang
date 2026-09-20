import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env') })

async function runMigration() {
  console.log('🚀 Memulai migrasi database...')

  // 1. Sumber: Database Lokal (db_chat)
  console.log('📦 Membaca data dari database lokal (db_chat)...')
  let localConn
  try {
    localConn = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'ahmadrizal',
      database: 'db_chat',
      multipleStatements: true,
    })
    console.log('✅ Terhubung ke database lokal.')
  } catch (err) {
    console.error('❌ Gagal terhubung ke database lokal:', err.message)
    process.exit(1)
  }

  // 2. Target: Database Remote dari .env
  const targetConfig = {
    host: process.env.DB_HOST || '141.11.190.114',
    port: Number(process.env.DB_PORT) || 50006,
    user: process.env.DB_USER || 'reuang',
    password: process.env.DB_PASSWORD || 'reuang123',
    database: process.env.DB_NAME || 'db_reuang',
    multipleStatements: true,
    connectTimeout: 10000,
  }

  console.log(`🌐 Menghubungkan ke target database (${targetConfig.host}:${targetConfig.port}/${targetConfig.database})...`)
  let targetConn
  try {
    targetConn = await mysql.createConnection(targetConfig)
    console.log('✅ Terhubung ke database target (remote).')
  } catch (err) {
    console.error('❌ Gagal terhubung ke database target (remote):', err.code, err.message)
    console.error('\n⚠️ Catatan Akses Remote:')
    console.error(`User '${targetConfig.user}' belum diberi izin akses dari host luar (remote host).`)
    console.error(`Jalankan perintah berikut pada server MySQL (${targetConfig.host}):`)
    console.error(`  CREATE USER IF NOT EXISTS '${targetConfig.user}'@'%' IDENTIFIED BY '${targetConfig.password}';`)
    console.error(`  GRANT ALL PRIVILEGES ON ${targetConfig.database}.* TO '${targetConfig.user}'@'%';`)
    console.error(`  FLUSH PRIVILEGES;`)
    await localConn.end()
    process.exit(1)
  }

  // 3. Eksekusi migrasi tabel demi tabel
  const tables = [
    'users',
    'categories',
    'bank_accounts',
    'katalog_produk',
    'order_history',
    'wa_accounts',
    'wa_sessions',
    'chat_messages',
  ]

  try {
    await targetConn.query('SET FOREIGN_KEY_CHECKS = 0;')

    for (const table of tables) {
      console.log(`\n⏳ Memproses tabel: ${table}...`)

      // Ambil DDL pembuatan tabel dari lokal
      const [createTableResult] = await localConn.query(`SHOW CREATE TABLE \`${table}\``)
      const createSql = createTableResult[0]['Create Table']

      // Buat tabel di target jika belum ada
      await targetConn.query(`DROP TABLE IF EXISTS \`${table}\``)
      await targetConn.query(createSql)

      // Ambil data dari lokal
      const [rows] = await localConn.query(`SELECT * FROM \`${table}\``)
      const dataRows = rows

      if (dataRows.length > 0) {
        // Ambil daftar kolom yang bukan GENERATED column
        const [colDefs] = await localConn.query(
          `SELECT COLUMN_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'db_chat' AND TABLE_NAME = ?`,
          [table]
        )
        const writableKeys = colDefs
          .filter((c) => !String(c.EXTRA || '').toUpperCase().includes('GENERATED'))
          .map((c) => c.COLUMN_NAME)

        const columnsStr = writableKeys.map((k) => `\`${k}\``).join(', ')

        // Insert bertahap (batch per 50 baris agar aman)
        const batchSize = 50
        for (let i = 0; i < dataRows.length; i += batchSize) {
          const chunk = dataRows.slice(i, i + batchSize)
          const values = []
          const placeholders = []

          for (const row of chunk) {
            placeholders.push(`(${writableKeys.map(() => '?').join(', ')})`)
            for (const k of writableKeys) {
              values.push(row[k])
            }
          }

          const insertQuery = `INSERT INTO \`${table}\` (${columnsStr}) VALUES ${placeholders.join(', ')}`
          await targetConn.query(insertQuery, values)
        }
        console.log(`  ✅ ${dataRows.length} baris berhasil dimigrasikan ke tabel '${table}'.`)
      } else {
        console.log(`  ℹ️ Tabel '${table}' kosong (0 baris).`)
      }
    }

    await targetConn.query('SET FOREIGN_KEY_CHECKS = 1;')
    console.log('\n🎉 SELURUH TABEL DAN DATA BERHASIL DIMIGRASIKAN KE REMOTE DATABASE!')
  } catch (migErr) {
    console.error('❌ Terjadi kesalahan saat migrasi:', migErr)
  } finally {
    await localConn.end()
    await targetConn.end()
  }
}

runMigration()
