/**
 * Web Session Storage - Dual Database Session Management
 * 
 * This class manages WhatsApp session data for the web interface across MongoDB and PostgreSQL.
 * It follows the same database structure as the Pterodactyl version but is optimized for web usage.
 * 
 * Database Structure:
 * - sessions (MongoDB): Session metadata, status, and operational data
 * - users (PostgreSQL): User records with session mapping, phone numbers, and auth data
 * - auth_baileys (MongoDB): Authentication data for WhatsApp connections
 * - web_users_auth (PostgreSQL): Password hashes for web user authentication
 * 
 * Key Features:
 * - Dual database support with intelligent failover
 * - Web user authentication with bcrypt password hashing
 * - Session lifecycle management for web interface
 * - Optimized for web performance with faster write buffering
 * - Clean separation between web users and telegram users
 */

import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { logger } from './logger.js'

export class SessionStorage {
  constructor() {
    // ================================
    // DATABASE CONNECTION PROPERTIES
    // ================================
    this.client = null                  // MongoDB client
    this.db = null                     // MongoDB database instance
    this.sessions = null               // MongoDB sessions collection
    this.isMongoConnected = false      // MongoDB connection status
    this.postgresPool = null           // PostgreSQL connection pool
    this.isPostgresConnected = false   // PostgreSQL connection status
    
    // ================================
    // PERFORMANCE & SECURITY
    // ================================
    this.encryptionKey = this._getEncryptionKey()  // Encryption key for sensitive data
    this.sessionCache = new Map()                  // In-memory session cache (faster for web)
    this.writeBuffer = new Map()                   // Write buffering for batch operations
    
    // ================================
    // WEB-SPECIFIC CONFIGURATION
    // ================================
    this.retryCount = 0               // Current retry attempt
    this.maxRetries = 2               // Lower retry count for web (faster failure)
    this.connectionTimeout = 8000     // Shorter timeout for web responsiveness
    this.writeBufferDelay = 200       // Faster writes for web interface
    
    // Initialize database connections
    this._initConnections()
  }

  // ================================
  // DATABASE CONNECTION MANAGEMENT
  // ================================

  /**
   * Initialize both database connections concurrently
   * Optimized for web interface with shorter timeouts
   */
  async _initConnections() {
    const connectionPromises = [
      this._initMongoDB(),
      this._initPostgres()
    ]
    
    await Promise.allSettled(connectionPromises)
    
    if (!this.isMongoConnected && !this.isPostgresConnected) {
      logger.error('Both database connections failed - web storage will operate in limited mode')
    }
  }

  /**
   * Initialize MongoDB connection with web-optimized settings
   */
  async _initMongoDB() {
    try {
      const mongoUrl = process.env.MONGODB_URI || 
        'mongodb+srv://Paul112210:qahmr6jy2b4uzBMf@main.uwa6va6.mongodb.net/?retryWrites=true&w=majority&appName=Main'
      
      // Web-optimized connection options
      const connectionOptions = {
        maxPoolSize: 5,                       // Smaller pool for web
        minPoolSize: 1,                       // Minimum connections
        maxIdleTimeMS: 30000,                 // Close idle connections faster
        serverSelectionTimeoutMS: this.connectionTimeout,
        socketTimeoutMS: 30000,
        connectTimeoutMS: this.connectionTimeout,
        retryWrites: true,
        heartbeatFrequencyMS: 30000
      }
      
      this.client = new MongoClient(mongoUrl, connectionOptions)
      
      // Connect with timeout protection
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('MongoDB connection timeout')), this.connectionTimeout)
        )
      ])
      
      // Test connection
      await this.client.db('admin').command({ ping: 1 })
      
      // Setup database and collections
      this.db = this.client.db()
      this.sessions = this.db.collection('sessions')
      
      // Create essential indexes
      await this._createMongoIndexes()
      
      this.isMongoConnected = true
      this.retryCount = 0
      logger.info('MongoDB connection established for web interface')
      
    } catch (error) {
      this.isMongoConnected = false
      logger.error(`Web MongoDB connection failed: ${error.message}`)
      
      // Retry logic with exponential backoff
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        const delay = Math.min(10000, 3000 * Math.pow(2, this.retryCount - 1))
        setTimeout(() => this._initMongoDB(), delay)
      }
    }
  }

  /**
   * Create MongoDB indexes optimized for web queries
   */
  async _createMongoIndexes() {
    try {
      const indexDefinitions = [
        { key: { sessionId: 1 }, name: 'web_sessionId_unique', unique: true },
        { key: { telegramId: 1 }, name: 'web_telegramId_1' },
        { key: { phoneNumber: 1 }, name: 'web_phoneNumber_1' },
        { key: { source: 1, isConnected: 1 }, name: 'web_source_connected_1' },
        { key: { updatedAt: -1 }, name: 'web_updatedAt_desc' }
      ]

      for (const indexDef of indexDefinitions) {
        try {
          await this.sessions.createIndex(indexDef.key, {
            name: indexDef.name,
            background: true,
            unique: indexDef.unique || false
          })
        } catch (error) {
          if (!error.message.includes('already exists') && !error.message.includes('same name')) {
            logger.warn(`Failed to create web index ${indexDef.name}: ${error.message}`)
          }
        }
      }
      
      logger.debug('Web MongoDB indexes created successfully')
      
    } catch (error) {
      logger.warn(`Web MongoDB index creation failed: ${error.message}`)
    }
  }

  /**
   * Initialize PostgreSQL connection for web user management
   */
  async _initPostgres() {
    try {
      const { pool } = await import('./database.js')
      this.postgresPool = pool
      
      // Test the connection
      const client = await this.postgresPool.connect()
      await client.query('SELECT 1 as test')
      client.release()
      
      this.isPostgresConnected = true
      logger.info('PostgreSQL connection established for web interface')
      
    } catch (error) {
      this.isPostgresConnected = false
      logger.error(`Web PostgreSQL connection failed: ${error.message}`)
    }
  }


  /**
   * Generate encryption key for sensitive data protection
   */
  _getEncryptionKey() {
    const key = process.env.WEB_SESSION_ENCRYPTION_KEY || process.env.SESSION_ENCRYPTION_KEY || 
                'web-default-key-change-in-production-immediately'
    return crypto.createHash('sha256').update(key).digest()
  }

  // ================================
  // WEB USER AUTHENTICATION METHODS
  // ================================

  /**
   * Create a new web user with authentication
   * 
   * @param {object} userData - User registration data
   * @param {string} userData.name - User's display name
   * @param {string} userData.phoneNumber - Phone number (must be unique)
   * @param {string} userData.password - Plain text password (will be hashed)
   * @returns {object|null} - Created user data or null if failed
   */
  async createUser(userData) {
    if (!this.isPostgresConnected) {
      throw new Error('Database connection required for user creation')
    }

    try {
      // Hash password securely
      const hashedPassword = await bcrypt.hash(userData.password, 12)
      
      // Generate unique telegram_id for web users (9+ billion range to avoid conflicts)
      const webTelegramId = Math.floor(Math.random() * 1000000000) + 9000000000
      
      // Create user record
      const userResult = await this.postgresPool.query(`
        INSERT INTO users (
          telegram_id, first_name, phone_number, username, 
          source, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'web', true, NOW(), NOW())
        RETURNING telegram_id, first_name, phone_number, username, created_at
      `, [
        webTelegramId,
        userData.name,
        userData.phoneNumber,
        `web_${userData.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
      ])
      
      const newUser = userResult.rows[0]
      
      // Store password hash in separate auth table
      await this.postgresPool.query(`
        INSERT INTO web_users_auth (user_id, password_hash) VALUES ($1, $2)
      `, [newUser.telegram_id, hashedPassword])
      
      logger.info(`Web user created: ${newUser.telegram_id} (${userData.phoneNumber})`)
      
      return {
        id: newUser.telegram_id,
        telegramId: newUser.telegram_id,
        name: newUser.first_name,
        phoneNumber: newUser.phone_number,
        username: newUser.username,
        createdAt: newUser.created_at
      }
      
    } catch (error) {
      logger.error('Web user creation error:', error)
      
      if (error.code === '23505') { // Unique constraint violation
        if (error.constraint === 'users_phone_number_key') {
          throw new Error('Phone number already registered')
        }
        throw new Error('User already exists')
      }
      
      throw new Error('Registration failed')
    }
  }

  /**
   * Authenticate web user by phone and password
   * 
   * @param {string} phoneNumber - User's phone number
   * @param {string} password - Plain text password
   * @returns {object|null} - User data if authenticated, null if failed
   */
  async authenticateUser(phoneNumber, password) {
    if (!this.isPostgresConnected) return null

    try {
      const result = await this.postgresPool.query(`
        SELECT u.telegram_id, u.first_name as name, u.phone_number, 
               u.username, u.created_at, u.updated_at, w.password_hash
        FROM users u
        INNER JOIN web_users_auth w ON u.telegram_id = w.user_id
        WHERE u.phone_number = $1 AND u.source = 'web' AND u.is_active = true
      `, [phoneNumber])
      
      if (!result.rows.length) {
        return null
      }
      
      const user = result.rows[0]
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash)
      if (!isValidPassword) {
        return null
      }
      
      // Return user data (without password hash)
      return {
        id: user.telegram_id,
        telegramId: user.telegram_id,
        name: user.name,
        phoneNumber: user.phone_number,
        username: user.username,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
      
    } catch (error) {
      logger.error('Web user authentication error:', error)
      return null
    }
  }

  /**
   * Get web user by phone number
   */
  async getUserByPhone(phoneNumber) {
    if (!this.isPostgresConnected) return null

    try {
      const result = await this.postgresPool.query(`
        SELECT telegram_id, first_name as name, phone_number, username, created_at, updated_at
        FROM users 
        WHERE phone_number = $1 AND source = 'web' AND is_active = true
      `, [phoneNumber])
      
      return result.rows[0] || null
    } catch (error) {
      logger.error('Get web user by phone error:', error)
      return null
    }
  }

  /**
   * Get web user by telegram ID
   */
  async getUserById(telegramId) {
    if (!this.isPostgresConnected) return null

    try {
      const result = await this.postgresPool.query(`
        SELECT telegram_id, first_name as name, phone_number, username, created_at, updated_at
        FROM users 
        WHERE telegram_id = $1 AND source = 'web' AND is_active = true
      `, [telegramId])
      
      return result.rows[0] || null
    } catch (error) {
      logger.error('Get web user by ID error:', error)
      return null
    }
  }

  // ================================
  // SESSION MANAGEMENT METHODS
  // ================================

  /**
   * Save session data to databases
   * Web sessions are primarily stored in MongoDB with PostgreSQL backup
   */
  async saveSession(sessionId, sessionData) {
    try {
      // Save to both databases concurrently
      const savePromises = [
        this._saveToMongo(sessionId, sessionData),
        this._saveToPostgres(sessionId, sessionData)
      ]
      
      const results = await Promise.allSettled(savePromises)
      const mongoSuccess = results[0].status === 'fulfilled' && results[0].value
      const postgresSuccess = results[1].status === 'fulfilled' && results[1].value
      
      if (mongoSuccess || postgresSuccess) {
        this.sessionCache.set(sessionId, { ...sessionData, lastCached: Date.now() })
        logger.debug(`Web session ${sessionId} saved (MongoDB: ${mongoSuccess}, PostgreSQL: ${postgresSuccess})`)
        return true
      }
      
      return false
    } catch (error) {
      logger.error(`Web session save error for ${sessionId}: ${error.message}`)
      return false
    }
  }

  /**
   * Get session data with caching
   */
  async getSession(sessionId) {
    try {
      // Check cache first (shorter TTL for web - 2 minutes)
      const cached = this.sessionCache.get(sessionId)
      if (cached && (Date.now() - cached.lastCached) < 120000) {
        return this._formatSessionData(cached)
      }
      
      // Try MongoDB first (better for session data)
      let sessionData = null
      
      if (this.isMongoConnected) {
        sessionData = await this._getFromMongo(sessionId)
      }
      
      // Fallback to PostgreSQL
      if (!sessionData && this.isPostgresConnected) {
        sessionData = await this._getFromPostgres(sessionId)
      }
      
      if (sessionData) {
        this.sessionCache.set(sessionId, { ...sessionData, lastCached: Date.now() })
        return this._formatSessionData(sessionData)
      }
      
      this.sessionCache.delete(sessionId)
      return null
      
    } catch (error) {
      logger.error(`Web session get error for ${sessionId}: ${error.message}`)
      this.sessionCache.delete(sessionId)
      return null
    }
  }

  /**
   * Force refresh session data from database
   */
  async getSessionFresh(sessionId) {
    this.sessionCache.delete(sessionId)
    return await this.getSession(sessionId)
  }

  /**
   * Update session with write buffering (optimized for web)
   */
  async updateSession(sessionId, updates) {
    try {
      const bufferId = `${sessionId}_update`
      
      // Handle existing buffered updates
      if (this.writeBuffer.has(bufferId)) {
        const existingBuffer = this.writeBuffer.get(bufferId)
        if (existingBuffer.timeout) {
          clearTimeout(existingBuffer.timeout)
        }
        Object.assign(existingBuffer.data, updates)
      } else {
        this.writeBuffer.set(bufferId, { data: { ...updates }, timeout: null })
      }
      
      // Set up delayed write (faster for web interface)
      const timeoutId = setTimeout(async () => {
        const bufferedData = this.writeBuffer.get(bufferId)?.data
        if (!bufferedData) return
        
        try {
          bufferedData.updatedAt = new Date()
          
          const updatePromises = [
            this._updateInMongo(sessionId, bufferedData),
            this._updateInPostgres(sessionId, bufferedData)
          ]
          
          await Promise.allSettled(updatePromises)
          
          // Update cache
          if (this.sessionCache.has(sessionId)) {
            const cachedSession = this.sessionCache.get(sessionId)
            Object.assign(cachedSession, bufferedData)
            cachedSession.lastCached = Date.now()
          }
          
          this.writeBuffer.delete(bufferId)
          
        } catch (error) {
          logger.error(`Web session buffered update error for ${sessionId}: ${error.message}`)
          this.writeBuffer.delete(bufferId)
        }
      }, this.writeBufferDelay)
      
      this.writeBuffer.get(bufferId).timeout = timeoutId
      return true
      
    } catch (error) {
      logger.error(`Web session update buffering error for ${sessionId}: ${error.message}`)
      return false
    }
  }

  /**
   * Delete session and clean up resources
   */
  async deleteSession(sessionId) {
    try {
      // Clear cache and buffer immediately
      this.sessionCache.delete(sessionId)
      this._clearWriteBuffer(sessionId)
      
      // Delete from both databases
      const deletePromises = [
        this._deleteFromMongo(sessionId),
        this._deleteFromPostgres(sessionId)
      ]
      
      const results = await Promise.allSettled(deletePromises)
      const success = results.some(r => r.status === 'fulfilled' && r.value)
      
      if (success) {
        logger.debug(`Web session ${sessionId} deleted successfully`)
      }
      
      return success
    } catch (error) {
      logger.error(`Web session delete error for ${sessionId}: ${error.message}`)
      return false
    }
  }

  /**
   * Get all sessions for web interface
   */
  async getAllSessions() {
    try {
      let sessions = []
      
      // Prefer MongoDB for session queries
      if (this.isMongoConnected) {
        sessions = await this._getAllFromMongo()
      } else if (this.isPostgresConnected) {
        sessions = await this._getAllFromPostgres()
      }
      
      return sessions.map(session => this._formatSessionData(session))
    } catch (error) {
      logger.error('Web get all sessions error:', error)
      return []
    }
  }

  /**
   * Check if phone number is already connected to another session
   */
  async getSessionByPhone(phoneNumber) {
    if (!this.isMongoConnected) return null
    
    try {
      const session = await this.sessions.findOne({ 
        phoneNumber,
        isConnected: true 
      })
      
      return session ? {
        sessionId: session.sessionId,
        phoneNumber: session.phoneNumber,
        isConnected: session.isConnected,
        connectionStatus: session.connectionStatus
      } : null
    } catch (error) {
      logger.error(`Web session check by phone ${phoneNumber}:`, error)
      return null
    }
  }

  /**
   * Perform complete web user disconnect cleanup
   */
  async performWebUserDisconnect(sessionId, telegramId) {
    try {
      const results = { mongo: false, postgres: false, auth: false }
      
      // Clear cache and buffer
      this.sessionCache.delete(sessionId)
      this._clearWriteBuffer(sessionId)
      
      // 1. Remove session from MongoDB
      if (this.isMongoConnected) {
        const deleteResult = await this.sessions.deleteOne({ sessionId })
        results.mongo = deleteResult.deletedCount > 0
      }
      
      // 2. Update PostgreSQL - clear session data but preserve user
      if (this.isPostgresConnected) {
        const pgResult = await this.postgresPool.query(`
          UPDATE users 
          SET session_id = NULL,
              is_connected = false,
              connection_status = 'disconnected',
              reconnect_attempts = 0,
              session_data = NULL,
              auth_state = NULL,
              updated_at = NOW()
          WHERE telegram_id = $1 AND source = 'web'
        `, [telegramId])
        results.postgres = pgResult.rowCount > 0
      }
      
      // 3. Clean up MongoDB auth_baileys collection
      if (this.client) {
        try {
          const db = this.client.db()
          const authCollection = db.collection('auth_baileys')
          const authDeleteResult = await authCollection.deleteMany({
            $or: [
              { _id: { $regex: `^${sessionId}` } },
              { sessionId: sessionId }
            ]
          })
          results.auth = authDeleteResult.deletedCount > 0
        } catch (error) {
          logger.warn(`Web auth cleanup error for ${sessionId}: ${error.message}`)
        }
      }
      
      logger.info(`Web user disconnect completed for ${sessionId}: ${JSON.stringify(results)}`)
      return results
      
    } catch (error) {
      logger.error(`Web user disconnect error for ${sessionId}: ${error.message}`)
      throw error
    }
  }

  // ================================
  // MONGODB OPERATIONS
  // ================================

  async _saveToMongo(sessionId, sessionData) {
    if (!this.isMongoConnected) return false
    
    try {
      const document = {
        sessionId,
        telegramId: sessionData.telegramId || sessionData.userId,
        phoneNumber: sessionData.phoneNumber,
        isConnected: this._ensureBoolean(sessionData.isConnected || false),
        connectionStatus: sessionData.connectionStatus || 'disconnected',
        reconnectAttempts: parseInt(sessionData.reconnectAttempts || 0),
        source: 'web', // Always web for this storage class
        detected: this._ensureBoolean(sessionData.detected !== false),
        detectedAt: sessionData.detectedAt || null,
        createdAt: sessionData.createdAt || new Date(),
        updatedAt: new Date()
      }

      await this.sessions.replaceOne({ sessionId }, document, { upsert: true })
      return true
    } catch (error) {
      this._handleMongoError(error)
      return false
    }
  }

  async _getFromMongo(sessionId) {
    if (!this.isMongoConnected) return null
    
    try {
      const session = await this.sessions.findOne({ sessionId })
      if (!session) return null

      return {
        sessionId: session.sessionId,
        userId: session.telegramId,
        telegramId: session.telegramId,
        phoneNumber: session.phoneNumber,
        isConnected: session.isConnected,
        connectionStatus: session.connectionStatus,
        reconnectAttempts: session.reconnectAttempts,
        source: session.source || 'web',
        detected: session.detected !== false,
        detectedAt: session.detectedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    } catch (error) {
      this._handleMongoError(error)
      return null
    }
  }

  async _updateInMongo(sessionId, updates) {
    if (!this.isMongoConnected) return false
    
    try {
      const updateDoc = { ...updates, updatedAt: new Date() }
      
      // Ensure boolean fields are properly typed
      if (updateDoc.isConnected !== undefined) {
        updateDoc.isConnected = this._ensureBoolean(updateDoc.isConnected)
      }
      if (updateDoc.detected !== undefined) {
        updateDoc.detected = this._ensureBoolean(updateDoc.detected)
      }

      const result = await this.sessions.updateOne(
        { sessionId }, 
        { $set: updateDoc }
      )
      
      return result.modifiedCount > 0 || result.matchedCount > 0
    } catch (error) {
      this._handleMongoError(error)
      return false
    }
  }

  async _deleteFromMongo(sessionId) {
    if (!this.isMongoConnected) return false
    
    try {
      const result = await this.sessions.deleteOne({ sessionId })
      return result.deletedCount > 0
    } catch (error) {
      this._handleMongoError(error)
      return false
    }
  }

  async _getAllFromMongo() {
    if (!this.isMongoConnected) return []
    
    try {
      const sessions = await this.sessions.find({ source: 'web' })
        .sort({ updatedAt: -1 })
        .toArray()

      return sessions.map(session => ({
        sessionId: session.sessionId,
        userId: session.telegramId,
        telegramId: session.telegramId,
        phoneNumber: session.phoneNumber,
        isConnected: session.isConnected,
        connectionStatus: session.connectionStatus,
        reconnectAttempts: session.reconnectAttempts,
        source: session.source,
        detected: session.detected,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }))
    } catch (error) {
      this._handleMongoError(error)
      return []
    }
  }

  // ================================
  // POSTGRESQL OPERATIONS
  // ================================

  async _saveToPostgres(sessionId, sessionData) {
    if (!this.isPostgresConnected) return false
    
    try {
      const result = await this.postgresPool.query(`
        INSERT INTO users (
          telegram_id, session_id, phone_number, is_connected, 
          connection_status, reconnect_attempts, source, detected, 
          detected_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (telegram_id) 
        DO UPDATE SET 
          session_id = EXCLUDED.session_id,
          phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number),
          is_connected = EXCLUDED.is_connected,
          connection_status = EXCLUDED.connection_status,
          reconnect_attempts = EXCLUDED.reconnect_attempts,
          source = EXCLUDED.source,
          detected = EXCLUDED.detected,
          detected_at = EXCLUDED.detected_at,
          updated_at = NOW()
      `, [
        parseInt(sessionData.telegramId || sessionData.userId),
        sessionId,
        sessionData.phoneNumber,
        this._ensureBoolean(sessionData.isConnected || false),
        sessionData.connectionStatus || 'disconnected',
        parseInt(sessionData.reconnectAttempts || 0),
        'web',
        this._ensureBoolean(sessionData.detected !== false),
        sessionData.detectedAt || null
      ])
      
      return true
    } catch (error) {
      logger.error(`Web PostgreSQL save error for ${sessionId}: ${error.message}`)
      return false
    }
  }

  async _getFromPostgres(sessionId) {
    if (!this.isPostgresConnected) return null
    
    try {
      const result = await this.postgresPool.query(
        'SELECT * FROM users WHERE session_id = $1 AND source = $2', 
        [sessionId, 'web']
      )
      
      if (!result.rows.length) return null
      
      const row = result.rows[0]
      return {
        sessionId: row.session_id,
        userId: row.telegram_id,
        telegramId: row.telegram_id,
        phoneNumber: row.phone_number,
        isConnected: row.is_connected,
        connectionStatus: row.connection_status || 'disconnected',
        reconnectAttempts: row.reconnect_attempts || 0,
        source: row.source || 'web',
        detected: row.detected !== false,
        detectedAt: row.detected_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    } catch (error) {
      logger.error(`Web PostgreSQL get error for ${sessionId}: ${error.message}`)
      return null
    }
  }

  async _updateInPostgres(sessionId, updates) {
    if (!this.isPostgresConnected) return false
    
    try {
      const setParts = []
      const values = [sessionId]
      let paramIndex = 2

      if (updates.isConnected !== undefined) {
        setParts.push(`is_connected = $${paramIndex++}`)
        values.push(this._ensureBoolean(updates.isConnected))
      }
      if (updates.connectionStatus) {
        setParts.push(`connection_status = $${paramIndex++}`)
        values.push(updates.connectionStatus)
      }
      if (updates.phoneNumber) {
        setParts.push(`phone_number = $${paramIndex++}`)
        values.push(updates.phoneNumber)
      }
      if (updates.reconnectAttempts !== undefined) {
        setParts.push(`reconnect_attempts = $${paramIndex++}`)
        values.push(parseInt(updates.reconnectAttempts))
      }
      if (updates.detected !== undefined) {
        setParts.push(`detected = ${paramIndex++}`)
        values.push(this._ensureBoolean(updates.detected))
      }
      if (updates.detectedAt !== undefined) {
        setParts.push(`detected_at = ${paramIndex++}`)
        values.push(updates.detectedAt)
      }

      if (setParts.length > 0) {
        const query = `
          UPDATE users 
          SET ${setParts.join(', ')}, updated_at = NOW() 
          WHERE session_id = $1 AND source = 'web'
        `
        
        const result = await this.postgresPool.query(query, values)
        return result.rowCount > 0
      }
      
      return false
    } catch (error) {
      logger.error(`Web PostgreSQL update error for ${sessionId}: ${error.message}`)
      return false
    }
  }

  async _deleteFromPostgres(sessionId) {
    if (!this.isPostgresConnected) return false
    
    try {
      // For web users, clear session data but preserve user record
      const result = await this.postgresPool.query(`
        UPDATE users 
        SET session_id = NULL, 
            is_connected = false, 
            connection_status = 'disconnected',
            session_data = NULL,
            auth_state = NULL,
            updated_at = NOW()
        WHERE session_id = $1 AND source = 'web'
      `, [sessionId])
      
      return result.rowCount > 0
    } catch (error) {
      logger.error(`Web PostgreSQL delete error for ${sessionId}: ${error.message}`)
      return false
    }
  }

  async _getAllFromPostgres() {
    if (!this.isPostgresConnected) return []
    
    try {
      const result = await this.postgresPool.query(`
        SELECT telegram_id, session_id, phone_number, is_connected, 
               connection_status, reconnect_attempts, source, detected, detected_at,
               created_at, updated_at
        FROM users 
        WHERE source = 'web' AND session_id IS NOT NULL
        ORDER BY updated_at DESC
      `)
      
      return result.rows.map(row => ({
        sessionId: row.session_id,
        userId: row.telegram_id,
        telegramId: row.telegram_id,
        phoneNumber: row.phone_number,
        isConnected: row.is_connected,
        connectionStatus: row.connection_status || 'disconnected',
        reconnectAttempts: row.reconnect_attempts || 0,
        source: row.source,
        detected: row.detected !== false,
        detectedAt: row.detected_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    } catch (error) {
      logger.error('Web PostgreSQL get all sessions error:', error)
      return []
    }
  }

  // ================================
  // UTILITY AND HELPER METHODS
  // ================================

  /**
   * Format session data for consistent output
   */
  _formatSessionData(sessionData) {
    if (!sessionData) return null

    return {
      sessionId: sessionData.sessionId,
      userId: sessionData.userId || sessionData.telegramId,
      telegramId: sessionData.telegramId || sessionData.userId,
      phoneNumber: sessionData.phoneNumber,
      isConnected: Boolean(sessionData.isConnected),
      connectionStatus: sessionData.connectionStatus || 'disconnected',
      reconnectAttempts: sessionData.reconnectAttempts || 0,
      source: sessionData.source || 'web',
      detected: sessionData.detected !== false,
      detectedAt: sessionData.detectedAt,
      createdAt: sessionData.createdAt,
      updatedAt: sessionData.updatedAt
    }
  }

  /**
   * Ensure proper boolean type conversion
   */
  _ensureBoolean(value) {
    if (value === null || value === undefined) return false
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') return value.toLowerCase() === 'true'
    if (typeof value === 'number') return value !== 0
    return Boolean(value)
  }

  /**
   * Clear write buffer for a specific session
   */
  _clearWriteBuffer(sessionId) {
    const bufferId = `${sessionId}_update`
    const bufferData = this.writeBuffer.get(bufferId)
    
    if (bufferData) {
      if (bufferData.timeout) {
        clearTimeout(bufferData.timeout)
      }
      this.writeBuffer.delete(bufferId)
    }
  }

  /**
   * Handle MongoDB connection errors
   */
  _handleMongoError(error) {
    const networkErrors = ['MongoNetworkError', 'MongoServerSelectionError', 'MongoTopologyClosedError']
    
    if (networkErrors.includes(error.name)) {
      logger.warn(`Web MongoDB connection lost (${error.name}), marking as disconnected`)
      this.isMongoConnected = false
      
      // Reset retry counter to allow reconnection attempts
      if (this.retryCount >= this.maxRetries) {
        this.retryCount = 0
      }
    }
  }

  // ================================
  // CONNECTION STATUS AND CLEANUP
  // ================================

  /**
   * Check if at least one database connection is active
   */
  get isConnected() {
    return this.isMongoConnected || this.isPostgresConnected
  }

  /**
   * Get detailed connection status for web interface
   */
  getConnectionStatus() {
    return {
      mongodb: this.isMongoConnected,
      postgresql: this.isPostgresConnected,
      overall: this.isConnected,
      cacheSize: this.sessionCache.size,
      bufferSize: this.writeBuffer.size,
      maxRetries: this.maxRetries,
      currentRetry: this.retryCount
    }
  }

  /**
   * Flush all pending write buffers before shutdown
   */
  async flushWriteBuffers() {
    const bufferKeys = Array.from(this.writeBuffer.keys())
    const flushPromises = []
    
    for (const bufferId of bufferKeys) {
      const bufferData = this.writeBuffer.get(bufferId)
      if (bufferData) {
        if (bufferData.timeout) {
          clearTimeout(bufferData.timeout)
        }
        
        const sessionId = bufferId.replace('_update', '')
        
        const flushPromise = (async () => {
          try {
            const updates = { ...bufferData.data, updatedAt: new Date() }
            
            const results = await Promise.allSettled([
              this._updateInMongo(sessionId, updates),
              this._updateInPostgres(sessionId, updates)
            ])
            
            const success = results.some(r => r.status === 'fulfilled' && r.value)
            if (success) {
              logger.debug(`Web: Flushed buffered updates for ${sessionId}`)
            }
            
            this.writeBuffer.delete(bufferId)
          } catch (error) {
            logger.error(`Web: Error flushing buffer for ${sessionId}: ${error.message}`)
          }
        })()
        
        flushPromises.push(flushPromise)
      }
    }
    
    if (flushPromises.length > 0) {
      logger.info(`Web: Flushing ${flushPromises.length} pending write buffers...`)
      await Promise.allSettled(flushPromises)
    }
  }

  /**
   * Graceful shutdown with cleanup
   */
  async close() {
    try {
      logger.info('Web SessionStorage: Starting graceful shutdown...')
      
      // Flush any pending write buffers
      await this.flushWriteBuffers()
      
      // Clear cache
      this.sessionCache.clear()
      
      // Close database connections
      const closePromises = []
      
      if (this.client && this.isMongoConnected) {
        closePromises.push(
          this.client.close().catch(error => {
            logger.warn(`Web MongoDB close error: ${error.message}`)
          }).finally(() => {
            this.isMongoConnected = false
          })
        )
      }
      
      if (this.postgresPool && this.isPostgresConnected) {
        closePromises.push(
          this.postgresPool.end().catch(error => {
            logger.warn(`Web PostgreSQL close error: ${error.message}`)
          }).finally(() => {
            this.isPostgresConnected = false
          })
        )
      }
      
      await Promise.allSettled(closePromises)
      
      logger.info('Web SessionStorage: Shutdown completed successfully')
      
    } catch (error) {
      logger.error(`Web SessionStorage shutdown error: ${error.message}`)
    }
  }

  /**
   * Get storage statistics for monitoring
   */
  getStats() {
    return {
      connections: {
        mongodb: this.isMongoConnected,
        postgresql: this.isPostgresConnected,
        overall: this.isConnected
      },
      cache: {
        size: this.sessionCache.size,
        entries: Array.from(this.sessionCache.keys())
      },
      writeBuffer: {
        size: this.writeBuffer.size,
        entries: Array.from(this.writeBuffer.keys())
      },
      config: {
        maxRetries: this.maxRetries,
        currentRetry: this.retryCount,
        connectionTimeout: this.connectionTimeout,
        writeBufferDelay: this.writeBufferDelay
      },
      type: 'WEB_INTERFACE'
    }
  }
}