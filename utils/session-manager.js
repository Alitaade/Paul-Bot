// Render WhatsApp Session Manager - Connection-Only with Auto-Cleanup
import { makeWASocket, DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import { baileysConfig } from "./baileys.js"
import { SessionStorage } from "./session-storage.js"
import { useMongoDBAuthState } from "./mongodb-auth-state.js"
import { createComponentLogger } from './logger.js'
import path from 'path'
import fs from 'fs'

const logger = createComponentLogger('RENDER_SESSION_MANAGER')

// Simple baileys config without external dependencies


class RenderWhatsAppSessionManager {
  constructor(sessionDir = './sessions') {
    // Core components
    this.storage = new SessionStorage()
    this.activeSockets = new Map()
    this.sessionDir = sessionDir
    this.mongoClient = null
    
    // Essential tracking
    this.initializingSessions = new Set()
    this.voluntarilyDisconnected = new Set()
    
    // Auto-cleanup tracking
    this.cleanupTimers = new Map()
    
    // Configuration
    this.maxSessions = 10 // Lower limit for Render
    this.isInitialized = false
    
    // No event handlers for Render - connection only
    this.eventHandlersEnabled = false
    
    this._createSessionDirectory()
    this._setupPeriodicCleanup()
  }

  _createSessionDirectory() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true })
    }
  }

  _setupPeriodicCleanup() {
    // Clean up stale data every 5 minutes
    setInterval(() => {
      this._performPeriodicCleanup()
    }, 300000)
  }

  async _performPeriodicCleanup() {
    try {
      const now = Date.now()
      const staleThreshold = 900000 // 15 minutes
      
      for (const [sessionId, sock] of this.activeSockets) {
        if (!sock.user && (now - (sock.createdAt || 0)) > staleThreshold) {
          logger.info(`RENDER: Cleaning up stale session ${sessionId}`)
          await this.disconnectSession(sessionId, true)
        }
      }
    } catch (error) {
      logger.error('RENDER: Periodic cleanup error:', error)
    }
  }

  async waitForMongoDB(maxWaitTime = 10000) {
    const startTime = Date.now()
    while (Date.now() - startTime < maxWaitTime) {
      if (this.storage.isMongoConnected && this.storage.client) {
        this.mongoClient = this.storage.client
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    return false
  }

  async createSession(userId, phoneNumber = null, callbacks = {}, isReconnect = false, source = 'web') {
    const userIdStr = String(userId)
    const sessionId = userIdStr.startsWith('session_') ? userIdStr : `session_${userIdStr}`
    
    // Prevent duplicate initialization
    if (this.initializingSessions.has(sessionId)) {
      logger.debug(`RENDER: Session ${sessionId} already initializing`)
      return this.activeSockets.get(sessionId)
    }
    
    if (this.activeSockets.has(sessionId) && !isReconnect) {
      logger.debug(`RENDER: Session ${sessionId} already exists`)
      return this.activeSockets.get(sessionId)
    }

    if (this.activeSockets.size >= this.maxSessions) {
      throw new Error(`RENDER: Maximum sessions limit (${this.maxSessions}) reached`)
    }

    this.initializingSessions.add(sessionId)
    
    try {
      // Clean up existing session if this is a reconnect
      if (isReconnect) {
        await this._cleanupExistingSession(sessionId)
      }
      
      const { state, saveCreds, authMethod } = await this._getAuthState(sessionId)
      const isRegistered = state?.creds?.registered || false
      
      const sock = makeWASocket({
        auth: state,
        ...baileysConfig
      })

      // Add creation timestamp for cleanup
      sock.createdAt = Date.now()
      
      this._configureSocket(sock, sessionId, authMethod, isRegistered, saveCreds)
      this.activeSockets.set(sessionId, sock)
      this._setupConnectionHandler(sock, sessionId, callbacks)

      await this.storage.saveSession(sessionId, {
        userId: userIdStr,
        telegramId: userIdStr,
        phoneNumber,
        isConnected: false,
        connectionStatus: 'connecting',
        source: source
      })

      if (phoneNumber && !isRegistered && !isReconnect && source === 'web') {
        setTimeout(() => this._handlePairing(sock, sessionId, phoneNumber, callbacks), 2000)
      }

      return sock
    } catch (error) {
      logger.error(`RENDER: Failed to create session ${sessionId}:`, error)
      throw error
    } finally {
      this.initializingSessions.delete(sessionId)
    }
  }

  _configureSocket(sock, sessionId, authMethod, isRegistered, saveCreds) {
    if (sock.ev && typeof sock.ev.setMaxListeners === 'function') {
      sock.ev.setMaxListeners(100) // Lower limit for Render
    }
    
    sock.ev.on('creds.update', saveCreds)
    sock.authMethod = authMethod
    sock.isRegistered = isRegistered
    sock.sessionId = sessionId
    
    // No event handlers for Render
    sock.eventHandlersSetup = false
  }

  async _getAuthState(sessionId) {
    let state, saveCreds, authMethod = 'file'
    
    if (this.mongoClient) {
      try {
        const db = this.mongoClient.db()
        const collection = db.collection('auth_baileys')
        const mongoAuth = await useMongoDBAuthState(collection, sessionId)
        
        state = mongoAuth.state
        saveCreds = mongoAuth.saveCreds
        authMethod = 'mongodb'
      } catch (mongoError) {
        logger.warn(`RENDER: MongoDB auth failed for ${sessionId}, falling back to file auth`)
      }
    }
    
    if (!state) {
      const authPath = path.join(this.sessionDir, sessionId)
      if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true })
      }
      
      const fileAuth = await useMultiFileAuthState(authPath)
      state = fileAuth.state
      saveCreds = fileAuth.saveCreds
      authMethod = 'file'
    }
    
    return { state, saveCreds, authMethod }
  }

  _setupConnectionHandler(sock, sessionId, callbacks) {
    const connectionHandler = async (update) => {
      await this._handleConnectionUpdate(sessionId, update, callbacks)
    }
    
    sock.ev.on('connection.update', connectionHandler)
  }

  async _handleConnectionUpdate(sessionId, update, callbacks) {
    const { connection, lastDisconnect, qr } = update
    const sock = this.activeSockets.get(sessionId)

    try {
      if (qr && callbacks?.onQR) {
        callbacks.onQR(qr)
      }

      if (connection === 'open') {
        await this._handleConnectionOpen(sock, sessionId, callbacks)
      } else if (connection === 'close') {
        await this._handleConnectionClose(sessionId, lastDisconnect, callbacks)
      } else if (connection === 'connecting') {
        await this.storage.updateSession(sessionId, { connectionStatus: 'connecting' })
      }
    } catch (error) {
      logger.error(`RENDER: Connection error for ${sessionId}:`, error)
    }
  }

  async _handleConnectionOpen(sock, sessionId, callbacks) {
    if (!sock) return
    
    this.voluntarilyDisconnected.delete(sessionId)
    const phoneNumber = sock?.user?.id?.split('@')[0]
    
    await this.storage.updateSession(sessionId, {
      isConnected: true,
      phoneNumber: phoneNumber ? `+${phoneNumber}` : null,
      connectionStatus: 'connected'
    })

    logger.info(`RENDER: ✓ ${sessionId} connected (+${phoneNumber || 'unknown'})`)

    if (callbacks?.onConnected) {
      callbacks.onConnected(sock)
    }

    // RENDER SPECIFIC: Schedule auto-cleanup after 15 seconds
    // This allows Pterodactyl to detect and take over the session
    this._scheduleAutoCleanup(sessionId, 15000)
  }

  _scheduleAutoCleanup(sessionId, delay) {
    // Clear any existing cleanup timer
    if (this.cleanupTimers.has(sessionId)) {
      clearTimeout(this.cleanupTimers.get(sessionId))
    }

    const timer = setTimeout(async () => {
      try {
        logger.info(`RENDER: Auto-cleaning up session ${sessionId} - handing over to Pterodactyl`)
        
        // Mark as undetected so Pterodactyl can pick it up
        await this.storage.updateSession(sessionId, { 
          detected: false 
        })
        
        // Clean up socket but keep session data
        const sock = this.activeSockets.get(sessionId)
        if (sock) {
          this._cleanupSocket(sessionId, sock)
          this.activeSockets.delete(sessionId)
        }
        
        this.cleanupTimers.delete(sessionId)
        logger.info(`RENDER: Session ${sessionId} handed over to Pterodactyl detection system`)
        
      } catch (error) {
        logger.error(`RENDER: Auto-cleanup error for ${sessionId}:`, error)
      }
    }, delay)

    this.cleanupTimers.set(sessionId, timer)
  }

async _handleConnectionClose(sessionId, lastDisconnect, callbacks) {
  const reason = lastDisconnect?.error?.message || 'Unknown'
  
  logger.info(`RENDER: ✗ ${sessionId} disconnected: ${reason}`)
  
  await this.storage.updateSession(sessionId, { 
    isConnected: false,
    connectionStatus: 'disconnected'
  })
  
  // FIXED: Check if we should reconnect before cleaning up
  const shouldReconnect = await this._shouldReconnect(lastDisconnect, sessionId)
  if (shouldReconnect) {
    setTimeout(() => this._reconnectDirect(sessionId, callbacks), 5000)
  } else {
    await this.disconnectSession(sessionId, true)
  }
}

async _shouldReconnect(lastDisconnect, sessionId) {
  if (!lastDisconnect?.error || !(lastDisconnect.error instanceof Boom)) {
    return true
  }
  
  const statusCode = lastDisconnect.error.output?.statusCode
  const session = await this.storage.getSession(sessionId)
  const reconnectCount = session?.reconnectAttempts || 0
  
  const permanentDisconnects = [
    DisconnectReason.loggedOut,
    DisconnectReason.badSession,
    DisconnectReason.multideviceMismatch
  ]
  
  if (statusCode === 515) return reconnectCount < 3 // Lower retry count for Render
  if (statusCode === 440) {
    logger.info(`RENDER: ${sessionId} QR timeout - session will not auto-reconnect`)
    return false
  }
  
  if (statusCode === 401) {
    return false // Don't reconnect on auth failure
  }
  
  return !permanentDisconnects.includes(statusCode) && reconnectCount < 3
}

async _reconnectDirect(sessionId, callbacks) {
  try {
    const session = await this.storage.getSession(sessionId)
    if (!session) return

    const newAttempts = (session.reconnectAttempts || 0) + 1
    await this.storage.updateSession(sessionId, {
      reconnectAttempts: newAttempts,
      connectionStatus: 'reconnecting'
    })

    logger.info(`RENDER: Reconnecting ${sessionId} (attempt #${newAttempts})`)
    
    await this.createSession(session.userId, session.phoneNumber, callbacks, true, session.source)
    
  } catch (error) {
    logger.error(`RENDER: Reconnect failed for ${sessionId}:`, error)
    // Don't retry recursively - let it fail and clean up
    await this.disconnectSession(sessionId, true)
  }
}

  async disconnectSession(sessionId, forceCleanup = false) {
    this.initializingSessions.delete(sessionId)
    this.voluntarilyDisconnected.add(sessionId)

    // Clear any scheduled cleanup
    if (this.cleanupTimers.has(sessionId)) {
      clearTimeout(this.cleanupTimers.get(sessionId))
      this.cleanupTimers.delete(sessionId)
    }

    const sock = this.activeSockets.get(sessionId)
    if (sock) {
      try {
        this._cleanupSocket(sessionId, sock)
      } catch (error) {
        logger.warn(`RENDER: Error during socket cleanup for ${sessionId}: ${error.message}`)
      }
    }

    this.activeSockets.delete(sessionId)
    
    if (forceCleanup) {
      await this.storage.deleteSession(sessionId)
    }
  }

  _cleanupSocket(sessionId, sock) {
    try {
      if (sock.ev && typeof sock.ev.removeAllListeners === 'function') {
        sock.ev.removeAllListeners()
      }
      
      if (sock.ws && sock.ws.readyState === sock.ws.OPEN) {
        sock.ws.close(1000, 'Render Cleanup')
      }
      
      sock.user = null
      sock.eventHandlersSetup = false
      return true
    } catch (error) {
      logger.error(`RENDER: Socket cleanup error for ${sessionId}:`, error)
      return false
    }
  }

  async _cleanupExistingSession(sessionId) {
    try {
      const existingSession = await this.storage.getSession(sessionId)
      if (existingSession && !existingSession.isConnected) {
        await this.disconnectSession(sessionId)
      }
    } catch (error) {
      // Silent error
    }
  }

  async _handlePairing(sock, sessionId, phoneNumber, callbacks) {
    try {
      if (!this.activeSockets.has(sessionId) || sock.isRegistered) return
      
      const { handlePairing } = await import("./pairing.js")
      await handlePairing(sock, sessionId, phoneNumber, new Map(), callbacks)
      
      logger.info(`RENDER: ${sessionId} pairing completed`)
      
    } catch (error) {
      logger.error(`RENDER: Pairing error for ${sessionId}:`, error)
      if (callbacks?.onError) callbacks.onError(error)
    }
  }

  // PUBLIC API METHODS
  getSession(sessionId) {
    return this.activeSockets.get(sessionId)
  }

  async isSessionConnected(sessionId) {
    const session = await this.storage.getSession(sessionId)
    return session?.isConnected || false
  }
  
  async isReallyConnected(sessionId) {
    const sock = this.activeSockets.get(sessionId)
    const session = await this.storage.getSession(sessionId)
    return !!(sock && sock.user && session?.isConnected)
  }

  async getStats() {
    const allSessions = await this.storage.getAllSessions()
    const connectedSessions = allSessions.filter(s => s.isConnected)
    const webSessions = allSessions.filter(s => s.source === 'web')
    
    return {
      totalSessions: allSessions.length,
      connectedSessions: connectedSessions.length,
      webSessions: webSessions.length,
      activeSockets: this.activeSockets.size,
      maxSessions: this.maxSessions,
      isInitialized: this.isInitialized,
      storage: this.storage.isConnected ? 'Connected' : 'Disconnected',
      mode: 'RENDER_CONNECTION_ONLY',
      scheduledCleanups: this.cleanupTimers.size
    }
  }

  isVoluntarilyDisconnected(sessionId) {
    return this.voluntarilyDisconnected.has(sessionId)
  }

  clearVoluntaryDisconnection(sessionId) {
    this.voluntarilyDisconnected.delete(sessionId)
  }

  // Cleanup all sessions and timers
  async shutdown() {
    logger.info('RENDER: Shutting down session manager')
    
    // Clear all cleanup timers
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer)
    }
    this.cleanupTimers.clear()

    // Disconnect all sessions
    for (const sessionId of this.activeSockets.keys()) {
      await this.disconnectSession(sessionId, false)
    }

    logger.info('RENDER: Session manager shutdown complete')
  }
}

export { RenderWhatsAppSessionManager }

// SINGLETON MANAGEMENT
let instance = null

export function initializeSessionManager(sessionDir = './sessions') {
  if (!instance) {
    instance = new RenderWhatsAppSessionManager(sessionDir)
  }
  return instance
}

export function getSessionManager() {
  if (!instance) {
    instance = new RenderWhatsAppSessionManager('./sessions')
  }
  return instance
}

export const sessionManager = getSessionManager()
export default getSessionManager