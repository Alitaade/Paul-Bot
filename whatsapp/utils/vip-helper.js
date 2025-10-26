import { createComponentLogger } from '../../utils/logger.js'
import { VIPQueries } from '../../database/query.js'
import { getSessionManager } from '../sessions/index.js'
import { resolveLidToJid } from '../groups/index.js'

const logger = createComponentLogger('VIP_HELPER')

export class VIPHelper {
  /**
   * Get default VIP telegram ID from environment
   */
  static getDefaultVIPTelegramId() {
    const defaultVipId = process.env.DEFAULT_ADMIN_ID
    
    if (!defaultVipId) {
      logger.warn('DEFAULT_VIP_TELEGRAM_ID not set in environment variables')
      return null
    }
    
    return parseInt(defaultVipId)
  }

  /**
   * Check if telegram ID is the default VIP
   */
  static isDefaultVIP(telegramId) {
    const defaultVipId = this.getDefaultVIPTelegramId()
    return defaultVipId && telegramId === defaultVipId
  }

  /**
   * Initialize default VIP in database (called on startup)
   */
  static async initializeDefaultVIP() {
    try {
      const defaultVipId = this.getDefaultVIPTelegramId()
      
      if (!defaultVipId) {
        logger.warn('Cannot initialize default VIP - DEFAULT_VIP_TELEGRAM_ID not set')
        return false
      }

      // Set default VIP in database
      await VIPQueries.setDefaultVIP(defaultVipId, true)
      logger.info(`Default VIP initialized: ${defaultVipId}`)
      
      return true
    } catch (error) {
      logger.error('Failed to initialize default VIP:', error)
      return false
    }
  }

  /**
   * Get default VIP's socket from session manager
   */
  static async getDefaultVIPSocket() {
    try {
      const defaultVipId = this.getDefaultVIPTelegramId()
      
      if (!defaultVipId) {
        return null
      }

      const sessionManager = getSessionManager()
      const sessionId = `session_${defaultVipId}`
      const sock = sessionManager.getSession(sessionId)
      
      if (!sock || !sock.user) {
        logger.warn(`Default VIP socket not available for telegram ID: ${defaultVipId}`)
        return null
      }
      
      logger.debug(`Got default VIP socket for telegram ID: ${defaultVipId}`)
      return sock
    } catch (error) {
      logger.error('Error getting default VIP socket:', error)
      return null
    }
  }

  /**
   * Check if user can control target
   */
  static async canControl(vipTelegramId, targetTelegramId) {
    try {
      // Check if this is the default VIP from ENV
      if (this.isDefaultVIP(vipTelegramId)) {
        return { allowed: true, reason: 'default_vip_env' }
      }

      const vipStatus = await VIPQueries.isVIP(vipTelegramId)
      
      // Default VIP from database
      if (vipStatus.isDefault || vipStatus.level === 99) {
        return { allowed: true, reason: 'default_vip_db' }
      }
      
      // Not a VIP at all
      if (!vipStatus.isVIP) {
        return { allowed: false, reason: 'not_vip' }
      }
      
      // Check if target is a VIP (cannot control other VIPs)
      const targetStatus = await VIPQueries.isVIP(targetTelegramId)
      if (targetStatus.isVIP) {
        return { allowed: false, reason: 'target_is_vip' }
      }
      
      // Check ownership
      const owns = await VIPQueries.ownsUser(vipTelegramId, targetTelegramId)
      if (!owns) {
        return { allowed: false, reason: 'not_owned' }
      }
      
      return { allowed: true, reason: 'owns_user' }
    } catch (error) {
      logger.error('Error checking control permission:', error)
      return { allowed: false, reason: 'error' }
    }
  }

  /**
   * Get user's session socket from session manager
   */
  static async getUserSocket(telegramId) {
    try {
      const sessionManager = getSessionManager()
      const sessionId = `session_${telegramId}`
      const sock = sessionManager.getSession(sessionId)
      
      if (!sock || !sock.user) {
        logger.debug(`Socket not available for telegram ID: ${telegramId}`)
        return null
      }
      
      return sock
    } catch (error) {
      logger.error('Error getting user socket:', error)
      return null
    }
  }

  /**
   * Get VIP's socket
   */
  static async getVIPSocket(vipTelegramId) {
    return await this.getUserSocket(vipTelegramId)
  }

  /**
   * Get user's phone number from session
   */
  static async getUserPhoneFromSession(telegramId) {
    try {
      const sock = await this.getUserSocket(telegramId)
      
      if (!sock || !sock.user || !sock.user.id) {
        return null
      }
      
      // Extract phone from user JID
      return sock.user.id.split('@')[0].split(':')[0]
    } catch (error) {
      logger.error('Error getting user phone from session:', error)
      return null
    }
  }

  /**
   * Get all connected VIP sessions
   */
  static async getAllConnectedVIPs() {
    try {
      const sessionManager = getSessionManager()
      const allVIPs = await VIPQueries.getAllVIPs()
      const connectedVIPs = []

      for (const vip of allVIPs) {
        const sessionId = `session_${vip.telegram_id}`
        const sock = sessionManager.getSession(sessionId)
        
        if (sock && sock.user) {
          connectedVIPs.push({
            telegramId: vip.telegram_id,
            phone: sock.user.id.split('@')[0],
            level: vip.vip_level,
            isDefault: vip.is_default_vip,
            ownedUsers: vip.owned_users_count
          })
        }
      }

      return connectedVIPs
    } catch (error) {
      logger.error('Error getting connected VIPs:', error)
      return []
    }
  }

/**
 * Get groups where the user is an admin (with rate-limit protection)
 */
static async getUserGroups(sock) {
  try {
    if (!sock || !sock.user) {
      return []
    }

    const chats = await sock.groupFetchAllParticipating()
    const adminGroups = []
    
    const botJid = sock.user.id
    const botPhone = botJid.split('@')[0].split(':')[0]
    
    const groupEntries = Object.entries(chats).filter(([jid]) => jid.endsWith('@g.us'))
    
    // Optimized settings for speed
    const BATCH_SIZE = 10  // Increased from 5
    const DELAY_BETWEEN_BATCHES = 1500 // Reduced to 2 seconds
    const DELAY_BETWEEN_RESOLVES = 300 // Reduced to 200ms
    
    logger.info(`[VIPHelper] Processing ${groupEntries.length} groups...`)
    
    for (let i = 0; i < groupEntries.length; i += BATCH_SIZE) {
      const batch = groupEntries.slice(i, i + BATCH_SIZE)
      
      for (const [jid, chat] of batch) {
        try {
          if (!chat.participants || !Array.isArray(chat.participants)) continue

          const adminParticipants = chat.participants.filter(p => 
            p.admin === 'admin' || p.admin === 'superadmin'
          )
          
          let botParticipant = null
          let groupOwner = null
          
          for (const participant of adminParticipants) {
            const participantId = participant.id || participant.jid || ''
            
            if (participant.admin === 'superadmin') {
              if (!participantId.endsWith('@lid')) {
                const participantPhone = participantId.split('@')[0].split(':')[0]
                
                if (participantPhone === botPhone || participantId === botJid) {
                  botParticipant = participant
                } else {
                  groupOwner = participant
                }
              } else {
                try {
                  const resolvedJid = await this.resolveJid(participantId, sock, jid)
                  await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_RESOLVES))
                  
                  const resolvedPhone = resolvedJid.split('@')[0].split(':')[0]
                  
                  if (resolvedPhone === botPhone || resolvedJid === botJid) {
                    botParticipant = participant
                  } else {
                    groupOwner = participant
                  }
                } catch (error) {
                  groupOwner = participant
                }
              }
            } 
            else if (participant.admin === 'admin' && !botParticipant) {
              if (!participantId.endsWith('@lid')) {
                const participantPhone = participantId.split('@')[0].split(':')[0]
                
                if (participantPhone === botPhone || participantId === botJid) {
                  botParticipant = participant
                }
              } else {
                try {
                  const resolvedJid = await this.resolveJid(participantId, sock, jid)
                  await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_RESOLVES))
                  
                  const resolvedPhone = resolvedJid.split('@')[0].split(':')[0]
                  
                  if (resolvedPhone === botPhone || resolvedJid === botJid) {
                    botParticipant = participant
                  }
                } catch (error) {
                  // Silent fail, continue
                }
              }
            }
          }

          if (botParticipant) {
            const isBotOwner = botParticipant.admin === 'superadmin'
            const hasOtherOwner = groupOwner !== null && groupOwner !== botParticipant
            const canTakeover = isBotOwner || !hasOtherOwner
            
            adminGroups.push({
              jid,
              name: chat.subject || 'Unknown Group',
              participants: chat.participants.length || 0,
              desc: chat.desc || '',
              createdAt: chat.creation || null,
              isBotOwner: isBotOwner,
              hasOtherOwner: hasOtherOwner,
              canTakeover: canTakeover
            })
          }
          
        } catch (groupError) {
          // Silent fail, continue with next group
        }
      }
      
      if (i + BATCH_SIZE < groupEntries.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
      }
    }
    
    logger.info(`[VIPHelper] Found ${adminGroups.length} admin groups`)
    return adminGroups
    
  } catch (error) {
    logger.error('Error getting user groups:', error)
    return []
  }
}

  /**
   * Get group invite link
   */
  static async getGroupInviteLink(sock, groupJid) {
    try {
      const code = await sock.groupInviteCode(groupJid)
      return `https://chat.whatsapp.com/${code}`
    } catch (error) {
      logger.error(`Error getting invite link for ${groupJid}:`, error)
      return null
    }
  }

  /**
   * Extract phone number from JID (with LID resolution)
   */
  static extractPhone(jid, sock = null, groupJid = null) {
    if (!jid) return null
    
    // If it's a LID and we have socket/group context, try to resolve
    if (jid.endsWith('@lid') && sock && groupJid) {
      // Note: This is sync, but LID resolution is async
      // For sync calls, just return the LID as-is
      logger.warn(`LID detected but cannot resolve synchronously: ${jid}`)
      return jid.split('@')[0].split(':')[0]
    }
    
    return jid.split('@')[0].split(':')[0]
  }

  /**
   * Extract phone number from JID with async LID resolution
   */
  static async extractPhoneAsync(jid, sock = null, groupJid = null) {
    if (!jid) return null
    
    // Resolve LID if necessary
    if (jid.endsWith('@lid') && sock && groupJid) {
      try {
        const resolvedJid = await resolveLidToJid(sock, groupJid, jid)
        return resolvedJid.split('@')[0].split(':')[0]
      } catch (error) {
        logger.error(`Failed to resolve LID ${jid}:`, error)
        return jid.split('@')[0].split(':')[0]
      }
    }
    
    return jid.split('@')[0].split(':')[0]
  }

  /**
   * Resolve JID (handle LIDs)
   */
  static async resolveJid(jid, sock, groupJid = null) {
    if (!jid) return null
    
    // If it's a LID, resolve it
    if (jid.endsWith('@lid')) {
      if (!sock || !groupJid) {
        logger.warn(`Cannot resolve LID without sock and groupJid: ${jid}`)
        return jid
      }
      
      try {
        return await resolveLidToJid(sock, groupJid, jid)
      } catch (error) {
        logger.error(`Failed to resolve LID: ${error.message}`)
        return jid
      }
    }
    
    return jid
  }

  /**
   * Format telegram ID to session ID
   */
  static toSessionId(telegramId) {
    return `session_${telegramId}`
  }

  /**
   * Extract telegram ID from session ID
   */
  static fromSessionId(sessionId) {
    const match = sessionId.match(/session_(-?\d+)/)
    return match ? parseInt(match[1]) : null
  }
}

export default VIPHelper