import express from "express"
import dotenv from "dotenv"
import { createComponentLogger } from "./utils/logger.js"
import { testConnection, closePool } from "./utils/database.js"
import { WebInterface } from "./web/index.js"
import cookieParser from 'cookie-parser'
dotenv.config()

const logger = createComponentLogger("RENDER_MAIN")
const PORT = process.env.PORT || 3000
const app = express()
const ALLOW_GRACEFUL_SHUTDOWN = process.env.ALLOW_GRACEFUL_SHUTDOWN !== 'false'

// Platform components
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
    service: "render-pairing",
    components: {
      database: true,
      webInterface: !!webInterface
    }
  }
  res.json(health)
})

app.get("/api/status", async (req, res) => {
  res.json({
    platform: "WhatsApp Web Pairing Service (RENDER)",
    status: isInitialized ? "operational" : "initializing",
    service: "pairing-only",
    note: "Message processing handled by Pterodactyl service"
  })
})

// Initialize platform
async function initializePlatform() {
  if (isInitialized) {
    logger.warn("Platform already initialized, skipping...")
    return
  }

  logger.info("Starting WhatsApp Web Pairing Service (RENDER)...")
  
  try {
    // 1. Database
    logger.info("Connecting to database...")
    await testConnection()

    // 2. HTTP Server
    server = app.listen(PORT, () => {
      logger.info(`RENDER Pairing Service running on port ${PORT}`)
      logger.info("Service: Web pairing and connection establishment only")
      logger.info(`Web interface: http://localhost:${PORT}`)
      logger.info(`Health check: http://localhost:${PORT}/health`)
    })

    isInitialized = true
    logger.info("RENDER service initialization completed successfully")

  } catch (error) {
    logger.error("RENDER service initialization failed:", error)
    process.exit(1)
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  if (!ALLOW_GRACEFUL_SHUTDOWN) {
    logger.warn(`Received ${signal}, but graceful shutdown is disabled. Ignoring...`)
    return
  }
  
  logger.info(`Received ${signal}, shutting down gracefully...`)
  
  try {
    if (server) {
      server.close()
      logger.info("HTTP server closed")
    }

    logger.info("Closing database connections...")
    await closePool()
    
    logger.info("RENDER service shutdown completed")
    process.exit(0)
  } catch (error) {
    logger.error("Shutdown error:", error)
    process.exit(1)
  }
}

if (ALLOW_GRACEFUL_SHUTDOWN) {
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
} else {
  process.on('SIGINT', (signal) => {
    logger.warn(`Received ${signal} but shutdown is disabled. Use SIGKILL to force stop.`)
  })
  process.on('SIGTERM', (signal) => {
    logger.warn(`Received ${signal} but shutdown is disabled. Use SIGKILL to force stop.`)
  })
}

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error)
  if (ALLOW_GRACEFUL_SHUTDOWN) {
    gracefulShutdown('uncaughtException')
  }
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

// Start platform
initializePlatform().catch((error) => {
  logger.error("Failed to start RENDER service:", error)
  process.exit(1)
})