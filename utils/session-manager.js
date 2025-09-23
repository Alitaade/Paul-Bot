// Web WhatsApp Session Manager - Minimal Version for Connection Setup Only
import { makeWASocket, DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import { baileysConfig } from "./baileys.js"
import { SessionStorage } from "./session-storage.js"
import { useMongoDBAuthState } from "./mongodb-auth-state.js"
import { logger } from "./logger.js"
import path from 'path'
import fs from 'fs'

// ==========================================
// WEB SESSION MANAGER CLASS (MINIMAL)
// ==========================================

class WhatsAppSessionManager {
  constructor(sessionDir = './sessions') {
    this._initializeProperties(sessionDir)
    this._createSessionDirectory()
  }

  // ==========================================
  // INITIALIZATION METHODS
  // ==========================================

  _initializeProperties(sessionDir) {
    // Core components
    this.storage = new SessionStorage()
    this.activeSockets = new Map()
    this.sessionDir = sessionDir
    this.mongoClient = null
    
    // Session tracking
    this.initializingSessions = new Set()
    this.reconnectingSessions = new Set()
    this.connectionListeners = new Map()
    
    // Configuration
    this.maxSessions = 20 // Lower limit for web
    this.isInitialized = true // Web is always initialized
  }

  _createSessionDirectory() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true })
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

  // ==========================================
  // SESSION CREATION & MANAGEMENT
  // ==========================================

  async createSession(userId, phoneNumber = null, callbacks = {}, isReconnect = false) {
    const userIdStr = String(userId)
    const sessionId = userIdStr.startsWith('session_') ? userIdStr : `session_${userIdStr}`
    
    // Prevent duplicate initialization
    if (this.initializingSessions.has(sessionId)) {
      logger.debug(`Session ${sessionId} already initializing`)
      return this.activeSockets.get(sessionId)
    }
    
    if (this.activeSockets.has(sessionId) && !isReconnect) {
      logger.debug(`Session ${sessionId} already exists`)
      return this.activeSockets.get(sessionId)
    }

    if (this.activeSockets.size >= this.maxSessions) {
      throw new Error(`Maximum sessions limit (${this.maxSessions}) reached`)
    }

    this.initializingSessions.add(sessionId)
    
    try {
      // Clean up existing session if this is a reconnect
      if (isReconnect) {
        await this._cleanupExistingSession(sessionId)
      }
      
      await this.waitForMongoDB()
      
      const { state, saveCreds, authMethod } = await this._getAuthState(sessionId)
      const isRegistered = state?.creds?.registered || false
      
      const sock = makeWASocket({
        auth: state,
        ...baileysConfig,
        printQRInTerminal: false,
        qrTimeout: 0,
        // Web-specific config
        shouldSyncHistoryMessage: () => false, // Disable for web to save resources
        shouldIgnoreJid: () => false,
        markOnlineOnConnect: true, // Mark online for web users
        syncFullHistory: false,
        defaultQueryTimeoutMs: 45_000,
        generateHighQualityLinkPreview: false,
        patchMessageBeforeSending: (message) => message
      })

      // Set socket properties
      this._configureSocket(sock, sessionId, authMethod, isRegistered, saveCreds)
      this.activeSockets.set(sessionId, sock)
      
      // Setup connection handler
      this._setupConnectionHandler(sock, sessionId, callbacks)

      // Save session to storage - minimal data for web
      await this.storage.saveSession(sessionId, {
        userId: userIdStr,
        telegramId: userIdStr,
        phoneNumber,
        isConnected: false,
        connectionStatus: 'connecting',
        reconnectAttempts: 0
      })

      // Handle pairing for new unregistered sessions
      if (phoneNumber && !isRegistered && !isReconnect) {
        setTimeout(() => this._handlePairing(sock, sessionId, phoneNumber, callbacks), 2000)
      }

      return sock
    } catch (error) {
      logger.error(`Failed to create session ${sessionId}:`, error)
      throw error
    } finally {
      this.initializingSessions.delete(sessionId)
    }
  }

  _configureSocket(sock, sessionId, authMethod, isRegistered, saveCreds) {
    // Increase max listeners to prevent memory leak warnings
    if (sock.ev && typeof sock.ev.setMaxListeners === 'function') {
      sock.ev.setMaxListeners(15)
    }
    
    sock.ev.on('creds.update', saveCreds)
    sock.authMethod = authMethod
    sock.isRegistered = isRegistered
    sock.sessionId = sessionId
    sock.eventHandlersSetup = false // Web doesn't setup event handlers
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
        logger.warn(`MongoDB auth failed for ${sessionId}, falling back to file auth`)
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

  // ==========================================
  // CONNECTION MANAGEMENT
  // ==========================================

  _setupConnectionHandler(sock, sessionId, callbacks) {
    // Remove existing listener to prevent duplicates
    this._removeExistingConnectionListener(sock, sessionId)
    
    const connectionHandler = async (update) => {
      await this._handleConnectionUpdate(sessionId, update, callbacks)
    }
    
    this.connectionListeners.set(sessionId, connectionHandler)
    sock.ev.on('connection.update', connectionHandler)
  }

  _removeExistingConnectionListener(sock, sessionId) {
  if (this.connectionListeners.has(sessionId)) {
    const existingHandler = this.connectionListeners.get(sessionId)
    try {
      // Check if sock.ev exists and has removeListener method
      if (sock.ev && typeof sock.ev.removeListener === 'function') {
        sock.ev.removeListener('connection.update', existingHandler)
      } else if (sock.ev && typeof sock.ev.off === 'function') {
        sock.ev.off('connection.update', existingHandler)
      }
      this.connectionListeners.delete(sessionId)
    } catch (e) {
      // Silent continue - just delete from map
      this.connectionListeners.delete(sessionId)
    }
  }
}

  async _handleConnectionUpdate(sessionId, update, callbacks) {
    const { connection, lastDisconnect, qr } = update
    const userId = sessionId.replace('session_', '')
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
      logger.error(`Connection error for ${sessionId}:`, error)
    }
  }

  async _handleConnectionOpen(sock, sessionId, userId, callbacks) {
    if (!sock) {
      logger.error(`Socket not found for ${sessionId}`)
      return
    }
    
    this.reconnectingSessions.delete(sessionId)
    
    const phoneNumber = sock?.user?.id?.split('@')[0]
    
    await this.storage.updateSession(sessionId, {
      isConnected: true,
      phoneNumber: phoneNumber ? `+${phoneNumber}` : null,
      connectionStatus: 'connected',
      reconnectAttempts: 0
    })

    logger.info(`✓ Web ${sessionId} connected (+${phoneNumber || 'unknown'})`)

    // For web - we auto-disconnect after connection is established (30 seconds)
    // This allows pterodactyl to take over with full event handlers
    setTimeout(() => {
      logger.info(`Web session ${sessionId} auto-disconnecting - handing over to pterodactyl`)
      this._webHandover(sessionId)
    }, 30000)

    if (callbacks?.onConnected) {
      callbacks.onConnected(sock)
    }
  }

  async _handleConnectionClose(sessionId, lastDisconnect, callbacks) {
    const reason = lastDisconnect?.error?.message || 'Unknown'
    logger.info(`✗ Web ${sessionId} disconnected: ${reason}`)
    
    await this.storage.updateSession(sessionId, { 
      isConnected: false,
      connectionStatus: 'disconnected'
    })
    
    const shouldReconnect = await this._shouldReconnect(lastDisconnect, sessionId)
    if (shouldReconnect && !this.reconnectingSessions.has(sessionId)) {
      this.reconnectingSessions.add(sessionId)
      setTimeout(() => this._reconnect(sessionId, callbacks), 3000)
    } else if (!shouldReconnect) {
      this.activeSockets.delete(sessionId)
    }
  }

  // Web-specific handover method
  async _webHandover(sessionId) {
    try {
      // Clean graceful handover - keep auth data intact
      const sock = this.activeSockets.get(sessionId)
      if (sock) {
        this._removeSocketListeners(sock, sessionId)
        // Don't close the socket completely - just clean up listeners
        this.activeSockets.delete(sessionId)
      }
      
      logger.info(`Web handover completed for ${sessionId}`)
    } catch (error) {
      logger.error(`Web handover error for ${sessionId}:`, error)
    }
  }

  // ==========================================
  // RECONNECTION LOGIC (Web-specific)
  // ==========================================

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
    
    // Stream errors should be reconnected with limit (common for web sessions)
    if (statusCode === 515) {
      logger.info(`Stream error for ${sessionId} - will reconnect (attempt ${reconnectCount + 1}/5)`)
      return reconnectCount < 5
    }
    
    // Connection restart required
    if (statusCode === 428) {
      logger.info(`Connection restart required for ${sessionId} - will reconnect`)
      return reconnectCount < 3
    }
    
    // All 401 errors should trigger cleanup
    if (statusCode === 401) {
      logger.warn(`Auth error for ${sessionId} - cleaning up`)
      return false
    }
    
    return !permanentDisconnects.includes(statusCode) && reconnectCount < 3
  }

  async _reconnect(sessionId, callbacks) {
    if (!this.reconnectingSessions.has(sessionId)) {
      return // Already handled
    }

    try {
      const session = await this.storage.getSession(sessionId)
      if (!session) {
        this.reconnectingSessions.delete(sessionId)
        return
      }

      const newAttempts = (session.reconnectAttempts || 0) + 1
      await this.storage.updateSession(sessionId, {
        reconnectAttempts: newAttempts,
        connectionStatus: 'reconnecting'
      })

      logger.info(`Web reconnecting ${sessionId} (attempt #${newAttempts})`)
      await this.createSession(session.userId, session.phoneNumber, callbacks, true)
      
    } catch (error) {
      logger.error(`Web reconnect failed for ${sessionId}:`, error)
      const session = await this.storage.getSession(sessionId)
      const delay = Math.min(15000, 3000 * Math.pow(2, (session?.reconnectAttempts || 0)))
      setTimeout(() => this._reconnect(sessionId, callbacks), delay)
    }
  }

  // ==========================================
  // PAIRING HANDLING
  // ==========================================

  async _handlePairing(sock, sessionId, phoneNumber, callbacks) {
    try {
      if (!this.activeSockets.has(sessionId) || sock.isRegistered) {
        return
      }
      
      const { handlePairing } = await import("../utils/pairing.js")
      await handlePairing(sock, sessionId, phoneNumber, new Map(), callbacks)
      
      logger.info(`${sessionId} pairing completed for web interface`)
      
    } catch (error) {
      logger.error(`Web pairing error for ${sessionId}:`, error)
      if (callbacks?.onError) callbacks.onError(error)
    }
  }

  // ==========================================
  // CLEANUP UTILITIES
  // ==========================================

  _removeSocketListeners(sock, sessionId) {
    if (sock.ev && typeof sock.ev.removeAllListeners === 'function') {
      // Only remove connection listeners for web handover
      const events = ['connection.update']
      events.forEach(event => {
        try {
          sock.ev.removeAllListeners(event)
        } catch (e) {
          // Silent continue
        }
      })
    }
    
    if (this.connectionListeners.has(sessionId)) {
      const existingHandler = this.connectionListeners.get(sessionId)
      try {
        sock.ev.removeListener('connection.update', existingHandler)
      } catch (e) {
        // Silent continue
      }
      this.connectionListeners.delete(sessionId)
    }
  }

  async _cleanupExistingSession(sessionId) {
    try {
      const existingSession = await this.storage.getSession(sessionId)
      if (existingSession && !existingSession.isConnected) {
        const sock = this.activeSockets.get(sessionId)
        if (sock) {
          this._removeSocketListeners(sock, sessionId)
          this.activeSockets.delete(sessionId)
        }
      }
    } catch (error) {
      // Silent error
    }
  }

  // ==========================================
  // PUBLIC API METHODS
  // ==========================================

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

  async getSessionInfo(sessionId) {
    return await this.storage.getSession(sessionId)
  }

async disconnectSession(sessionId) {
  const sock = this.activeSockets.get(sessionId)
  
  if (sock) {
    this._removeSocketListeners(sock, sessionId)
    if (sock.ws && sock.ws.readyState === sock.ws.OPEN) {
      sock.ws.close(1000, 'Web disconnect')
    }
  }

  this.activeSockets.delete(sessionId)
  this.reconnectingSessions.delete(sessionId)
  this.initializingSessions.delete(sessionId)
  
  // Note: Database cleanup is handled separately via storage.performWebUserDisconnect()
  // This method only handles socket cleanup for web sessions
}

  // ==========================================
  // CLEANUP & SHUTDOWN
  // ==========================================

  async cleanup() {
    let cleanupCount = 0
    
    // Cleanup all active sessions
    for (const sessionId of this.activeSockets.keys()) {
      await this.disconnectSession(sessionId)
      cleanupCount++
    }
    
    // Clear all tracking sets and maps
    this.reconnectingSessions.clear()
    this.connectionListeners.clear()
    this.initializingSessions.clear()
    
    // Close storage connection
    await this.storage.close()
    
    logger.info(`Web cleanup completed for ${cleanupCount} sessions`)
    return cleanupCount
  }
}

export { WhatsAppSessionManager }

// ==========================================
// SINGLETON MANAGEMENT
// ==========================================

let instance = null

export function initializeSessionManager(sessionDir = './sessions') {
  if (!instance) {
    instance = new WhatsAppSessionManager(sessionDir)
  }
  return instance
}

export function getSessionManager() {
  if (!instance) {
    instance = new WhatsAppSessionManager('./sessions')
  }
  return instance
}

export const sessionManager = getSessionManager()
export default getSessionManager