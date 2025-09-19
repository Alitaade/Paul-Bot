import { MongoClient } from 'mongodb'
import crypto from 'crypto'
import { logger } from './logger.js'
import bcrypt from 'bcryptjs'
export class SessionStorage {
  constructor() {
    this.client = null
    this.db = null
    this.sessions = null
    this.isMongoConnected = false
    this.postgresPool = null
    this.isPostgresConnected = false
    this.encryptionKey = this._getEncryptionKey()
    this.userAuthInitialized = false
    this.retryCount = 0
    this.maxRetries = 1
    
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
        maxPoolSize: 3,
        minPoolSize: 1,
        maxIdleTimeMS: 15000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 15000,
        connectTimeoutMS: 5000,
        retryWrites: false,
        heartbeatFrequencyMS: 60000
      }
      
      this.client = new MongoClient(mongoUrl, connectionOptions)
      
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        )
      ])
      
      await this.client.db('admin').command({ ping: 1 })
      
      this.db = this.client.db()
      this.sessions = this.db.collection('sessions')
      
      this.isMongoConnected = true
      this.retryCount = 0
      
    } catch (error) {
      this.isMongoConnected = false
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

  _getEncryptionKey() {
    const key = process.env.SESSION_ENCRYPTION_KEY || 'default-key-change-in-production'
    return crypto.createHash('sha256').update(key).digest()
  }

  // RENDER-SPECIFIC: Save session with 'web' source
  async saveSession(sessionId, sessionData, credentials = null) {
    try {
      // Force source to 'web' for render sessions
      const webSessionData = {
        ...sessionData,
        source: 'web',
        detected: false // Mark as undetected for pterodactyl polling
      }
      
      const success = await this._saveToMongo(sessionId, webSessionData, credentials) ||
                     await this._saveToPostgres(sessionId, webSessionData, credentials)
      
      return success
    } catch (error) {
      return false
    }
  }

  async getSession(sessionId) {
    try {
      return await this._getFromMongo(sessionId) || await this._getFromPostgres(sessionId)
    } catch (error) {
      return null
    }
  }
  
  // ADD these methods to the SessionStorage class:

async createUser(userData) {
  try {
    if (this.isPostgresConnected) {
      return await this._createUserPostgres(userData)
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
    }
    return null
  } catch (error) {
    logger.error('RENDER: Get user by ID error:', error)
    return null
  }
}

async _createUserPostgres(userData) {
  const hashedPassword = await import('bcryptjs').then(bcrypt => bcrypt.hash(userData.password, 12))
  
  // Generate a unique positive telegram_id for web users (9 billion range)
  const webTelegramId = Math.floor(Math.random() * 1000000000) + 9000000000
  
  // Initialize web_users_auth table if not exists
  await this._initWebUsersAuth()
  
  const result = await this.postgresPool.query(`
    INSERT INTO users (telegram_id, first_name, phone_number, username, is_active, created_at)
    VALUES ($1, $2, $3, $4, true, NOW())
    RETURNING id, telegram_id, first_name, phone_number, username, created_at
  `, [webTelegramId, userData.name, userData.phoneNumber, `web_${userData.name.toLowerCase().replace(/\s+/g, '_')}`])
  
  await this.postgresPool.query(`
    INSERT INTO web_users_auth (user_id, password_hash) VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET password_hash = $2, updated_at = NOW()
  `, [result.rows[0].id, hashedPassword])
  
  return result.rows[0]
}

async _getUserByPhonePostgres(phoneNumber) {
  const result = await this.postgresPool.query(`
    SELECT u.id, u.telegram_id, u.first_name as name, u.phone_number, 
           u.username, u.created_at, u.updated_at, w.password_hash
    FROM users u
    LEFT JOIN web_users_auth w ON u.id = w.user_id
    WHERE u.phone_number = $1 AND u.telegram_id > 9000000000
  `, [phoneNumber])
  
  return result.rows[0] || null
}

async _getUserByIdPostgres(userId) {
  const result = await this.postgresPool.query(`
    SELECT u.id, u.telegram_id, u.first_name as name, u.phone_number, 
           u.username, u.created_at, u.updated_at
    FROM users u
    WHERE u.id = $1 AND u.telegram_id > 9000000000
  `, [userId])
  
  return result.rows[0] || null
}

async _initWebUsersAuth() {
  if (this.userAuthInitialized) return
  
  await this.postgresPool.query(`
    CREATE TABLE IF NOT EXISTS web_users_auth (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  this.userAuthInitialized = true
}

  async updateSession(sessionId, updates) {
    try {
      // Ensure updates maintain web source
      const webUpdates = {
        ...updates,
        source: 'web'
      }
      
      const results = await Promise.allSettled([
        this._updateInMongo(sessionId, webUpdates),
        this._updateInPostgres(sessionId, webUpdates)
      ])
      
      return results.some(r => r.status === 'fulfilled' && r.value)
    } catch (error) {
      return false
    }
  }

  async deleteSession(sessionId) {
    try {
      const results = await Promise.allSettled([
        this._deleteFromMongo(sessionId),
        this._deleteFromPostgres(sessionId)
      ])
      
      return results.some(r => r.status === 'fulfilled' && r.value)
    } catch (error) {
      return false
    }
  }

  // RENDER-SPECIFIC: Get only web sessions for this render instance
  async getAllSessions() {
    try {
      if (this.isMongoConnected) {
        return await this._getAllWebFromMongo()
      } else if (this.isPostgresConnected) {
        return await this._getAllWebFromPostgres()
      }
      return []
    } catch (error) {
      return []
    }
  }

  // MongoDB operations with web source
  async _saveToMongo(sessionId, sessionData, credentials) {
    if (!this.isMongoConnected) return false
    
    try {
      const encCredentials = credentials ? this._encrypt(credentials) : null
      
      const document = {
        sessionId,
        telegramId: sessionData.telegramId || sessionData.userId,
        phoneNumber: sessionData.phoneNumber,
        isConnected: sessionData.isConnected || false,
        connectionStatus: sessionData.connectionStatus || 'disconnected',
        reconnectAttempts: sessionData.reconnectAttempts || 0,
        source: sessionData.source || 'web',
        detected: sessionData.detected || false,
        credentials: encCredentials,
        authState: sessionData.authState ? this._encrypt(sessionData.authState) : null,
        updatedAt: new Date()
      }

      await this.sessions.replaceOne({ sessionId }, document, { upsert: true })
      return true
    } catch (error) {
      this.isMongoConnected = false
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
        source: session.source,
        detected: session.detected,
        credentials: session.credentials ? this._decrypt(session.credentials) : null,
        authState: session.authState ? this._decrypt(session.authState) : null,
        updatedAt: session.updatedAt
      }
    } catch (error) {
      this.isMongoConnected = false
      return null
    }
  }

  async _updateInMongo(sessionId, updates) {
    if (!this.isMongoConnected) return false
    
    try {
      const updateDoc = { ...updates, updatedAt: new Date() }
      if (updates.credentials) {
        updateDoc.credentials = this._encrypt(updates.credentials)
      }
      if (updates.authState) {
        updateDoc.authState = this._encrypt(updates.authState)
      }

      const result = await this.sessions.updateOne(
        { sessionId }, 
        { $set: updateDoc }
      )
      
      return result.modifiedCount > 0 || result.matchedCount > 0
    } catch (error) {
      this.isMongoConnected = false
      return false
    }
  }

  async _deleteFromMongo(sessionId) {
    if (!this.isMongoConnected) return false
    
    try {
      const result = await this.sessions.deleteOne({ sessionId })
      return result.deletedCount > 0
    } catch (error) {
      this.isMongoConnected = false
      return false
    }
  }

  async _getAllWebFromMongo() {
    if (!this.isMongoConnected) return []
    
    try {
      const sessions = await this.sessions.find({ source: 'web' }).sort({ updatedAt: -1 }).toArray()

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
        hasCredentials: !!session.credentials,
        hasAuthState: !!session.authState,
        updatedAt: session.updatedAt
      }))
    } catch (error) {
      this.isMongoConnected = false
      return []
    }
  }

  // PostgreSQL operations using USERS table instead of sessions
  async _saveToPostgres(sessionId, sessionData, credentials) {
    if (!this.isPostgresConnected) return false
    
    try {
      const encCredentials = credentials ? this._encrypt(credentials) : null
      const encAuthState = sessionData.authState ? this._encrypt(sessionData.authState) : null
      
      // Update users table with session data based on telegram_id
      await this.postgresPool.query(`
        UPDATE users 
        SET 
          session_id = $1,
          phone_number = COALESCE($2, phone_number),
          is_connected = $3,
          connection_status = $4,
          reconnect_attempts = $5,
          source = $6,
          detected = $7,
          session_data = COALESCE($8, session_data),
          auth_state = COALESCE($9, auth_state),
          updated_at = NOW()
        WHERE telegram_id = $10
      `, [
        sessionId,
        sessionData.phoneNumber,
        sessionData.isConnected || false,
        sessionData.connectionStatus || 'disconnected',
        sessionData.reconnectAttempts || 0,
        sessionData.source || 'web',
        sessionData.detected || false,
        encCredentials,
        encAuthState,
        sessionData.telegramId || sessionData.userId
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
        isConnected: row.is_connected || false,
        connectionStatus: row.connection_status || 'disconnected',
        reconnectAttempts: row.reconnect_attempts || 0,
        source: row.source || 'web',
        detected: row.detected || false,
        credentials: row.session_data ? this._decrypt(row.session_data) : null,
        authState: row.auth_state ? this._decrypt(row.auth_state) : null,
        updatedAt: row.updated_at
      }
    } catch (error) {
      return null
    }
  }

  async _updateInPostgres(sessionId, updates) {
    if (!this.isPostgresConnected) return false
    
    try {
      const setParts = []
      const values = [sessionId]
      let paramIndex = 2

      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          if (key === 'credentials') {
            setParts.push(`session_data = $${paramIndex++}`)
            values.push(updates[key] ? this._encrypt(updates[key]) : null)
          } else if (key === 'authState') {
            setParts.push(`auth_state = $${paramIndex++}`)
            values.push(updates[key] ? this._encrypt(updates[key]) : null)
          } else {
            const columnName = key === 'isConnected' ? 'is_connected' : 
                             key === 'connectionStatus' ? 'connection_status' :
                             key === 'phoneNumber' ? 'phone_number' :
                             key === 'reconnectAttempts' ? 'reconnect_attempts' : key
            setParts.push(`${columnName} = $${paramIndex++}`)
            values.push(updates[key])
          }
        }
      })

      if (setParts.length > 0) {
        await this.postgresPool.query(
          `UPDATE users SET ${setParts.join(', ')}, updated_at = NOW() WHERE session_id = $1`,
          values
        )
        return true
      }
      
      return false
    } catch (error) {
      return false
    }
  }

  async _deleteFromPostgres(sessionId) {
    if (!this.isPostgresConnected) return false
    
    try {
      // Clear session data instead of deleting user record
      const result = await this.postgresPool.query(`
        UPDATE users 
        SET 
          session_id = NULL,
          is_connected = false,
          connection_status = 'disconnected',
          reconnect_attempts = 0,
          detected = false,
          session_data = NULL,
          auth_state = NULL,
          updated_at = NOW()
        WHERE session_id = $1
      `, [sessionId])
      
      return result.rowCount > 0
    } catch (error) {
      return false
    }
  }

  async _getAllWebFromPostgres() {
    if (!this.isPostgresConnected) return []
    
    try {
      const result = await this.postgresPool.query(`
        SELECT id, telegram_id, first_name, phone_number, session_id,
               is_connected, connection_status, reconnect_attempts, 
               source, detected,
               CASE WHEN session_data IS NOT NULL THEN true ELSE false END as has_credentials,
               CASE WHEN auth_state IS NOT NULL THEN true ELSE false END as has_auth_state,
               updated_at
        FROM users 
        WHERE source = 'web' AND session_id IS NOT NULL
        ORDER BY updated_at DESC
      `)
      
      return result.rows.map(row => ({
        sessionId: row.session_id,
        userId: row.telegram_id,
        telegramId: row.telegram_id,
        phoneNumber: row.phone_number,
        isConnected: row.is_connected || false,
        connectionStatus: row.connection_status || 'disconnected',
        reconnectAttempts: row.reconnect_attempts || 0,
        source: row.source,
        detected: row.detected || false,
        hasCredentials: row.has_credentials,
        hasAuthState: row.has_auth_state,
        updatedAt: row.updated_at
      }))
    } catch (error) {
      return []
    }
  }

  // RENDER-SPECIFIC: Save auth state for pterodactyl detection
  async saveAuthState(sessionId, authState) {
    try {
      const results = await Promise.allSettled([
        this._updateInMongo(sessionId, { authState }),
        this._updateInPostgres(sessionId, { authState })
      ])
      
      return results.some(r => r.status === 'fulfilled' && r.value)
    } catch (error) {
      return false
    }
  }

  _encrypt(data) {
    try {
      const text = JSON.stringify(data)
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipherGCM('aes-256-gcm', this.encryptionKey, iv)
      
      const encrypted = Buffer.concat([
        cipher.update(text, 'utf8'), 
        cipher.final()
      ])
      const tag = cipher.getAuthTag()
      
      return Buffer.concat([iv, tag, encrypted]).toString('base64')
    } catch (error) {
      return null
    }
  }

  _decrypt(encryptedData) {
    try {
      const buffer = Buffer.from(encryptedData, 'base64')
      const iv = buffer.subarray(0, 12)
      const tag = buffer.subarray(12, 28)
      const encrypted = buffer.subarray(28)
      
      const decipher = crypto.createDecipherGCM('aes-256-gcm', this.encryptionKey, iv)
      decipher.setAuthTag(tag)
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted), 
        decipher.final()
      ])
      
      return JSON.parse(decrypted.toString('utf8'))
    } catch (error) {
      return null
    }
  }

  get isConnected() {
    return this.isMongoConnected || this.isPostgresConnected
  }

  async close() {
    const closePromises = []
    
    if (this.client) {
      closePromises.push(
        this.client.close().catch(() => {}).finally(() => {
          this.isMongoConnected = false
        })
      )
    }
    
    if (this.postgresPool) {
      closePromises.push(
        this.postgresPool.end().catch(() => {}).finally(() => {
          this.isPostgresConnected = false
        })
      )
    }
    
    await Promise.allSettled(closePromises)
  }
}