/**
 * Web WhatsApp Session Manager - Optimized for Web Interface
 * 
 * This class manages WhatsApp sessions specifically for the web interface.
 * It's designed to be lightweight, responsive, and optimized for web usage patterns.
 * 
 * Key Differences from Pterodactyl Version:
 * - Lighter weight with fewer concurrent sessions
 * - Auto-handover mechanism to Pterodactyl after 30 seconds
 * - Web-specific error handling and reconnection logic
 * - Optimized for quick connection setup and pairing
 * - No persistent event handlers (handled by Pterodactyl)
 * - No used of event handlers here at(handled by Pterodactyl)
 * 
 * Features:
 * - Session creation and connection management
 * - MongoDB and file-based authentication state
 * - Intelligent reconnection with exponential backoff
 * - Graceful handover to Pterodactyl system
 * - Clean resource management and cleanup
 */

import { makeWASocket, DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"
import { baileysConfig } from "./baileys.js"
import { SessionStorage } from "./session-storage.js"
import { useMongoDBAuthState } from "./mongodb-auth-state.js"
import { logger } from "./logger.js"
import path from 'path'
import fs from 'fs'

/**
 * Web WhatsApp Session Manager
 * 
 * Manages WhatsApp sessions for the web interface with the following lifecycle:
 * 1. User connects through web interface
 * 2. Session is created and authenticated
 * 3. Connection is established and QR/pairing handled
 * 4. After successful connection, auto-handover to Pterodactyl
 * 5. Web session cleans up gracefully
 */
class WhatsAppSessionManager {
  constructor(sessionDir = './sessions') {
    this._initializeProperties(sessionDir)
    this._createSessionDirectory()
  }

  // ================================
  // INITIALIZATION AND SETUP
  // ================================

  /**
   * Initialize all manager properties
   */
  _initializeProperties(sessionDir) {
    // Core components
    this.storage = new SessionStorage()
    this.activeSockets = new Map()      // sessionId -> WhatsApp socket
    this.sessionDir = sessionDir
    this.mongoClient = null
    
    // Session state tracking
    this.initializingSessions = new Set()     // Prevent duplicate initialization
    this.reconnectingSessions = new Set()     // Track active reconnections
    this.connectionListeners = new Map()      // Track connection event listeners
    
    // Web-specific configuration
    this.maxSessions = 90                     // Lower limit for web interface
    this.isInitialized = true                 // Web is always ready
    this.handoverTimeout = 30000              // 30 seconds before handover
    this.reconnectLimit = 3                   // Lower reconnect attempts
    
    logger.info('Web WhatsApp Session Manager initialized')
  }

  /**
   * Create session directory if it doesn't exist
   */
  _createSessionDirectory() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true })
      logger.debug(`Created web session directory: ${this.sessionDir}`)
    }
  }

  /**
   * Wait for MongoDB connection with timeout
   */
  async waitForMongoDB(maxWaitTime = 8000) {
    const startTime = Date.now()
    
    while (Date.now() - startTime < maxWaitTime) {
      if (this.storage.isMongoConnected && this.storage.client) {
        this.mongoClient = this.storage.client
        logger.debug('Web: MongoDB connection confirmed')
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    logger.warn('Web: MongoDB connection timeout - using file auth only')
    return false
  }

  // ================================
  // SESSION CREATION AND MANAGEMENT
  // ================================

  /**
   * Create a new WhatsApp session for web interface
   * 
   * @param {string} userId - Web user's telegram ID (9+ billion range)
   * @param {string} phoneNumber - Phone number (optional, for pairing)
   * @param {object} callbacks - Event callbacks {onQR, onConnected, onError}
   * @param {boolean} isReconnect - Whether this is a reconnection attempt
   * @returns {object|null} - WhatsApp socket or null if failed
   */
  async createSession(userId, phoneNumber = null, callbacks = {}, isReconnect = false) {
    const userIdStr = String(userId)
    const sessionId = userIdStr.startsWith('session_') ? userIdStr : `session_${userIdStr}`
    
    // Validation checks
    if (this.initializingSessions.has(sessionId)) {
      logger.debug(`Web: Session ${sessionId} already initializing`)
      return this.activeSockets.get(sessionId)
    }
    
    if (this.activeSockets.has(sessionId) && !isReconnect) {
      logger.debug(`Web: Session ${sessionId} already exists`)
      return this.activeSockets.get(sessionId)
    }

    if (this.activeSockets.size >= this.maxSessions) {
      throw new Error(`Web session limit reached (${this.maxSessions}). Please try again later.`)
    }

    this.initializingSessions.add(sessionId)
    
    try {
      // Clean up existing session if reconnecting
      if (isReconnect) {
        await this._cleanupExistingSession(sessionId)
      }
      
      // Wait for MongoDB connection (with timeout)
      await this.waitForMongoDB()
      
      // Get authentication state (MongoDB preferred, file fallback)
      const { state, saveCreds, authMethod } = await this._getAuthState(sessionId)
      const isRegistered = state?.creds?.registered || false
      
      // Create WhatsApp socket
      const sock = makeWASocket({
        auth: state,
        ...baileysConfig
      })

      // Configure socket properties and listeners
      this._configureSocket(sock, sessionId, authMethod, isRegistered, saveCreds)
      this.activeSockets.set(sessionId, sock)
      
      // Setup connection event handler
      this._setupConnectionHandler(sock, sessionId, callbacks)

      // Save initial session data to storage
      await this.storage.saveSession(sessionId, {
        userId: userIdStr,
        telegramId: userIdStr,
        phoneNumber,
        isConnected: false,
        connectionStatus: 'connecting',
        reconnectAttempts: 0,
        source: 'web',        // Mark as web source
        detected: false       // Will be detected by Pterodactyl later
      })

      // Handle pairing for unregistered sessions
      if (phoneNumber && !isRegistered && !isReconnect) {
        setTimeout(() => this._handlePairing(sock, sessionId, phoneNumber, callbacks), 2000)
      }

      logger.info(`Web: Created session ${sessionId} (auth: ${authMethod})`)
      return sock

    } catch (error) {
      logger.error(`Web: Failed to create session ${sessionId}:`, error)
      throw error
    } finally {
      this.initializingSessions.delete(sessionId)
    }
  }

  /**
   * Configure WhatsApp socket with essential properties
   */
  _configureSocket(sock, sessionId, authMethod, isRegistered, saveCreds) {
    // Set reasonable event listener limits for web
    if (sock.ev && typeof sock.ev.setMaxListeners === 'function') {
      sock.ev.setMaxListeners(15)
    }
    
    // Setup credential saving handler
    sock.ev.on('creds.update', saveCreds)
    
    // Add tracking properties
    sock.authMethod = authMethod
    sock.isRegistered = isRegistered
    sock.sessionId = sessionId
    sock.isWebSession = true
    
    logger.debug(`Web: Configured socket ${sessionId} (registered: ${isRegistered})`)
  }

  /**
   * Get authentication state with MongoDB preference and file fallback
   */
  async _getAuthState(sessionId) {
    let state, saveCreds, authMethod = 'file'
    
    // Try MongoDB authentication first
    if (this.mongoClient) {
      try {
        const db = this.mongoClient.db()
        const collection = db.collection('auth_baileys')
        const mongoAuth = await useMongoDBAuthState(collection, sessionId)
        
        state = mongoAuth.state
        saveCreds = mongoAuth.saveCreds
        authMethod = 'mongodb'
        
        logger.debug(`Web: Using MongoDB auth for ${sessionId}`)
      } catch (mongoError) {
        logger.warn(`Web: MongoDB auth failed for ${sessionId}, falling back to file auth`)
      }
    }
    
    // Fallback to file-based authentication
    if (!state) {
      const authPath = path.join(this.sessionDir, sessionId)
      if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true })
      }
      
      const fileAuth = await useMultiFileAuthState(authPath)
      state = fileAuth.state
      saveCreds = fileAuth.saveCreds
      authMethod = 'file'
      
      logger.debug(`Web: Using file auth for ${sessionId}`)
    }
    
    return { state, saveCreds, authMethod }
  }

  // ================================
  // CONNECTION EVENT HANDLING
  // ================================

  /**
   * Setup connection event handler for a socket
   */
  _setupConnectionHandler(sock, sessionId, callbacks) {
    // Remove any existing listeners to prevent duplicates
    this._removeExistingConnectionListener(sock, sessionId)
    
    const connectionHandler = async (update) => {
      await this._handleConnectionUpdate(sessionId, update, callbacks)
    }
    
    // Store listener reference for cleanup
    this.connectionListeners.set(sessionId, connectionHandler)
    sock.ev.on('connection.update', connectionHandler)
    
    logger.debug(`Web: Connection handler setup for ${sessionId}`)
  }

  /**
   * Remove existing connection listener to prevent memory leaks
   */
  _removeExistingConnectionListener(sock, sessionId) {
    if (this.connectionListeners.has(sessionId)) {
      const existingHandler = this.connectionListeners.get(sessionId)
      try {
        if (sock.ev && typeof sock.ev.removeListener === 'function') {
          sock.ev.removeListener('connection.update', existingHandler)
        } else if (sock.ev && typeof sock.ev.off === 'function') {
          sock.ev.off('connection.update', existingHandler)
        }
        this.connectionListeners.delete(sessionId)
        logger.debug(`Web: Removed existing connection listener for ${sessionId}`)
      } catch (e) {
        // Silent cleanup - just remove from map
        this.connectionListeners.delete(sessionId)
      }
    }
  }

  /**
   * Handle connection state updates (connecting, open, close)
   */
  async _handleConnectionUpdate(sessionId, update, callbacks) {
    const { connection, lastDisconnect, qr } = update
    const userId = sessionId.replace('session_', '')
    const sock = this.activeSockets.get(sessionId)

    try {
      // Handle QR code generation for pairing
      if (qr && callbacks?.onQR) {
        logger.debug(`Web: QR code generated for ${sessionId}`)
        callbacks.onQR(qr)
      }

      // Handle different connection states
      if (connection === 'open') {
        await this._handleConnectionOpen(sock, sessionId, userId, callbacks)
      } else if (connection === 'close') {
        await this._handleConnectionClose(sessionId, lastDisconnect, callbacks)
      } else if (connection === 'connecting') {
        await this.storage.updateSession(sessionId, { connectionStatus: 'connecting' })
        logger.debug(`Web: ${sessionId} connecting...`)
      }
    } catch (error) {
      logger.error(`Web: Connection error for ${sessionId}:`, error)
      if (callbacks?.onError) {
        callbacks.onError(error)
      }
    }
  }

  /**
   * Handle successful connection establishment
   */
  async _handleConnectionOpen(sock, sessionId, userId, callbacks) {
    if (!sock) {
      logger.error(`Web: Socket not found for ${sessionId}`)
      return
    }
    
    // Clear reconnection tracking
    this.reconnectingSessions.delete(sessionId)
    
    // Extract phone number from WhatsApp user ID
    const phoneNumber = sock?.user?.id?.split('@')[0]
    
    // Update session status in database
    const updateData = {
      isConnected: true,
      connectionStatus: 'connected',
      reconnectAttempts: 0,
      source: 'web',
      detected: false  // Keep undetected for Pterodactyl pickup
    }
    
    if (phoneNumber) {
      updateData.phoneNumber = `+${phoneNumber}`
    }
    
    await this.storage.updateSession(sessionId, updateData)

    logger.info(`Web: ✓ Session ${sessionId} connected (+${phoneNumber || 'unknown'})`)

    // Schedule automatic handover to Pterodactyl
    setTimeout(() => {
      logger.info(`Web: Auto-handover starting for ${sessionId}`)
      this._performWebHandover(sessionId)
    }, this.handoverTimeout)

    // Call success callback
    if (callbacks?.onConnected) {
      callbacks.onConnected(sock)
    }
  }

  /**
   * Handle connection closure/disconnection
   */
  async _handleConnectionClose(sessionId, lastDisconnect, callbacks) {
    const reason = lastDisconnect?.error?.message || 'Unknown'
    logger.info(`Web: ✗ Session ${sessionId} disconnected: ${reason}`)
    
    // Update database status
    await this.storage.updateSession(sessionId, { 
      isConnected: false,
      connectionStatus: 'disconnected'
    })
    
    // Determine if we should attempt reconnection
    const shouldReconnect = await this._shouldReconnect(lastDisconnect, sessionId)
    
    if (shouldReconnect && !this.reconnectingSessions.has(sessionId)) {
      this.reconnectingSessions.add(sessionId)
      setTimeout(() => this._attemptReconnection(sessionId, callbacks), 3000)
    } else if (!shouldReconnect) {
      // Clean up session if no reconnection needed
      await this.disconnectSession(sessionId)
    }
  }

  /**
   * Perform graceful handover to Pterodactyl system
   * This keeps the session data intact but removes web management
   */
  async _performWebHandover(sessionId) {
    try {
      const sock = this.activeSockets.get(sessionId)
      if (!sock) return
      
      // Update session to be detectable by Pterodactyl
      await this.storage.updateSession(sessionId, {
        detected: false,  // Pterodactyl will detect and take over
        source: 'web'     // Keep web source for identification
      })
      
      // Clean up web-specific resources but preserve connection
      this._removeSocketListeners(sock, sessionId)
      this.activeSockets.delete(sessionId)
      this.reconnectingSessions.delete(sessionId)
      
      logger.info(`Web: Handover completed for ${sessionId} - Pterodactyl will take control`)
    } catch (error) {
      logger.error(`Web: Handover error for ${sessionId}:`, error)
    }
  }

  // ================================
  // RECONNECTION LOGIC
  // ================================

  /**
   * Determine if a session should be reconnected based on disconnect reason
   */
  async _shouldReconnect(lastDisconnect, sessionId) {
    if (!lastDisconnect?.error || !(lastDisconnect.error instanceof Boom)) {
      return true // Unknown error, attempt reconnect
    }
    
    const statusCode = lastDisconnect.error.output?.statusCode
    const session = await this.storage.getSession(sessionId)
    const reconnectCount = session?.reconnectAttempts || 0
    
    // Permanent disconnection reasons - no reconnection
    const permanentDisconnects = [
      DisconnectReason.loggedOut,
      DisconnectReason.badSession,
      DisconnectReason.multideviceMismatch
    ]
    
    // Handle specific error codes
    if (statusCode === 515) { // Stream/rate limit error
      logger.info(`Web: Stream error for ${sessionId} - will retry (attempt ${reconnectCount + 1}/${this.reconnectLimit})`)
      return reconnectCount < this.reconnectLimit
    }
    
    if (statusCode === 428) { // Connection restart required
      logger.info(`Web: Connection restart required for ${sessionId}`)
      return reconnectCount < this.reconnectLimit
    }
    
    if (statusCode === 401) { // Authentication error - cleanup needed
      logger.warn(`Web: Auth error for ${sessionId} - session will be cleaned up`)
      return false
    }
    
    if (statusCode === 440) { // QR timeout
      logger.info(`Web: QR timeout for ${sessionId} - no auto-reconnection`)
      return false
    }
    
    // Default reconnection logic
    return !permanentDisconnects.includes(statusCode) && reconnectCount < this.reconnectLimit
  }

  /**
   * Attempt to reconnect a disconnected session
   */
  async _attemptReconnection(sessionId, callbacks) {
    if (!this.reconnectingSessions.has(sessionId)) {
      return // Already handled elsewhere
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

      logger.info(`Web: Reconnecting ${sessionId} (attempt #${newAttempts}/${this.reconnectLimit})`)
      
      // Attempt to create new session (reconnect mode)
      await this.createSession(session.userId, session.phoneNumber, callbacks, true)
      
    } catch (error) {
      logger.error(`Web: Reconnect failed for ${sessionId}:`, error)
      
      // Exponential backoff for next retry
      const session = await this.storage.getSession(sessionId)
      const attempts = session?.reconnectAttempts || 0
      
      if (attempts < this.reconnectLimit) {
        const delay = Math.min(15000, 3000 * Math.pow(2, attempts))
        setTimeout(() => this._attemptReconnection(sessionId, callbacks), delay)
      } else {
        // Max retries reached, give up
        this.reconnectingSessions.delete(sessionId)
        await this.disconnectSession(sessionId)
      }
    }
  }

  // ================================
  // PAIRING AND AUTHENTICATION
  // ================================

  /**
   * Handle WhatsApp pairing process for new sessions
   */
  async _handlePairing(sock, sessionId, phoneNumber, callbacks) {
    try {
      // Skip if session no longer exists or is already registered
      if (!this.activeSockets.has(sessionId) || sock.isRegistered) {
        return
      }
      
      // Import pairing utility and execute
      const { handlePairing } = await import("../utils/pairing.js")
      await handlePairing(sock, sessionId, phoneNumber, new Map(), callbacks)
      
      logger.info(`Web: Pairing completed for ${sessionId}`)
      
      // Give time for initial data sync before potential handover
      setTimeout(() => {
        if (sock && sock.user) {
          logger.debug(`Web: ${sessionId} data sync period completed`)
        }
      }, 3000)
      
    } catch (error) {
      logger.error(`Web: Pairing error for ${sessionId}:`, error)
      if (callbacks?.onError) {
        callbacks.onError(error)
      }
    }
  }

  // ================================
  // CLEANUP AND RESOURCE MANAGEMENT
  // ================================

  /**
   * Remove socket event listeners for clean handover
   */
  _removeSocketListeners(sock, sessionId) {
    if (sock.ev && typeof sock.ev.removeAllListeners === 'function') {
      // Only remove connection-related events for handover
      const eventsToRemove = ['connection.update']
      eventsToRemove.forEach(event => {
        try {
          sock.ev.removeAllListeners(event)
        } catch (e) {
          // Silent continue
        }
      })
    }
    
    // Remove our stored connection listener
    if (this.connectionListeners.has(sessionId)) {
      const existingHandler = this.connectionListeners.get(sessionId)
      try {
        if (sock.ev && typeof sock.ev.removeListener === 'function') {
          sock.ev.removeListener('connection.update', existingHandler)
        }
      } catch (e) {
        // Silent continue
      }
      this.connectionListeners.delete(sessionId)
    }
    
    logger.debug(`Web: Cleaned up listeners for ${sessionId}`)
  }

  /**
   * Clean up existing session before reconnection
   */
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
      // Silent cleanup error
    }
  }

  /**
   * Disconnect and clean up a web session
   */
  async disconnectSession(sessionId) {
    try {
      const sock = this.activeSockets.get(sessionId)
      
      // Clean up socket resources
      if (sock) {
        this._removeSocketListeners(sock, sessionId)
        
        // Close WebSocket connection gracefully
        if (sock.ws && sock.ws.readyState === sock.ws.OPEN) {
          sock.ws.close(1000, 'Web disconnect')
        }
      }

      // Clean up tracking
      this.activeSockets.delete(sessionId)
      this.reconnectingSessions.delete(sessionId)
      this.initializingSessions.delete(sessionId)
      
      logger.info(`Web: Session ${sessionId} disconnected and cleaned up`)
      
    } catch (error) {
      logger.error(`Web: Disconnect error for ${sessionId}:`, error)
    }
  }

  // ================================
  // PUBLIC API METHODS
  // ================================

  /**
   * Get active socket by session ID
   */
  getSession(sessionId) {
    return this.activeSockets.get(sessionId)
  }

  /**
   * Check if session is connected in database
   */
  async isSessionConnected(sessionId) {
    const session = await this.storage.getSession(sessionId)
    return session?.isConnected || false
  }
  
  /**
   * Check if session is actually connected (socket + database)
   */
  async isReallyConnected(sessionId) {
    const sock = this.activeSockets.get(sessionId)
    const session = await this.storage.getSession(sessionId)
    
    return !!(sock && sock.user && session?.isConnected)
  }

  /**
   * Get session information from storage
   */
  async getSessionInfo(sessionId) {
    return await this.storage.getSession(sessionId)
  }

  /**
   * Get all sessions managed by this web interface
   */
  async getAllSessions() {
    return await this.storage.getAllSessions()
  }

  /**
   * Find session by WhatsApp JID (phone number)
   */
  async getSessionByWhatsAppJid(jid) {
    if (!jid) return null

    const phoneNumber = jid.split('@')[0].split(':')[0]
    for (const [sessionId, sock] of this.activeSockets) {
      if (sock?.user?.id) {
        const sessionPhone = sock.user.id.split('@')[0]
        if (sessionPhone === phoneNumber) {
          return { sock, sessionId }
        }
      }
    }
    return null
  }

  /**
   * Get comprehensive manager statistics
   */
  async getStats() {
    const allSessions = await this.storage.getAllSessions()
    const connectedSessions = allSessions.filter(s => s.isConnected)
    
    return {
      totalSessions: allSessions.length,
      connectedSessions: connectedSessions.length,
      activeSockets: this.activeSockets.size,
      initializingSessions: this.initializingSessions.size,
      reconnectingSessions: this.reconnectingSessions.size,
      maxSessions: this.maxSessions,
      handoverTimeout: this.handoverTimeout,
      reconnectLimit: this.reconnectLimit,
      storage: this.storage.isConnected ? 'Connected' : 'Disconnected',
      storageStats: this.storage.getStats(),
      isInitialized: this.isInitialized,
      type: 'WEB_INTERFACE'
    }
  }

  /**
   * Get current status of session manager
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      activeSessions: this.activeSockets.size,
      maxSessions: this.maxSessions,
      storageConnected: this.storage.isConnected,
      mongoConnected: this.storage.isMongoConnected,
      postgresConnected: this.storage.isPostgresConnected
    }
  }

  // ================================
  // CLEANUP AND SHUTDOWN
  // ================================

  /**
   * Clean up all resources and sessions
   */
  async cleanup() {
    let cleanupCount = 0
    
    logger.info('Web: Starting cleanup of all sessions...')
    
    // Disconnect all active sessions
    const disconnectPromises = []
    for (const sessionId of this.activeSockets.keys()) {
      disconnectPromises.push(this.disconnectSession(sessionId))
      cleanupCount++
    }
    
    await Promise.allSettled(disconnectPromises)
    
    // Clear all tracking collections
    this.reconnectingSessions.clear()
    this.connectionListeners.clear()
    this.initializingSessions.clear()
    
    // Close storage connections
    await this.storage.close()
    
    logger.info(`Web: Cleanup completed for ${cleanupCount} sessions`)
    return cleanupCount
  }

  /**
   * Graceful shutdown of the web session manager
   */
  async shutdown() {
    try {
      logger.info('Web: Starting graceful shutdown...')
      
      const cleanedSessions = await this.cleanup()
      
      logger.info(`Web: Shutdown completed successfully (${cleanedSessions} sessions cleaned)`)
      
    } catch (error) {
      logger.error('Web: Shutdown error:', error)
    }
  }

  // ================================
  // UTILITY METHODS
  // ================================

  /**
   * Check if a session ID represents a web user
   */
  isWebUser(sessionId) {
    const userId = sessionId.replace('session_', '')
    return parseInt(userId) > 9000000000
  }

  /**
   * Validate phone number format
   */
  isValidPhoneNumber(phoneNumber) {
    // Basic validation - adjust regex as needed
    const phoneRegex = /^\+?[1-9]\d{10,14}$/
    return phoneRegex.test(phoneNumber)
  }

  /**
   * Get session age in milliseconds
   */
  async getSessionAge(sessionId) {
    const session = await this.storage.getSession(sessionId)
    if (!session?.createdAt) return 0
    
    return Date.now() - new Date(session.createdAt).getTime()
  }
}

// ================================
// SINGLETON MANAGEMENT
// ================================

let webSessionManagerInstance = null

/**
 * Initialize the web session manager singleton
 */
export function initializeSessionManager(sessionDir = './sessions') {
  if (!webSessionManagerInstance) {
    webSessionManagerInstance = new WhatsAppSessionManager(sessionDir)
    logger.info('Web session manager singleton initialized')
  }
  return webSessionManagerInstance
}

/**
 * Get the web session manager singleton
 */
export function getSessionManager() {
  if (!webSessionManagerInstance) {
    webSessionManagerInstance = new WhatsAppSessionManager('./sessions')
    logger.info('Web session manager singleton created')
  }
  return webSessionManagerInstance
}

// Export singleton instance
export const sessionManager = getSessionManager()
export default getSessionManager

// Export the class for direct usage if needed
export { WhatsAppSessionManager }