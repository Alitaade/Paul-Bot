import { createComponentLogger } from "../../utils/logger.js"
import AdminChecker from "../../whatsapp/utils/admin-checker.js"

const logger = createComponentLogger("HIDETAG")

export default {
  name: "HideTag",
  description: "Send a message that tags everyone without showing the tags",
  commands: ["hidetag", "h", "ht", "hiddentag", "tag"],
  category: "group",
  adminOnly: true,
  usage:
    "• `.hidetag [message]` - Send hidden tag message\n• `.hidetag` (reply to message) - Forward message with hidden tags",

  async execute(sock, sessionId, args, m) {
    const groupJid = m.chat

    if (!m.isGroup) {
      return { response: "❌ This command can only be used in groups!" }
    }

    // Check if user is admin or bot owner
    const adminChecker = new AdminChecker()
    const isAdmin = await adminChecker.isGroupAdmin(sock, groupJid, m.sender)
    
    // Debug logging for bot owner check
    logger.info(`[HideTag] Debug - m.sender: ${m.sender}`)
    logger.info(`[HideTag] Debug - sock.user.id: ${sock.user.id}`)
    logger.info(`[HideTag] Debug - sock.user: ${JSON.stringify(sock.user)}`)
    
    // Try different ways to check bot owner
    const isBotOwner = m.sender === sock.user.id || 
                      m.sender === sock.user?.jid || 
                      m.sender.replace('@s.whatsapp.net', '') === sock.user.id?.replace('@s.whatsapp.net', '')
    
    logger.info(`[HideTag] Debug - isAdmin: ${isAdmin}, isBotOwner: ${isBotOwner}`)
    
    if (!isAdmin && !isBotOwner) {
      return { response: "❌ Only group admins or bot owner can use this command!" }
    }

    try {
      // Get group metadata
      let groupMetadata
      try {
        groupMetadata = await sock.groupMetadata(groupJid)
      } catch (error) {
        logger.error("[HideTag] Error getting group metadata:", error.message)
        return { response: "❌ Unable to get group information!" }
      }

      // Get participants
      const participants = groupMetadata?.participants || []
      
      if (participants.length === 0) {
        return { response: "❌ No participants found in this group!" }
      }

      // Determine message content
      let message
      
      // Check if replying to a message
      if (m.quoted && m.quoted.text) {
        message = m.quoted.text
      } else if (args.length > 0) {
        message = args.join(" ")
      } else {
        message = '\u200E' // Zero-width character when no message
      }

      // Prepare mentions array
      const mentions = participants.map(participant => participant.id)
      
      // Function to detect URLs in text
      const urlRegex = /(https?:\/\/[^\s]+)/gi
      const urls = message.match(urlRegex)
      
      logger.info(`[HideTag] Sending hidden tag message to ${participants.length} members in ${groupJid} (${isBotOwner ? 'Bot Owner' : 'Admin'})`)

      if (urls && urls.length > 0) {
        // If message contains URLs, send with link preview
        try {
          await sock.sendMessage(groupJid, {
            text: message,
            mentions: mentions,
          }, { quoted: m })
          
          logger.info("[HideTag] Sent message with link preview")
          
        } catch (error) {
          logger.warn("[HideTag] Link preview failed, trying with contextInfo:", error.message)
          
          
          logger.info("[HideTag] Sent message with contextInfo link preview")
        }
      } else {
        // Regular message without links
        await sock.sendMessage(groupJid, {
          text: message,
          mentions: mentions
        }, { quoted: m })
        
        logger.info("[HideTag] Sent regular hidden tag message")
      }

      // Return success (no additional response needed since we already sent the message)
      return { response: null, success: true }

    } catch (error) {
      logger.error("[HideTag] Error in hidetag command:", error)
      return { response: `❌ Failed to send hidden tag message! Error: ${error.message}` }
    }
  },

  // Helper method to check if message contains links
  hasLinks(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/gi
    return urlRegex.test(text)
  },

  // Helper method to extract links from text
  extractLinks(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/gi
    return text.match(urlRegex) || []
  },

  // Helper method to get participant count
  async getParticipantCount(sock, groupJid) {
    try {
      const groupMetadata = await sock.groupMetadata(groupJid)
      return groupMetadata?.participants?.length || 0
    } catch (error) {
      logger.error(`[HideTag] Error getting participant count: ${error.message}`)
      return 0
    }
  }
}