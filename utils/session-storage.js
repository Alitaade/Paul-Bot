// Render Session Storage - Web-focused, lightweight storage
import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
import { createComponentLogger } from './logger.js'

const logger = createComponentLogger('RENDER_STORAGE')

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
    this._setupCacheCleanup()
  }

  _setupCacheCleanup() {
    // Clean cache every 2 minutes to prevent memory buildup
    setInterval(() => {
      const now = Date.now()
      for (const [key, data] of this.sessionCache) {
        if (data.timestamp && (now - data.timestamp) > 120000) {
          this.sessionCache.delete(key)
        }
      }
    }, 120000)
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
        maxPoolSize: 3, // Lower pool size for Render
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
      logger.info('RENDER: MongoDB connected successfully')
      
    } catch (error) {
      this.isMongoConnected = false
      logger.warn('RENDER: MongoDB connection failed:', error.message)
      if (this.retryCount < this.maxRetries) {
        this.retryCount++
        setTimeout(() => this._initMongoDB(), 5000)
      }
    }
  }

  async _initPostgres() {
    try {
      const { pool } = await import('../../config/database.js')
      this.postgresPool = pool
      
      const client = await this.postgresPool.connect()
      await client.query('SELECT 1')
      client.release()
      
      this.isPostgresConnected = true
      logger.info('RENDER: PostgreSQL connected successfully')
    } catch (error) {
      this.isPostgresConnected = false
      logger.warn('RENDER: PostgreSQL connection failed:', error.message)
    }
  }

  async saveSession(sessionId, sessionData) {
    try {
      const success = await this._saveToMongo(sessionId, sessionData) ||
                     await this._saveToPostgres(sessionId, sessionData)
      
      if (success) {
        this.sessionCache.set(sessionId, { 
          ...sessionData, 
          timestamp: Date.now() 
        })
        return true
      }
      
      return false
    } catch (error) {
      logger.error('RENDER: Save session error:', error)
      return false
    }
  }

  async getSession(sessionId) {
    try {
      // Check cache first
      if (this.sessionCache.has(sessionId)) {
        const cached = this.sessionCache.get(sessionId)
        if (cached.timestamp && (Date.now() - cached.timestamp) < 60000) {
          return cached
        }
        this.sessionCache.delete(sessionId)
      }

      const session = await this._getFromMongo(sessionId) || await this._getFromPostgres(sessionId)
      
      if (session) {
        this.sessionCache.set(sessionId, { 
          ...session, 
          timestamp: Date.now() 
        })
        return session
      } else {
        this.sessionCache.delete(sessionId)
        return null
      }
    } catch (error) {
      logger.error('RENDER: Get session error:', error)
      this.sessionCache.delete(sessionId)
      return null
    }
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
          await this._updateInPostgres(sessionId, bufferedData)
          
          if (this.sessionCache.has(sessionId)) {
            Object.assign(this.sessionCache.get(sessionId), bufferedData)
            this.sessionCache.get(sessionId).timestamp = Date.now()
          }
          
          this.writeBuffer.delete(bufferId)
        }
      }, 200) // Faster writes for Render
      
      this.writeBuffer.get(bufferId).timeout = timeoutId
      return true
    } catch (error) {
      logger.error('RENDER: Update session error:', error)
      return false
    }
  }

  async deleteSession(sessionId) {
    try {
      this.sessionCache.delete(sessionId)
      this.writeBuffer.delete(`${sessionId}_update`)
      
      const bufferId = `${sessionId}_update`
      if (this.writeBuffer.has(bufferId)) {
        const bufferData = this.writeBuffer.get(bufferId)
        if (bufferData.timeout) {
          clearTimeout(bufferData.timeout)
        }
        this.writeBuffer.delete(bufferId)
      }
      
      const results = await Promise.allSettled([
        this._deleteFromMongo(sessionId),
        this._deleteFromPostgres(sessionId)
      ])
      
      return results.some(r => r.status === 'fulfilled' && r.value)
    } catch (error) {
      logger.error('RENDER: Delete session error:', error)
      return false
    }
  }

  async getAllSessions() {
    try {
      if (this.isPostgresConnected) {
        return await this._getAllFromPostgres()
      } else if (this.isMongoConnected) {
        return await this._getAllFromMongo()
      }
      return []
    } catch (error) {
      logger.error('RENDER: Get all sessions error:', error)
      return []
    }
  }

  // Web user authentication methods
  async createUser(userData) {
    const { name, phoneNumber, password } = userData
    
    try {
      if (this.isPostgresConnected) {
        return await this._createUserPostgres(name, phoneNumber, password)
      } else if (this.isMongoConnected) {
        return await this._createUserMongo(name, phoneNumber, password)
      }
      throw new Error('No database connection available')
    } catch (error) {
      logger.error('RENDER: Create user error:', error)
      throw error
    }
  }

  async getUserByPhone(phoneNumber) {
    try {
      if (this.isPostgresConnected) {
        return await this._getUserByPhonePostgres(phoneNumber)
      } else if (this.isMongoConnected) {
        return await this._getUserByPhoneMongo(phoneNumber)
      }
      return null
    } catch (error) {
      logger.error('RENDER: Get user by phone error:', error)
      return null
    }
  }

  async getUserById(userId) {
    try {
      if (this.isPostgresConnected) {
        return await this._getUserByIdPostgres(userId)
      } else if (this.isMongoConnected) {
        return await this._getUserByIdMongo(userId)
      }
      return null
    } catch (error) {
      logger.error('RENDER: Get user by ID error:', error)
      return null
    }
  }

  // MongoDB operations
  async _saveToMongo(sessionId, sessionData) {
    if (!this.isMongoConnected) return false
    
    try {
      const document = {
        sessionId,
        telegramId: sessionData.telegramId || sessionData.userId,
        phoneNumber: sessionData.phoneNumber,
        isConnected: sessionData.isConnected || false,
        connectionStatus: sessionData.connectionStatus || 'disconnected',
        source: sessionData.source || 'web',
        detected: sessionData.detected !== undefined ? sessionData.detected : false,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await this.sessions.replaceOne({ sessionId }, document, { upsert: true })
      return true
    } catch (error) {
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        this.isMongoConnected = false
      }
      logger.error('RENDER: MongoDB save error:', error)
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
        source: session.source || 'web',
        detected: session.detected !== undefined ? session.detected : false,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    } catch (error) {
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        this.isMongoConnected = false
      }
      logger.error('RENDER: MongoDB get error:', error)
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
      
      return result.modifiedCount > 0 || result.matchedCount > 0
    } catch (error) {
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        this.isMongoConnected = false
      }
      logger.error('RENDER: MongoDB update error:', error)
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
      logger.error('RENDER: MongoDB delete error:', error)
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
        source: session.source || 'web',
        detected: session.detected !== undefined ? session.detected : false,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }))
    } catch (error) {
      if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
        this.isMongoConnected = false
      }
      logger.error('RENDER: MongoDB get all error:', error)
      return []
    }
  }

  async _createUserMongo(name, phoneNumber, password) {
    if (!this.isMongoConnected) throw new Error('MongoDB not connected')
    
    const users = this.db.collection('users')
    
    // Check if user exists
    const existingUser = await users.findOne({ phone_number: phoneNumber })
    if (existingUser) {
      throw new Error('Phone number already registered')
    }

    // Generate telegram_id in 9 billion+ range for web users
    const telegramId = 9000000000 + Math.floor(Math.random() * 999999999)
    const passwordHash = await bcrypt.hash(password, 10)

    const userData = {
      telegram_id: telegramId,
      username: `web_${name.toLowerCase().replace(/\s+/g, '_')}_${Math.floor(Math.random() * 1000)}`,
      first_name: name,
      phone_number: phoneNumber,
      is_admin: false,
      is_active: true,
      source: 'web',
      password_hash: passwordHash,
      created_at: new Date(),
      updated_at: new Date()
    }

    const result = await users.insertOne(userData)
    return {
      id: result.insertedId,
      telegram_id: telegramId,
      name: name,
      phone_number: phoneNumber
    }
  }

  async _getUserByPhoneMongo(phoneNumber) {
    if (!this.isMongoConnected) return null
    
    const users = this.db.collection('users')
    const user = await users.findOne({ phone_number: phoneNumber })
    
    return user ? {
      id: user._id,
      telegram_id: user.telegram_id,
      name: user.first_name,
      phone_number: user.phone_number,
      password_hash: user.password_hash
    } : null
  }

  async _getUserByIdMongo(userId) {
    if (!this.isMongoConnected) return null
    
    const users = this.db.collection('users')
    const user = await users.findOne({ _id: userId })
    
    return user ? {
      id: user._id,
      telegram_id: user.telegram_id,
      name: user.first_name,
      phone_number: user.phone_number
    } : null
  }

  // PostgreSQL operations - USING USERS TABLE ONLY
  async _saveToPostgres(sessionId, sessionData) {
    if (!this.isPostgresConnected) return false
    
    try {
      await this.postgresPool.query(`
        INSERT INTO users (
          telegram_id, session_id, phone_number, is_connected, 
          connection_status, source, detected, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (telegram_id) 
        DO UPDATE SET 
          session_id = EXCLUDED.session_id,
          phone_number = COALESCE(EXCLUDED.phone_number, users.phone_number),
          is_connected = EXCLUDED.is_connected,
          connection_status = EXCLUDED.connection_status,
          source = EXCLUDED.source,
          detected = EXCLUDED.detected,
          updated_at = NOW()
      `, [
        sessionData.telegramId || sessionData.userId,
        sessionId,
        sessionData.phoneNumber,
        sessionData.isConnected || false,
        sessionData.connectionStatus || 'disconnected',
        sessionData.source || 'web',
        sessionData.detected !== undefined ? sessionData.detected : false
      ])
      
      return true
    } catch (error) {
      logger.error('RENDER: PostgreSQL save error:', error)
      return false
    }
  }

  async _getFromPostgres(sessionId) {
    if (!this.isPostgresConnected) return null
    
    try {
      const result = await this.postgresPool.query(
        'SELECT * FROM users WHERE session_id = $1', 
        [sessionId]
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
        source: row.source || 'web',
        detected: row.detected !== undefined ? row.detected : false,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    } catch (error) {
      logger.error('RENDER: PostgreSQL get error:', error)
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
        values.push(updates.isConnected)
      }
      if (updates.connectionStatus) {
        setParts.push(`connection_status = $${paramIndex++}`)
        values.push(updates.connectionStatus)
      }
      if (updates.phoneNumber) {
        setParts.push(`phone_number = $${paramIndex++}`)
        values.push(updates.phoneNumber)
      }
      if (updates.source) {
        setParts.push(`source = $${paramIndex++}`)
        values.push(updates.source)
      }
      if (updates.detected !== undefined) {
        setParts.push(`detected = $${paramIndex++}`)
        values.push(updates.detected)
      }

      if (setParts.length > 0) {
        await this.postgresPool.query(
          `UPDATE users SET ${setParts.join(', ')}, updated_at = NOW() WHERE session_id = $1`,
          values
        )
        return true
      }
      
      return false
    } catch (error) {
      logger.error('RENDER: PostgreSQL update error:', error)
      return false
    }
  }

  async _deleteFromPostgres(sessionId) {
    if (!this.isPostgresConnected) return false
    
    try {
      const result = await this.postgresPool.query(`
        UPDATE users 
        SET session_id = NULL, 
            is_connected = false, 
            connection_status = 'disconnected',
            updated_at = NOW()
        WHERE session_id = $1
      `, [sessionId])
      
      return result.rowCount > 0
    } catch (error) {
      logger.error('RENDER: PostgreSQL delete error:', error)
      return false
    }
  }

  async _getAllFromPostgres() {
    if (!this.isPostgresConnected) return []
    
    try {
      const result = await this.postgresPool.query(`
        SELECT telegram_id, session_id, phone_number, is_connected, 
               connection_status, source, detected,
               created_at, updated_at
        FROM users 
        WHERE session_id IS NOT NULL
        ORDER BY updated_at DESC
      `)
      
      return result.rows.map(row => ({
        sessionId: row.session_id,
        userId: row.telegram_id,
        telegramId: row.telegram_id,
        phoneNumber: row.phone_number,
        isConnected: row.is_connected,
        connectionStatus: row.connection_status || 'disconnected',
        source: row.source || 'web',
        detected: row.detected !== undefined ? row.detected : false,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    } catch (error) {
      logger.error('RENDER: PostgreSQL get all error:', error)
      return []
    }
  }

  async _createUserPostgres(name, phoneNumber, password) {
    if (!this.isPostgresConnected) throw new Error('PostgreSQL not connected')
    
    // Check if user exists
    const existingUser = await this.postgresPool.query(
      'SELECT id FROM users WHERE phone_number = $1',
      [phoneNumber]
    )
    
    if (existingUser.rows.length > 0) {
      throw new Error('Phone number already registered')
    }

    // Generate telegram_id in 9 billion+ range for web users
    const telegramId = 9000000000 + Math.floor(Math.random() * 999999999)
    const passwordHash = await bcrypt.hash(password, 10)

    const result = await this.postgresPool.query(`
      INSERT INTO users (
        telegram_id, username, first_name, phone_number, 
        is_admin, is_active, source, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id, telegram_id, first_name, phone_number
    `, [
      telegramId,
      `web_${name.toLowerCase().replace(/\s+/g, '_')}_${Math.floor(Math.random() * 1000)}`,
      name,
      phoneNumber,
      false,
      true,
      'web'
    ])

    // Insert password hash in separate table
    await this.postgresPool.query(`
      INSERT INTO web_users_auth (user_id, password_hash, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
    `, [result.rows[0].id, passwordHash])

    return {
      id: result.rows[0].id,
      telegram_id: result.rows[0].telegram_id,
      name: result.rows[0].first_name,
      phone_number: result.rows[0].phone_number
    }
  }

  async _getUserByPhonePostgres(phoneNumber) {
    if (!this.isPostgresConnected) return null
    
    const result = await this.postgresPool.query(`
      SELECT u.id, u.telegram_id, u.first_name, u.phone_number, w.password_hash
      FROM users u
      LEFT JOIN web_users_auth w ON u.id = w.user_id
      WHERE u.phone_number = $1
    `, [phoneNumber])
    
    if (!result.rows.length) return null
    
    const row = result.rows[0]
    return {
      id: row.id,
      telegram_id: row.telegram_id,
      name: row.first_name,
      phone_number: row.phone_number,
      password_hash: row.password_hash
    }
  }

  async _getUserByIdPostgres(userId) {
    if (!this.isPostgresConnected) return null
    
    const result = await this.postgresPool.query(`
      SELECT u.id, u.telegram_id, u.first_name, u.phone_number
      FROM users u
      WHERE u.id = $1
    `, [userId])
    
    if (!result.rows.length) return null
    
    const row = result.rows[0]
    return {
      id: row.id,
      telegram_id: row.telegram_id,
      name: row.first_name,
      phone_number: row.phone_number
    }
  }

  get isConnected() {
    return this.isMongoConnected || this.isPostgresConnected
  }

  async close() {
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
    
    // Clear all caches and buffers
    this.sessionCache.clear()
    for (const buffer of this.writeBuffer.values()) {
      if (buffer.timeout) {
        clearTimeout(buffer.timeout)
      }
    }
    this.writeBuffer.clear()
  }
}