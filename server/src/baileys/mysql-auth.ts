import {
  type AuthenticationCreds,
  type AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
} from '@whiskeysockets/baileys'
import { and, eq } from 'drizzle-orm'
import { db, waSessions } from '../db/database.js'

export interface MySQLAuthState {
  state: AuthenticationState
  saveCreds: () => Promise<void>
  clearAuth: () => Promise<void>
}

/**
 * Custom Baileys authentication state adapter that persists all keys and credentials
 * to the MySQL database (wa_sessions table) using Drizzle ORM.
 */
export async function useMySQLAuthState(sessionId: string): Promise<MySQLAuthState> {
  const writeData = async (data: any, key: string) => {
    try {
      const valStr = JSON.stringify(data, BufferJSON.replacer)
      await db
        .insert(waSessions)
        .values({
          sessionId,
          dataKey: key,
          dataVal: valStr,
        })
        .onDuplicateKeyUpdate({
          set: { dataVal: valStr },
        })
    } catch (error) {
      console.error(`[MySQL Auth] Error writing key "${key}" for session "${sessionId}":`, error)
    }
  }

  const readData = async (key: string) => {
    try {
      const rows = await db
        .select({ dataVal: waSessions.dataVal })
        .from(waSessions)
        .where(and(eq(waSessions.sessionId, sessionId), eq(waSessions.dataKey, key)))
        .limit(1)

      if (rows && rows.length > 0 && rows[0]?.dataVal) {
        return JSON.parse(rows[0].dataVal, BufferJSON.reviver)
      }
      return null
    } catch (error) {
      console.error(`[MySQL Auth] Error reading key "${key}" for session "${sessionId}":`, error)
      return null
    }
  }

  const removeData = async (key: string) => {
    try {
      await db
        .delete(waSessions)
        .where(and(eq(waSessions.sessionId, sessionId), eq(waSessions.dataKey, key)))
    } catch (error) {
      console.error(`[MySQL Auth] Error deleting key "${key}" for session "${sessionId}":`, error)
    }
  }

  const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [key: string]: any } = {}
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`)
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value)
              }
              data[id] = value
            })
          )
          return data
        },
        set: async (data) => {
          const tasks: Promise<void>[] = []
          const anyData = data as any
          for (const category in anyData) {
            for (const id in anyData[category]) {
              const value = anyData[category][id]
              const key = `${category}-${id}`
              tasks.push(value ? writeData(value, key) : removeData(key))
            }
          }
          await Promise.all(tasks)
        },
      },
    },
    saveCreds: async () => {
      await writeData(creds, 'creds')
    },
    clearAuth: async () => {
      try {
        await db.delete(waSessions).where(eq(waSessions.sessionId, sessionId))
      } catch (error) {
        console.error(`[MySQL Auth] Error clearing auth for session "${sessionId}":`, error)
      }
    },
  }
}
