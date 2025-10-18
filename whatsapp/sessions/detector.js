import { createComponentLogger } from '../../utils/logger.js'

const logger = createComponentLogger('WEB_SESSION_DETECTOR')

/**
 * WebSessionDetector - Detects and initializes web sessions
 * Polls database for undetected web sessions and initializes them
 */
export class WebSessionDetector {
  constructor(storage, sessionManager) {
    this.storage = storage
    this.sessionManager = sessionManager
    this.pollingInterval = null
    this.running = false
    this.processedSessions = new Set()
    this.pollIntervalMs = 3000 // 3 seconds
  }

  /**
   * Start detection polling
   */
  start() {
    if (this.running) {
      logger.warn('Web session detector already running')
      return
    }

    this.running = true
    logger.info('Starting web session detector')

    this.pollingInterval = setInterval(() => {
      this._pollForWebSessions().catch(error => {
        logger.error('Polling error:', error)
      })
    }, this.pollIntervalMs)
  }

  /**
   * Stop detection polling
   */
  stop() {
    if (!this.running) {
      return
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    this.running = false
    this.processedSessions.clear()
    
    logger.info('Web session detector stopped')
  }

  /**
   * Poll for undetected web sessions
   * @private
   */
  async _pollForWebSessions() {
    try {
      const undetectedSessions = await this.storage.getUndetectedWebSessions()
      
      if (undetectedSessions.length === 0) {
        return
      }

      logger.debug(`Found ${undetectedSessions.length} undetected web sessions`)

      for (const sessionData of undetectedSessions) {
        await this._processWebSession(sessionData)
      }

    } catch (error) {
      logger.error('Error polling for web sessions:', error)
    }
  }

  /**
   * Process individual web session
   * @private
   */
  async _processWebSession(sessionData) {
    const { sessionId } = sessionData

    try {
      // Skip if already processed
      if (this.processedSessions.has(sessionId)) {
        return
      }

      // Check if session already has active socket
      if (this.sessionManager.activeSockets.has(sessionId)) {
        await this.storage.markSessionAsDetected(sessionId)
        this.processedSessions.add(sessionId)
        logger.info(`Session ${sessionId} already active, marked as detected`)
        return
      }

      // Mark as being processed
      this.processedSessions.add(sessionId)

      logger.info(`Initializing web session: ${sessionId}`)

      // Create web session
      const success = await this.sessionManager.createWebSession(sessionData)

      if (!success) {
        // Remove from processed set to retry later
        this.processedSessions.delete(sessionId)
        logger.warn(`Failed to initialize web session: ${sessionId}`)
      } else {
        logger.info(`Successfully initialized web session: ${sessionId}`)
      }

    } catch (error) {
      logger.error(`Error processing web session ${sessionId}:`, error)
      // Remove from processed set to retry later
      this.processedSessions.delete(sessionId)
    }
  }

  /**
   * Check if detector is running
   */
  isRunning() {
    return this.running
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      running: this.running,
      processedSessions: this.processedSessions.size,
      pollInterval: this.pollIntervalMs
    }
  }

  /**
   * Manually trigger detection
   */
  async triggerDetection() {
    if (!this.running) {
      logger.warn('Detector not running, starting temporarily')
    }

    await this._pollForWebSessions()
  }

  /**
   * Reset processed sessions list
   */
  resetProcessed() {
    const count = this.processedSessions.size
    this.processedSessions.clear()
    logger.info(`Reset ${count} processed sessions`)
  }
}