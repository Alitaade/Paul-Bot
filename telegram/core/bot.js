/**
 * Telegram Bot - Main Bot Class
 * Handles bot initialization, polling, and message routing
 */

import TelegramBotAPI from 'node-telegram-bot-api'
import { createComponentLogger } from '../../utils/logger.js'
import { telegramConfig, validateConfig } from './index.js'

const logger = createComponentLogger('TELEGRAM_BOT')

export class TelegramBot {
  constructor(token, options = {}) {
    this.token = token || telegramConfig.token
    this.options = options
    this.bot = null
    this.isRunning = false
    this.userStates = new Map()
    
    // Handlers (lazy loaded)
    this.connectionHandler = null
    this.adminHandler = null
    this.commandHandler = null
    
    // Middleware
    this.authMiddleware = null
    this.adminMiddleware = null
  }

  /**
   * Initialize the bot
   */
  async initialize() {
    try {
      // Validate configuration
      validateConfig()
      
      logger.info('Initializing Telegram bot...')

      // Create bot instance
      this.bot = new TelegramBotAPI(this.token, { polling: false })
      
      // Initialize handlers
      await this._initializeHandlers()
      
      // Initialize middleware
      await this._initializeMiddleware()
      
      // Clear webhook and start polling
      await this._clearWebhookAndStartPolling()
      
      // Set bot commands
      await this._setBotCommands()
      
      // Setup event listeners
      this._setupEventListeners()
      
      this.isRunning = true
      logger.info('Telegram bot initialized successfully')
      return true
      
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error)
      throw error
    }
  }

  /**
   * Initialize handlers
   * @private
   */
  async _initializeHandlers() {
    const { ConnectionHandler, AdminHandler, CommandHandler } = await import('../handlers/index.js')
    
    this.connectionHandler = new ConnectionHandler(this.bot)
    this.adminHandler = new AdminHandler(this.bot)
    this.commandHandler = new CommandHandler(this.bot, this.connectionHandler, this.adminHandler)
    
    logger.info('Handlers initialized')
  }

  /**
   * Initialize middleware
   * @private
   */
  async _initializeMiddleware() {
    const { AuthMiddleware, AdminMiddleware } = await import('../middleware/index.js')
    
    this.authMiddleware = new AuthMiddleware()
    this.adminMiddleware = new AdminMiddleware()
    
    logger.info('Middleware initialized')
  }

  /**
   * Clear webhook and start polling
   * @private
   */
  async _clearWebhookAndStartPolling() {
    try {
      await this.bot.setWebHook('')
      logger.info('Webhook cleared successfully')
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      await this.bot.startPolling({ restart: true })
      logger.info('Polling started successfully')
      
    } catch (error) {
      logger.warn('Standard webhook clearing failed, trying alternative method:', error.message)
      
      try {
        this.bot = new TelegramBotAPI(this.token, { polling: true })
        logger.info('Bot recreated with direct polling')
        
      } catch (pollingError) {
        logger.error('All polling methods failed:', pollingError.message)
        throw pollingError
      }
    }
  }

  /**
   * Set bot commands
   * @private
   */
  async _setBotCommands() {
    try {
      const commands = [
        { command: 'start', description: 'Start the bot and show main menu' },
        { command: 'connect', description: 'Connect your WhatsApp account' },
        { command: 'status', description: 'Check connection status' },
        { command: 'disconnect', description: 'Disconnect WhatsApp' },
        { command: 'admin', description: 'Admin panel (admins only)' },
        { command: 'help', description: 'Show help information' }
      ]
      
      await this.bot.setMyCommands(commands)
      logger.info('Bot commands set successfully')
      
    } catch (error) {
      logger.warn('Failed to set bot commands:', error.message)
    }
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEventListeners() {
    // Text messages
    this.bot.on('message', async (msg) => {
      try {
        if (!msg.text) return
        
        const chatId = msg.chat.id
        const userId = msg.from.id
        const text = msg.text.trim()
        
        logger.info(`Message from ${userId}: ${text}`)
        
        // Authenticate user
        await this.authMiddleware.authenticateUser(userId, msg.from)
        
        // Handle admin password input first
        if (this.adminHandler.isPendingInput(userId)) {
          const handled = await this.adminHandler.processInput(msg)
          if (handled) return
        }
        
        // Handle connection phone input
        if (this.connectionHandler.isPendingConnection(userId)) {
          const handled = await this.connectionHandler.handlePhoneNumber(msg)
          if (handled) return
        }
        
        // Handle commands
        if (text.startsWith('/')) {
          await this.commandHandler.handleCommand(msg)
          return
        }
        
        // Default: show main menu
        await this.commandHandler.showMainMenu(chatId, null, msg.from)
        
      } catch (error) {
        logger.error('Error handling message:', error)
        await this._sendErrorMessage(msg.chat.id)
      }
    })

    // Callback queries (button presses)
    this.bot.on('callback_query', async (query) => {
      try {
        await this.bot.answerCallbackQuery(query.id)
        
        const data = query.data
        const userId = query.from.id
        
        // Authenticate user
        await this.authMiddleware.authenticateUser(userId, query.from)
        
        // Route to appropriate handler
        if (data.startsWith('admin_')) {
          await this.adminHandler.handleAction(query)
        } else {
          await this.commandHandler.handleCallback(query)
        }
        
      } catch (error) {
        logger.error('Error handling callback query:', error)
        try {
          await this.bot.answerCallbackQuery(query.id, {
            text: 'An error occurred',
            show_alert: true
          })
        } catch (answerError) {
          logger.error('Failed to answer callback query:', answerError)
        }
      }
    })

    // Polling errors
    this.bot.on('polling_error', (error) => {
      logger.error('Polling error:', error.message)
      this._handlePollingError(error)
    })

    this.bot.on('error', (error) => {
      logger.error('Bot error:', error)
    })
    
    logger.info('Event listeners setup complete')
  }


  

  /**
   * Handle polling errors
   * @private
   */
  _handlePollingError(error) {
    setTimeout(async () => {
      try {
        if (this.bot && this.isRunning) {
          logger.info('Attempting to restart polling...')
          await this.bot.stopPolling()
          await new Promise(resolve => setTimeout(resolve, 2000))
          await this.bot.startPolling({ restart: true })
          logger.info('Polling restarted successfully')
        }
      } catch (restartError) {
        logger.error('Failed to restart polling:', restartError.message)
      }
    }, 5000)
  }

  /**
   * Send error message
   * @private
   */
  async _sendErrorMessage(chatId) {
    const { TelegramMessages, TelegramKeyboards } = await import('../utils/index.js')
    
    await this.bot.sendMessage(chatId, TelegramMessages.error(), {
      reply_markup: TelegramKeyboards.mainMenu()
    })
  }

  /**
   * Send message (public API)
   */
  async sendMessage(chatId, text, options = {}) {
    try {
      return await this.bot.sendMessage(chatId, text, options)
    } catch (error) {
      logger.error('Failed to send message:', error)
      throw error
    }
  }

  /**
   * Delete message (public API)
   */
  async deleteMessage(chatId, messageId) {
    try {
      await this.bot.deleteMessage(chatId, messageId)
    } catch (error) {
      logger.debug('Could not delete message:', error.message)
    }
  }

  /**
   * Edit message text (public API)
   */
  async editMessageText(text, options) {
    try {
      return await this.bot.editMessageText(text, options)
    } catch (error) {
      logger.error('Failed to edit message:', error)
      throw error
    }
  }

  /**
   * Get bot statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      activeStates: this.userStates.size,
      hasConnectionHandler: !!this.connectionHandler,
      hasAdminHandler: !!this.adminHandler,
      hasCommandHandler: !!this.commandHandler
    }
  }

  /**
   * Get user state
   */
  getUserState(userId) {
    return this.userStates.get(userId)
  }

  /**
   * Set user state
   */
  setUserState(userId, state) {
    this.userStates.set(userId, state)
  }

  /**
   * Clear user state
   */
  clearUserState(userId) {
    this.userStates.delete(userId)
    
    if (this.connectionHandler) {
      this.connectionHandler.clearPending(userId)
    }
    if (this.adminHandler) {
      this.adminHandler.clearPending(userId)
    }
  }

  /**
   * Stop the bot
   */
  async stop() {
    try {
      this.isRunning = false
      if (this.bot) {
        await this.bot.stopPolling()
        logger.info('Telegram bot stopped successfully')
      }
    } catch (error) {
      logger.error('Error stopping bot:', error)
    }
  }

  /**
   * Check if bot is initialized
   */
  get isInitialized() {
    return this.bot !== null && this.isRunning
  }
}