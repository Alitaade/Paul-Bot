import { createComponentLogger } from '../../utils/logger.js'

const logger = createComponentLogger('PAIRING')

/**
 * Handle WhatsApp pairing code generation
 */
export async function handlePairing(sock, sessionId, phoneNumber, pairingState, callbacks) {
  try {
    if (!phoneNumber) {
      logger.warn(`No phone number provided for pairing ${sessionId}`)
      return
    }

    // Check if pairing already exists and is active
    const existingPair = pairingState.get(sessionId)
    const now = Date.now()
    
    if (existingPair && now < existingPair.expiresAt && existingPair.active) {
      if (callbacks?.onPairingCode) {
        await callbacks.onPairingCode(existingPair.code)
      }
      return
    }

    // Format phone number - remove all non-numeric characters
    const formattedPhone = phoneNumber.replace(/[^0-9]/g, '')
    logger.info(`Pairing: Original: ${phoneNumber}, Formatted: ${formattedPhone}`)

    // Wait before requesting pairing code
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Request pairing code
    const customPairingCode = 'PAULCODE'
    const code = await sock.requestPairingCode(formattedPhone, customPairingCode)
    const formattedCode = code.match(/.{1,4}/g)?.join('-') || code

    // Store pairing state
    pairingState.set(sessionId, {
      code: formattedCode,
      expiresAt: Date.now() + 6 * 60 * 1000, // 5 minutes
      active: true,
      phoneNumber: formattedPhone
    })

    logger.info(`Pairing code generated for ${sessionId}: ${formattedCode}`)

    // Invoke callback
    if (callbacks?.onPairingCode) {
      await callbacks.onPairingCode(formattedCode)
    }

  } catch (error) {
    logger.error(`Pairing error for ${sessionId}:`, error)
    
    if (callbacks?.onError) {
      callbacks.onError(error)
    }
  }
}

/**
 * Mark pairing restart as handled
 */
export function markPairingRestartHandled(pairingState, sessionId) {
  const pair = pairingState.get(sessionId)
  if (pair) {
    pairingState.set(sessionId, { ...pair, active: false })
  }
}

/**
 * Clear pairing state
 */
export function clearPairing(pairingState, sessionId) {
  pairingState.delete(sessionId)
  logger.debug(`Pairing state cleared for ${sessionId}`)
}

/**
 * Check if pairing is active
 */
export function isPairingActive(pairingState, sessionId) {
  const pair = pairingState.get(sessionId)
  if (!pair) return false

  const now = Date.now()
  return pair.active && now < pair.expiresAt
}

/**
 * Get pairing code
 */
export function getPairingCode(pairingState, sessionId) {
  const pair = pairingState.get(sessionId)
  if (!pair) return null

  const now = Date.now()
  if (now >= pair.expiresAt) {
    pairingState.delete(sessionId)
    return null
  }

  return pair.code
}