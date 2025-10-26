import { createComponentLogger } from '../../utils/logger.js'

const logger = createComponentLogger('SESSION_HANDLERS')

/**
 * SessionEventHandlers - FIXED
 * Sets up connection-specific event handlers
 * ONLY handles initial connection setup, NOT reconnection logic
 */
export class SessionEventHandlers {
  constructor(sessionManager) {
    this.sessionManager = sessionManager
  }

  /**
   * Setup connection event handler for a session
   * This is the main connection.update listener
   */
  setupConnectionHandler(sock, sessionId, callbacks = {}) {
    sock.ev.on('connection.update', async (update) => {
      await this._handleConnectionUpdate(sock, sessionId, update, callbacks)
    })

    logger.debug(`Connection handler set up for ${sessionId}`)
  }

  /**
   * Handle connection update
   * @private
   */
  async _handleConnectionUpdate(sock, sessionId, update, callbacks) {
    const { connection, lastDisconnect, qr } = update

    try {
      // QR code generation
      if (qr && callbacks.onQR) {
        callbacks.onQR(qr)
      }

      // Connection states
      if (connection === 'open') {
        await this._handleConnectionOpen(sock, sessionId, callbacks)
      } else if (connection === 'close') {
        await this._handleConnectionClose(sock, sessionId, lastDisconnect, callbacks)
      } else if (connection === 'connecting') {
        await this.sessionManager.storage.updateSession(sessionId, {
          connectionStatus: 'connecting'
        })
      }

    } catch (error) {
      logger.error(`Connection update error for ${sessionId}:`, error)
    }
  }

  /**
   * Handle connection open
   * @private
   */
  async _handleConnectionOpen(sock, sessionId, callbacks) {
    try {
      logger.info(`Session ${sessionId} connection opened`)

      // Clear connection timeout
      this.sessionManager.connectionManager?.clearConnectionTimeout?.(sessionId)

      // Clear voluntary disconnection flag
      this.sessionManager.voluntarilyDisconnected.delete(sessionId)

      // Extract phone number
      const phoneNumber = sock.user?.id?.split('@')[0]
      const updateData = {
        isConnected: true,
        connectionStatus: 'connected',
        reconnectAttempts: 0
      }

      if (phoneNumber) {
        updateData.phoneNumber = `+${phoneNumber}`
      }

      // Update storage
      await this.sessionManager.storage.updateSession(sessionId, updateData)
      
      // Update in-memory state
      this.sessionManager.sessionState.set(sessionId, updateData)

      // Setup event handlers if enabled
      if (this.sessionManager.eventHandlersEnabled && !sock.eventHandlersSetup) {
        await this._setupEventHandlers(sock, sessionId)
        
        // Setup cache invalidation
        try {
          const { setupCacheInvalidation } = await import('../../config/baileys.js')
          setupCacheInvalidation(sock)
        } catch (error) {
          logger.error(`Cache invalidation setup error for ${sessionId}:`, error)
        }
      }

      // Send Telegram notification for telegram-sourced sessions
      await this._sendConnectionNotification(sessionId, phoneNumber)

      // Invoke onConnected callback
      if (callbacks.onConnected) {
        await callbacks.onConnected(sock)
      }

      logger.info(`Session ${sessionId} fully initialized`)

    } catch (error) {
      logger.error(`Connection open handler error for ${sessionId}:`, error)
    }
  }

  /**
   * Setup full event handlers for session
   * @private
   */
  async _setupEventHandlers(sock, sessionId) {
    try {
      const { EventDispatcher } = await import('../events/index.js')
      
      if (!this.sessionManager.eventDispatcher) {
        this.sessionManager.eventDispatcher = new EventDispatcher(this.sessionManager)
      }

      this.sessionManager.eventDispatcher.setupEventHandlers(sock, sessionId)
      sock.eventHandlersSetup = true

      logger.info(`Event handlers set up for ${sessionId}`)

    } catch (error) {
      logger.error(`Failed to setup event handlers for ${sessionId}:`, error)
    }
  }

/**
 * Send connection notification via Telegram
 * @private
 */
async _sendConnectionNotification(sessionId, phoneNumber) {
  try {
    const session = await this.sessionManager.storage.getSession(sessionId)
    
    if (session?.source === 'telegram' && this.sessionManager.telegramBot && phoneNumber) {
      const userId = sessionId.replace('session_', '')
      
      // Check if the method exists, otherwise use sendMessage directly
      if (typeof this.sessionManager.telegramBot.sendConnectionSuccess === 'function') {
        await this.sessionManager.telegramBot.sendConnectionSuccess(
          userId,
          `+${phoneNumber}`
        ).catch(error => {
          logger.error('Failed to send connection notification:', error)
        })
      } else if (typeof this.sessionManager.telegramBot.sendMessage === 'function') {
        // Fallback to sendMessage
        await this.sessionManager.telegramBot.sendMessage(
          userId,
          `✅ *WhatsApp Connected!*\n\n📱 Number: +${phoneNumber}\n\nYou can now use the bot to send and receive messages.`,
          { parse_mode: 'Markdown' }
        ).catch(error => {
          logger.error('Failed to send connection notification:', error)
        })
      }
    }
  } catch (error) {
    logger.error('Connection notification error:', error)
  }
}

  /**
   * Handle connection close - FIXED TO PREVENT DUPLICATE RECONNECTION
   * @private
   */
  async _handleConnectionClose(sock, sessionId, lastDisconnect, callbacks) {
    try {
      logger.warn(`Session ${sessionId} connection closed`)

      // Update session status
      await this.sessionManager.storage.updateSession(sessionId, {
        isConnected: false,
        connectionStatus: 'disconnected'
      })

      // CRITICAL FIX: Only delegate to ConnectionEventHandler
      // Do NOT implement fallback reconnection logic here
      // This prevents duplicate 515 handling
      
      try {
        const { ConnectionEventHandler } = await import('../events/index.js')
        
        if (!this.sessionManager.connectionEventHandler) {
          this.sessionManager.connectionEventHandler = new ConnectionEventHandler(this.sessionManager)
        }

        // Delegate ALL reconnection logic to ConnectionEventHandler
        await this.sessionManager.connectionEventHandler._handleConnectionClose(
          sock, 
          sessionId, 
          lastDisconnect
        )
        
        logger.debug(`Connection close delegated to ConnectionEventHandler for ${sessionId}`)
      } catch (error) {
        logger.error(`Failed to delegate to ConnectionEventHandler for ${sessionId}:`, error)
        
        // CRITICAL: No fallback reconnection here
        // If ConnectionEventHandler fails to load, just log and exit
        // This prevents duplicate reconnection attempts that were causing the 515 issue
      }

    } catch (error) {
      logger.error(`Connection close handler error for ${sessionId}:`, error)
    }
  }

  /**
   * Setup credentials update handler
   */
  setupCredsHandler(sock, sessionId) {
    sock.ev.on('creds.update', async () => {
      try {
        // Set bot presence
        await sock.sendPresenceUpdate('unavailable').catch(() => {})
        
        logger.debug(`Credentials updated for ${sessionId}`)
      } catch (error) {
        logger.error(`Creds update error for ${sessionId}:`, error)
      }
    })

    logger.debug(`Credentials handler set up for ${sessionId}`)
  }

  /**
   * Remove all event handlers for a session
   */
  cleanup(sock, sessionId) {
    try {
      if (sock.ev && typeof sock.ev.removeAllListeners === 'function') {
        sock.ev.removeAllListeners()
      }

      logger.debug(`Event handlers cleaned up for ${sessionId}`)
      return true

    } catch (error) {
      logger.error(`Failed to cleanup handlers for ${sessionId}:`, error)
      return false
    }
  }
}