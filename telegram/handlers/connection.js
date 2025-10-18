/**
 * Connection Handler
 * Manages WhatsApp connection flow via Telegram
 */

import { createComponentLogger } from '../../utils/logger.js'
import { TelegramKeyboards, TelegramMessages } from '../ui/index.js'
import { validatePhone } from '../utils/index.js'

const logger = createComponentLogger('CONNECTION_HANDLER')

export class ConnectionHandler {
  constructor(bot) {
    this.bot = bot
    this.pendingConnections = new Map()
    this.sessionManager = null  // Will be injected after WhatsApp module initializes
    this.storage = null          // Will be injected after WhatsApp module initializes
  }

  /**
   * Ensure dependencies are loaded (lazy loading)
   * @private
   */
  async _ensureDependencies() {
    // If already injected, skip
    if (this.sessionManager && this.storage) {
      return
    }

    // Fallback: lazy load if not injected (shouldn't happen in production)
    logger.warn('Session manager not injected, using lazy loading fallback')
    const { getSessionManager } = await import('../../whatsapp/index.js')
    this.sessionManager = getSessionManager()
    this.storage = this.sessionManager.storage
  }

/**
 * Handle initial connection request
 */
async handleConnect(chatId, userId, userInfo) {
  try {
    // Ensure dependencies are loaded FIRST
    await this._ensureDependencies()
    
    const sessionId = `session_${userId}`
    
    // Now this will work because sessionManager is loaded
    const isReallyConnected = await this.sessionManager.isReallyConnected(sessionId)
    
    if (isReallyConnected) {
      const session = await this.storage.getSession(sessionId)
      return this.bot.sendMessage(
        chatId,
        TelegramMessages.alreadyConnected(session.phoneNumber),
        { 
          parse_mode: 'Markdown',
          reply_markup: TelegramKeyboards.mainMenu() 
        }
      )
    }

    // Start connection flow
    this.pendingConnections.set(userId, { 
      step: 'phone',
      timestamp: Date.now(),
      userInfo
    })
    
    await this.bot.sendMessage(
      chatId,
      TelegramMessages.askPhoneNumber(),
      { 
        parse_mode: 'Markdown',
        reply_markup: TelegramKeyboards.connecting()
      }
    )

    // Auto-cleanup after 5 minutes
    setTimeout(() => {
      if (this.pendingConnections.has(userId)) {
        this.pendingConnections.delete(userId)
      }
    }, 300000)

  } catch (error) {
    logger.error('Connection initiation error:', error)
    await this.bot.sendMessage(chatId, TelegramMessages.error('Failed to start connection'))
  }
}

  /**
   * Handle phone number input
   */
  async handlePhoneNumber(msg) {
    const userId = msg.from.id
    const chatId = msg.chat.id
    const phone = msg.text.trim()

    const pending = this.pendingConnections.get(userId)
    if (!pending || pending.step !== 'phone') {
      return false
    }

    try {
      await this._ensureDependencies()

      // Validate phone
      const validation = validatePhone(phone)
      if (!validation.isValid) {
        await this.bot.sendMessage(
          chatId, 
          TelegramMessages.invalidPhone(),
          {
            parse_mode: 'Markdown',
            reply_markup: TelegramKeyboards.connecting()
          }
        )
        return true
      }

      // Update state
      this.pendingConnections.set(userId, { 
        step: 'generating',
        phone: validation.formatted,
        userInfo: pending.userInfo,
        timestamp: Date.now()
      })

      // Show loading
      const loadingMsg = await this.bot.sendMessage(
        chatId,
        TelegramMessages.connecting(),
        { parse_mode: 'Markdown' }
      )

      // Generate code
      const result = await this._generatePairingCode(userId, validation.formatted, pending.userInfo)
      
      // Delete loading
      await this.bot.deleteMessage(chatId, loadingMsg.message_id)

      if (result.success) {
        await this.bot.sendMessage(
          chatId,
          TelegramMessages.showPairingCode(result.code),
          { 
            parse_mode: 'Markdown',
            reply_markup: TelegramKeyboards.codeOptions(result.code)
          }
        )

        // Update state
        this.pendingConnections.set(userId, { 
          step: 'waiting_connection',
          phone: validation.formatted,
          code: result.code,
          userInfo: pending.userInfo,
          timestamp: Date.now()
        })

        // Cleanup after 2 minutes
        setTimeout(() => {
          if (this.pendingConnections.get(userId)?.code === result.code) {
            this.pendingConnections.delete(userId)
          }
        }, 120000)

      } else {
        await this.bot.sendMessage(
          chatId, 
          TelegramMessages.error(result.error || 'Could not generate pairing code')
        )
        this.pendingConnections.delete(userId)
      }

      return true

    } catch (error) {
      logger.error('Phone number handling error:', error)
      await this.bot.sendMessage(chatId, TelegramMessages.error('Failed to process phone number'))
      this.pendingConnections.delete(userId)
      return true
    }
  }

  /**
   * Generate pairing code
   * @private
   */
  async _generatePairingCode(userId, phoneNumber, userInfo) {
    try {
      await this._ensureDependencies()
      
      const sessionId = `session_${userId}`
      logger.info(`Generating pairing code for ${phoneNumber} (user: ${userId})`)

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          logger.error(`Pairing timeout for ${userId}`)
          resolve({ success: false, error: 'Connection timeout. Please try again.' })
        }, 60000)

        this.sessionManager.createSession(userId, phoneNumber, {
          
          onPairingCode: (code) => {
            clearTimeout(timeout)
            logger.info(`Pairing code generated for ${userId}: ${code}`)
            resolve({ success: true, code })
          },
          
          onConnected: async (socket) => {
            clearTimeout(timeout)
            logger.info(`WhatsApp connected for ${userId}: ${phoneNumber}`)
            
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            if (socket?.user && socket.readyState === socket.ws?.OPEN) {
              await this._handleConnectionSuccess(sessionId, phoneNumber, userId)
            } else {
              resolve({ success: false, error: 'Connection unstable' })
            }
          },
          
          onError: (error) => {
            clearTimeout(timeout)
            logger.error(`Session error for ${userId}:`, error)
            resolve({ success: false, error: error.message || 'Connection failed' })
          }
          
        }, false, 'telegram', true) // allowPairing = true
        .catch(error => {
          clearTimeout(timeout)
          logger.error(`Session creation failed for ${userId}:`, error)
          resolve({ success: false, error: error.message || 'Failed to create session' })
        })
      })

    } catch (error) {
      logger.error('Pairing code generation error:', error)
      return { success: false, error: error.message || 'Unexpected error' }
    }
  }

  /**
   * Handle connection success
   * @private
   */
  async _handleConnectionSuccess(sessionId, phoneNumber, userId) {
    try {
      logger.info(`Connection successful for ${userId}: ${phoneNumber}`)
      this.pendingConnections.delete(userId)

      await this.bot.sendMessage(
        userId, 
        TelegramMessages.connected(phoneNumber),
        {
          parse_mode: 'Markdown',
          reply_markup: TelegramKeyboards.backButton('main_menu')
        }
      )
    } catch (error) {
      logger.error('Connection success handler error:', error)
    }
  }

  /**
   * Handle disconnect request
   */
  async handleDisconnect(chatId, userId) {
    try {
      await this._ensureDependencies()
      
      const session = await this.storage.getSession(`session_${userId}`)
      
      if (!session || !session.isConnected) {
        return this.bot.sendMessage(
          chatId,
          TelegramMessages.notConnected(),
          { 
            parse_mode: 'Markdown',
            reply_markup: TelegramKeyboards.mainMenu() 
          }
        )
      }

      await this.bot.sendMessage(
        chatId,
        TelegramMessages.confirmDisconnect(session.phoneNumber),
        { 
          parse_mode: 'Markdown',
          reply_markup: TelegramKeyboards.confirmDisconnect()
        }
      )
    } catch (error) {
      logger.error('Disconnect request error:', error)
      await this.bot.sendMessage(chatId, TelegramMessages.error('Failed to disconnect'))
    }
  }

  /**
   * Confirm disconnect
   */
  async confirmDisconnect(chatId, userId) {
    let processingMsg
    try {
      await this._ensureDependencies()
      
      const session = await this.storage.getSession(`session_${userId}`)
      
      processingMsg = await this.bot.sendMessage(
        chatId, 
        TelegramMessages.disconnecting(session?.phoneNumber || 'WhatsApp')
      )

      const sessionId = `session_${userId}`
      await this.sessionManager.performCompleteUserCleanup(sessionId)

      await this.bot.deleteMessage(chatId, processingMsg.message_id)

      await this.bot.sendMessage(
        chatId,
        TelegramMessages.disconnected(),
        { 
          parse_mode: 'Markdown',
          reply_markup: TelegramKeyboards.mainMenu() 
        }
      )

      logger.info(`User ${userId} disconnected successfully`)
    } catch (error) {
      logger.error('Disconnect error:', error)
      if (processingMsg) {
        await this.bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {})
      }
      await this.bot.sendMessage(chatId, TelegramMessages.error('Failed to disconnect'))
    }
  }

  /**
   * Handle status check
   */
  async handleStatus(chatId, userId) {
    try {
      await this._ensureDependencies()
      
      const sessionId = `session_${userId}`
      const isConnected = await this.sessionManager.isReallyConnected(sessionId)
      const session = await this.storage.getSession(sessionId)
      
      await this.bot.sendMessage(
        chatId,
        TelegramMessages.status(isConnected, session?.phoneNumber),
        { 
          parse_mode: 'Markdown',
          reply_markup: TelegramKeyboards.mainMenu()
        }
      )
    } catch (error) {
      logger.error('Status check error:', error)
      await this.bot.sendMessage(chatId, TelegramMessages.error('Failed to check status'))
    }
  }

  /**
   * Check if user has pending connection
   */
  isPendingConnection(userId) {
    return this.pendingConnections.has(userId)
  }

  /**
   * Get pending connection info
   */
  getPendingConnection(userId) {
    return this.pendingConnections.get(userId)
  }

  /**
   * Clear pending connection
   */
  clearPending(userId) {
    this.pendingConnections.delete(userId)
  }

  /**
   * Get all pending connections (for admin/debugging)
   */
  getAllPending() {
    return Array.from(this.pendingConnections.entries())
  }
}