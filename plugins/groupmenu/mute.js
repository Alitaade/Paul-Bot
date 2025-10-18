import { createComponentLogger } from "../../utils/logger.js"
import AdminChecker from "../../whatsapp/utils/admin-checker.js"

const logger = createComponentLogger("CLOSE-GROUP")

export default {
  name: "Close Group",
  description: "Set group to admin-only mode (only admins can send messages)",
  commands: ["close", "mute", "closetime"],
  category: "group",
  adminOnly: true,
  usage:
    "• `.close` - Set group to admin-only mode\n• `.close <duration>` - Close for specific duration (e.g., 1h, 30m)",

  async execute(sock, sessionId, args, m) {
    const groupJid = m.chat

    if (!m.isGroup) {
      await sock.sendMessage(groupJid, {
        text: "❌ This command can only be used in groups!"
      }, { quoted: m })
      return
    }

    try {
      const adminChecker = new AdminChecker()
      const isAdmin = await adminChecker.isGroupAdmin(sock, groupJid, m.sender)

      if (!isAdmin) {
        await sock.sendMessage(groupJid, {
          text: "❌ Only admins can use this command!"
        }, { quoted: m })
        return
      }

      const duration = args[0]
      let durationText = "indefinitely"

      if (duration) {
        // Parse duration (e.g., 1h, 30m, 2d)
        const durationMatch = duration.match(/^(\d+)([hmd])$/)
        if (!durationMatch) {
          await sock.sendMessage(groupJid, {
            text: "❌ Invalid duration format. Use: 1h, 30m, 2d"
          }, { quoted: m })
          return
        }

        const value = parseInt(durationMatch[1])
        const unit = durationMatch[2]
        
        let milliseconds
        switch (unit) {
          case 'h': milliseconds = value * 60 * 60 * 1000; break
          case 'm': milliseconds = value * 60 * 1000; break
          case 'd': milliseconds = value * 24 * 60 * 60 * 1000; break
        }
        
        durationText = `for ${value}${unit}`
        
        // Schedule reopening
        setTimeout(async () => {
          try {
            await sock.groupSettingUpdate(groupJid, 'not_announcement')
            await sock.sendMessage(groupJid, {
              text: "🔓 Group has been reopened. All members can now send messages."
            })
          } catch (error) {
            logger.error("Error reopening group:", error)
          }
        }, milliseconds)
      }

      // Set group to admin-only mode
      await sock.groupSettingUpdate(groupJid, 'announcement')
      
      await sock.sendMessage(groupJid, {
        text: `🔒 *Group Closed!*\n\n` +
              `Only admins can send messages ${durationText}.\n` +
              `Use .open to reopen the group.`
      }, { quoted: m })


    } catch (error) {
      logger.error("Error closing group:", error)
      await sock.sendMessage(groupJid, {
        text: "❌ Error closing group. Make sure bot is admin."
      }, { quoted: m })
    }
  }
}