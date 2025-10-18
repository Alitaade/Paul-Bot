import { createComponentLogger } from "../../utils/logger.js"
import AdminChecker from "../../whatsapp/utils/admin-checker.js"

const logger = createComponentLogger("TAGALL")

export default {
  name: "TagAll",
  description: "Tag all group members",
  commands: ["tagall", "mentionall", "everyone"],
  category: "group",
  adminOnly: true,
  usage:
    "• `.tagall` - Tag all members\n• `.tagall [message]` - Tag all with custom message",

  async execute(sock, sessionId, args, m) {
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
      // Get group metadata
      let groupMetadata
      try {
        groupMetadata = await sock.groupMetadata(groupJid)
      } catch (error) {
        logger.error("[TagAll] Error getting group metadata:", error.message)
        return { response: "❌ Unable to get group information!" }
      }

      // Get participants
      const participants = groupMetadata?.participants || []
      
      if (participants.length === 0) {
        return { response: "❌ No participants found in this group!" }
      }

      // Get custom message or default
      const customMessage = args.length ? args.join(" ") : "no message"
      
      // Get sender's phone number
      const senderNumber = m.sender.split('@')[0]
      
      // Build the tag message
      let tagMessage = `╚»˙·٠🎯●♥  ♥●🎯٠·˙«╝\n`
      tagMessage += `😶 Tagger: @${senderNumber}\n`
      tagMessage += `🌿 Message: ${customMessage}\n\n`
      
      // Add all participants
      participants.forEach((participant) => {
        const phoneNumber = participant.id.split('@')[0]
        tagMessage += `🎯 @${phoneNumber}\n`
      })
      
      // Prepare mentions array
      const mentions = participants.map(participant => participant.id)
      // Add sender to mentions
      mentions.push(m.sender)

      logger.info(`[TagAll] Tagging ${participants.length} members in ${groupJid}`)

      // Send the tag message
      await sock.sendMessage(groupJid, {
        text: tagMessage,
        mentions: mentions
      }, { quoted: m })

      logger.info(`[TagAll] Successfully tagged ${participants.length} members`)
      
      // Return success (no additional response needed since we already sent the message)
      return { response: null, success: true }

    } catch (error) {
      logger.error("[TagAll] Error in tagall command:", error)
      return { response: `❌ Failed to tag all members! Error: ${error.message}` }
    }
  },

  // Helper method to get participant count
  async getParticipantCount(sock, groupJid) {
    try {
      const groupMetadata = await sock.groupMetadata(groupJid)
      return groupMetadata?.participants?.length || 0
    } catch (error) {
      logger.error(`[TagAll] Error getting participant count: ${error.message}`)
      return 0
    }
  },

  // Helper method to check if group has participants
  async hasParticipants(sock, groupJid) {
    try {
      const count = await this.getParticipantCount(sock, groupJid)
      return count > 0
    } catch (error) {
      logger.error(`[TagAll] Error checking participants: ${error.message}`)
      return false
    }
  }
}