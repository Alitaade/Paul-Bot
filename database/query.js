// Database query utilities
// queries/index.js - Fixed Database Query Abstraction Layer
// Updated to work with the new schema and proper constraints

import { pool } from "../config/database.js"
import { logger } from "../utils/logger.js"

class QueryManager {
  constructor() {
    this.cache = new Map()
    this.cacheTimeout = 5 * 60 * 1000 // 5 minutes
  }

  /**
   * Execute a raw query with error handling
   */
  async execute(query, params = []) {
    try {
      const result = await pool.query(query, params)
      return result
    } catch (error) {
      logger.error(`[QueryManager] Database error: ${error.message}`)
      logger.error(`[QueryManager] Query: ${query}`)
      logger.error(`[QueryManager] Params: ${JSON.stringify(params)}`)
      throw error
    }
  }

  /**
   * Execute query with caching
   */
  async executeWithCache(cacheKey, query, params = [], ttl = this.cacheTimeout) {
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      if (Date.now() - cached.timestamp < ttl) {
        return cached.data
      }
      this.cache.delete(cacheKey)
    }

    const result = await this.execute(query, params)
    this.cache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    })

    return result
  }

  /**
   * Clear cache for a specific key or all cache
   */
  clearCache(key = null) {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }
}

const queryManager = new QueryManager()

// ==========================================
// GROUP SETTINGS QUERIES - FIXED VERSION
// ==========================================

export const GroupQueries = {
  // ==========================================
  // BASIC GROUP MANAGEMENT
  // ==========================================

  /**
   * Ensure group exists in database - FIXED FOR CONSTRAINT ISSUE
   */
  async ensureGroupExists(groupJid, groupName = null) {
    if (!groupJid) {
      logger.warn(`[GroupQueries] Cannot ensure group exists - no groupJid provided`)
      return null
    }

    try {
      try {
        const result = await queryManager.execute(
          `INSERT INTO groups (jid, name, created_at, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (jid) 
           DO UPDATE SET 
             name = COALESCE($2, groups.name),
             updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [groupJid, groupName],
        )

        logger.debug(`[GroupQueries] Ensured group exists: ${groupJid}`)
        return result.rows[0]
      } catch (constraintError) {
        if (constraintError.message.includes("no unique or exclusion constraint")) {
          const existsResult = await queryManager.execute(`SELECT id FROM groups WHERE jid = $1`, [groupJid])

          if (existsResult.rows.length === 0) {
            const result = await queryManager.execute(
              `INSERT INTO groups (jid, name, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
              [groupJid, groupName],
            )
            logger.debug(`[GroupQueries] Ensured group exists (fallback): ${groupJid}`)
            return result.rows[0]
          } else {
            if (groupName) {
              await queryManager.execute(`UPDATE groups SET name = $2, updated_at = CURRENT_TIMESTAMP WHERE jid = $1`, [
                groupJid,
                groupName,
              ])
            }
            logger.debug(`[GroupQueries] Group already exists: ${groupJid}`)
            return existsResult.rows[0]
          }
        } else {
          throw constraintError
        }
      }
    } catch (error) {
      logger.error(`[GroupQueries] Error ensuring group exists: ${error.message}`)
      throw error
    }
  },

  /**
   * Get basic group settings
   */
  async getSettings(groupJid) {
    try {
      const result = await queryManager.execute(`SELECT * FROM groups WHERE jid = $1`, [groupJid])
      return result.rows[0] || null
    } catch (error) {
      logger.error(`[GroupQueries] Error getting settings for ${groupJid}: ${error.message}`)
      return null
    }
  },

  /**
   * Delete group from database
   */
  async deleteGroup(groupJid) {
    try {
      await queryManager.execute(`DELETE FROM groups WHERE jid = $1`, [groupJid])
      queryManager.clearCache(`group_settings_${groupJid}`)
      logger.info(`[GroupQueries] Deleted group: ${groupJid}`)
    } catch (error) {
      logger.error(`[GroupQueries] Error deleting group: ${error.message}`)
      throw error
    }
  },

  /**
   * Update group metadata
   */
  async updateGroupMeta(groupJid, metadata = {}) {
    try {
      const { name, description, participantsCount, isBotAdmin } = metadata

      await queryManager.execute(
        `UPDATE groups 
         SET name = COALESCE($2, name),
             description = COALESCE($3, description),
             participants_count = COALESCE($4, participants_count),
             is_bot_admin = COALESCE($5, is_bot_admin),
             updated_at = CURRENT_TIMESTAMP
         WHERE jid = $1`,
        [groupJid, name, description, participantsCount, isBotAdmin],
      )

      queryManager.clearCache(`group_settings_${groupJid}`)
    } catch (error) {
      logger.error(`[GroupQueries] Error updating group meta: ${error.message}`)
    }
  },

  // ==========================================
  // GROUP SETTINGS MANAGEMENT
  // ==========================================

  /**
   * Get comprehensive group settings including grouponly and public_mode
   */
  async getGroupSettings(groupJid) {
    try {
      const query = `
        SELECT grouponly_enabled, public_mode, antilink_enabled, is_bot_admin,
               anticall_enabled, antiimage_enabled, antivideo_enabled,
               antiaudio_enabled, antidocument_enabled, antisticker_enabled, 
               antigroupmention_enabled, antidelete_enabled, antiviewonce_enabled,
               antibot_enabled, antispam_enabled, antiraid_enabled,
               autowelcome_enabled, autokick_enabled,
               welcome_enabled, goodbye_enabled
        FROM groups 
        WHERE jid = $1
      `
      const result = await queryManager.execute(query, [groupJid])
      
      if (result.rows.length === 0) {
        // Create group record if it doesn't exist
        await this.ensureGroupExists(groupJid)
        return {
          grouponly_enabled: false,
          public_mode: true,
          antilink_enabled: false,
          is_bot_admin: false
        }
      }
      
      return result.rows[0]
    } catch (error) {
      logger.error("Error getting group settings:", error)
      return {
        grouponly_enabled: false,
        public_mode: true,
        antilink_enabled: false,
        is_bot_admin: false
      }
    }
  },

  /**
   * Update multiple group settings at once
   */
  async updateGroupSettings(groupJid, settings) {
    try {
      // Ensure group exists first
      await this.ensureGroupExists(groupJid)
      
      const allowedFields = [
        'grouponly_enabled', 'public_mode', 'antilink_enabled', 
        'is_bot_admin', 'name', 'description', 'anticall_enabled',
        'antiimage_enabled', 'antivideo_enabled', 'antiaudio_enabled',
        'antidocument_enabled', 'antisticker_enabled', 'antigroupmention_enabled',
        'antidelete_enabled', 'antiviewonce_enabled', 'antibot_enabled',
        'antispam_enabled', 'antiraid_enabled', 'autowelcome_enabled',
        'autokick_enabled', 'welcome_enabled', 'goodbye_enabled'
      ]
      
      const updates = []
      const values = [groupJid]
      let paramIndex = 2
      
      for (const [key, value] of Object.entries(settings)) {
        if (allowedFields.includes(key)) {
          updates.push(`${key} = $${paramIndex}`)
          values.push(value)
          paramIndex++
        }
      }
      
      if (updates.length === 0) {
        throw new Error('No valid fields to update')
      }
      
      updates.push(`updated_at = CURRENT_TIMESTAMP`)
      
      const query = `
        UPDATE groups 
        SET ${updates.join(', ')} 
        WHERE jid = $1
        RETURNING *
      `
      
      const result = await queryManager.execute(query, values)
      queryManager.clearCache(`group_settings_${groupJid}`)
      return result.rows[0]
      
    } catch (error) {
      logger.error("Error updating group settings:", error)
      throw error
    }
  },

  /**
   * Create or update group settings - UPSERT with fallback
   */
  async upsertSettings(groupJid, settings = {}) {
    try {
      // Handle empty settings case
      if (Object.keys(settings).length === 0) {
        try {
          const result = await queryManager.execute(
            `INSERT INTO groups (jid, updated_at)
             VALUES ($1, CURRENT_TIMESTAMP)
             ON CONFLICT (jid)
             DO UPDATE SET updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [groupJid],
          )
          return result.rows[0]
        } catch (constraintError) {
          if (constraintError.message.includes("no unique or exclusion constraint")) {
            const existsResult = await queryManager.execute(`SELECT * FROM groups WHERE jid = $1`, [groupJid])

            if (existsResult.rows.length === 0) {
              const result = await queryManager.execute(
                `INSERT INTO groups (jid, updated_at) VALUES ($1, CURRENT_TIMESTAMP) RETURNING *`,
                [groupJid],
              )
              return result.rows[0]
            } else {
              const result = await queryManager.execute(
                `UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE jid = $1 RETURNING *`,
                [groupJid],
              )
              return result.rows[0]
            }
          } else {
            throw constraintError
          }
        }
      }

      // Build dynamic query for multiple settings
      const columns = Object.keys(settings)
      const values = Object.values(settings)
      const placeholders = columns.map((_, i) => `$${i + 2}`).join(", ")
      const updateSet = columns.map((col, i) => `${col} = $${i + 2}`).join(", ")

      try {
        const query = `
          INSERT INTO groups (jid, ${columns.join(", ")}, updated_at)
          VALUES ($1, ${placeholders}, CURRENT_TIMESTAMP)
          ON CONFLICT (jid)
          DO UPDATE SET 
            ${updateSet},
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `

        const result = await queryManager.execute(query, [groupJid, ...values])
        queryManager.clearCache(`group_settings_${groupJid}`)
        return result.rows[0]
      } catch (constraintError) {
        if (constraintError.message.includes("no unique or exclusion constraint")) {
          const existsResult = await queryManager.execute(`SELECT * FROM groups WHERE jid = $1`, [groupJid])

          if (existsResult.rows.length === 0) {
            const query = `INSERT INTO groups (jid, ${columns.join(", ")}, updated_at) VALUES ($1, ${placeholders}, CURRENT_TIMESTAMP) RETURNING *`
            const result = await queryManager.execute(query, [groupJid, ...values])
            queryManager.clearCache(`group_settings_${groupJid}`)
            return result.rows[0]
          } else {
            const query = `UPDATE groups SET ${updateSet}, updated_at = CURRENT_TIMESTAMP WHERE jid = $1 RETURNING *`
            const result = await queryManager.execute(query, [groupJid, ...values])
            queryManager.clearCache(`group_settings_${groupJid}`)
            return result.rows[0]
          }
        } else {
          throw constraintError
        }
      }
    } catch (error) {
      logger.error(`[GroupQueries] Error in upsertSettings: ${error.message}`)
      throw error
    }
  },

  // ==========================================
  // GROUP-ONLY FUNCTIONALITY (MISSING METHODS)
  // ==========================================

  /**
   * Set grouponly status for a group
   */
  async setGroupOnly(groupJid, enabled) {
    try {
      logger.info(`[GroupQueries] Setting grouponly to ${enabled} for group ${groupJid}`)

      const result = await queryManager.execute(
        `INSERT INTO groups (jid, grouponly_enabled, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (jid)
         DO UPDATE SET 
           grouponly_enabled = $2,
           updated_at = CURRENT_TIMESTAMP
         RETURNING grouponly_enabled`,
        [groupJid, enabled],
      )

      queryManager.clearCache(`group_settings_${groupJid}`)
      queryManager.clearCache(`grouponly_${groupJid}`)

      const returnValue = result.rows[0]?.grouponly_enabled || false
      logger.info(`[GroupQueries] Successfully set grouponly to ${returnValue} for ${groupJid}`)

      return returnValue
    } catch (error) {
      logger.error(`[GroupQueries] Error setting grouponly: ${error.message}`)
      throw error
    }
  },

  /**
   * Check if grouponly is enabled for a group
   */
  async isGroupOnlyEnabled(groupJid) {
    if (!groupJid) {
      logger.debug(`[GroupQueries] No groupJid provided for grouponly check, returning false`)
      return false
    }

    try {
      // Ensure group exists first
      try {
        await queryManager.execute(
          `INSERT INTO groups (jid, updated_at) VALUES ($1, CURRENT_TIMESTAMP)
           ON CONFLICT (jid) DO NOTHING`,
          [groupJid],
        )
      } catch (constraintError) {
        if (constraintError.message.includes("no unique or exclusion constraint")) {
          const existsResult = await queryManager.execute(`SELECT id FROM groups WHERE jid = $1`, [groupJid])

          if (existsResult.rows.length === 0) {
            await queryManager.execute(`INSERT INTO groups (jid, updated_at) VALUES ($1, CURRENT_TIMESTAMP)`, [
              groupJid,
            ])
          }
        } else {
          throw constraintError
        }
      }

      const result = await queryManager.execute(`SELECT grouponly_enabled FROM groups WHERE jid = $1`, [groupJid])

      const isEnabled = result.rows.length > 0 && result.rows[0].grouponly_enabled === true

      return isEnabled
    } catch (error) {
      logger.error(`[GroupQueries] Error checking if grouponly enabled: ${error.message}`)
      return false
    }
  },

  /**
   * Check if public mode is enabled for a group
   */
  async isPublicModeEnabled(groupJid) {
    try {
      const settings = await this.getGroupSettings(groupJid)
      return settings.public_mode
    } catch (error) {
      logger.error("Error checking if public mode enabled:", error)
      return true // Default to public
    }
  },

  // ==========================================
  // ANTI-COMMAND FUNCTIONALITY
  // ==========================================

  /**
   * Enable/disable specific anti-command
   */
  async setAntiCommand(groupJid, commandType, enabled) {
    const columnName = `${commandType}_enabled`

    try {
      logger.info(`[GroupQueries] Setting ${commandType} to ${enabled} for group ${groupJid}`)

      const result = await queryManager.execute(
        `INSERT INTO groups (jid, ${columnName}, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (jid)
         DO UPDATE SET 
           ${columnName} = $2,
           updated_at = CURRENT_TIMESTAMP
         RETURNING ${columnName}`,
        [groupJid, enabled],
      )

      queryManager.clearCache(`group_settings_${groupJid}`)
      queryManager.clearCache(`anti_${commandType}_${groupJid}`)

      const returnValue = result.rows[0]?.[columnName] || false
      logger.info(`[GroupQueries] Successfully set ${commandType} to ${returnValue} for ${groupJid}`)

      return returnValue
    } catch (error) {
      logger.error(`[GroupQueries] Error setting ${commandType}: ${error.message}`)
      throw error
    }
  },

  /**
   * Check if anti-command is enabled
   */
  async isAntiCommandEnabled(groupJid, commandType) {
    if (!groupJid) {
      logger.debug(`[GroupQueries] No groupJid provided for ${commandType} check, returning false`)
      return false
    }

    const columnName = `${commandType}_enabled`
    try {
      // Ensure group exists first
      try {
        await queryManager.execute(
          `INSERT INTO groups (jid, updated_at) VALUES ($1, CURRENT_TIMESTAMP)
           ON CONFLICT (jid) DO NOTHING`,
          [groupJid],
        )
      } catch (constraintError) {
        if (constraintError.message.includes("no unique or exclusion constraint")) {
          const existsResult = await queryManager.execute(`SELECT id FROM groups WHERE jid = $1`, [groupJid])

          if (existsResult.rows.length === 0) {
            await queryManager.execute(`INSERT INTO groups (jid, updated_at) VALUES ($1, CURRENT_TIMESTAMP)`, [
              groupJid,
            ])
          }
        } else {
          throw constraintError
        }
      }

      const result = await queryManager.execute(`SELECT ${columnName} FROM groups WHERE jid = $1`, [groupJid])

      const isEnabled = result.rows.length > 0 && result.rows[0][columnName] === true

      return isEnabled
    } catch (error) {
      logger.error(`[GroupQueries] Error checking if ${commandType} enabled: ${error.message}`)
      return false
    }
  },

  /**
   * Get all enabled anti-commands for a group
   */
  async getEnabledAntiCommands(groupJid) {
    try {
      const result = await queryManager.execute(
        `SELECT 
          antilink_enabled, anticall_enabled, antiimage_enabled, antivideo_enabled,
          antiaudio_enabled, antidocument_enabled, antisticker_enabled, 
          antigroupmention_enabled, antidelete_enabled, antiviewonce_enabled,
          antibot_enabled, antispam_enabled, antiraid_enabled,
          autowelcome_enabled, autokick_enabled,
          welcome_enabled, goodbye_enabled, grouponly_enabled, public_mode
        FROM groups 
        WHERE jid = $1`,
        [groupJid],
      )

      if (result.rows.length === 0) return {}

      const settings = result.rows[0]
      const enabled = {}

      Object.keys(settings).forEach((key) => {
        if (settings[key] === true) {
          enabled[key.replace("_enabled", "")] = true
        }
      })

      return enabled
    } catch (error) {
      logger.error(`[GroupQueries] Error getting enabled anti-commands: ${error.message}`)
      return {}
    }
  },

  // ==========================================
  // ADMIN & MEMBER TRACKING
  // ==========================================

  /**
   * Log admin promotion
   */
  async logAdminPromotion(groupJid, userJid, promotedBy) {
    try {
      await queryManager.execute(
        `INSERT INTO admin_promotions (group_jid, user_jid, promoted_by, promoted_at) 
         VALUES ($1, $2, $3, NOW()) 
         ON CONFLICT (group_jid, user_jid) 
         DO UPDATE SET promoted_at = NOW(), promoted_by = $3`,
        [groupJid, userJid, promotedBy]
      )
    } catch (error) {
      logger.error("Error logging admin promotion:", error)
    }
  },

  /**
   * Get user promotion time
   */
  async getUserPromoteTime(groupJid, userJid) {
    try {
      const result = await queryManager.execute(
        `SELECT promoted_at FROM admin_promotions 
         WHERE group_jid = $1 AND user_jid = $2 
         ORDER BY promoted_at DESC LIMIT 1`,
        [groupJid, userJid]
      )
      
      return result.rows.length > 0 ? result.rows[0].promoted_at : null
    } catch (error) {
      logger.error("Error getting user promote time:", error)
      return null
    }
  },

  /**
   * Log member addition
   */
  async logMemberAddition(groupJid, addedUserJid, addedByJid) {
    try {
      await queryManager.execute(
        `INSERT INTO group_member_additions (group_jid, added_user_jid, added_by_jid) 
         VALUES ($1, $2, $3)`,
        [groupJid, addedUserJid, addedByJid]
      )
    } catch (error) {
      logger.error("Error logging member addition:", error)
    }
  }
}


// ==========================================
// VIP SYSTEM QUERIES
// ==========================================

export const VIPQueries = {
  /**
   * Check if user is a VIP
   */
  async isVIP(telegramId) {
    try {
      const result = await queryManager.execute(
        `SELECT vip_level, is_default_vip FROM whatsapp_users WHERE telegram_id = $1`,
        [telegramId]
      )
      
      if (result.rows.length === 0) return { isVIP: false, level: 0, isDefault: false }
      
      const user = result.rows[0]
      return {
        isVIP: user.vip_level > 0 || user.is_default_vip,
        level: user.vip_level || 0,
        isDefault: user.is_default_vip || false
      }
    } catch (error) {
      logger.error(`[VIPQueries] Error checking VIP status: ${error.message}`)
      return { isVIP: false, level: 0, isDefault: false }
    }
  },

  // Add this method to VIPQueries
async getUserByTelegramId(telegramId) {
  try {
    const result = await pool.query(
      `SELECT telegram_id, first_name, phone_number, is_connected, connection_status 
       FROM users 
       WHERE telegram_id = $1 
       LIMIT 1`,
      [telegramId]
    )
    
    return result.rows[0] || null
  } catch (error) {
    logger.error('[VIPQueries] Error getting user by telegram ID:', error)
    return null
  }
},

// Add to VIPQueries
async ensureWhatsAppUser(telegramId, jid, phone = null) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_users (telegram_id, jid, phone, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (telegram_id) DO UPDATE 
       SET jid = EXCLUDED.jid, 
           phone = COALESCE(EXCLUDED.phone, whatsapp_users.phone),
           updated_at = CURRENT_TIMESTAMP`,
      [telegramId, jid, phone]
    )
    return true
  } catch (error) {
    logger.error('[VIPQueries] Error ensuring whatsapp user:', error)
    return false
  }
},

  /**
   * Promote user to VIP
   */
  async promoteToVIP(telegramId, level = 1) {
    try {
      const result = await queryManager.execute(
        `INSERT INTO whatsapp_users (telegram_id, vip_level, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (telegram_id)
         DO UPDATE SET 
           vip_level = $2,
           updated_at = CURRENT_TIMESTAMP
         RETURNING telegram_id, vip_level`,
        [telegramId, level]
      )
      
      logger.info(`[VIPQueries] Promoted ${telegramId} to VIP Level ${level}`)
      return result.rows[0]
    } catch (error) {
      logger.error(`[VIPQueries] Error promoting to VIP: ${error.message}`)
      throw error
    }
  },

  /**
   * Demote VIP to regular user
   */
  async demoteVIP(telegramId) {
    try {
      await queryManager.execute(
        `UPDATE whatsapp_users 
         SET vip_level = 0, updated_at = CURRENT_TIMESTAMP 
         WHERE telegram_id = $1`,
        [telegramId]
      )
      
      logger.info(`[VIPQueries] Demoted ${telegramId} from VIP`)
      return true
    } catch (error) {
      logger.error(`[VIPQueries] Error demoting VIP: ${error.message}`)
      throw error
    }
  },

  /**
   * Set default VIP status
   */
  async setDefaultVIP(telegramId, isDefault = true) {
    try {
      await queryManager.execute(
        `INSERT INTO whatsapp_users (telegram_id, is_default_vip, vip_level, updated_at)
         VALUES ($1, $2, 99, CURRENT_TIMESTAMP)
         ON CONFLICT (telegram_id)
         DO UPDATE SET 
           is_default_vip = $2,
           vip_level = 99,
           updated_at = CURRENT_TIMESTAMP`,
        [telegramId, isDefault]
      )
      
      logger.info(`[VIPQueries] Set default VIP status for ${telegramId}: ${isDefault}`)
      return true
    } catch (error) {
      logger.error(`[VIPQueries] Error setting default VIP: ${error.message}`)
      throw error
    }
  },

async getUserByPhone(phone) {
  try {
    // Clean the phone number
    const cleanPhone = phone.replace(/[@\s\-+]/g, '')
    
    // Search for phone number in users table (stored as +2349036074532:5 format)
    const result = await queryManager.execute(
      `SELECT telegram_id, first_name, phone_number, is_connected, connection_status 
       FROM users 
       WHERE phone_number LIKE $1 
       ORDER BY updated_at DESC 
       LIMIT 1`,
      [`%${cleanPhone}%`]
    )
    
    return result.rows[0] || null
  } catch (error) {
    logger.error('[VIPQueries] Error getting user by phone:', error)
    return null
  }
},

  /**
   * Claim a user
   */
  async claimUser(vipTelegramId, targetTelegramId, targetPhone = null, targetJid = null) {
    try {
      // Check if already claimed
      const existing = await queryManager.execute(
        `SELECT vip_telegram_id FROM vip_owned_users 
         WHERE owned_telegram_id = $1 AND is_active = true`,
        [targetTelegramId]
      )
      
      if (existing.rows.length > 0) {
        return { success: false, error: 'Already claimed by another VIP', ownedBy: existing.rows[0].vip_telegram_id }
      }
      
      // Claim the user
      const result = await queryManager.execute(
        `INSERT INTO vip_owned_users (vip_telegram_id, owned_telegram_id, owned_phone, owned_jid)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [vipTelegramId, targetTelegramId, targetPhone, targetJid]
      )
      
      // Update whatsapp_users table
      await queryManager.execute(
        `UPDATE whatsapp_users 
         SET owned_by_telegram_id = $1, claimed_at = CURRENT_TIMESTAMP 
         WHERE telegram_id = $2`,
        [vipTelegramId, targetTelegramId]
      )
      
      logger.info(`[VIPQueries] VIP ${vipTelegramId} claimed user ${targetTelegramId}`)
      return { success: true, id: result.rows[0].id }
    } catch (error) {
      logger.error(`[VIPQueries] Error claiming user: ${error.message}`)
      throw error
    }
  },

  /**
   * Unclaim a user
   */
  async unclaimUser(targetTelegramId, vipTelegramId = null) {
    try {
      let query, params
      
      if (vipTelegramId) {
        // Specific VIP unclaiming their user
        query = `UPDATE vip_owned_users SET is_active = false WHERE owned_telegram_id = $1 AND vip_telegram_id = $2`
        params = [targetTelegramId, vipTelegramId]
      } else {
        // Admin override
        query = `UPDATE vip_owned_users SET is_active = false WHERE owned_telegram_id = $1`
        params = [targetTelegramId]
      }
      
      await queryManager.execute(query, params)
      
      await queryManager.execute(
        `UPDATE whatsapp_users SET owned_by_telegram_id = NULL WHERE telegram_id = $1`,
        [targetTelegramId]
      )
      
      logger.info(`[VIPQueries] Unclaimed user ${targetTelegramId}`)
      return true
    } catch (error) {
      logger.error(`[VIPQueries] Error unclaiming user: ${error.message}`)
      throw error
    }
  },

  /**
   * Check if VIP owns a user
   */
  async ownsUser(vipTelegramId, targetTelegramId) {
    try {
      const result = await queryManager.execute(
        `SELECT id FROM vip_owned_users 
         WHERE vip_telegram_id = $1 AND owned_telegram_id = $2 AND is_active = true`,
        [vipTelegramId, targetTelegramId]
      )
      
      return result.rows.length > 0
    } catch (error) {
      logger.error(`[VIPQueries] Error checking ownership: ${error.message}`)
      return false
    }
  },

  /**
   * Get VIP's owned users
   */
  async getOwnedUsers(vipTelegramId) {
    try {
      const result = await queryManager.execute(
        `SELECT vou.*, wu.jid, wu.name, wu.phone 
         FROM vip_owned_users vou
         LEFT JOIN whatsapp_users wu ON vou.owned_telegram_id = wu.telegram_id
         WHERE vou.vip_telegram_id = $1 AND vou.is_active = true
         ORDER BY vou.claimed_at DESC`,
        [vipTelegramId]
      )
      
      return result.rows
    } catch (error) {
      logger.error(`[VIPQueries] Error getting owned users: ${error.message}`)
      return []
    }
  },

  /**
   * Reassign user to different VIP
   */
  async reassignUser(targetTelegramId, newVipTelegramId) {
    try {
      // Deactivate old ownership
      await queryManager.execute(
        `UPDATE vip_owned_users SET is_active = false WHERE owned_telegram_id = $1`,
        [targetTelegramId]
      )
      
      // Create new ownership
      await queryManager.execute(
        `INSERT INTO vip_owned_users (vip_telegram_id, owned_telegram_id, claimed_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [newVipTelegramId, targetTelegramId]
      )
      
      // Update whatsapp_users
      await queryManager.execute(
        `UPDATE whatsapp_users SET owned_by_telegram_id = $1 WHERE telegram_id = $2`,
        [newVipTelegramId, targetTelegramId]
      )
      
      logger.info(`[VIPQueries] Reassigned user ${targetTelegramId} to VIP ${newVipTelegramId}`)
      return true
    } catch (error) {
      logger.error(`[VIPQueries] Error reassigning user: ${error.message}`)
      throw error
    }
  },

  /**
   * Log VIP activity
   */
  async logActivity(vipTelegramId, actionType, targetUserTelegramId = null, targetGroupJid = null, details = {}) {
    try {
      await queryManager.execute(
        `INSERT INTO vip_activity_log (vip_telegram_id, action_type, target_user_telegram_id, target_group_jid, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [vipTelegramId, actionType, targetUserTelegramId, targetGroupJid, JSON.stringify(details)]
      )
      
      // Update last_used_at and takeovers_count if applicable
      if (actionType === 'takeover' && targetUserTelegramId) {
        await queryManager.execute(
          `UPDATE vip_owned_users 
           SET last_used_at = CURRENT_TIMESTAMP, takeovers_count = takeovers_count + 1
           WHERE vip_telegram_id = $1 AND owned_telegram_id = $2`,
          [vipTelegramId, targetUserTelegramId]
        )
      }
    } catch (error) {
      logger.error(`[VIPQueries] Error logging activity: ${error.message}`)
    }
  },

  /**
   * Get all VIPs (for admin panel)
   */
  async getAllVIPs() {
    try {
      const result = await queryManager.execute(
        `SELECT wu.telegram_id, wu.jid, wu.name, wu.phone, wu.vip_level, wu.is_default_vip,
                COUNT(vou.id) as owned_users_count,
                MAX(vou.last_used_at) as last_activity
         FROM whatsapp_users wu
         LEFT JOIN vip_owned_users vou ON wu.telegram_id = vou.vip_telegram_id AND vou.is_active = true
         WHERE wu.vip_level > 0 OR wu.is_default_vip = true
         GROUP BY wu.telegram_id
         ORDER BY wu.vip_level DESC, wu.telegram_id`
      )
      
      return result.rows
    } catch (error) {
      logger.error(`[VIPQueries] Error getting all VIPs: ${error.message}`)
      return []
    }
  },

  /**
   * Get VIP details
   */
  async getVIPDetails(vipTelegramId) {
    try {
      const vipInfo = await queryManager.execute(
        `SELECT * FROM whatsapp_users WHERE telegram_id = $1`,
        [vipTelegramId]
      )
      
      const ownedUsers = await this.getOwnedUsers(vipTelegramId)
      
      const recentActivity = await queryManager.execute(
        `SELECT * FROM vip_activity_log 
         WHERE vip_telegram_id = $1 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [vipTelegramId]
      )
      
      return {
        vip: vipInfo.rows[0],
        ownedUsers,
        recentActivity: recentActivity.rows
      }
    } catch (error) {
      logger.error(`[VIPQueries] Error getting VIP details: ${error.message}`)
      return null
    }
  }
}

// ==========================================
// WARNING SYSTEM QUERIES - ENHANCED
// ==========================================

export const WarningQueries = {
  /**
   * Add or increment warning - FIXED
   */
  async addWarning(groupJid, userJid, warningType, reason = null) {
    try {
      const result = await queryManager.execute(
        `INSERT INTO warnings (user_jid, group_jid, warning_type, warning_count, reason, last_warning_at, created_at)
         VALUES ($1, $2, $3, 1, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (user_jid, group_jid, warning_type)
         DO UPDATE SET 
           warning_count = warnings.warning_count + 1,
           reason = COALESCE($4, warnings.reason),
           last_warning_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         RETURNING warning_count`,
        [userJid, groupJid, warningType, reason],
      )

      const warningCount = result.rows[0]?.warning_count || 1
      logger.info(`[WarningQueries] Added ${warningType} warning for ${userJid} in ${groupJid}: ${warningCount}/4`)
      return warningCount
    } catch (error) {
      logger.error(`[WarningQueries] Error adding warning: ${error.message}`)
      throw error
    }
  },

  /**
   * Reset user warnings for specific type or all
   */
  async resetUserWarnings(groupJid, userJid, warningType = null) {
    try {
      let query, params

      if (warningType) {
        query = `DELETE FROM warnings WHERE group_jid = $1 AND user_jid = $2 AND warning_type = $3`
        params = [groupJid, userJid, warningType]
      } else {
        query = `DELETE FROM warnings WHERE group_jid = $1 AND user_jid = $2`
        params = [groupJid, userJid]
      }

      const result = await queryManager.execute(query, params)
      logger.info(
        `[WarningQueries] Reset ${
          warningType || "all"
        } warnings for ${userJid} in ${groupJid} (${result.rowCount} removed)`,
      )

      return result.rowCount
    } catch (error) {
      logger.error(`[WarningQueries] Error resetting warnings: ${error.message}`)
      throw error
    }
  },

  /**
   * Get warning count for user and type
   */
  async getWarningCount(groupJid, userJid, warningType) {
    try {
      const result = await queryManager.execute(
        `SELECT warning_count FROM warnings
         WHERE group_jid = $1 AND user_jid = $2 AND warning_type = $3`,
        [groupJid, userJid, warningType],
      )

      return result.rows[0]?.warning_count || 0
    } catch (error) {
      logger.error(`[WarningQueries] Error getting warning count: ${error.message}`)
      return 0
    }
  },

  /**
   * Get warning statistics for group
   */
  async getWarningStats(groupJid, warningType = null) {
    try {
      let query, params

      if (warningType) {
        query = `
          SELECT 
            COUNT(DISTINCT user_jid) as total_users,
            SUM(warning_count) as total_warnings,
            AVG(warning_count) as avg_warnings,
            MAX(warning_count) as max_warnings
          FROM warnings
          WHERE group_jid = $1 AND warning_type = $2
        `
        params = [groupJid, warningType]
      } else {
        query = `
          SELECT 
            COUNT(DISTINCT user_jid) as total_users,
            SUM(warning_count) as total_warnings,
            AVG(warning_count) as avg_warnings,
            MAX(warning_count) as max_warnings
          FROM warnings
          WHERE group_jid = $1
        `
        params = [groupJid]
      }

      const result = await queryManager.execute(query, params)

      return {
        totalUsers: Number.parseInt(result.rows[0]?.total_users) || 0,
        totalWarnings: Number.parseInt(result.rows[0]?.total_warnings) || 0,
        avgWarnings: Number.parseFloat(result.rows[0]?.avg_warnings) || 0,
        maxWarnings: Number.parseInt(result.rows[0]?.max_warnings) || 0,
      }
    } catch (error) {
      logger.error(`[WarningQueries] Error getting warning stats: ${error.message}`)
      return {
        totalUsers: 0,
        totalWarnings: 0,
        avgWarnings: 0,
        maxWarnings: 0,
      }
    }
  },

  /**
   * Get warning list for group
   */
  async getWarningList(groupJid, warningType = null, limit = 10) {
    try {
      let query, params

      if (warningType) {
        query = `
          SELECT user_jid, warning_count, reason, last_warning_at
          FROM warnings
          WHERE group_jid = $1 AND warning_type = $2
          ORDER BY last_warning_at DESC
          LIMIT $3
        `
        params = [groupJid, warningType, limit]
      } else {
        query = `
          SELECT user_jid, warning_type, warning_count, reason, last_warning_at
          FROM warnings
          WHERE group_jid = $1
          ORDER BY last_warning_at DESC
          LIMIT $2
        `
        params = [groupJid, limit]
      }

      const result = await queryManager.execute(query, params)
      return result.rows
    } catch (error) {
      logger.error(`[WarningQueries] Error getting warning list: ${error.message}`)
      return []
    }
  },
}

// ==========================================
// VIOLATION LOGGING QUERIES - ENHANCED
// ==========================================

export const ViolationQueries = {
  /**
   * Log a violation for analytics
   */
  async logViolation(
    groupJid,
    userJid,
    violationType,
    messageContent,
    detectedContent,
    actionTaken,
    warningNumber,
    messageId,
  ) {
    try {
      await queryManager.execute(
        `INSERT INTO violations (
          user_jid, group_jid, violation_type, 
          message_content, detected_content, action_taken, 
          warning_number, message_id, violated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
        [
          userJid,
          groupJid,
          violationType,
          messageContent?.substring(0, 500), // Truncate long messages
          JSON.stringify(detectedContent || {}),
          actionTaken,
          warningNumber,
          messageId,
        ],
      )

      logger.debug(`[ViolationQueries] Logged ${violationType} violation for ${userJid} in ${groupJid}`)
    } catch (error) {
      logger.error(`[ViolationQueries] Error logging violation: ${error.message}`)
    }
  },

  /**
   * Get violation statistics
   */
  async getViolationStats(groupJid, violationType = null, days = 30) {
    try {
      let query, params

      if (violationType) {
        query = `
          SELECT 
            COUNT(*) as total_violations,
            COUNT(DISTINCT user_jid) as unique_violators,
            COUNT(*) FILTER (WHERE action_taken = 'kick') as kicks,
            COUNT(*) FILTER (WHERE action_taken = 'warning') as warnings
          FROM violations
          WHERE group_jid = $1 AND violation_type = $2
            AND violated_at > CURRENT_DATE - INTERVAL '${days} days'
        `
        params = [groupJid, violationType]
      } else {
        query = `
          SELECT 
            violation_type,
            COUNT(*) as total_violations,
            COUNT(DISTINCT user_jid) as unique_violators,
            COUNT(*) FILTER (WHERE action_taken = 'kick') as kicks
          FROM violations
          WHERE group_jid = $1
            AND violated_at > CURRENT_DATE - INTERVAL '${days} days'
          GROUP BY violation_type
          ORDER BY total_violations DESC
        `
        params = [groupJid]
      }

      const result = await queryManager.execute(query, params)
      return result.rows
    } catch (error) {
      logger.error(`[ViolationQueries] Error getting violation stats: ${error.message}`)
      return []
    }
  },
}

// ==========================================
// MESSAGE QUERIES - ENHANCED
// ==========================================

export const MessageQueries = {
  /**
   * Store message in database - FIXED
   */
 async storeMessage(messageData) {
  try {
    const { id, fromJid, senderJid, timestamp, content, media, mediaType, sessionId, userId, isViewOnce, fromMe, pushName } =
      messageData
    
    // First try to update existing message
    const updateResult = await queryManager.execute(
      `UPDATE messages 
       SET content = COALESCE($1, content),
           media = COALESCE($2, media),
           media_type = COALESCE($3, media_type),
           push_name = COALESCE($4, push_name),
           is_deleted = false
       WHERE id = $5 AND session_id = $6
       RETURNING id`,
      [content, media, mediaType, pushName, id, sessionId]
    )
    
    if (updateResult.rows.length > 0) {
      return updateResult.rows[0].id
    }
    
    // If no rows updated, insert new message
    const insertResult = await queryManager.execute(
      `INSERT INTO messages (
        id, from_jid, sender_jid, timestamp, content, media, 
        media_type, session_id, user_id, is_view_once, from_me, push_name, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
      RETURNING id`,
      [id, fromJid, senderJid, timestamp, content, media, mediaType, sessionId, userId, isViewOnce, fromMe, pushName]
    )
    return insertResult.rows[0]?.id
  } catch (error) {
    logger.error(`[MessageQueries] Error storing message: ${error.message}`)
    throw error
  }
},
    
  /**
   * Get recent messages from a chat
   */
  async getRecentMessages(chatJid, sessionId, limit = 50) {
    try {
      const result = await queryManager.execute(
        `SELECT * FROM messages
         WHERE from_jid = $1 AND session_id = $2
           AND is_deleted = false
         ORDER BY timestamp DESC
         LIMIT $3`,
        [chatJid, sessionId, limit],
      )

      return result.rows
    } catch (error) {
      logger.error(`[MessageQueries] Error getting recent messages: ${error.message}`)
      return []
    }
  },

  /**
   * Mark message as deleted
   */
  async markDeleted(messageId, sessionId) {
    try {
      await queryManager.execute(
        `UPDATE messages 
         SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND session_id = $2`,
        [messageId, sessionId],
      )
    } catch (error) {
      logger.error(`[MessageQueries] Error marking message deleted: ${error.message}`)
    }
  },

  /**
   * Search messages by content
   */
  async searchMessages(chatJid, sessionId, searchTerm, limit = 20) {
    try {
      const result = await queryManager.execute(
        `SELECT * FROM messages
         WHERE from_jid = $1 AND session_id = $2 
           AND content ILIKE $3
           AND is_deleted = false
         ORDER BY timestamp DESC
         LIMIT $4`,
        [chatJid, sessionId, `%${searchTerm}%`, limit],
      )

      return result.rows
    } catch (error) {
      logger.error(`[MessageQueries] Error searching messages: ${error.message}`)
      return []
    }
  },
  /**
   * Find message by ID with optional session filter - FIXED
   */
  async findMessageById(messageId, sessionId = null) {
    try {
      const params = [messageId]
      let queryText = `
        SELECT id, from_jid, sender_jid, timestamp, content, media, media_type, 
               session_id, user_id, is_view_once, from_me, push_name, created_at
        FROM messages 
        WHERE id = $1
      `

      if (sessionId) {
        queryText += " AND session_id = $2"
        params.push(sessionId)
      }

      queryText += " ORDER BY timestamp DESC LIMIT 1"

      const result = await queryManager.execute(queryText, params)
      
      if (result.rows.length === 0) {
        logger.info(`[MessageQueries] Message not found: ${messageId}`)
        return null
      }

      const row = result.rows[0]
      return {
        id: row.id,
        fromJid: row.from_jid,
        senderJid: row.sender_jid,
        timestamp: this.normalizeTimestamp(row.timestamp),
        content: row.content,
        media: this.safeJsonParse(row.media),
        mediaType: row.media_type,
        sessionId: row.session_id,
        userId: row.user_id,
        isViewOnce: Boolean(row.is_view_once),
        fromMe: Boolean(row.from_me),
        pushName: row.push_name || 'Unknown', // FIXED: Added pushName
        createdAt: row.created_at
      }
    } catch (error) {
      logger.error("[MessageQueries] Error finding message by ID:", error)
      return null
    }
  },

  /**
   * Delete message by ID (for cleanup after processing deletion)
   */
  async deleteMessageById(messageId, sessionId = null) {
    try {
      const params = [messageId]
      let queryText = "DELETE FROM messages WHERE id = $1"

      if (sessionId) {
        queryText += " AND session_id = $2"
        params.push(sessionId)
      }

      const result = await queryManager.execute(queryText, params)
      
      logger.info(`[MessageQueries] Deleted message ${messageId}: ${result.rowCount} rows affected`)
      return { success: true, rowsDeleted: result.rowCount }
    } catch (error) {
      logger.error("[MessageQueries] Error deleting message:", error)
      return { success: false, error: error.message }
    }
  },

  /**
   * Normalize timestamp to handle different formats
   */
  normalizeTimestamp(timestamp) {
    if (!timestamp) return Math.floor(Date.now() / 1000)
    
    if (typeof timestamp === 'string') {
      const parsed = parseInt(timestamp)
      return isNaN(parsed) ? Math.floor(Date.now() / 1000) : parsed
    }
    
    if (typeof timestamp === 'number') {
      // If timestamp is in milliseconds, convert to seconds
      return timestamp > 1e12 ? Math.floor(timestamp / 1000) : timestamp
    }
    
    return Math.floor(Date.now() / 1000)
  },

  /**
   * Safe JSON parsing with fallback
   */
  safeJsonParse(jsonString) {
    if (!jsonString) return null
    
    try {
      return typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString
    } catch (error) {
      logger.warn("[MessageQueries] Failed to parse JSON:", jsonString)
      return null
    }
  },
}

// ==========================================
// ANALYTICS QUERIES - ENHANCED
// ==========================================

export const AnalyticsQueries = {
  /**
   * Update daily group analytics - FIXED
   */
  async updateGroupAnalytics(groupJid, updates) {
    try {
      const columns = Object.keys(updates)
      const values = Object.values(updates)
      const placeholders = columns.map((_, i) => `$${i + 3}`).join(", ")
      const updateSet = columns.map((col, i) => `${col} = ${col} + $${i + 3}`).join(", ")

      await queryManager.execute(
        `INSERT INTO group_analytics (
          group_jid, date, ${columns.join(", ")}
        )
        VALUES ($1, $2, ${placeholders})
        ON CONFLICT (group_jid, date)
        DO UPDATE SET ${updateSet}`,
        [groupJid, new Date().toISOString().split("T")[0], ...values],
      )
    } catch (error) {
      logger.error(`[AnalyticsQueries] Error updating analytics: ${error.message}`)
    }
  },

  /**
   * Get group analytics for date range
   */
  async getGroupAnalytics(groupJid, days = 30) {
    try {
      const result = await queryManager.execute(
        `SELECT * FROM group_analytics
         WHERE group_jid = $1
           AND date > CURRENT_DATE - INTERVAL '${days} days'
         ORDER BY date DESC`,
        [groupJid],
      )

      return result.rows
    } catch (error) {
      logger.error(`[AnalyticsQueries] Error getting analytics: ${error.message}`)
      return []
    }
  },
}

// ==========================================
// USER SETTINGS QUERIES - NEW ADDITION
// ==========================================

export const UserQueries = {
  /**
   * Get user by Telegram ID - Fixed to use only users table
   */
  async getUserByTelegramId(telegramId) {
    try {
      const result = await queryManager.execute(
        `SELECT * FROM users WHERE telegram_id = $1`,
        [telegramId],
      )
      return result.rows[0] || null
    } catch (error) {
      logger.error(`[UserQueries] Error getting user by telegram_id ${telegramId}: ${error.message}`)
      return null
    }
  },

  /**
   * Get user by Session ID - Extract telegram_id from session and query users table
   */
  async getUserBySessionId(sessionId) {
    try {
      // Extract telegram_id from session_id format: session_{telegram_id}
      const sessionIdMatch = sessionId.match(/session_(-?\d+)/)
      if (!sessionIdMatch) {
        logger.warn(`[UserQueries] Invalid session ID format: ${sessionId}`)
        return null
      }
      
      const telegramId = Number.parseInt(sessionIdMatch[1])
      
      const result = await queryManager.execute(
        `SELECT * FROM users WHERE telegram_id = $1`,
        [telegramId],
      )
      return result.rows[0] || null
    } catch (error) {
      logger.error(`[UserQueries] Error getting user by session_id ${sessionId}: ${error.message}`)
      return null
    }
  },

  /**
   * Create user for negative (web) sessions
   */
  async createWebUser(telegramId, phoneNumber = null) {
    try {
      const result = await queryManager.execute(
        `INSERT INTO users (telegram_id, phone_number, is_active, created_at, updated_at)
         VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (telegram_id) 
         DO UPDATE SET 
           phone_number = COALESCE($2, users.phone_number),
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [telegramId, phoneNumber],
      )
      
      logger.info(`[UserQueries] Created/updated web user with telegram_id: ${telegramId}`)
      return result.rows[0]
    } catch (error) {
      logger.error(`[UserQueries] Error creating web user: ${error.message}`)
      throw error
    }
  },

  /**
   * Ensure user exists in users table (for any telegram_id including negative ones)
   */
  async ensureUserInUsersTable(telegramId, userData = {}) {
    try {
      const result = await queryManager.execute(
        `INSERT INTO users (telegram_id, username, first_name, last_name, phone_number, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, true), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (telegram_id) 
         DO UPDATE SET 
           username = COALESCE($2, users.username),
           first_name = COALESCE($3, users.first_name),
           last_name = COALESCE($4, users.last_name),
           phone_number = COALESCE($5, users.phone_number),
           is_active = COALESCE($6, users.is_active),
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          telegramId,
          userData.username || null,
          userData.first_name || null,
          userData.last_name || null,
          userData.phone_number || null,
          userData.is_active
        ],
      )
      
      logger.debug(`[UserQueries] Ensured user exists in users table: telegram_id ${telegramId}`)
      return result.rows[0]
    } catch (error) {
      logger.error(`[UserQueries] Error ensuring user exists in users table: ${error.message}`)
      throw error
    }
  },

  /**
   * Get user settings
   */
  async getSettings(userJid) {
    try {
      const result = await queryManager.execute(`SELECT * FROM whatsapp_users WHERE jid = $1`, [userJid])
      return result.rows[0] || null
    } catch (error) {
      logger.error(`[UserQueries] Error getting settings for ${userJid}: ${error.message}`)
      return null
    }
  },

  /**
   * Create or update user settings
   */
  async upsertSettings(userJid, settings = {}) {
    try {
      const telegramId = settings.telegram_id || null

      // Handle empty settings case
      if (Object.keys(settings).length === 0) {
        const result = await queryManager.execute(
          `INSERT INTO whatsapp_users (jid, telegram_id, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (jid)
           DO UPDATE SET updated_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [userJid, telegramId],
        )
        return result.rows[0]
      }

      // Build dynamic query for multiple settings
      const columns = Object.keys(settings)
      const values = Object.values(settings)
      const placeholders = columns.map((_, i) => `$${i + 2}`).join(", ")
      const updateSet = columns.map((col, i) => `${col} = $${i + 2}`).join(", ")

      const query = `
        INSERT INTO whatsapp_users (jid, ${columns.join(", ")}, updated_at)
        VALUES ($1, ${placeholders}, CURRENT_TIMESTAMP)
        ON CONFLICT (jid)
        DO UPDATE SET 
          ${updateSet},
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `

      const result = await queryManager.execute(query, [userJid, ...values])
      queryManager.clearCache(`user_settings_${userJid}`)
      return result.rows[0]
    } catch (error) {
      logger.error(`[UserQueries] Error in upsertSettings: ${error.message}`)
      throw error
    }
  },

  /**
   * Enable/disable antiviewonce for user - FIXED to include telegram_id
   */
  async setAntiViewOnce(userJid, enabled, telegramId = null) {
    try {
      // Normalize JID to remove device ID
      const normalizedJid = userJid ? userJid.replace(/:\d+@/, "@") : null

      logger.info(
        `[UserQueries] Setting antiviewonce to ${enabled} for user ${normalizedJid} (telegram_id: ${telegramId})`,
      )

      // Check if user already exists to prevent duplicates
      const existingUser = await queryManager.execute(
        `SELECT jid, telegram_id FROM whatsapp_users WHERE jid = $1 OR telegram_id = $2`,
        [normalizedJid, telegramId],
      )

      let result
      if (existingUser.rows.length > 0) {
        // Update existing user
        result = await queryManager.execute(
          `UPDATE whatsapp_users 
           SET antiviewonce_enabled = $1, 
               jid = COALESCE($2, jid),
               telegram_id = COALESCE($3, telegram_id),
               updated_at = CURRENT_TIMESTAMP
           WHERE jid = $2 OR telegram_id = $3
           RETURNING antiviewonce_enabled, telegram_id`,
          [enabled, normalizedJid, telegramId],
        )
      } else {
        // Insert new user only if none exists
        result = await queryManager.execute(
          `INSERT INTO whatsapp_users (jid, antiviewonce_enabled, telegram_id, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           RETURNING antiviewonce_enabled, telegram_id`,
          [normalizedJid, enabled, telegramId],
        )
      }

      queryManager.clearCache(`user_settings_${normalizedJid}`)
      const returnValue = result.rows[0]?.antiviewonce_enabled || false
      logger.info(`[UserQueries] Successfully set antiviewonce to ${returnValue} for ${normalizedJid}`)

      return returnValue
    } catch (error) {
      logger.error(`[UserQueries] Error setting antiviewonce: ${error.message}`)
      throw error
    }
  },

  /**
   * Check if antiviewonce is enabled for user - FIXED to accept telegram_id parameter
   */
  async isAntiViewOnceEnabled(userJid, telegramId = null) {
    if (!userJid && !telegramId) {
      logger.debug(`[UserQueries] No userJid or telegramId provided for antiviewonce check, returning false`)
      return false
    }

    try {
      let query, params

      if (telegramId) {
        query = `SELECT antiviewonce_enabled FROM whatsapp_users WHERE telegram_id = $1`
        params = [telegramId]
      } else {
        // Normalize JID to remove device ID
        const normalizedJid = userJid.replace(/:\d+@/, "@")
        query = `SELECT antiviewonce_enabled FROM whatsapp_users WHERE jid = $1`
        params = [normalizedJid]
      }

      const result = await queryManager.execute(query, params)

      const isEnabled = result.rows.length > 0 && result.rows[0].antiviewonce_enabled === true
      logger.debug(`[UserQueries] antiviewonce enabled for ${telegramId || userJid}: ${isEnabled}`)

      return isEnabled
    } catch (error) {
      logger.error(`[UserQueries] Error checking if antiviewonce enabled: ${error.message}`)
      return false
    }
  },

  /**
   * Get all users with antiviewonce enabled
   */
  async getAntiViewOnceUsers() {
    try {
      const result = await queryManager.execute(
        `SELECT wu.jid, wu.telegram_id 
         FROM whatsapp_users wu
         WHERE wu.antiviewonce_enabled = true 
         AND wu.jid IS NOT NULL 
         AND wu.telegram_id IS NOT NULL`,
      )
      const validUsers = result.rows
        .map((row) => ({
          jid: row.jid,
          telegram_id: row.telegram_id,
        }))
        .filter((user) => user.jid && user.jid.includes("@"))

      logger.info(`[UserQueries] Found ${validUsers.length} valid antiviewonce users`)
      return validUsers
    } catch (error) {
      logger.error(`[UserQueries] Error getting antiviewonce users: ${error.message}`)
      return []
    }
  },

  async getAntiDeleteUsers() {
    try {
      const result = await queryManager.execute(
        `SELECT wu.jid, wu.telegram_id 
         FROM whatsapp_users wu
         WHERE wu.antideleted_enabled = true 
         AND wu.jid IS NOT NULL 
         AND wu.telegram_id IS NOT NULL`,
      )
      const validUsers = result.rows
        .map((row) => ({
          jid: row.jid,
          telegram_id: row.telegram_id,
        }))
        .filter((user) => user.jid && user.jid.includes("@"))

      logger.info(`[UserQueries] Found ${validUsers.length} valid antideleted users`)
      return validUsers
    } catch (error) {
      logger.error(`[UserQueries] Error getting antideleted users: ${error.message}`)
      return []
    }
  },

  /**
   * Check if user has anti-deleted enabled
   */
  async isAntiDeletedEnabled(jid, telegramId) {
    try {
      const result = await queryManager.execute(`
        SELECT antideleted_enabled 
        FROM whatsapp_users 
        WHERE jid = $1 AND telegram_id = $2
      `, [jid, telegramId])

      if (result.rows.length > 0) {
        return Boolean(result.rows[0].antideleted_enabled)
      }

      return false
    } catch (error) {
      logger.error("[UserQueries] Error checking anti-deleted status:", error)
      return false
    }
  },

  /**
   * Set anti-deleted status for user
   */
  async setAntiDeleted(jid, enabled, telegramId) {
    try {
      // First try to update existing record
      const updateResult = await queryManager.execute(`
        UPDATE whatsapp_users 
        SET antideleted_enabled = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE jid = $2 AND telegram_id = $3
        RETURNING id
      `, [enabled, jid, telegramId])

      if (updateResult.rows.length > 0) {
        logger.info(`[UserQueries] Updated anti-deleted status for ${jid}: ${enabled}`)
        return true
      }

      // If no existing record, create new one
      await queryManager.execute(`
        INSERT INTO whatsapp_users (jid, telegram_id, antideleted_enabled, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (jid, telegram_id) 
        DO UPDATE SET 
          antideleted_enabled = EXCLUDED.antideleted_enabled,
          updated_at = CURRENT_TIMESTAMP
      `, [jid, telegramId, enabled])

      logger.info(`[UserQueries] Set anti-deleted status for ${jid}: ${enabled}`)
      return true
    } catch (error) {
      logger.error("[UserQueries] Error setting anti-deleted status:", error)
      throw error
    }
  },

  /**
   * Get WhatsApp user by telegram_id (for both anti-viewonce and anti-deleted processing)
   */
  async getWhatsAppUserByTelegramId(telegramId) {
    try {
      const result = await queryManager.execute(
        `SELECT jid, telegram_id, antideleted_enabled, antiviewonce_enabled
         FROM whatsapp_users 
         WHERE telegram_id = $1 
         LIMIT 1`,
        [telegramId]
      )

      if (result.rows.length > 0) {
        return {
          jid: result.rows[0].jid,
          telegram_id: result.rows[0].telegram_id,
          antideleted_enabled: Boolean(result.rows[0].antideleted_enabled),
          antiviewonce_enabled: Boolean(result.rows[0].antiviewonce_enabled)
        }
      }

      return null
    } catch (error) {
      logger.error(`[UserQueries] Error getting WhatsApp user by telegram_id ${telegramId}: ${error.message}`)
      return null
    }
  },

  /**
   * Ensure user exists in database (whatsapp_users table)
   */
  async ensureUserExists(userJid, userName = null) {
    if (!userJid) {
      logger.warn(`[UserQueries] Cannot ensure user exists - no userJid provided`)
      return null
    }

    try {
      const result = await queryManager.execute(
        `INSERT INTO whatsapp_users (jid, name, created_at, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (jid) 
         DO UPDATE SET 
           name = COALESCE($2, whatsapp_users.name),
           updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [userJid, userName],
      )

      logger.debug(`[UserQueries] Ensured user exists: ${userJid}`)
      return result.rows[0]
    } catch (error) {
      logger.error(`[UserQueries] Error ensuring user exists: ${error.message}`)
      throw error
    }
  },
}

// ==========================================
// UTILITY FUNCTIONS - ENHANCED
// ==========================================

export const Utils = {
  /**
   * Clean old data
   */
  async cleanupOldData(days = 90) {
    try {
      const result = await queryManager.execute(`SELECT cleanup_old_data($1)`, [days])

      return result.rows[0]?.cleanup_old_data || 0
    } catch (error) {
      logger.error(`[Utils] Error cleaning up old data: ${error.message}`)
      return 0
    }
  },

  /**
   * Get database statistics
   */
  async getDatabaseStats() {
    const stats = {}
    const tables = [
      "users",
      "sessions",
      "messages",
      "groups",
      "warnings",
      "settings",
      "group_analytics",
      "whatsapp_users",
    ]

    for (const table of tables) {
      try {
        const result = await queryManager.execute(`SELECT COUNT(*) as count FROM ${table}`)
        stats[table] = Number.parseInt(result.rows[0].count)
      } catch (error) {
        stats[table] = 0
      }
    }

    return stats
  },

  /**
   * Test database connection
   */
  async testConnection() {
    try {
      const result = await queryManager.execute("SELECT NOW() as current_time")
      logger.info(`[Utils] Database connection OK: ${result.rows[0].current_time}`)
      return true
    } catch (error) {
      logger.error(`[Utils] Database connection failed: ${error.message}`)
      return false
    }
  },

  /**
   * Verify all constraints exist
   */
  async verifyConstraints() {
    try {
      const result = await queryManager.execute(`
        SELECT 
          conname as constraint_name,
          conrelid::regclass as table_name,
          contype as constraint_type
        FROM pg_constraint 
        WHERE contype = 'u' 
        AND conrelid::regclass::text IN (
          'whatsapp_users', 'sessions', 'groups', 'messages', 
          'warnings', 'settings', 'group_analytics'
        )
        ORDER BY table_name, constraint_name
      `)

      logger.info("[Utils] Unique constraints found:")
      result.rows.forEach((row) => {
        logger.info(`  ${row.table_name}: ${row.constraint_name}`)
      })

      return result.rows
    } catch (error) {
      logger.error(`[Utils] Error verifying constraints: ${error.message}`)
      return []
    }
  },
}

export default queryManager
