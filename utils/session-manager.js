// RENDER: Complete WhatsApp Session Manager - Web Pairing Only
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys"
import { baileysConfig } from "./baileys.js"
import { SessionStorage } from "./session-storage.js"
import { useMongoDBAuthState } from "./mongodb-auth-state.js"
import { logger } from "./logger.js"
import path from 'path'
import fs from 'fs'

class WhatsAppSessionManager {
  constructor(telegramBot = null, sessionDir = './sessions') {
    // Core components only - RENDER SPECIFIC
    this.storage = new SessionStorage()
    this.activeSockets = new Map()
    this.telegramBot = telegramBot
    this.sessionDir = sessionDir
    this.mongoClient = null
    
    // Minimal tracking for connection process only
    this.initializingSessions = new Set()
    this.pairingCodes = new Map() // Store pairing codes for web interface
    
    // RENDER CONFIG - Connection only, no message processing
    this.maxSessions = 10 // Lower limit for render
    this.isInitialized = false
    this.eventHandlersEnabled = false // ALWAYS FALSE for render
    
    this._createSessionDirectory()
}

  _createSessionDirectory() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true })
    }
  }

  async waitForMongoDB(maxWaitTime = 5000) {
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

  // RENDER SPECIFIC: Initialize existing web sessions only (for status checks)
  async initializeExistingSessions() {
    try {
      await this.waitForMongoDB()
      
      // Only get web sessions that are already connected
      const webSessions = await this.storage.getAllSessions()
      const connectedSessions = webSessions.filter(s => s.isConnected && s.source === 'web')
      
      logger.info(`RENDER: Found ${connectedSessions.length} existing web sessions`)
      
      this.isInitialized = true
      return { initialized: 0, total: connectedSessions.length }
    } catch (error) {
      logger.error('RENDER session initialization failed:', error)
      return { initialized: 0, total: 0 }
    }
  }

  // RENDER SPECIFIC: Create session for pairing only - NO EVENT HANDLERS
  async createSession(userId, phoneNumber = null, callbacks = {}, isReconnect = false) {
    const userIdStr = String(userId)
    const sessionId = userIdStr.startsWith('session_') ? userIdStr : `session_${userIdStr}`
    
    logger.info(`RENDER: Creating session ${sessionId} for phone ${phoneNumber} (reconnect: ${isReconnect})`)
    
    if (this.initializingSessions.has(sessionId)) {
      return this.activeSockets.get(sessionId)
    }
    
    if (this.activeSockets.has(sessionId) && !isReconnect) {
      return this.activeSockets.get(sessionId)
    }

    if (this.activeSockets.size >= this.maxSessions) {
      throw new Error(`RENDER: Maximum sessions limit (${this.maxSessions}) reached`)
    }

    this.initializingSessions.add(sessionId)
    
    try {
      if (isReconnect) {
        await this._cleanupExistingSession(sessionId)
      }
      
      const { state, saveCreds, authMethod } = await this._getAuthState(sessionId)
      const isRegistered = state?.creds?.registered || false
      
      const sock = makeWASocket({
        auth: state,
        ...baileysConfig,
        printQRInTerminal: false,
        qrTimeout: 60000,
        shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: () => false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 30_000
      })

      // RENDER SPECIFIC: Minimal socket configuration
      this._configureSocket(sock, sessionId, authMethod, isRegistered, saveCreds)
      this.activeSockets.set(sessionId, sock)
      
      // RENDER: Setup connection handler - PAIRING FOCUSED
      this._setupConnectionHandler(sock, sessionId, callbacks)

      // RENDER: Save session with web source - MUST HAPPEN FIRST
      await this.storage.saveSession(sessionId, {
        userId: userIdStr,
        telegramId: userIdStr,
        phoneNumber,
        isConnected: false,
        connectionStatus: 'connecting',
        reconnectAttempts: 0,
        source: 'web',
        detected: false
      })

      // RENDER: Handle pairing for new unregistered sessions - NO TIMEOUT
      if (phoneNumber && !isRegistered && !isReconnect) {
        this._handlePairing(sock, sessionId, phoneNumber, callbacks)
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
      sock.ev.setMaxListeners(10)
    }
    
    sock.ev.on('creds.update', saveCreds)
    sock.authMethod = authMethod
    sock.isRegistered = isRegistered
    sock.sessionId = sessionId
    sock.eventHandlersSetup = false // RENDER: Always false
  }

  async _getAuthState(sessionId) {
    let state, saveCreds, authMethod = 'file'
    
    // Try MongoDB auth first
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
    
    // Fallback to file auth
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

  async disconnectSession(sessionId, forceCleanup = false) {
    if (forceCleanup) {
      return await this.performCompleteUserCleanup(sessionId)
    }

    this.initializingSessions.delete(sessionId)

    const sock = this.activeSockets.get(sessionId)
    
    if (sock) {
      try {
        this._cleanupSocket(sessionId, sock)
      } catch (error) {
        logger.warn(`RENDER: Error during socket cleanup for ${sessionId}: ${error.message}`)
      }
    }

    this.activeSockets.delete(sessionId)
    await this.storage.deleteSession(sessionId)
    this.pairingCodes.delete(sessionId)
  }

  // RENDER: NO EVENT HANDLERS - This method does nothing
  async enableEventHandlers() {
    logger.info('RENDER: Event handlers are disabled - connection only mode')
    return false
  }

  // RENDER SPECIFIC: Connection handler for pairing process
  _setupConnectionHandler(sock, sessionId, callbacks) {
    const connectionHandler = async (update) => {
      await this._handleConnectionUpdate(sessionId, update, callbacks)
    }
    
    sock.ev.on('connection.update', connectionHandler)
  }

  async _handleConnectionUpdate(sessionId, update, callbacks) {
    const { connection, lastDisconnect, qr } = update
    const userId = sessionId.replace('session_', '').replace('web_', '')
    const sock = this.activeSockets.get(sessionId)

    try {
      if (qr && callbacks?.onQR) {
        callbacks.onQR(qr)
      }

      if (connection === 'open') {
        await this._handleConnectionOpen(sock, sessionId, userId, callbacks)
      } else if (connection === 'close') {
        await this._handleConnectionClose(sessionId, lastDisconnect, callbacks)
      } else if (connection === 'connecting') {
        await this.storage.updateSession(sessionId, { connectionStatus: 'connecting' })
      }
    } catch (error) {
      logger.error(`RENDER: Connection error for ${sessionId}:`, error)
    }
  }

async _handleConnectionOpen(sock, sessionId, userId, callbacks) {
  if (!sock) return
  
  const phoneNumber = sock?.user?.id?.split('@')[0]
  
  // The auth state is already being saved automatically via the saveCreds callback
  // that was set up in _configureSocket, so we don't need manual intervention
  
  // CRITICAL: Update BOTH databases with connected status
  await Promise.all([
    this.storage.updateSession(sessionId, {
      isConnected: true,
      phoneNumber: phoneNumber ? `+${phoneNumber}` : null,
      connectionStatus: 'connected',
      reconnectAttempts: 0,
      source: 'web',
      detected: false
    }),
    // Also update MongoDB directly to ensure consistency
    this.storage._updateInMongo(sessionId, {
      isConnected: true,
      phoneNumber: phoneNumber ? `+${phoneNumber}` : null,
      connectionStatus: 'connected',
      reconnectAttempts: 0,
      source: 'web',
      detected: false
    })
  ])

  logger.info(`RENDER: ✓ ${sessionId} connected (+${phoneNumber || 'unknown'}) - Ready for pterodactyl detection`)

  this.pairingCodes.delete(sessionId)
  
  if (callbacks?.onConnected) {
    callbacks.onConnected(sock)
  }

  // Keep socket alive for 15 seconds then cleanup
  setTimeout(() => {
    logger.info(`RENDER: Auto-cleanup socket ${sessionId} - pterodactyl will handle messages`)
    this._cleanupSocket(sessionId, sock)
    this.activeSockets.delete(sessionId)
  }, 15000)
}

async _handleConnectionClose(sessionId, lastDisconnect, callbacks) {
  const reason = lastDisconnect?.error?.message || 'Unknown'
  logger.info(`RENDER: ✗ ${sessionId} disconnected: ${reason}`)
  
  await this.storage.updateSession(sessionId, { 
    isConnected: false,
    connectionStatus: 'disconnected'
  })
  
  // RENDER: Check if should reconnect (like Pterodactyl does)
  const shouldReconnect = this._shouldReconnect(lastDisconnect, sessionId)
  if (shouldReconnect) {
    logger.info(`RENDER: Will reconnect ${sessionId} - ${reason}`)
    setTimeout(() => this._reconnectSession(sessionId, callbacks), 3000)
  } else {
    logger.info(`RENDER: Will not reconnect ${sessionId} - ${reason}`)
    await this.disconnectSession(sessionId, true)
    
    if (callbacks?.onError) {
      callbacks.onError(new Error(`Connection failed: ${reason}`))
    }
  }
}

  _shouldReconnect(lastDisconnect, sessionId) {
  if (!lastDisconnect?.error) return true
  
  const reason = lastDisconnect.error.message || ''
  
  // RENDER: Reconnect on stream errors (like Pterodactyl does)
  if (reason.includes('Stream Errored') || reason.includes('restart required')) {
    return true
  }
  
  // RENDER: Don't reconnect on permanent failures
  if (reason.includes('QR timeout') || reason.includes('logged out')) {
    return false
  }
  
  return true
}
  
    async _reconnectSession(sessionId, callbacks) {
    try {
      const session = await this.storage.getSession(sessionId)
      if (!session) {
        logger.warn(`RENDER: Cannot reconnect ${sessionId} - session not found`)
        return
      }

      logger.info(`RENDER: Reconnecting ${sessionId}...`)
      
      await this.createSession(
        session.userId, 
        session.phoneNumber, 
        callbacks, 
        true // isReconnect = true
      )
      
    } catch (error) {
      logger.error(`RENDER: Reconnect failed for ${sessionId}:`, error)
      
      // Try again after delay
      setTimeout(() => this._reconnectSession(sessionId, callbacks), 5000)
    }
  }
  

  // RENDER: Simplified cleanup
  _cleanupSocket(sessionId, sock) {
    try {
      // Remove all listeners directly
      if (sock.ev && typeof sock.ev.removeAllListeners === 'function') {
        sock.ev.removeAllListeners()
      }
      
      // Close socket
      if (sock.ws && sock.ws.readyState === sock.ws.OPEN) {
        sock.ws.close(1000, 'RENDER cleanup')
      }
      
      // Clear references
      sock.user = null
      sock.eventHandlersSetup = false
      
      return true
    } catch (error) {
      logger.error(`RENDER: Socket cleanup error for ${sessionId}:`, error)
      return false
    }
  }

  async performCompleteUserCleanup(sessionId) {
    const userId = sessionId.replace('session_', '').replace('web_', '')
    const results = { socket: false, database: false }

    try {
      this.initializingSessions.delete(sessionId)
      
      // Cleanup socket
      const sock = this.activeSockets.get(sessionId)
      if (sock) {
        results.socket = this._cleanupSocket(sessionId, sock)
      }
      this.activeSockets.delete(sessionId)
      this.pairingCodes.delete(sessionId)

      // Database cleanup
      try {
        await this.storage.updateSession(sessionId, {
          isConnected: false,
          connectionStatus: 'disconnected',
          detected: false
        })
        results.database = true
      } catch (error) {
        logger.error(`RENDER: Database cleanup error for ${sessionId}:`, error)
      }

      logger.info(`RENDER: Complete cleanup for ${sessionId}:`, results)
      return results

    } catch (error) {
      logger.error(`RENDER: Cleanup failed for ${sessionId}:`, error)
      return results
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

  // RENDER SPECIFIC: Handle pairing process with code generation
  async _handlePairing(sock, sessionId, phoneNumber, callbacks) {
    try {
      if (!this.activeSockets.has(sessionId) || sock.isRegistered) {
        logger.warn(`RENDER: Pairing skipped for ${sessionId} - socket missing or already registered`)
        return
      }
      
      logger.info(`RENDER: Starting pairing process for ${sessionId} with ${phoneNumber}`)
      
      const { handlePairing } = await import("./pairing.js")
      await handlePairing(sock, sessionId, phoneNumber, this.pairingCodes, callbacks)
      
      logger.info(`RENDER: ${sessionId} pairing completed, waiting for connection...`)
      
    } catch (error) {
      logger.error(`RENDER: Pairing error for ${sessionId}:`, error)
      if (callbacks?.onError) callbacks.onError(error)
    }
  }

  // RENDER SPECIFIC: Get pairing code for web display
  getPairingCode(sessionId) {
    return this.pairingCodes.get(sessionId)
  }

  // RENDER SPECIFIC: Set pairing code from pairing process
  setPairingCode(sessionId, code) {
    this.pairingCodes.set(sessionId, code)
  }

  // PUBLIC API METHODS
  getSession(sessionId) {
    return this.activeSockets.get(sessionId)
  }

  async getAllSessions() {
    return await this.storage.getAllSessions()
  }

  async isSessionConnected(sessionId) {
    const session = await this.storage.getSession(sessionId)
    return session?.isConnected || false
  }
  
  async isReallyConnected(sessionId) {
    const session = await this.storage.getSession(sessionId)
    return session?.isConnected && session?.source === 'web'
  }

  async getStats() {
    const allSessions = await this.storage.getAllSessions()
    const connectedSessions = allSessions.filter(s => s.isConnected)
    
    return {
      totalSessions: allSessions.length,
      connectedSessions: connectedSessions.length,
      activeSockets: this.activeSockets.size,
      eventHandlersEnabled: false, // Always false for render
      maxSessions: this.maxSessions,
      isInitialized: this.isInitialized,
      storage: this.storage.isConnected ? 'Connected' : 'Disconnected',
      mode: 'RENDER_CONNECTION_ONLY'
    }
  }

  // RENDER SPECIFIC: Check if session is ready for pterodactyl detection
  async isReadyForDetection(sessionId) {
    const session = await this.storage.getSession(sessionId)
    return session?.isConnected && 
           session?.source === 'web' && 
           !session?.detected &&
           session?.connectionStatus === 'connected'
  }

}
export { WhatsAppSessionManager }

// SINGLETON MANAGEMENT
let instance = null

export function initializeSessionManager(telegramBot, sessionDir = './sessions') {
  if (!instance) {
    instance = new WhatsAppSessionManager(telegramBot, sessionDir)
  }
  return instance
}

export function getSessionManager() {
  if (!instance) {
    instance = new WhatsAppSessionManager(null, './sessions')
  }
  return instance
}

export const sessionManager = getSessionManager()
export default getSessionManager



