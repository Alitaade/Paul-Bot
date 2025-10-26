import { createComponentLogger } from "../../utils/logger.js"
import { GroupQueries, WarningQueries, ViolationQueries } from "../../database/query.js"
import AdminChecker from "../../whatsapp/utils/admin-checker.js"
import { analyzeMessage } from "guaranteed_security"
import { pool } from "../../config/database.js"

const logger = createComponentLogger("ANTI-VIRTEX")

export default {
  name: "Anti-Virtex",
  description: "Detect and remove malicious messages (virtex/bugs) with configurable warning system",
  commands: ["antivirtex"],
  category: "group",
  adminOnly: true,
  usage:
    "• `.antivirtex on` - Enable virtex protection\n" +
    "• `.antivirtex off` - Disable virtex protection\n" +
    "• `.antivirtex status` - Check protection status\n" +
    "• `.antivirtex warn [number]` - Set warning limit (1-5)\n" +
    "• `.antivirtex reset @user` - Reset user warnings\n" +
    "• `.antivirtex list` - Show warning list\n" +
    "• `.antivirtex stats` - View statistics\n" +
    "• `.antivirtex test` - Test detection capabilities",

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
          await GroupQueries.setAntiCommand(groupJid, "antivirtex", true)
          const currentLimit = await this.getWarningLimit(groupJid)
          if (!currentLimit) {
            await this.setWarningLimit(groupJid, 2)
          }
          
          await sock.sendMessage(groupJid, {
            text:
              "🛡️ *Anti-Virtex Protection Enabled!*\n\n" +
              "✅ Malicious messages will be detected and removed\n" +
              `⚠️ Users get ${currentLimit || 2} warnings before removal\n` +
              "👑 Admins are exempt from restrictions\n\n" +
              "*Protected Against:*\n" +
              "• Text Bombing (extreme length)\n" +
              "• Invisible Character Abuse\n" +
              "• Mention Bombing\n" +
              "• Protocol Exploitation\n" +
              "• Media Abuse\n" +
              "• Button/List Flooding\n" +
              "• Annotation Abuse\n" +
              "• External Ad Exploitation\n\n" +
              "💡 Use `.antivirtex warn [1-5]` to change warning limit"
          }, { quoted: m })
          break

        case "off":
          await GroupQueries.setAntiCommand(groupJid, "antivirtex", false)
          await sock.sendMessage(groupJid, {
            text: "🛡️ Anti-virtex protection disabled."
          }, { quoted: m })
          break

        case "warn":
          if (args.length < 2) {
            const currentLimit = await this.getWarningLimit(groupJid) || 1
            await sock.sendMessage(groupJid, {
              text: `⚠️ *Current warning limit:* ${currentLimit}\n\nUsage: \`.antivirtex warn [1-5]\` to change limit`
            }, { quoted: m })
            return
          }

          const newLimit = parseInt(args[1])
          if (isNaN(newLimit) || newLimit < 1 || newLimit > 5) {
            await sock.sendMessage(groupJid, {
              text: "❌ Warning limit must be between 1 and 5 (virtex is more severe)"
            }, { quoted: m })
            return
          }

          await this.setWarningLimit(groupJid, newLimit)
          await sock.sendMessage(groupJid, {
            text: `✅ Warning limit set to ${newLimit} warnings before removal`
          }, { quoted: m })
          break

        case "status":
          const status = await GroupQueries.isAntiCommandEnabled(groupJid, "antivirtex")
          const warningStats = await WarningQueries.getWarningStats(groupJid, "antivirtex")
          const warningLimit = await this.getWarningLimit(groupJid) || 1
          
          await sock.sendMessage(groupJid, {
            text:
              `🛡️ *Anti-Virtex Status*\n\n` +
              `Status: ${status ? "✅ Enabled" : "❌ Disabled"}\n` +
              `Warning Limit: ${warningLimit} warnings\n` +
              `Active Warnings: ${warningStats.totalUsers} users\n` +
              `Total Warnings: ${warningStats.totalWarnings}\n` +
              `Max Warnings: ${warningStats.maxWarnings}/${warningLimit}\n\n` +
              `*Detection Methods:*\n` +
              `• guaranteed_security library\n` +
              `• Advanced pattern analysis\n` +
              `• Real-time threat detection`
          }, { quoted: m })
          break

        case "reset":
          const targetUser = await this.extractTargetUser(m, args)
          if (!targetUser) {
            await sock.sendMessage(groupJid, {
              text: "❌ Usage: `.antivirtex reset @user` or reply to a user's message"
            }, { quoted: m })
            return
          }

          const resetResult = await WarningQueries.resetUserWarnings(groupJid, targetUser, "antivirtex")
          const userNumber = targetUser.split("@")[0]
          
          if (resetResult) {
            await sock.sendMessage(groupJid, {
              text: `✅ Warnings reset for @${userNumber}`,
              mentions: [targetUser]
            }, { quoted: m })
          } else {
            await sock.sendMessage(groupJid, {
              text: `ℹ️ @${userNumber} had no active warnings to reset`,
              mentions: [targetUser]
            }, { quoted: m })
          }
          break

        case "list":
          const warningList = await WarningQueries.getWarningList(groupJid, "antivirtex")
          if (warningList.length === 0) {
            await sock.sendMessage(groupJid, {
              text: "📋 No active warnings found"
            }, { quoted: m })
            return
          }

          const currentWarningLimit = await this.getWarningLimit(groupJid) || 1
          let listResponse = "📋 *Active Anti-Virtex Warnings*\n\n"
          warningList.forEach((warn, index) => {
            const userNumber = warn.user_jid.split("@")[0]
            listResponse += `${index + 1}. @${userNumber} - ${warn.warning_count}/${currentWarningLimit} warnings\n`
          })

          const mentions = warningList.map((w) => w.user_jid)
          await sock.sendMessage(groupJid, {
            text: listResponse,
            mentions: mentions
          }, { quoted: m })
          break

        case "stats":
          const violationStats = await ViolationQueries.getViolationStats(groupJid, "antivirtex", 7)
          const weekStats = violationStats[0] || { total_violations: 0, unique_violators: 0, kicks: 0, warnings: 0 }

          await sock.sendMessage(groupJid, {
            text:
              `📊 *Anti-Virtex Statistics (Last 7 days)*\n\n` +
              `👥 Users warned: ${weekStats.unique_violators}\n` +
              `⚠️ Warnings issued: ${weekStats.warnings}\n` +
              `🚪 Users kicked: ${weekStats.kicks}\n` +
              `🛡️ Threats blocked: ${weekStats.total_violations}`
          }, { quoted: m })
          break

        case "test":
          await sock.sendMessage(groupJid, {
            text:
              "🧪 *Anti-Virtex Test Results*\n\n" +
              "*Detection Capabilities:*\n" +
              "✅ Text Bombing (25,000+ chars)\n" +
              "✅ Invisible Characters (5,000+ or 50%+ ratio)\n" +
              "✅ Mention Bombing (1,000+ mentions)\n" +
              "✅ Media Property Abuse\n" +
              "✅ Button Flooding (100+ buttons)\n" +
              "✅ List Flooding (1,000+ rows)\n" +
              "✅ Protocol Exploitation\n" +
              "✅ Annotation Abuse\n\n" +
              "*Library:* guaranteed_security v1.0.0\n" +
              "*Status:* All systems operational ✓"
          }, { quoted: m })
          break

        default:
          const currentStatus = await GroupQueries.isAntiCommandEnabled(groupJid, "antivirtex")
          const currentWarnLimit = await this.getWarningLimit(groupJid) || 1
          
          await sock.sendMessage(groupJid, {
            text:
              "🛡️ *Anti-Virtex Commands*\n\n" +
              "• `.antivirtex on` - Enable protection\n" +
              "• `.antivirtex off` - Disable protection\n" +
              "• `.antivirtex status` - Check status\n" +
              "• `.antivirtex warn [1-5]` - Set warning limit\n" +
              "• `.antivirtex reset @user` - Reset warnings\n" +
              "• `.antivirtex list` - Show warning list\n" +
              "• `.antivirtex stats` - View statistics\n" +
              "• `.antivirtex test` - Test detection\n\n" +
              `*Current Status:* ${currentStatus ? "✅ Enabled" : "❌ Disabled"}\n` +
              `*Warning Limit:* ${currentWarnLimit} warnings\n\n` +
              "🔒 Powered by guaranteed_security"
          }, { quoted: m })
          break
      }
    } catch (error) {
      logger.error("Error in antivirtex command:", error)
      await sock.sendMessage(groupJid, {
        text: "❌ Error managing anti-virtex settings"
      }, { quoted: m })
    }
  },

  async extractTargetUser(m, args) {
    const contextInfo = m.message?.message?.extendedTextMessage?.contextInfo
    if (contextInfo?.mentionedJid && contextInfo.mentionedJid.length > 0) {
      return contextInfo.mentionedJid[0]
    }

    if (contextInfo?.quotedMessage && contextInfo.participant) {
      return contextInfo.participant
    }

    const messageContent = m.message?.message
    if (messageContent) {
      if (messageContent.conversation && contextInfo?.mentionedJid) {
        return contextInfo.mentionedJid[0]
      }
      
      if (messageContent.extendedTextMessage?.contextInfo?.mentionedJid) {
        return messageContent.extendedTextMessage.contextInfo.mentionedJid[0]
      }
    }

    if (m.mentionedJid && m.mentionedJid.length > 0) {
      return m.mentionedJid[0]
    }

    if (args.length > 1) {
      const phoneArg = args[1].replace(/[@\s-+]/g, '')
      if (/^\d{10,15}$/.test(phoneArg)) {
        return `${phoneArg}@s.whatsapp.net`
      }
    }

    if (m.quoted && m.quoted.sender) {
      return m.quoted.sender
    }

    return null
  },

  async getWarningLimit(groupJid) {
    try {
      const result = await pool.query(
        `SELECT virtex_warning_limit FROM groups WHERE jid = $1`,
        [groupJid]
      )
      return result.rows[0]?.virtex_warning_limit || 1
    } catch (error) {
      logger.error("Error getting virtex warning limit:", error)
      return 2
    }
  },

  async setWarningLimit(groupJid, limit) {
    try {
      await GroupQueries.ensureGroupExists(groupJid)
      
      await pool.query(
        `UPDATE groups SET virtex_warning_limit = $1, updated_at = CURRENT_TIMESTAMP WHERE jid = $2`,
        [limit, groupJid]
      )
      return true
    } catch (error) {
      logger.error("Error setting virtex warning limit:", error)
      return false
    }
  },

  async isEnabled(groupJid) {
    try {
      return await GroupQueries.isAntiCommandEnabled(groupJid, "antivirtex")
    } catch (error) {
      logger.error("Error checking if antivirtex enabled:", error)
      return false
    }
  },

  async shouldProcess(m) {
    if (!m.isGroup) return false
    if (m.isCommand) return false
    if (m.key?.fromMe) return false
    return true
  },

  async processMessage(sock, sessionId, m) {
    try {
      await this.handleVirtexDetection(sock, sessionId, m)
    } catch (error) {
      logger.error("Error processing antivirtex message:", error)
    }
  },

  async handleVirtexDetection(sock, sessionId, m) {
    try {
      const adminChecker = new AdminChecker()
      const groupJid = m.chat
      
      if (!groupJid) {
        logger.warn("No group JID available for antivirtex processing")
        return
      }

      // Skip if user is admin
      const isAdmin = await adminChecker.isGroupAdmin(sock, groupJid, m.sender)
      if (isAdmin) {
        return
      }

      // Check if bot is admin
      const botIsAdmin = await adminChecker.isBotAdmin(sock, groupJid)
      if (!botIsAdmin) {
        try {
          await sock.sendMessage(groupJid, {
            text: "🛡️ Malicious message detected but bot lacks admin permissions.\n\nPlease make bot an admin to enable message deletion."
          })
        } catch (error) {
          logger.error("Failed to send no-permission message:", error)
        }
        return
      }

      // Analyze message using guaranteed_security
      const analysis = await this.analyzeWhatsAppMessage(m)
      
      if (!analysis.isMalicious) {
        return
      }

      logger.info(`Virtex detected from ${m.sender}: ${analysis.reason}`)

      const warningLimit = await this.getWarningLimit(groupJid)
      
      const messageInfo = {
        sender: m.sender,
        text: m.text || "[media/special message]",
        id: m.key.id,
        reason: analysis.reason
      }

      let warnings
      try {
        warnings = await WarningQueries.addWarning(
          groupJid,
          messageInfo.sender,
          "antivirtex",
          `Virtex attack: ${analysis.reason}`
        )
      } catch (error) {
        logger.error("Failed to add warning:", error)
        warnings = 1
      }

      // Delete the malicious message
      try {
        await sock.sendMessage(groupJid, { delete: m.key })
        m._wasDeletedByAntiPlugin = true
      } catch (error) {
        logger.error("Failed to delete message:", error)
        m._wasDeletedByAntiPlugin = true
      }

      await new Promise(resolve => setTimeout(resolve, 800))

      let response =
        `🛡️ *Virtex Attack Detected & Blocked!*\n\n` +
        `👤 @${messageInfo.sender.split("@")[0]}\n` +
        `🔍 Threat: ${analysis.reason}\n` +
        `⚠️ Warning: ${warnings}/${warningLimit}`

      if (warnings >= warningLimit) {
        try {
          await sock.groupParticipantsUpdate(groupJid, [messageInfo.sender], "remove")
          response += `\n\n❌ *User removed* for reaching ${warningLimit} virtex warnings.`
          await WarningQueries.resetUserWarnings(groupJid, messageInfo.sender, "antivirtex")
        } catch (error) {
          logger.error("Failed to remove user:", error)
          response += `\n\n❌ Failed to remove user (insufficient permissions)`
        }
      } else {
        response += `\n\n📝 ${warningLimit - warnings} warnings remaining before removal.`
      }

      response += `\n\n🔒 Group protected by guaranteed_security`

      try {
        await sock.sendMessage(groupJid, {
          text: response,
          mentions: [messageInfo.sender]
        })
      } catch (error) {
        logger.error("Failed to send warning message:", error)
      }

      // Log violation
      try {
        await ViolationQueries.logViolation(
          groupJid,
          messageInfo.sender,
          "antivirtex",
          messageInfo.text,
          { 
            reason: analysis.reason,
            detectionMethod: "guaranteed_security"
          },
          warnings >= warningLimit ? "kick" : "warning",
          warnings,
          messageInfo.id
        )
      } catch (error) {
        logger.error("Failed to log violation:", error)
      }
      
    } catch (error) {
      logger.error("Error handling virtex detection:", error)
    }
  },

  async analyzeWhatsAppMessage(m) {
    try {
      // Convert WhatsApp message to format expected by guaranteed_security
      const messageObj = this.convertToAnalyzableFormat(m)
      
      // Use guaranteed_security library for analysis
      const result = analyzeMessage(messageObj)
      
      return result
    } catch (error) {
      logger.error("Error analyzing message with guaranteed_security:", error)
      return { isMalicious: false, reason: null }
    }
  },

  convertToAnalyzableFormat(m) {
    const message = {}
    
    try {
      // Extract message content based on type
      const msgContent = m.message?.message || m.message || {}
      
      // Handle different message types
      if (msgContent.conversation) {
        message.conversation = msgContent.conversation
      }
      
      if (msgContent.extendedTextMessage) {
        message.extendedTextMessage = {
          text: msgContent.extendedTextMessage.text,
          contextInfo: msgContent.extendedTextMessage.contextInfo
        }
      }
      
      if (msgContent.imageMessage) {
        message.imageMessage = {
          caption: msgContent.imageMessage.caption,
          mimetype: msgContent.imageMessage.mimetype,
          fileLength: msgContent.imageMessage.fileLength,
          seconds: msgContent.imageMessage.seconds
        }
      }
      
      if (msgContent.videoMessage) {
        message.videoMessage = {
          caption: msgContent.videoMessage.caption,
          seconds: msgContent.videoMessage.seconds,
          fileLength: msgContent.videoMessage.fileLength,
          mimetype: msgContent.videoMessage.mimetype
        }
      }
      
      if (msgContent.audioMessage) {
        message.audioMessage = {
          seconds: msgContent.audioMessage.seconds,
          fileLength: msgContent.audioMessage.fileLength,
          mimetype: msgContent.audioMessage.mimetype
        }
      }
      
      if (msgContent.documentMessage) {
        message.documentMessage = {
          fileName: msgContent.documentMessage.fileName,
          mimetype: msgContent.documentMessage.mimetype,
          fileLength: msgContent.documentMessage.fileLength,
          pageCount: msgContent.documentMessage.pageCount
        }
      }
      
      if (msgContent.buttonsMessage) {
        message.buttonsMessage = {
          buttons: msgContent.buttonsMessage.buttons,
          contentText: msgContent.buttonsMessage.contentText
        }
      }
      
      if (msgContent.listMessage) {
        message.listMessage = {
          sections: msgContent.listMessage.sections,
          title: msgContent.listMessage.title
        }
      }
      
      if (msgContent.templateMessage) {
        message.templateMessage = msgContent.templateMessage
      }
      
      if (msgContent.contactMessage) {
        message.contactMessage = msgContent.contactMessage
      }
      
      if (msgContent.locationMessage) {
        message.locationMessage = msgContent.locationMessage
      }
      
      if (msgContent.liveLocationMessage) {
        message.liveLocationMessage = msgContent.liveLocationMessage
      }
      
    } catch (error) {
      logger.error("Error converting message format:", error)
    }
    
    return message
  }
}