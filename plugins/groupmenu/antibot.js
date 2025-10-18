import { createComponentLogger } from "../../utils/logger.js"
import { GroupQueries, WarningQueries, ViolationQueries } from "../../database/query.js"
import AdminChecker from "../../whatsapp/utils/admin-checker.js"

const logger = createComponentLogger("ANTI-BOT")

export default {
  name: "Anti-Bot",
  description: "Detect and remove Baileys/WhatsApp bots from the group (excludes all admins)",
  commands: ["antibot"],
  category: "group",
  adminOnly: true,
  usage:
    "• `.antibot on` - Enable bot protection\n• `.antibot off` - Disable bot protection\n• `.antibot status` - Check protection status\n• `.antibot scan` - Manually scan for bots",

  async execute(sock, sessionId, args, m) {
    const action = args[0]?.toLowerCase()
    const groupJid = m.chat

    if (!m.isGroup) {
      return { response: "❌ This command can only be used in groups!" }
    }

    // Check if user is admin
    const adminChecker = new AdminChecker()
    const isAdmin = await adminChecker.isGroupAdmin(sock, groupJid, m.sender)
    if (!isAdmin) {
      return { response: "❌ Only group admins can use this command!" }
    }
    
    try {
      switch (action) {
        case "on":
          await GroupQueries.setAntiCommand(groupJid, "antibot", true)
          return {
            response:
              "🤖 *Anti-bot protection enabled!*\n\n" +
              "✅ Baileys/WhatsApp bots will be automatically detected and removed\n" +
              "🔍 Detects bots by analyzing message patterns and sender info\n" +
              "⚡ Works on new joins and can scan existing members\n" +
              "👑 **All admins are protected from removal**"
          }

        case "off":
          await GroupQueries.setAntiCommand(groupJid, "antibot", false)
          return { response: "🤖 Anti-bot protection disabled." }

        case "status":
          const status = await GroupQueries.isAntiCommandEnabled(groupJid, "antibot")
          return {
            response: `🤖 *Anti-bot Status*\n\nStatus: ${status ? "✅ Enabled" : "❌ Disabled"}`
          }

        case "scan":
          return await this.scanExistingMembers(sock, groupJid)

        default:
          const currentStatus = await GroupQueries.isAntiCommandEnabled(groupJid, "antibot")
          return {
            response:
              "🤖 *Anti-Bot Commands*\n\n" +
              "• `.antibot on` - Enable protection\n" +
              "• `.antibot off` - Disable protection\n" +
              "• `.antibot status` - Check status\n" +
              "• `.antibot scan` - Scan existing members\n\n" +
              `*Current Status:* ${currentStatus ? "✅ Enabled" : "❌ Disabled"}\n\n` +
              "💡 *Detection Method:* Analyzes message patterns, sender info, and Baileys-specific characteristics\n" +
              "🛡️ *Safe Mode:* Never removes admins or owners"
          }
      }
    } catch (error) {
      logger.error("Error in antibot command:", error)
      return { response: "❌ Error managing anti-bot settings" }
    }
  },

  async isEnabled(groupJid) {
    try {
      return await GroupQueries.isAntiCommandEnabled(groupJid, "antibot")
    } catch (error) {
      logger.error("Error checking if antibot enabled:", error)
      return false
    }
  },

  async shouldProcess(m) {
    if (!m.isGroup) return false
    
    // Process both participant updates and regular messages for bot detection
    return true
  },

  async processMessage(sock, sessionId, m) {
    try {
      if (!await this.isEnabled(m.chat)) return
      
      // CRITICAL: Skip if sender is an admin, owner, or the bot itself
      if (await this.isProtectedUser(sock, m.chat, m.sender)) {
        return
      }
      
      // Check if this message shows bot characteristics
      if (await this.detectBotFromMessage(m)) {
        await this.handleDetectedBot(sock, m.chat, m.sender, "message_pattern")
      }
    } catch (error) {
      logger.error("Error processing message for bot detection:", error)
    }
  },

  async processParticipantUpdate(sock, sessionId, update) {
    try {
      if (update.action === 'add' && await this.isEnabled(update.jid)) {
        for (const participantJid of update.participants) {
          await this.checkNewParticipant(sock, update.jid, participantJid)
        }
      }
    } catch (error) {
      logger.error("Error processing participant update:", error)
    }
  },

  async checkNewParticipant(sock, groupJid, participantJid) {
    try {
      const adminChecker = new AdminChecker()
      
      // Skip if bot is not admin
      const botIsAdmin = await adminChecker.isBotAdmin(sock, groupJid)
      if (!botIsAdmin) return
      
      // CRITICAL: Skip if the new participant is protected (admin/owner/bot itself)
      if (await this.isProtectedUser(sock, groupJid, participantJid)) {
        logger.info(`Skipping bot check for protected user: ${participantJid}`)
        return
      }
      
      // Wait a bit for the user to potentially send a message
      setTimeout(async () => {
        // Double-check protection status before taking action
        if (await this.isProtectedUser(sock, groupJid, participantJid)) {
          return
        }
        
        const isBot = await this.detectBotFromProfile(sock, participantJid)
        if (isBot) {
          await this.handleDetectedBot(sock, groupJid, participantJid, "profile_analysis")
        }
      }, 5000) // Wait 5 seconds
      
    } catch (error) {
      logger.error("Error checking new participant:", error)
    }
  },

  async scanExistingMembers(sock, groupJid) {
    try {
      const adminChecker = new AdminChecker()
      
      // Check if bot is admin
      const botIsAdmin = await adminChecker.isBotAdmin(sock, groupJid)
      if (!botIsAdmin) {
        return { response: "❌ Bot needs admin permissions to scan and remove bots!" }
      }

      // Get group metadata
      const groupMetadata = await sock.groupMetadata(groupJid)
      const participants = groupMetadata.participants
      
      let suspiciousBots = []
      let checkedCount = 0
      let skippedProtected = 0
      
      for (const participant of participants) {
        // CRITICAL: Skip protected users (bot itself, admins, owners)
        if (await this.isProtectedUser(sock, groupJid, participant.id)) {
          skippedProtected++
          logger.info(`Skipping protected user during scan: ${participant.id}`)
          continue
        }
        
        const isBot = await this.detectBotFromProfile(sock, participant.id)
        if (isBot) {
          suspiciousBots.push(participant.id)
        }
        checkedCount++
        
        // Add delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      if (suspiciousBots.length === 0) {
        return {
          response: 
            `🤖 *Scan Complete*\n\n` +
            `Checked: ${checkedCount} members\n` +
            `Skipped protected: ${skippedProtected}\n` +
            `Bots found: 0\n\n` +
            `✅ No suspicious bots detected!`
        }
      }
      
      // Remove detected bots
      let removedCount = 0
      for (const botJid of suspiciousBots) {
        try {
          // Final protection check before removal
          if (await this.isProtectedUser(sock, groupJid, botJid)) {
            logger.warn(`Attempted to remove protected user, skipping: ${botJid}`)
            continue
          }
          
          await sock.groupParticipantsUpdate(groupJid, [botJid], "remove")
          removedCount++
          
          // Log the violation
          await ViolationQueries.logViolation(
            groupJid,
            botJid,
            "antibot",
            "Suspected bot account (manual scan)",
            {},
            "kick",
            0,
            null
          )
          
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (error) {
          logger.error("Failed to remove bot during scan:", error)
        }
      }
      
      return {
        response:
          `🤖 *Scan Complete*\n\n` +
          `Checked: ${checkedCount} members\n` +
          `Skipped protected: ${skippedProtected}\n` +
          `Bots detected: ${suspiciousBots.length}\n` +
          `Successfully removed: ${removedCount}\n` +
          `Failed to remove: ${suspiciousBots.length - removedCount}`
      }
      
    } catch (error) {
      logger.error("Error scanning existing members:", error)
      return { response: "❌ Error scanning group members" }
    }
  },

  async handleDetectedBot(sock, groupJid, botJid, detectionMethod) {
    try {
      // CRITICAL: Final protection check before removal
      if (await this.isProtectedUser(sock, groupJid, botJid)) {
        logger.warn(`Attempted to remove protected user via handleDetectedBot, aborting: ${botJid}`)
        return
      }
      
      await sock.groupParticipantsUpdate(groupJid, [botJid], "remove")
      
      await sock.sendMessage(groupJid, {
        text: 
          `🤖 *Bot Detected & Removed!*\n\n` +
          `👤 User: @${botJid.split('@')[0]}\n` +
          `🔍 Detection: ${detectionMethod}\n` +
          `⚡ Action: Automatically removed\n` +
          `🛡️ Admins are always protected`,
        mentions: [botJid]
      })
      
      // Log the violation
      await ViolationQueries.logViolation(
        groupJid,
        botJid,
        "antibot",
        `Suspected bot account (${detectionMethod})`,
        { detectionMethod },
        "kick",
        0,
        null
      )
      
    } catch (error) {
      logger.error("Failed to remove detected bot:", error)
    }
  },

  // CRITICAL: Enhanced method to check if user is protected from bot removal
  async isProtectedUser(sock, groupJid, userJid) {
    try {
      // Skip the bot itself - CRITICAL CHECK
      if (userJid === sock.user?.id || userJid.includes(sock.user?.id?.split('@')[0])) {
        logger.info(`Protected: Bot itself - ${userJid}`)
        return true
      }
      
      // Check if user is admin using AdminChecker
      const adminChecker = new AdminChecker()
      const isAdmin = await adminChecker.isGroupAdmin(sock, groupJid, userJid)
      if (isAdmin) {
        logger.info(`Protected: Admin user - ${userJid}`)
        return true
      }
      
      // Additional check: Get group metadata to double-check admin status
      try {
        const groupMetadata = await sock.groupMetadata(groupJid)
        const participant = groupMetadata.participants.find(p => p.jid === userJid)
        
        if (participant && (participant.admin === 'admin' || participant.admin === 'superadmin')) {
          logger.info(`Protected: Admin from metadata - ${userJid}`)
          return true
        }
      } catch (error) {
        logger.error("Error getting group metadata for protection check:", error)
      }
      
      return false
    } catch (error) {
      logger.error("Error checking if user is protected:", error)
      // Return true on error to be safe (don't remove if we can't verify)
      return true
    }
  },

  async detectBotFromMessage(m) {
    try {
      // Check if message is explicitly marked as from a bot
      if (m.isBot) {
        logger.info(`Bot detected via isBot flag: ${m.sender}`)
        return true
      }
      
      // Check message key structure (Baileys-specific patterns)
      if (m.key) {
        // Check if message ID follows Baileys pattern
        const messageId = m.key.id
        if (this.isBaileysMessageId(messageId)) {
          logger.info(`Bot detected via Baileys message ID: ${m.sender}`)
          return true
        }
        
        // Check if participant field exists and doesn't match sender (indicates forwarded bot message)
        if (m.key.participant && m.key.participant !== m.sender) {
          logger.info(`Bot detected via participant mismatch: ${m.sender}`)
          return true
        }
        
        // Check for fromMe inconsistencies (message marked as from bot but sender is different)
        if (m.key.fromMe === true && m.sender && !m.sender.includes(m.sock?.user?.id?.split('@')[0])) {
          logger.info(`Bot detected via fromMe inconsistency: ${m.sender}`)
          return true
        }
      }
      
      return false
    } catch (error) {
      logger.error("Error detecting bot from message:", error)
      return false
    }
  },

  async detectBotFromProfile(sock, jid) {
    try {
      // Check if it's marked as a bot (primary check)
      // This would need to be implemented based on your WhatsApp client capabilities
      
      // Only use very specific and reliable bot detection methods
      // Removed unreliable checks like:
      // - Phone number patterns (too many false positives)
      // - Profile picture absence (many legitimate users don't have profile pics)
      // - Timestamp checks (can vary for legitimate reasons)
      
      // Keep only the most reliable checks
      try {
        // Check if the JID has unusual format that indicates a bot
        const phoneNumber = jid.split('@')[0]
        
        // Only flag very obvious bot patterns (much more restrictive)
        // Check for extremely suspicious patterns only
        if (phoneNumber.length > 15 || phoneNumber.length < 10) {
          // Most legitimate phone numbers are 10-15 digits
          logger.info(`Suspicious phone number length: ${jid}`)
          return true
        }
        
        // Check for all same digits (very unlikely for real numbers)
        const uniqueDigits = new Set(phoneNumber.split(''))
        if (uniqueDigits.size === 1) {
          logger.info(`All same digits detected: ${jid}`)
          return true
        }
      } catch (error) {
        logger.error("Error in profile analysis:", error)
      }
      
      return false
    } catch (error) {
      logger.error("Error detecting bot from profile:", error)
      return false
    }
  },

  isBaileysMessageId(messageId) {
    if (!messageId) return false
    
    // Baileys typically generates message IDs in specific patterns
    // Check for common Baileys message ID patterns (keep only most reliable)
    const baileysPatterns = [
      /^3EB[0-9A-F]{17}$/i, // Common Baileys pattern
      /^BAE[0-9A-F]{17}$/i, // Another Baileys pattern
      /^3A[0-9A-F]{18}$/i,  // Extended pattern
    ]
    
    return baileysPatterns.some(pattern => pattern.test(messageId))
  },

  // Removed unreliable detection methods:
  // - isSequentialNumber (many legitimate numbers can be sequential)
  // - hasRepeatingPattern (many legitimate numbers have patterns)
  // - Timestamp checks (can vary legitimately)
  // - Profile picture checks (many users don't set profile pictures)
  // - Country-specific number patterns (too many false positives)
}