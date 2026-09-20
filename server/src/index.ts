import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { initDatabase } from './db/database.js'
import { sessionManager } from './baileys/session-manager.js'
import { apiRouter } from './routes.js'
import { authRouter } from './auth/auth-routes.js'
import { accountSettingsRouter } from './account-settings.js'

const app = new Hono()

// CORS configuration for web frontend communication
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
)

// Serve static media files (e.g. default profile image)
app.use('/media/*', serveStatic({ root: './' }))

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    status: 'online',
    service: 'Multi-User WhatsApp Bot Server',
    database: 'MySQL (db_chat)',
    auth: 'JWT & Users Table Active',
    timestamp: new Date().toISOString(),
  })
})

// Register Authentication and WhatsApp Bot API Routes
app.route('/api/auth', authRouter)
app.route('/api/account-settings', accountSettingsRouter)
app.route('/api', apiRouter)

const port = Number(process.env.PORT) || 3000

// Initialize database schema and restore active sessions before listening
async function bootstrap() {
  try {
    console.log('[Server] Connecting to MySQL and verifying tables...')
    await initDatabase()
    console.log('[Server] Restoring previous active WhatsApp sessions...')
    await sessionManager.restoreActiveSessions()

    serve(
      {
        fetch: app.fetch,
        port,
      },
      (info) => {
        console.log(`🚀 Multi-User WhatsApp Bot Server running on http://localhost:${info.port}`)
      }
    )
  } catch (err) {
    console.error('[Server] Startup error:', err)
    process.exit(1)
  }
}

bootstrap()
