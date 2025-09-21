import express from "express"
import dotenv from "dotenv"
import { createComponentLogger } from "./utils/logger.js"
import { testConnection, closePool, getPoolStats } from "./utils/database.js"
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
let keepAliveInterval = null
let monitoringInterval = null

// Startup time for uptime calculations
const startTime = Date.now()

// Enhanced request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  
  res.on('finish', () => {
    const duration = Date.now() - start
    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')?.substring(0, 100)
    }
    
    if (duration > 1000) {
      logger.warn('Slow request detected:', logData)
    } else {
      logger.debug('Request:', logData)
    }
  })
  
  next()
})

// Setup middleware
app.use(express.json({ limit: "30mb" }))
app.use(express.urlencoded({ extended: true, limit: "30mb" }))
app.use(express.static("public"))
app.use(cookieParser())

// Setup web interface routes
webInterface = new WebInterface()
app.use('/', webInterface.router)

// Keep-alive endpoint to prevent sleeping
app.get('/keep-alive', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000)
  const memUsage = process.memoryUsage()
  
  res.json({ 
    status: 'alive',
    service: 'render-pairing',
    timestamp: new Date().toISOString(),
    uptime: `${uptime}s`,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
    },
    initialized: isInitialized
  })
})

// Enhanced health endpoints
app.get("/health", async (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000)
  const memUsage = process.memoryUsage()
  const poolStats = getPoolStats()
  
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: `${uptime}s`,
    initialized: isInitialized,
    service: "render-pairing",
    version: process.env.npm_package_version || "unknown",
    node_version: process.version,
    platform: process.platform,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
      external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
    },
    components: {
      database: true,
      webInterface: !!webInterface,
      poolStats: poolStats
    },
    env: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development',
      gracefulShutdown: ALLOW_GRACEFUL_SHUTDOWN
    }
  }
  
  res.json(health)
})

app.get("/api/status", async (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000)
  
  res.json({
    platform: "WhatsApp Web Pairing Service (RENDER)",
    status: isInitialized ? "operational" : "initializing",
    service: "pairing-only",
    uptime: `${uptime}s`,
    timestamp: new Date().toISOString(),
    note: "Message processing handled by Pterodactyl service",
    endpoints: {
      health: "/health",
      keepAlive: "/keep-alive",
      webInterface: "/"
    }
  })
})

// Monitoring endpoint for debugging
app.get("/api/debug", (req, res) => {
  const memUsage = process.memoryUsage()
  const cpuUsage = process.cpuUsage()
  
  res.json({
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
      external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
    },
    cpu: {
      user: Math.round(cpuUsage.user / 1000),
      system: Math.round(cpuUsage.system / 1000)
    },
    database: getPoolStats(),
    initialized: isInitialized,
    webInterface: !!webInterface
  })
})

// Process monitoring function
function logSystemStats() {
  const memUsage = process.memoryUsage()
  const uptime = Math.floor((Date.now() - startTime) / 1000)
  const poolStats = getPoolStats()
  
  const stats = {
    uptime: `${uptime}s`,
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB'
    },
    database: {
      total: poolStats.totalCount,
      idle: poolStats.idleCount,
      waiting: poolStats.waitingCount
    }
  }
  
  // Log warning if memory usage is high
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024
  if (heapUsedMB > 100) {
    logger.warn('High memory usage detected:', stats)
  } else {
    logger.debug('System stats:', stats)
  }
  
  // Log warning if too many database connections
  if (poolStats.totalCount > 15) {
    logger.warn('High database connection count:', poolStats)
  }
}

// Self ping to prevent sleeping (for free tier services)
async function keepAlivePing() {
  try {
    const response = await fetch(`http://localhost:${PORT}/keep-alive`)
    const data = await response.json()
    logger.debug('Keep-alive ping successful:', { uptime: data.uptime, memory: data.memory.rss })
  } catch (error) {
    logger.warn('Keep-alive ping failed:', error.message)
  }
}

// Initialize platform
async function initializePlatform() {
  if (isInitialized) {
    logger.warn("Platform already initialized, skipping...")
    return
  }
  
  logger.info("Starting WhatsApp Web Pairing Service (RENDER)...")
  logger.info(`Node.js version: ${process.version}`)
  logger.info(`Platform: ${process.platform}`)
  logger.info(`Memory limit: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB initial`)
  
  try {
    // 1. Database connection
    logger.info("Connecting to database...")
    const dbConnected = await testConnection()
    if (!dbConnected) {
      throw new Error('Database connection failed')
    }
    logger.info("Database connection established")

    // 2. Start HTTP Server
    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`RENDER Pairing Service running on port ${PORT}`)
      logger.info("Service: Web pairing and connection establishment only")
      logger.info(`Web interface: http://localhost:${PORT}`)
      logger.info(`Health check: http://localhost:${PORT}/health`)
      logger.info(`Keep-alive: http://localhost:${PORT}/keep-alive`)
      logger.info(`Debug info: http://localhost:${PORT}/api/debug`)
    })
    
    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error:', error)
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`)
        process.exit(1)
      }
    })

    // 3. Start monitoring and keep-alive
    startMonitoring()
    
    isInitialized = true
    logger.info("RENDER service initialization completed successfully")
    logger.info(`Process PID: ${process.pid}`)
    
  } catch (error) {
    logger.error("RENDER service initialization failed:", error)
    process.exit(1)
  }
}

// Start monitoring intervals
function startMonitoring() {
  // System stats monitoring (every 2 minutes)
  if (monitoringInterval) clearInterval(monitoringInterval)
  monitoringInterval = setInterval(() => {
    logSystemStats()
  }, 120000)
  
  // Keep-alive self ping (every 14 minutes to prevent sleeping)
  if (keepAliveInterval) clearInterval(keepAliveInterval)
  keepAliveInterval = setInterval(() => {
    keepAlivePing()
  }, 840000) // 14 minutes
  
  logger.info("Monitoring and keep-alive intervals started")
}

// Stop monitoring intervals
function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval)
    monitoringInterval = null
  }
  
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
  }
  
  logger.info("Monitoring intervals stopped")
}

// Graceful shutdown with enhanced logging
async function gracefulShutdown(signal) {
  if (!ALLOW_GRACEFUL_SHUTDOWN) {
    logger.warn(`Received ${signal}, but graceful shutdown is disabled. Ignoring...`)
    return
  }
  
  logger.info(`Received ${signal}, initiating graceful shutdown...`)
  const shutdownStart = Date.now()
  
  try {
    // Stop monitoring first
    stopMonitoring()
    
    // Close HTTP server
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          logger.info("HTTP server closed")
          resolve()
        })
      })
    }
    
    // Close database connections
    logger.info("Closing database connections...")
    await closePool()
    
    const shutdownDuration = Date.now() - shutdownStart
    logger.info(`RENDER service shutdown completed in ${shutdownDuration}ms`)
    process.exit(0)
    
  } catch (error) {
    logger.error("Shutdown error:", error)
    process.exit(1)
  }
}

// Enhanced process event handlers
if (ALLOW_GRACEFUL_SHUTDOWN) {
  process.on('SIGINT', () => {
    logger.info('Received SIGINT (Ctrl+C)')
    gracefulShutdown('SIGINT')
  })
  
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM (termination request)')
    gracefulShutdown('SIGTERM')
  })
} else {
  process.on('SIGINT', (signal) => {
    logger.warn(`Received ${signal} but graceful shutdown is disabled. Use SIGKILL to force stop.`)
  })
  
  process.on('SIGTERM', (signal) => {
    logger.warn(`Received ${signal} but graceful shutdown is disabled. Use SIGKILL to force stop.`)
  })
}

// Enhanced error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000)
  })
  
  if (ALLOW_GRACEFUL_SHUTDOWN) {
    setTimeout(() => {
      gracefulShutdown('uncaughtException')
    }, 1000) // Give time to log the error
  }
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', {
    reason: reason,
    promise: promise,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000)
  })
})

// Log when process is about to exit
process.on('exit', (code) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000)
  logger.info(`Process exiting with code ${code} after ${uptime}s uptime`)
})

// Start the application
logger.info("Initializing RENDER WhatsApp Pairing Service...")
initializePlatform().catch((error) => {
  logger.error("Failed to start RENDER service:", error)
  process.exit(1)
})
