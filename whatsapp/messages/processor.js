import { createComponentLogger } from '../../utils/logger.js'
import { MessageLogger } from './logger.js'
import { MessagePersistence } from './persistence.js'
import { MessageExtractor } from './extractor.js'

const logger = createComponentLogger('MESSAGE_PROCESSOR')

/**
 * MessageProcessor - Main message processing pipeline
 * Handles message processing, commands, anti-plugins
 */
export class MessageProcessor {
  constructor() {
    this.isInitialized = false
    this.messageLogger = new MessageLogger()
    this.messagePersistence = new MessagePersistence()
    this.messageExtractor = new MessageExtractor()
    
    // Plugin loader (lazy loaded)
    this.pluginLoader = null
    
    // Minimal stats tracking
    this.messageStats = {
      processed: 0,
      commands: 0,
      errors: 0
    }
  }

  /**
   * Initialize processor
   */
  async initialize() {
    if (!this.isInitialized) {
      // Lazy load plugin loader
      const pluginLoaderModule = await import('../../utils/plugin-loader.js')
      this.pluginLoader = pluginLoaderModule.default

      if (!this.pluginLoader.isInitialized) {
        await this.pluginLoader.loadPlugins()
      }

      this.isInitialized = true
      logger.info('Message processor initialized')
    }
  }

  /**
   * Process message through pipeline
   */
  async processMessage(sock, sessionId, m, prefix) {
    try {
      await this.initialize()

      // Validate message
      if (!m || !m.message) {
        return { processed: false, error: 'Invalid message object' }
      }

      // Get session context
      m.sessionContext = this._getSessionContext(sessionId)
      m.sessionId = sessionId
      m.prefix = prefix

      // Extract contact info
      await this._extractContactInfo(sock, m)

      // Extract quoted message
      m.quoted = this.messageExtractor.extractQuotedMessage(m)

      // Persist message to database
      await this.messagePersistence.persistMessage(sessionId, sock, m)

      // Set admin status
      await this._setAdminStatus(sock, m)

      // Process anti-plugins first (before command processing)
      await this._processAntiPlugins(sock, sessionId, m)

      if (m._wasDeletedByAntiPlugin) {
        await this.messageLogger.logEnhancedMessageEntry(sock, sessionId, m)
        return { processed: true, deletedByAntiPlugin: true }
      }

      // Extract message body
      if (!m.body) {
        m.body = this.messageExtractor.extractMessageBody(m)
      }

      // Determine if it's a command
      const isCommand = m.body && m.body.startsWith(prefix)
      m.isCommand = isCommand

      if (isCommand) {
        this._parseCommand(m, prefix)
      }

      // Log message
      await this.messageLogger.logEnhancedMessageEntry(sock, sessionId, m)

      // Handle interactive responses
      if (m.message?.listResponseMessage) {
        return await this._handleListResponse(sock, sessionId, m, prefix)
      }

      if (m.message?.interactiveResponseMessage || 
          m.message?.templateButtonReplyMessage || 
          m.message?.buttonsResponseMessage) {
        return await this._handleInteractiveResponse(sock, sessionId, m, prefix)
      }

      // Execute command if it's a command
      if (m.isCommand && m.body && !m._wasDeletedByAntiPlugin) {
        this.messageStats.commands++
        return await this._handleCommand(sock, sessionId, m)
      }

      // Process non-command messages through anti-plugins
      if (!m.isCommand && !m._wasDeletedByAntiPlugin && m.body && m.body.trim()) {
        await this._processAntiPluginMessages(sock, sessionId, m)
        
        if (m._wasDeletedByAntiPlugin) {
          return { processed: true, deletedByAntiPlugin: true }
        }
      }

      // Process game messages
      if (!m.isCommand && !m._wasDeletedByAntiPlugin && m.body && m.body.trim()) {
        const gameResult = await this._handleGameMessage(sock, sessionId, m)
        if (gameResult) {
          return gameResult
        }
      }

      this.messageStats.processed++
      return { processed: true }

    } catch (error) {
      logger.error('Error processing message:', error)
      this.messageStats.errors++
      return { error: error.message }
    }
  }

  /**
   * Get session context
   * @private
   */
  _getSessionContext(sessionId) {
    const sessionIdMatch = sessionId.match(/session_(-?\d+)/)
    
    if (sessionIdMatch) {
      const telegramId = parseInt(sessionIdMatch[1])
      return {
        telegram_id: telegramId,
        session_id: sessionId,
        isWebSession: telegramId < 0,
        id: telegramId
      }
    }

    return {
      telegram_id: 'Unknown',
      session_id: sessionId,
      id: null
    }
  }

  /**
   * Extract contact info (push name)
   * @private
   */
  async _extractContactInfo(sock, m) {
    try {
      const { getContactResolver } = await import('../contacts/index.js')
      const resolver = getContactResolver()
      await resolver.extractPushName(sock, m)
    } catch (error) {
      logger.error('Error extracting contact info:', error)
      m.pushName = 'Unknown'
    }
  }

  /**
   * Set admin status for message
   * @private
   */
  async _setAdminStatus(sock, m) {
    try {
      // Private chats: both are admins
      if (!m.isGroup) {
        m.isAdmin = true
        m.isBotAdmin = true
        m.isCreator = this._checkIsBotOwner(sock, m.sender)
        return
      }

      // Group chats: check admin status
      const { isGroupAdmin, isBotAdmin } = await import('../groups/index.js')
      
      m.isAdmin = await isGroupAdmin(sock, m.chat, m.sender)
      m.isBotAdmin = await isBotAdmin(sock, m.chat)
      m.isCreator = this._checkIsBotOwner(sock, m.sender)

      // Get group metadata for reference
      const { getGroupMetadataManager } = await import('../groups/index.js')
      const metadataManager = getGroupMetadataManager()
      m.groupMetadata = await metadataManager.getMetadata(sock, m.chat)
      m.participants = m.groupMetadata?.participants || []

    } catch (error) {
      logger.error('Error setting admin status:', error)
      m.isAdmin = false
      m.isBotAdmin = false
      m.isCreator = this._checkIsBotOwner(sock, m.sender)
    }
  }

  /**
   * Check if user is bot owner
   * @private
   */
  _checkIsBotOwner(sock, userJid) {
    try {
      if (!sock?.user?.id || !userJid) {
        return false
      }

      const botNumber = sock.user.id.split(':')[0]
      const userNumber = userJid.split('@')[0]

      return botNumber === userNumber
    } catch (error) {
      return false
    }
  }

  /**
   * Parse command from message
   * @private
   */
  _parseCommand(m, prefix) {
    const commandText = m.body.slice(prefix.length).trim()
    const [cmd, ...args] = commandText.split(/\s+/)

    m.command = {
      name: cmd.toLowerCase(),
      args: args,
      raw: commandText,
      fullText: m.body
    }
  }

  /**
   * Process anti-plugins
   * @private
   */
  async _processAntiPlugins(sock, sessionId, m) {
    try {
      if (!this.pluginLoader) return

      await this.pluginLoader.processAntiPlugins(sock, sessionId, m)
    } catch (error) {
      logger.error('Error processing anti-plugins:', error)
    }
  }

  /**
   * Process anti-plugin messages (non-commands)
   * @private
   */
  async _processAntiPluginMessages(sock, sessionId, m) {
    try {
      if (!this.pluginLoader) return

      for (const plugin of this.pluginLoader.antiPlugins.values()) {
        try {
          let enabled = true
          if (typeof plugin.isEnabled === 'function') {
            enabled = await plugin.isEnabled(m.chat)
          }
          if (!enabled) continue

          let shouldProcess = true
          if (typeof plugin.shouldProcess === 'function') {
            shouldProcess = await plugin.shouldProcess(m)
          }
          if (!shouldProcess) continue

          if (typeof plugin.processMessage === 'function') {
            await plugin.processMessage(sock, sessionId, m)
            if (m._wasDeletedByAntiPlugin) break
          }
        } catch (pluginError) {
          logger.error(`Error in anti-plugin ${plugin.name || 'unknown'}:`, pluginError)
        }
      }
    } catch (error) {
      logger.error('Error processing anti-plugin messages:', error)
    }
  }

  /**
   * Handle game messages
   * @private
   */
  async _handleGameMessage(sock, sessionId, m) {
    try {
      const { gameManager } = await import('../../lib/game managers/game-manager.js')
      
      if (!m.body || m.body.startsWith('.')) return null
      if (!m.chat) return null

      const result = await gameManager.processGameMessage(sock, m.chat, m.sender, m.body)
      
      if (result && result.success !== false) {
        return { processed: true, gameMessage: true, result }
      }

      return null
    } catch (error) {
      logger.error('Error handling game message:', error)
      return null
    }
  }

  /**
   * Handle interactive response (buttons, lists)
   * @private
   */
  async _handleInteractiveResponse(sock, sessionId, m, prefix) {
    try {
      let selectedCommand = null
      
      if (m.message?.interactiveResponseMessage?.nativeFlowResponseMessage) {
        const flowResponse = m.message.interactiveResponseMessage.nativeFlowResponseMessage
        const paramsJson = flowResponse.paramsJson

        if (paramsJson) {
          try {
            const params = JSON.parse(paramsJson)
            selectedCommand = params.id
          } catch (parseError) {
            // Silent fail
          }
        }
      } else if (m.message?.templateButtonReplyMessage) {
        selectedCommand = m.message.templateButtonReplyMessage.selectedId
      } else if (m.message?.buttonsResponseMessage) {
        selectedCommand = m.message.buttonsResponseMessage.selectedButtonId
      } else if (m.message?.interactiveResponseMessage) {
        const response = m.message.interactiveResponseMessage
        selectedCommand = response.selectedButtonId || response.selectedId || response.body?.text
      }

      if (selectedCommand) {
        if (selectedCommand.startsWith(prefix)) {
          m.body = selectedCommand
          m.isCommand = true
          this._parseCommand(m, prefix)
          return await this._handleCommand(sock, sessionId, m)
        } else {
          return { processed: true, buttonResponse: selectedCommand }
        }
      }

      return { processed: true, interactiveResponse: true }
    } catch (error) {
      logger.error('Error handling interactive response:', error)
      return { processed: false, error: error.message }
    }
  }

  /**
   * Handle list response
   * @private
   */
  async _handleListResponse(sock, sessionId, m, prefix) {
    const selectedRowId = m.message.listResponseMessage.singleSelectReply.selectedRowId

    if (selectedRowId?.startsWith(prefix)) {
      m.body = selectedRowId
      m.isCommand = true
      this._parseCommand(m, prefix)
      return await this._handleCommand(sock, sessionId, m)
    }

    return { processed: true, listResponse: true }
  }

  /**
   * Handle command execution
   * @private
   */
  async _handleCommand(sock, sessionId, m) {
    const command = m.command.name

    try {
      if (!this.pluginLoader) {
        throw new Error('Plugin loader not initialized')
      }

      const exec = await this.pluginLoader.executeCommand(
        sock,
        sessionId,
        command,
        m.command.args,
        m
      )

      if (exec?.ignore) {
        return { processed: true, ignored: true }
      } else if (exec?.success) {
        await this._sendCommandResponse(sock, m, exec.result || exec)
      }
    } catch (error) {
      logger.error(`Error executing command ${command}:`, error)
    }

    return { processed: true, commandExecuted: true }
  }

  /**
   * Send command response
   * @private
   */
  async _sendCommandResponse(sock, m, result) {
    if (!result?.response) return

    const messageOptions = { quoted: m }

    if (result.mentions && Array.isArray(result.mentions)) {
      messageOptions.mentions = result.mentions
    }

    try {
      if (result.isList && result.response.sections) {
        await sock.sendMessage(m.chat, result.response, messageOptions)
      } else if (result.media) {
        const mediaMessage = {
          [result.mediaType || 'image']: result.media,
          caption: result.response
        }
        await sock.sendMessage(m.chat, mediaMessage, messageOptions)
      } else {
        await sock.sendMessage(m.chat, { text: result.response }, messageOptions)
      }
    } catch (error) {
      logger.error('Failed to send response:', error)
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      isInitialized: this.isInitialized,
      messageStats: { ...this.messageStats },
      pluginStats: this.pluginLoader?.getPluginStats() || {}
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.messageStats = {
      processed: 0,
      commands: 0,
      errors: 0
    }
  }

  /**
   * Perform maintenance
   */
  performMaintenance() {
    // Clean up any temporary data if needed
    logger.debug('Message processor maintenance performed')
  }
}