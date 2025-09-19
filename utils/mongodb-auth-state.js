import { proto } from '@whiskeysockets/baileys'
import { initAuthCreds } from '@whiskeysockets/baileys'
import { logger } from './logger.js'

const BufferJSON = {
  replacer: (k, value) => {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array || value?.type === 'Buffer') {
      return {
        type: 'Buffer',
        data: Buffer.from(value?.data || value).toString('base64'),
      }
    }
    return value
  },
  reviver: (_, value) => {
    if (typeof value === 'object' && !!value && (value.buffer === true || value.type === 'Buffer')) {
      const val = value.data || value.value
      return typeof val === 'string' ? Buffer.from(val, 'base64') : Buffer.from(val || [])
    }
    return value
  },
}

// Minimal, session-specific cache with aggressive cleanup
const authCache = new Map()
const writeQueue = new Map()

// Cleanup function to prevent RAM buildup
const cleanupCache = (sessionId = null) => {
  if (sessionId) {
    // Clean up specific session
    for (const [key] of authCache) {
      if (key.startsWith(`${sessionId}:`)) {
        authCache.delete(key)
      }
    }
    for (const [key, timeout] of writeQueue) {
      if (key.startsWith(`${sessionId}:`)) {
        clearTimeout(timeout)
        writeQueue.delete(key)
      }
    }
  } else {
    // Clean up old entries (older than 5 minutes)
    const now = Date.now()
    const maxAge = 300000 // 5 minutes
    
    for (const [key, data] of authCache) {
      if (data.timestamp && (now - data.timestamp) > maxAge) {
        authCache.delete(key)
      }
    }
  }
}

// Periodic cleanup every 2 minutes to prevent memory leaks
setInterval(() => cleanupCache(), 120000)

export const useMongoDBAuthState = async (collection, sessionId) => {
  if (!sessionId || !sessionId.startsWith('session_')) {
    throw new Error(`Invalid sessionId: ${sessionId}`)
  }

  const fixFileName = (file) => file?.replace(/\//g, "__")?.replace(/:/g, "-") || ""

  const readData = async (fileName) => {
    const cacheKey = `${sessionId}:${fileName}`
    
    // Check cache with timestamp validation
    if (authCache.has(cacheKey)) {
      const cached = authCache.get(cacheKey)
      const now = Date.now()
      
      // Cache valid for only 30 seconds to prevent stale data
      if (cached.timestamp && (now - cached.timestamp) < 30000) {
        return cached.data
      } else {
        authCache.delete(cacheKey) // Remove stale data
      }
    }

    try {
      const query = { filename: fixFileName(fileName), sessionId: sessionId }
      const result = await collection.findOne(query, { projection: { datajson: 1 } })
      const data = result ? JSON.parse(result.datajson, BufferJSON.reviver) : null
      
      // Cache with timestamp for short-term use only
      if (data) {
        authCache.set(cacheKey, {
          data: data,
          timestamp: Date.now()
        })
      }
      
      return data
    } catch (error) {
      logger.error(`[MongoDB Auth] Error reading ${fileName}:`, error.message)
      return null
    }
  }

  const writeData = async (datajson, fileName) => {
    const cacheKey = `${sessionId}:${fileName}`
    
    // Update cache immediately with timestamp
    authCache.set(cacheKey, {
      data: datajson,
      timestamp: Date.now()
    })

    const queueKey = `${sessionId}:${fileName}`
    
    // Clear existing timeout to prevent duplicate writes
    if (writeQueue.has(queueKey)) {
      clearTimeout(writeQueue.get(queueKey))
    }
    
    // Debounced write with shorter delay
    const timeoutId = setTimeout(async () => {
      try {
        const query = { filename: fixFileName(fileName), sessionId: sessionId }
        const update = {
          $set: {
            filename: fixFileName(fileName),
            sessionId: sessionId,
            datajson: JSON.stringify(datajson, BufferJSON.replacer),
            updatedAt: new Date()
          },
        }
        await collection.updateOne(query, update, { upsert: true })
      } catch (error) {
        logger.error(`[MongoDB Auth] Error writing ${fileName}:`, error.message)
      } finally {
        writeQueue.delete(queueKey)
      }
    }, 50) // Reduced from 100ms to 50ms for faster writes
    
    writeQueue.set(queueKey, timeoutId)
  }

  const removeData = async (fileName) => {
    const cacheKey = `${sessionId}:${fileName}`
    authCache.delete(cacheKey)
    
    try {
      const query = { filename: fixFileName(fileName), sessionId: sessionId }
      await collection.deleteOne(query)
    } catch (error) {
      logger.error(`[MongoDB Auth] Error removing ${fileName}:`, error.message)
    }
  }

  // Load existing credentials
  const existingCreds = await readData("creds.json")
  
  let creds
  if (existingCreds && existingCreds.noiseKey && existingCreds.signedIdentityKey) {
    creds = existingCreds
  } else {
    creds = initAuthCreds()
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {}
          
          // Process in smaller batches to prevent memory spikes
          const batchSize = 10
          for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize)
            
            const promises = batch.map(async (id) => {
              try {
                let value = await readData(`${type}-${id}.json`)
                if (type === "app-state-sync-key" && value) {
                  value = proto.Message.AppStateSyncKeyData.fromObject(value)
                }
                if (value) data[id] = value
              } catch (error) {
                logger.error(`[MongoDB Auth] Error getting key ${type}-${id}:`, error.message)
              }
            })
            
            await Promise.allSettled(promises)
          }
          
          return data
        },
        set: async (data) => {
          const tasks = []
          
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id]
              const file = `${category}-${id}.json`
              
              // Limit concurrent operations to prevent memory spikes
              if (tasks.length >= 20) {
                await Promise.allSettled(tasks)
                tasks.length = 0
              }
              
              tasks.push(value ? writeData(value, file) : removeData(file))
            }
          }
          
          if (tasks.length > 0) {
            await Promise.allSettled(tasks)
          }
        },
      },
    },
    saveCreds: () => writeData(creds, "creds.json"),
    
    // Add cleanup method for this session
    cleanup: () => {
      cleanupCache(sessionId)
    }
  }
}

export const getAllAuthSessions = async (collection) => {
  try {
    const sessions = await collection.distinct('sessionId', {
      filename: 'creds.json',
      sessionId: { $regex: /^session_/ }
    })
    return sessions || []
  } catch (error) {
    logger.error('[MongoDB Auth] Error getting all sessions:', error.message)
    return []
  }
}

export const hasValidAuthData = async (collection, sessionId) => {
  try {
    const creds = await collection.findOne({
      filename: 'creds.json',
      sessionId: sessionId
    }, { projection: { datajson: 1 } })
    
    if (!creds) return false
    
    const credsData = JSON.parse(creds.datajson, BufferJSON.reviver)
    return !!(credsData && credsData.noiseKey && credsData.signedIdentityKey)
  } catch (error) {
    logger.error(`[MongoDB Auth] Error checking valid auth data for ${sessionId}:`, error.message)
    return false
  }
}

export const cleanupSessionAuthData = async (collection, sessionId) => {
  try {
    // Clean up database
    const result = await collection.deleteMany({ sessionId })
    
    // Clean up memory cache
    cleanupCache(sessionId)
    
    logger.info(`[MongoDB Auth] Cleaned up ${result.deletedCount} documents for session ${sessionId}`)
    return true
  } catch (error) {
    logger.error(`[MongoDB Auth] Error cleaning up session ${sessionId}:`, error.message)
    return false
  }
}

export const getAuthStats = async (collection) => {
  try {
    const [totalDocs, sessions, credsSessions] = await Promise.all([
      collection.countDocuments(),
      collection.distinct('sessionId'),
      collection.distinct('sessionId', { filename: 'creds.json' })
    ])
    
    return {
      totalAuthDocuments: totalDocs,
      totalSessions: sessions.length,
      sessionsWithCreds: credsSessions.length,
      avgDocsPerSession: sessions.length > 0 ? Math.round(totalDocs / sessions.length) : 0,
      cacheSize: authCache.size,
      pendingWrites: writeQueue.size
    }
  } catch (error) {
    logger.error('[MongoDB Auth] Error getting auth stats:', error.message)
    return {
      totalAuthDocuments: 0,
      totalSessions: 0,
      sessionsWithCreds: 0,
      avgDocsPerSession: 0,
      cacheSize: 0,
      pendingWrites: 0
    }
  }
}

// Manual cleanup function for external use
export const performAuthCacheMaintenance = () => {
  const beforeSize = authCache.size
  cleanupCache()
  const afterSize = authCache.size
  
  if (beforeSize !== afterSize) {
    logger.info(`[MongoDB Auth] Cache maintenance: removed ${beforeSize - afterSize} stale entries`)
  }
  
  return {
    before: beforeSize,
    after: afterSize,
    removed: beforeSize - afterSize,
    pendingWrites: writeQueue.size
  }
}