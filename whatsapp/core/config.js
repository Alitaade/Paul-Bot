import pino from 'pino'
import { makeWASocket, DisconnectReason, Browsers } from '@whiskeysockets/baileys'
import { createComponentLogger } from '../../utils/logger.js'

const logger = createComponentLogger('BAILEYS_CONFIG')

/**
 * Import base baileys config from existing file
 */
import { baileysConfig as baseBaileysConfig } from '../../config/baileys.js'

/**
 * Base Baileys configuration (from existing config)
 */
export const baileysConfig = baseBaileysConfig

/**
 * Create a Baileys WhatsApp socket with custom config
 */
export function createBaileysSocket(authState, customConfig = {}) {
  try {
    const config = {
      ...baileysConfig,
      auth: authState,
      ...customConfig
    }

    const sock = makeWASocket(config)
    
    // Setup default socket properties
    setupSocketDefaults(sock)
    
    return sock

  } catch (error) {
    logger.error('Failed to create Baileys socket:', error)
    throw error
  }
}

/**
 * Setup default properties and utilities on socket
 */
export function setupSocketDefaults(sock) {
  try {
    // Set max listeners to prevent memory leak warnings
    if (sock.ev && typeof sock.ev.setMaxListeners === 'function') {
      sock.ev.setMaxListeners(100)
    }

    // Add session tracking properties
    sock.sessionId = null
    sock.eventHandlersSetup = false
    sock.connectionCallbacks = null

    logger.debug('Socket defaults configured')

  } catch (error) {
    logger.error('Failed to setup socket defaults:', error)
  }
}

/**
 * Get Baileys socket configuration
 */
export function getBaileysConfig() {
  return { ...baileysConfig }
}

/**
 * Create a socket with specific auth method
 */
export function getBaileysSocket(authState, options = {}) {
  return createBaileysSocket(authState, options)
}

/**
 * Export disconnect reasons and browsers
 */
export { DisconnectReason, Browsers } from '@whiskeysockets/baileys'