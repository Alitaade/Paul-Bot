import { createComponentLogger } from "../../utils/logger.js"
import { GroupQueries } from "../../database/query.js"
import AdminChecker from "../../whatsapp/utils/admin-checker.js"

const logger = createComponentLogger("OPEN-GROUP")

export default {
  name: "Open Group",
  description: "Reopen group so all members can send messages",
  commands: ["open", "unmute", "opentime", "umute"],
  category: "group",
  adminOnly: true,
  usage: "• `.open` - Reopen group (all members can send messages)",

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

      // Set group to all-member mode
      await sock.groupSettingUpdate(groupJid, "not_announcement")

      await sock.sendMessage(groupJid, {
        text: "🔓 *Group Opened!*\n\nAll members can now send messages."
      }, { quoted: m })


    } catch (error) {
      logger.error("Error opening group:", error)
      await sock.sendMessage(groupJid, {
        text: "❌ Error opening group. Make sure bot is admin."
      }, { quoted: m })
    }
  }
}
