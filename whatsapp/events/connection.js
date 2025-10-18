import { createComponentLogger } from '../../utils/logger.js'
import { DisconnectReason } from './types.js'
import { Boom } from '@hapi/boom'

const logger = createComponentLogger('CONNECTION_EVENTS')

/**
 * ConnectionEventHandler - Handles connection state, contacts, chats, presence
 * This is ONLY used for reconnection logic and disconnect handling
 * Initial connection setup is handled by SessionEventHandlers
 */
export class ConnectionEventHandler {
  constructor(sessionManager) {
    this.sessionManager = sessionManager
  }

  /**
   * Handle connection close - FIXED to prevent unexpected disconnections
   * Made public so SessionEventHandlers can call it
   */
  async _handleConnectionClose(sock, sessionId, lastDisconnect) {
    try {
      // Update session status first
      await this.sessionManager.storage.updateSession(sessionId, {
        isConnected: false,
        connectionStatus: 'disconnected'
      })

      // Extract disconnect reason
      const error = lastDisconnect?.error
      const statusCode = error instanceof Boom ? error.output?.statusCode : null
      
      logger.warn(`Session ${sessionId} disconnected - Status: ${statusCode}`)

      // CRITICAL: Check if this is a forced/expected disconnection
      const isVoluntaryDisconnect = this.sessionManager.voluntarilyDisconnected?.has(sessionId)
      
      if (isVoluntaryDisconnect) {
        logger.info(`Session ${sessionId} voluntarily disconnected - skipping cleanup`)
        return
      }

      // Handle specific disconnect reasons
      if (statusCode === DisconnectReason.LOGGED_OUT) {
        // User logged out (401) - full cleanup
        logger.info(`Session ${sessionId} logged out - performing full cleanup`)
        await this._handleLoggedOut(sessionId)
        return
      }

      if (statusCode === DisconnectReason.CONNECTION_REPLACED) {
        // Connection replaced by another device (440) - full cleanup
        logger.info(`Session ${sessionId} replaced by another device`)
        await this.sessionManager.disconnectSession(sessionId, true)
        return
      }

      if (statusCode === DisconnectReason.BAD_SESSION) {
        // Bad MAC/session (500) - Usually auth storage pile-up, not a permanent failure
        // Clear auth storage but keep creds, then reconnect
        logger.warn(`Session ${sessionId} has bad MAC/session - clearing auth storage`)
        await this._handleBadMac(sessionId)
        return
      }

      if (statusCode === DisconnectReason.FORBIDDEN) {
        // Forbidden (403) - Account banned or restricted
        logger.error(`Session ${sessionId} is forbidden/banned - performing full cleanup`)
        await this._handleForbidden(sessionId)
        return
      }

      // For other disconnect reasons (including RESTART_REQUIRED), attempt reconnection
      const shouldReconnect = await this._shouldReconnect(statusCode, sessionId)
      
      if (shouldReconnect) {
        logger.info(`Session ${sessionId} will attempt reconnection (status: ${statusCode})`)
        setTimeout(() => {
          this._attemptReconnection(sessionId).catch(err => {
            logger.error(`Reconnection attempt failed for ${sessionId}:`, err)
          })
        }, 3000) // Shorter delay for RESTART_REQUIRED scenarios
      } else {
        logger.warn(`Session ${sessionId} will not reconnect - permanent failure`)
        await this.sessionManager.disconnectSession(sessionId, true)
      }

    } catch (error) {
      logger.error(`Connection close handler error for ${sessionId}:`, error)
    }
  }

  /**
   * Handle bad MAC/session error
   * This is usually auth storage pile-up, not a permanent failure
   * Solution: Clear auth storage except creds.json, then reconnect
   */
  async _handleBadMac(sessionId) {
    try {
      logger.info(`Handling bad MAC for ${sessionId} - clearing auth storage`)
      
      const session = await this.sessionManager.storage.getSession(sessionId)
      if (!session) {
        logger.error(`No session data found for ${sessionId}`)
        return
      }

      // Clear the socket and in-memory state
      const sock = this.sessionManager.activeSockets?.get(sessionId)
      if (sock) {
        try {
          if (sock.ev && typeof sock.ev.removeAllListeners === 'function') {
            sock.ev.removeAllListeners()
          }
          if (sock.ws && sock.ws.readyState === sock.ws.OPEN) {
            sock.ws.close(1000, 'Bad MAC cleanup')
          }
        } catch (error) {
          logger.error(`Error cleaning up socket for ${sessionId}:`, error)
        }
      }

      this.sessionManager.activeSockets?.delete(sessionId)
      this.sessionManager.sessionState?.delete(sessionId)

      // Clear auth storage but preserve creds
      await this._clearAuthStorageKeepCreds(sessionId)

      // Update session status
      await this.sessionManager.storage.updateSession(sessionId, {
        isConnected: false,
        connectionStatus: 'disconnected',
        reconnectAttempts: 0 // Reset attempts since we fixed the issue
      })

      // Attempt reconnection after a short delay
      logger.info(`Attempting reconnection for ${sessionId} after bad MAC cleanup`)
      setTimeout(() => {
        this._attemptReconnection(sessionId).catch(err => {
          logger.error(`Reconnection after bad MAC failed for ${sessionId}:`, err)
        })
      }, 2000)

    } catch (error) {
      logger.error(`Bad MAC handler error for ${sessionId}:`, error)
      // If clearing auth storage fails, fall back to full cleanup
      await this.sessionManager.performCompleteUserCleanup(sessionId)
    }
  }

  /**
   * Clear auth storage but keep credentials
   * This fixes bad MAC errors caused by auth storage pile-up
   */
  async _clearAuthStorageKeepCreds(sessionId) {
    try {
      // Clear MongoDB auth storage except creds
      if (this.sessionManager.connectionManager?.mongoClient) {
        try {
          const db = this.sessionManager.connectionManager.mongoClient.db()
          const collection = db.collection('auth_baileys')
          
          // Delete all auth data EXCEPT creds.json for this session
          const result = await collection.deleteMany({
            sessionId: sessionId,
            key: { $ne: 'creds.json' } // Keep creds.json
          })
          
          logger.info(`Cleared ${result.deletedCount} auth storage items for ${sessionId} (kept creds)`)
        } catch (mongoError) {
          logger.warn(`Failed to clear MongoDB auth storage for ${sessionId}:`, mongoError)
        }
      }

      // Clear file-based auth storage except creds.json
      if (this.sessionManager.connectionManager?.fileManager) {
        try {
          const sessionPath = this.sessionManager.connectionManager.fileManager.getSessionPath(sessionId)
          const fs = await import('fs').then(m => m.promises)
          
          // Read directory
          const files = await fs.readdir(sessionPath).catch(() => [])
          
          // Delete all files except creds.json
          for (const file of files) {
            if (file !== 'creds.json') {
              await fs.unlink(`${sessionPath}/${file}`).catch(() => {})
            }
          }
          
          logger.info(`Cleared file auth storage for ${sessionId} (kept creds.json)`)
        } catch (fileError) {
          logger.warn(`Failed to clear file auth storage for ${sessionId}:`, fileError)
        }
      }

    } catch (error) {
      logger.error(`Error clearing auth storage for ${sessionId}:`, error)
      throw error
    }
  }

  /**
   * Handle forbidden/banned account state
   */
  async _handleForbidden(sessionId) {
    try {
      const session = await this.sessionManager.storage.getSession(sessionId)
      
      // Perform full cleanup
      await this.sessionManager.performCompleteUserCleanup(sessionId)
      
      // Notify via Telegram if it's a telegram session
      if (session?.source === 'telegram' && this.sessionManager.telegramBot) {
        const userId = sessionId.replace('session_', '')
        try {
          await this.sessionManager.telegramBot.sendMessage(
            userId,
            `🚫 *WhatsApp Account Restricted*\n\nYour WhatsApp account ${session.phoneNumber || ''} has been banned or restricted by WhatsApp.\n\nThis usually happens due to:\n- Using unofficial WhatsApp versions\n- Violating WhatsApp Terms of Service\n- Suspicious activity detected\n\nPlease contact WhatsApp support or wait for the restriction to be lifted.`,
            { parse_mode: 'Markdown' }
          )
        } catch (notifyError) {
          logger.error(`Failed to send forbidden notification:`, notifyError)
        }
      }

    } catch (error) {
      logger.error(`Forbidden handler error for ${sessionId}:`, error)
    }
  }

  /**
   * Handle logged out state
   */
  async _handleLoggedOut(sessionId) {
    try {
      const session = await this.sessionManager.storage.getSession(sessionId)
      
      // Perform full cleanup
      await this.sessionManager.performCompleteUserCleanup(sessionId)
      
      // Notify via Telegram if it's a telegram session
      if (session?.source === 'telegram' && this.sessionManager.telegramBot) {
        const userId = sessionId.replace('session_', '')
        try {
          await this.sessionManager.telegramBot.sendMessage(
            userId,
            `⚠️ *WhatsApp Disconnected*\n\nYour WhatsApp ${session.phoneNumber || ''} has been logged out.\n\nUse /connect to reconnect.`,
            { parse_mode: 'Markdown' }
          )
        } catch (notifyError) {
          logger.error(`Failed to send logout notification:`, notifyError)
        }
      }

    } catch (error) {
      logger.error(`Logged out handler error for ${sessionId}:`, error)
    }
  }

  /**
   * Determine if reconnection should be attempted
   */
  async _shouldReconnect(statusCode, sessionId) {
    // Get current reconnect attempts
    const session = await this.sessionManager.storage.getSession(sessionId)
    const reconnectAttempts = session?.reconnectAttempts || 0

    // Don't reconnect for these permanent failure status codes
    const noReconnectCodes = [
      DisconnectReason.LOGGED_OUT,           // 401 - User logged out
      DisconnectReason.CONNECTION_REPLACED,  // 440 - Another device connected
      DisconnectReason.FORBIDDEN             // 403 - Account banned/restricted
      // Note: BAD_SESSION (500) is NOT here - it's handled separately with auth cleanup
    ]

    if (noReconnectCodes.includes(statusCode)) {
      return false
    }

    // Allow more attempts for RESTART_REQUIRED (515) which happens after pairing
    if (statusCode === DisconnectReason.RESTART_REQUIRED || statusCode === DisconnectReason.STREAM_ERROR_UNKNOWN) {
        // Allow more reconnection attempts for both 515 and 516
      logger.info(`Session ${sessionId} has stream error (${statusCode}) - attempting reconnection`)
      if (reconnectAttempts >= 10000) {
        logger.warn(`Session ${sessionId} exceeded max reconnection attempts for RESTART_REQUIRED`)
        return false
      }
      return true
    }

    // Limit reconnection attempts for other errors
    if (reconnectAttempts >= 5) {
      logger.warn(`Session ${sessionId} exceeded max reconnection attempts`)
      return false
    }

    return true
  }

  /**
   * Attempt to reconnect session
   */
  async _attemptReconnection(sessionId) {
    try {
      const session = await this.sessionManager.storage.getSession(sessionId)
      
      if (!session) {
        logger.error(`No session data found for ${sessionId} - cannot reconnect`)
        return
      }

      // Increment reconnect attempts
      const newAttempts = (session.reconnectAttempts || 0) + 1
      await this.sessionManager.storage.updateSession(sessionId, {
        reconnectAttempts: newAttempts,
        connectionStatus: 'reconnecting'
      })

      logger.info(`Reconnection attempt ${newAttempts} for ${sessionId}`)

      // Create new session
      await this.sessionManager.createSession(
        session.userId,
        session.phoneNumber,
        session.callbacks || {},
        true, // isReconnect
        session.source || 'telegram',
        false // Don't allow pairing on reconnect
      )

    } catch (error) {
      logger.error(`Reconnection failed for ${sessionId}:`, error)
      
      // Schedule next attempt with exponential backoff
      const session = await this.sessionManager.storage.getSession(sessionId)
      const delay = Math.min(30000, 5000 * Math.pow(2, session?.reconnectAttempts || 0))
      
      setTimeout(() => {
        this._attemptReconnection(sessionId).catch(() => {})
      }, delay)
    }
  }

  /**
   * Handle credentials update
   */
  async handleCredsUpdate(sock, sessionId) {
    try {
      // Set bot presence
      await sock.sendPresenceUpdate('unavailable').catch(() => {})
      
      logger.debug(`Credentials updated for ${sessionId}`)
    } catch (error) {
      logger.error(`Creds update error for ${sessionId}:`, error)
    }
  }

  /**
   * Handle new contacts
   */
  async handleContactsUpsert(sock, sessionId, contacts) {
    try {
      logger.debug(`${contacts.length} new contacts for ${sessionId}`)
      
      // Process contacts (can be used to update contact cache if needed)
      for (const contact of contacts) {
        // Store in contact manager if implemented
        // await contactManager.storeContact(sessionId, contact)
      }
    } catch (error) {
      logger.error(`Contacts upsert error:`, error)
    }
  }

  /**
   * Handle contact updates - FIXED: Actually update contact cache
   */
  async handleContactsUpdate(sock, sessionId, updates) {
    try {
      logger.debug(`${updates.length} contact updates for ${sessionId}`)
      
      // Import contact manager if available
      const { getContactManager } = await import('../contacts/index.js').catch(() => ({}))
      
      if (getContactManager) {
        const contactManager = getContactManager()
        
        for (const update of updates) {
          try {
            // Update contact information
            await contactManager.updateContact(sessionId, {
              jid: update.id,
              name: update.name,
              notify: update.notify,
              verifiedName: update.verifiedName
            })
          } catch (error) {
            logger.error(`Failed to update contact ${update.id}:`, error)
          }
        }
      }
    } catch (error) {
      logger.error(`Contacts update error:`, error)
    }
  }

  /**
   * Handle new chats
   */
  async handleChatsUpsert(sock, sessionId, chats) {
    try {
      logger.debug(`${chats.length} new chats for ${sessionId}`)
    } catch (error) {
      logger.error(`Chats upsert error:`, error)
    }
  }

  /**
   * Handle chat updates
   */
  async handleChatsUpdate(sock, sessionId, updates) {
    try {
      logger.debug(`${updates.length} chat updates for ${sessionId}`)
    } catch (error) {
      logger.error(`Chats update error:`, error)
    }
  }

  /**
   * Handle chat deletions
   */
  async handleChatsDelete(sock, sessionId, deletions) {
    try {
      logger.debug(`${deletions.length} chats deleted for ${sessionId}`)
    } catch (error) {
      logger.error(`Chats delete error:`, error)
    }
  }

  /**
   * Handle presence updates (online/offline/typing)
   */
  async handlePresenceUpdate(sock, sessionId, update) {
    try {
      // Usually just logged, not acted upon
      // logger.debug(`Presence update for ${sessionId}:`, update.id)
    } catch (error) {
      logger.error(`Presence update error:`, error)
    }
  }
}