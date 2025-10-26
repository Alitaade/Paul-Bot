import express from "express"
import dotenv from "dotenv"
import { createComponentLogger } from "./utils/logger.js"
import { testConnection, closePool } from "./config/database.js"
import { runMigrations } from "./database/migrations/run-migrations.js"
import { quickSetup as quickSetupTelegram } from "./telegram/index.js"
import { quickSetup as quickSetupWhatsApp } from "./whatsapp/index.js"
import { WebInterface } from "./web/index.js"
import { VIPHelper }from './whatsapp/index.js'
import pluginLoader from "./utils/plugin-loader.js"
import cookieParser from 'cookie-parser'

dotenv.config()

const logger = createComponentLogger("MAIN")
const PORT = process.env.PORT || 3000
const app = express()
const ALLOW_GRACEFUL_SHUTDOWN = process.env.ALLOW_GRACEFUL_SHUTDOWN !== 'false'

// Platform components
let telegramBot = null
let sessionManager = null
let webInterface = null
let server = null
let isInitialized = false

// Setup middleware
app.use(express.json({ limit: "30mb" }))
app.use(express.urlencoded({ extended: true, limit: "30mb" }))
app.use(express.static("public"))
app.use(cookieParser())

// Setup web interface routes
webInterface = new WebInterface()
app.use('/', webInterface.router)

// Health endpoints
app.get("/health", async (req, res) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    initialized: isInitialized,
    components: {
      database: true,
      telegram: !!telegramBot,
      sessions: sessionManager ? sessionManager.activeSockets.size : 0,
      sessionManager: !!sessionManager,
      eventHandlersEnabled: sessionManager ? sessionManager.eventHandlersEnabled : false,
      webInterface: !!webInterface
    }
  }
  res.json(health)
})

app.get("/api/status", async (req, res) => {
  const stats = {}
  
  if (sessionManager) {
    try {
      stats.sessions = await sessionManager.getStats()
    } catch (error) {
      stats.sessions = { error: 'Failed to get stats' }
    }
  }
  
  res.json({
    platform: "WhatsApp-Telegram Bot Platform",
    status: isInitialized ? "operational" : "initializing",
    ...stats,
    telegram: telegramBot ? telegramBot.getStats?.() : null
  })
})

// Initialize platform
async function initializePlatform() {
  if (isInitialized) {
    logger.warn("Platform already initialized")
    return
  }

  logger.info("Starting platform...")
  
  try {
    // 1. Database - with connection warmup
    logger.info("Connecting to database...")
    await testConnection()
    
    // Warmup MongoDB connection pool
    for (let i = 0; i < 3; i++) {
      await testConnection()
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    logger.info("Running database migrations...")
    await runMigrations()

    // 2. Plugins
    logger.info("Loading plugins...")
    await pluginLoader.loadPlugins()

    // 3. Telegram Bot - Quick Setup
    logger.info("Initializing Telegram bot...")
    telegramBot = await quickSetupTelegram()
    logger.info("Telegram bot initialized successfully")

    // 4. WhatsApp Module - Quick Setup (includes session manager)
    logger.info("Initializing WhatsApp module...")
    sessionManager = await quickSetupWhatsApp(telegramBot)

    // 5. IMPORTANT: Update telegram bot with session manager
if (telegramBot.connectionHandler) {
  telegramBot.connectionHandler.sessionManager = sessionManager
  telegramBot.connectionHandler.storage = sessionManager.storage
  logger.info("Session manager linked to Telegram bot")
}
    
    logger.info(`WhatsApp module initialized: ${sessionManager.activeSockets.size} active sessions`)

    // 5. Wait for sessions to stabilize
    logger.info("Waiting for sessions to stabilize...")

        // Initialize Default VIP from ENV
    const  vipInitialized = await VIPHelper.initializeDefaultVIP()
        if (vipInitialized) {
      console.log('✅ Default VIP initialized successfully')
    } else {
      console.warn('⚠️  Warning: Default VIP not initialized - check DEFAULT_VIP_TELEGRAM_ID in .env')
    }

    await new Promise(resolve => setTimeout(resolve, 10000))
    
    // Verify database before proceeding
    await testConnection()

    // 6. HTTP Server
    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`)
      logger.info(`Web Interface: http://localhost:${PORT}`)
      logger.info(`Health Check: http://localhost:${PORT}/health`)
      logger.info(`API Status: http://localhost:${PORT}/api/status`)
    })

    isInitialized = true
    logger.info("Platform initialization completed successfully!")

    // 7. Maintenance tasks
    setupMaintenanceTasks()
    setupConnectionMonitor()

  } catch (error) {
    logger.error("Platform initialization failed:", error)
    process.exit(1)
  }
}

// Maintenance tasks
function setupMaintenanceTasks() {
  let maintenanceRunning = false

  setInterval(async () => {
    if (maintenanceRunning) return
    
    maintenanceRunning = true
    
    try {
      if (sessionManager?.storage) {
        const initStatus = sessionManager.getInitializationStatus()
        
        // Only test connection if no sessions are initializing
        if (initStatus.initializingSessions === 0) {
          await testConnection()
        }
      }
    } catch (error) {
      logger.error("Maintenance error:", error.message)
    } finally {
      maintenanceRunning = false
    }
  }, 600000) // 10 minutes
}

// MongoDB connection monitor
function setupConnectionMonitor() {
  let consecutiveErrors = 0
  const MAX_ERRORS = 3

  setInterval(async () => {
    try {
      if (sessionManager?.storage?.isMongoConnected) {
        if (consecutiveErrors > 0) {
          logger.info("MongoDB connection recovered")
          consecutiveErrors = 0
        }
      } else {
        consecutiveErrors++
        
        if (consecutiveErrors >= MAX_ERRORS) {
          logger.error(`MongoDB disconnected (${consecutiveErrors} attempts)`)
        }
      }
    } catch (error) {
      // Silent
    }
  }, 30000) // 30 seconds
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  if (!ALLOW_GRACEFUL_SHUTDOWN) {
    logger.warn(`${signal} received but shutdown disabled`)
    return
  }
  
  logger.info(`Shutting down (${signal})...`)
  
  try {
    if (server) {
      server.close()
    }

    if (sessionManager) {
      await sessionManager.shutdown()
    }

    if (telegramBot) {
      await telegramBot.stop()
    }

    await closePool()
    
    logger.info("Shutdown completed")
    process.exit(0)
  } catch (error) {
    logger.error("Shutdown error:", error)
    process.exit(1)
  }
}

// Signal handlers
if (ALLOW_GRACEFUL_SHUTDOWN) {
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
} else {
  process.on('SIGINT', (signal) => {
    logger.warn(`${signal} ignored - use SIGKILL to force stop`)
  })
  process.on('SIGTERM', (signal) => {
    logger.warn(`${signal} ignored - use SIGKILL to force stop`)
  })
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  if (ALLOW_GRACEFUL_SHUTDOWN) {
    gracefulShutdown('uncaughtException')
  }
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason)
})

process.on('warning', (warning) => {
  if (warning.name !== 'MaxListenersExceededWarning') {
    logger.warn('Warning:', warning.message)
  }
})

// Start platform
initializePlatform().catch((error) => {
  logger.error("Failed to start:", error)
  process.exit(1)
})