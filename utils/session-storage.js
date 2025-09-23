import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
import { logger } from './logger.js'
//web session storage
export class SessionStorage {
  constructor() {
    this.client = null
    this.db = null
    this.sessions = null
    this.isMongoConnected = false
    this.postgresPool = null
    this.isPostgresConnected = false
    this.sessionCache = new Map()
    this.writeBuffer = new Map()
    this.retryCount = 0
    this.maxRetries = 2
    
    this._initConnections()
  }

  async _initConnections() {
    await Promise.allSettled([
      this._initMongoDB(),
      this._initPostgres()
    ])
  }

  async _initMongoDB() {
    try {
      const mongoUrl = process.env.MONGODB_URI || 
        'mongodb+srv://Paul112210:qahmr6jy2b4uzBMf@main.uwa6va6.mongodb.net/?retryWrites=true&w=majority&appName=Main'
      
      const connectionOptions = {
        maxPoolSize: 5, // Lower pool for web
        minPoolSize: 1,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 30000,
        connectTimeoutMS: 10000,
        retryWrites: true,
        heartbeatFrequencyMS: 30000
      }
      
      this.client = new MongoClient(mongoUrl, connectionOptions)
      
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 10000)
        )
      ])
      
      await this.client.db('admin').command({ ping: 1 })
      
      this.db = this.client.db()
      this.sessions = this.db.collection('sessions')
      
      await this.sessions.createIndex({ sessionId: 1 }, { unique: true, background: true })
        .catch(() => {})
      
      this.isMongoConnected = true
      this.retryCount = 0
      
    } catch (error) {
      this.isMongoConnected = false
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        setTimeout(() => this._initMongoDB(), 5000)
      }
    }
  }

  async _initPostgres() {
    try {
      const { pool } = await import('./database.js')
      this.postgresPool = pool
      
      const client = await this.postgresPool.connect()
      await client.query('SELECT 1')
      client.release()
      
      this.isPostgresConnected = true
    } catch (error) {
      this.isPostgresConnected = false
    }
  }

  // ==========================================
  // USER MANAGEMENT (PostgreSQL)
  // ==========================================

  async createUser(userData) {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 12)
      
      // Generate a unique positive telegram_id for web users (9 billion range)
      const webTelegramId = Math.floor(Math.random() * 1000000000) + 9000000000
      
      const result = await this.postgresPool.query(`
        INSERT INTO users (telegram_id, first_name, phone_number, username, is_active, created_at)
        VALUES ($1, $2, $3, $4, true, NOW())
        RETURNING id, telegram_id, first_name, phone_number, username, created_at
      `, [webTelegramId, userData.name, userData.phoneNumber, `web_${userData.name.toLowerCase().replace(/\s+/g, '_')}`])
      
      // Store password separately in a web_users_auth table
      await this.postgresPool.query(`
        CREATE TABLE IF NOT EXISTS web_users_auth (
          user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      
      await this.postgresPool.query(`
        INSERT INTO web_users_auth (user_id, password_hash) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET password_hash = $2, updated_at = NOW()
      `, [result.rows[0].id, hashedPassword])
      
      return result.rows[0]
    } catch (error) {
      logger.error('Create user error:', error)
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Phone number already registered')
      }
      throw new Error('Registration failed')
    }
  }

  async getUserByPhone(phoneNumber) {
    try {
      const result = await this.postgresPool.query(`
        SELECT u.id, u.telegram_id, u.first_name as name, u.phone_number, 
               u.username, u.created_at, u.updated_at, w.password_hash
        FROM users u
        LEFT JOIN web_users_auth w ON u.id = w.user_id
        WHERE u.phone_number = $1 AND u.telegram_id > 9000000000
      `, [phoneNumber])
      
      return result.rows[0] || null
    } catch (error) {
      logger.error('Get user by phone error:', error)
      return null
    }
  }

  async getUserById(userId) {
    try {
      const result = await this.postgresPool.query(`
        SELECT u.id, u.telegram_id, u.first_name as name, u.phone_number, 
               u.username, u.created_at, u.updated_at
        FROM users u
        WHERE u.id = $1 AND u.telegram_id > 9000000000
      `, [userId])
      
      return result.rows[0] || null
    } catch (error) {
      logger.error('Get user by ID error:', error)
      return null
    }
  }

  // ==========================================
  // SESSION MANAGEMENT (MongoDB + PostgreSQL)
  // ==========================================

  async saveSession(sessionId, sessionData) {
    try {
      // For web interface, we primarily use MongoDB for session data
      // but can fall back to PostgreSQL if needed
      const success = await this._saveToMongo(sessionId, sessionData)
      
      if (success) {
        this.sessionCache.set(sessionId, sessionData)
        return true
      }
      
      return false
    } catch (error) {
      logger.error('Save session error:', error)
      return false
    }
  }

  async getSession(sessionId) {
    try {
      // Always fetch fresh data from database first
      const session = await this._getFromMongo(sessionId)
      
      if (session) {
        this.sessionCache.set(sessionId, session)
        return session
      } else {
        this.sessionCache.delete(sessionId)
        return null
      }
    } catch (error) {
      this.sessionCache.delete(sessionId)
      return null
    }
  }

  async getSessionFresh(sessionId) {
    // Force remove from cache first
    this.sessionCache.delete(sessionId)
    return await this.getSession(sessionId)
  }

  async updateSession(sessionId, updates) {
    try {
      const bufferId = `${sessionId}_update`
      
      if (this.writeBuffer.has(bufferId)) {
        clearTimeout(this.writeBuffer.get(bufferId).timeout)
        Object.assign(this.writeBuffer.get(bufferId).data, updates)
      } else {
        this.writeBuffer.set(bufferId, { data: updates, timeout: null })
      }
      
      const timeoutId = setTimeout(async () => {
        const bufferedData = this.writeBuffer.get(bufferId)?.data
        if (bufferedData) {
          await this._updateInMongo(sessionId, bufferedData)
          
          if (this.sessionCache.has(sessionId)) {
            Object.assign(this.sessionCache.get(sessionId), bufferedData)
          }
          
          this.writeBuffer.delete(bufferId)
        }
      }, 200) // Faster writes for web
      
      this.writeBuffer.get(bufferId).timeout = timeoutId
      return true
    } catch (error) {
      return false
    }
  }

  async deleteSession(sessionId) {
    try {
      // Immediately invalidate cache
      this.sessionCache.delete(sessionId)
      
      // Cancel any pending writes
      const bufferId = `${sessionId}_update`
      if (this.writeBuffer.has(bufferId)) {
        const bufferData = this.writeBuffer.get(bufferId)
        if (bufferData.timeout) {
          clearTimeout(bufferData.timeout)
        }
        this.writeBuffer.delete(bufferId)
      }
      
      return await this._deleteFromMongo(sessionId)
    } catch (error) {
      return false
    }
  }

  async getAllSessions() {
    try {
      if (this.isMongoConnected) {
        return await this._getAllFromMongo()
      }
      return []
    } catch (error) {
      return []
    }
  }

  // Check if phone is already in use by another session
  async getSessionByPhone(phoneNumber) {
    if (!this.isMongoConnected) return null
    
    try {
      const session = await this.sessions.findOne({ phoneNumber })
      return session ? {
        sessionId: session.sessionId,
        phoneNumber: session.phoneNumber,
        isConnected: session.isConnected
      } : null
    } catch (error) {
      logger.error(`Error checking session by phone ${phoneNumber}:`, error)
      return null
    }
  }

  // ==========================================
  // MONGODB OPERATIONS
  // ==========================================

  async _saveToMongo(sessionId, sessionData) {
    if (!this.isMongoConnected) return false
    
    try {
      const document = {
        sessionId,
        telegramId: sessionData.telegramId || sessionData.userId,
        phoneNumber: sessionData.phoneNumber,
        isConnected: sessionData.isConnected || false,
        connectionStatus: sessionData.connectionStatus || 'disconnected',
        reconnectAttempts: sessionData.reconnectAttempts || 0,
        source: sessionData.source || 'telegram',
        detected: sessionData.detected !== false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await this.sessions.replaceOne({ sessionId }, document, { upsert: true })
      return true
    } catch (error) {
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        this.isMongoConnected = false
      }
      logger.error('MongoDB save error:', error)
      return false
    }
  }

  async performWebUserDisconnect(sessionId, telegramId) {
  try {
    const results = { mongo: false, postgres: false, auth: false }
    
    // 1. Remove from MongoDB sessions collection
    if (this.isMongoConnected) {
      const deleteResult = await this.sessions.deleteOne({ sessionId })
      results.mongo = deleteResult.deletedCount > 0
    }
    
    // 2. Update PostgreSQL users table - clear session fields but keep user
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
        WHERE telegram_id = $1
      `, [telegramId])
      results.postgres = pgResult.rowCount > 0
    }
    
    // 3. Clean up auth_baileys collection in MongoDB
    if (this.client) {
      try {
        const db = this.client.db()
        const authCollection = db.collection('auth_baileys')
        await authCollection.deleteMany({ 
          $or: [
            { _id: { $regex: `^${sessionId}` } },
            { sessionId: sessionId }
          ]
        })
        results.auth = true
      } catch (error) {
        // Auth cleanup is optional
      }
    }
    
    // Clear cache
    this.sessionCache.delete(sessionId)
    
    return results
  } catch (error) {
    throw error
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
        source: session.source || 'telegram',
        detected: session.detected !== false,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    } catch (error) {
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        this.isMongoConnected = false
      }
      return null
    }
  }

  async _updateInMongo(sessionId, updates) {
  if (!this.isMongoConnected) return false
  
  try {
    const updateDoc = { ...updates, updatedAt: new Date() }

    const result = await this.sessions.updateOne(
      { sessionId }, 
      { $set: updateDoc }
    )
    
    // Also update PostgreSQL for web users if connection status changes
    if (updates.isConnected !== undefined && this.isPostgresConnected) {
      const telegramId = sessionId.replace('session_', '')
      if (parseInt(telegramId) > 9000000000) { // Web user
        await this.postgresPool.query(`
          UPDATE users 
          SET is_connected = $1, connection_status = $2, phone_number = COALESCE($3, phone_number), updated_at = NOW()
          WHERE telegram_id = $4
        `, [
          updates.isConnected, 
          updates.connectionStatus || 'connected',
          updates.phoneNumber,
          telegramId
        ])
      }
    }
    
    return result.modifiedCount > 0 || result.matchedCount > 0
  } catch (error) {
    if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
      this.isMongoConnected = false
    }
    return false
  }
}

  async _deleteFromMongo(sessionId) {
    if (!this.isMongoConnected) return false
    
    try {
      const result = await this.sessions.deleteOne({ sessionId })
      return result.deletedCount > 0
    } catch (error) {
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        this.isMongoConnected = false
      }
      return false
    }
  }

  async _getAllFromMongo() {
    if (!this.isMongoConnected) return []
    
    try {
      const sessions = await this.sessions.find({}).sort({ updatedAt: -1 }).toArray()

      return sessions.map(session => ({
        sessionId: session.sessionId,
        userId: session.telegramId,
        telegramId: session.telegramId,
        phoneNumber: session.phoneNumber,
        isConnected: session.isConnected,
        connectionStatus: session.connectionStatus,
        reconnectAttempts: session.reconnectAttempts,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }))
    } catch (error) {
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        this.isMongoConnected = false
      }
      return []
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  get isConnected() {
    return this.isMongoConnected || this.isPostgresConnected
  }

  async close() {
    // Clear all pending writes
    for (const [key, buffer] of this.writeBuffer.entries()) {
      if (buffer.timeout) {
        clearTimeout(buffer.timeout)
      }
    }
    this.writeBuffer.clear()
    
    if (this.client) {
      try {
        await this.client.close()
      } catch (error) {
        // Silent cleanup
      } finally {
        this.isMongoConnected = false
      }
    }
    
    if (this.postgresPool) {
      try {
        await this.postgresPool.end()
      } catch (error) {
        // Silent cleanup
      } finally {
        this.isPostgresConnected = false
      }
    }
  }
}