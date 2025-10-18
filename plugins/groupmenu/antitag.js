import { createComponentLogger } from "../../utils/logger.js"
import { GroupQueries, WarningQueries, ViolationQueries } from "../../database/query.js"
import AdminChecker from "../../whatsapp/utils/admin-checker.js"

const logger = createComponentLogger("ANTI-TAG")

export default {
  name: "Anti-Tag",
  description: "Detect and prevent excessive tagging of users",
  commands: ["antitag"],
  category: "group",
  adminOnly: true,
  usage:
    "• `.antitag on` - Enable tag protection\n• `.antitag off` - Disable tag protection\n• `.antitag status` - Check protection status\n• `.antitag limit <number>` - Set maximum tags allowed",

  async execute(sock, sessionId, args, m) {
    const action = args[0]?.toLowerCase()
    const groupJid = m.chat

    if (!m.isGroup) {
      await sock.sendMessage(groupJid, {
        text: "❌ This command can only be used in groups!"
      }, { quoted: m })
      return
    }
  const adminChecker = new AdminChecker()
  const isAdmin = await adminChecker.isGroupAdmin(sock, groupJid, m.sender)
  if (!isAdmin) {
    return { response: "❌ Only group admins can use this command!" }
  }
    try {
      switch (action) {
        case "on":
          await GroupQueries.setAntiCommand(groupJid, "antitag", true)
          await sock.sendMessage(groupJid, {
            text:
              "🔖 *Anti-tag protection enabled!*\n\n" +
              "✅ Excessive tagging will be detected and prevented\n" +
              "⚠️ Users get warnings for excessive tagging\n" +
              "👑 Admins are exempt from tag restrictions"
          }, { quoted: m })
          break

        case "off":
          await GroupQueries.setAntiCommand(groupJid, "antitag", false)
          await sock.sendMessage(groupJid, {
            text: "🔖 Anti-tag protection disabled."
          }, { quoted: m })
          break

        case "status":
          const status = await GroupQueries.isAntiCommandEnabled(groupJid, "antitag")
          await sock.sendMessage(groupJid, {
            text: `🔖 *Anti-tag Status*\n\nStatus: ${status ? "✅ Enabled" : "❌ Disabled"}`
          }, { quoted: m })
          break

        case "limit":
          const limit = parseInt(args[1])
          if (isNaN(limit) || limit < 1 || limit > 20) {
            await sock.sendMessage(groupJid, {
              text: "❌ Please provide a valid limit between 1 and 20"
            }, { quoted: m })
            return
          }
          
          await GroupQueries.setTagLimit(groupJid, limit)
          await sock.sendMessage(groupJid, {
            text: `🔖 Tag limit set to ${limit} users per message`
          }, { quoted: m })
          break

        default:
          const currentStatus = await GroupQueries.isAntiCommandEnabled(groupJid, "antitag")
          const tagLimit = await GroupQueries.getTagLimit(groupJid) || 5
          
          await sock.sendMessage(groupJid, {
            text:
              "🔖 *Anti-Tag Commands*\n\n" +
              "• `.antitag on` - Enable protection\n" +
              "• `.antitag off` - Disable protection\n" +
              "• `.antitag status` - Check status\n" +
              "• `.antitag limit <number>` - Set tag limit\n\n" +
              `*Current Status:* ${currentStatus ? "✅ Enabled" : "❌ Disabled"}\n` +
              `*Tag Limit:* ${tagLimit} users per message`
          }, { quoted: m })
          break
      }
    } catch (error) {
      logger.error("Error in antitag command:", error)
      await sock.sendMessage(groupJid, {
        text: "❌ Error managing anti-tag settings"
      }, { quoted: m })
    }
  },

  async isEnabled(groupJid) {
    try {
      return await GroupQueries.isAntiCommandEnabled(groupJid, "antitag")
    } catch (error) {
      logger.error("Error checking if antitag enabled:", error)
      return false
    }
  },

  async shouldProcess(m) {
    if (!m.isGroup || !m.text) return false
    if (m.isCommand) return false
    if (m.key?.fromMe) return false
    
    const adminChecker = new AdminChecker()
    const isAdmin = await adminChecker.isGroupAdmin(sock, m.chat, m.sender)
    if (isAdmin) return false
    
    return this.countMentions(m) > 0
  },

  async processMessage(sock, sessionId, m) {
    try {
      await this.handleTagDetection(sock, sessionId, m)
    } catch (error) {
      logger.error("Error processing antitag message:", error)
    }
  },

  async handleTagDetection(sock, sessionId, m) {
    try {
      const adminChecker = new AdminChecker()
      const groupJid = m.chat
      
      if (!groupJid) {
        logger.warn("No group JID available for antitag processing")
        return
      }

      const botIsAdmin = await adminChecker.isBotAdmin(sock, groupJid)
      if (!botIsAdmin) {
        try {
          await sock.sendMessage(groupJid, {
            text: "🔖 Excessive tagging detected but bot lacks admin permissions to take action."
          })
        } catch (error) {
          logger.error("Failed to send no-permission message:", error)
        }
        return
      }

      const mentionCount = this.countMentions(m)
      const tagLimit = await GroupQueries.getTagLimit(groupJid) || 5
      
      if (mentionCount <= tagLimit) {
        return // Within allowed limits
      }

      const messageInfo = {
        sender: m.sender,
        text: m.text,
        id: m.key.id,
        mentionCount: mentionCount
      }

      let warnings
      try {
        warnings = await WarningQueries.addWarning(
          groupJid,
          messageInfo.sender,
          "antitag",
          `Excessive tagging (${mentionCount} users)`
        )
      } catch (error) {
        logger.error("Failed to add warning:", error)
        warnings = 1
      }

      try {
        await sock.sendMessage(groupJid, { delete: m.key })
        m._wasDeletedByAntiPlugin = true
      } catch (error) {
        logger.error("Failed to delete message:", error)
        m._wasDeletedByAntiPlugin = true
      }

      await new Promise(resolve => setTimeout(resolve, 800))

      let response =
        `🔖 *Excessive Tagging Detected & Removed!*\n\n` +
        `👤 @${messageInfo.sender.split("@")[0]}\n` +
        `🔖 Tagged ${mentionCount} users (limit: ${tagLimit})\n` +
        `⚠️ Warning: ${warnings}/4`

      if (warnings >= 4) {
        try {
          await sock.groupParticipantsUpdate(groupJid, [messageInfo.sender], "remove")
          response += `\n\n❌ *User removed* after reaching 4 warnings.`
          await WarningQueries.resetUserWarnings(groupJid, messageInfo.sender, "antitag")
        } catch (error) {
          logger.error("Failed to remove user:", error)
          response += `\n\n❌ Failed to remove user (insufficient permissions)`
        }
      } else {
        response += `\n\n📝 ${4 - warnings} warnings remaining before removal.`
      }

      try {
        await sock.sendMessage(groupJid, {
          text: response,
          mentions: [messageInfo.sender]
        })
      } catch (error) {
        logger.error("Failed to send warning message:", error)
      }

      try {
        await ViolationQueries.logViolation(
          groupJid,
          messageInfo.sender,
          "antitag",
          messageInfo.text,
          { mentionCount: mentionCount },
          warnings >= 4 ? "kick" : "warning",
          warnings,
          messageInfo.id
        )
      } catch (error) {
        logger.error("Failed to log violation:", error)
      }
      
    } catch (error) {
      logger.error("Error handling tag detection:", error)
    }
  },

  countMentions(m) {
    if (!m.message) return 0
    
    // Check for mentions in extended text message
    if (m.message.extendedTextMessage && 
        m.message.extendedTextMessage.contextInfo && 
        m.message.extendedTextMessage.contextInfo.mentionedJid) {
      return m.message.extendedTextMessage.contextInfo.mentionedJid.length
    }
    
    // Check for @mentions in text
    const text = m.text || ""
    const mentionMatches = text.match(/@\d+/g) || []
    
    return mentionMatches.length
  }
}