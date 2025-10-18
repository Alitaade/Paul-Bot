import { createComponentLogger } from "../../utils/logger.js"
import AdminChecker from "../../whatsapp/utils/admin-checker.js"

const logger = createComponentLogger("TAG-ADMIN")

export default {
  name: "Tag Admin",
  description: "Mention all group admins",
  commands: ["tagadmin", "admins", "admin"],
  category: "group",
  adminOnly: false,
  usage: "• `.tagadmin` - Mention all group admins",

  async execute(sock, sessionId, args, m) {
    const groupJid = m.chat

    if (!m.isGroup) {
      await sock.sendMessage(groupJid, {
        text: "❌ This command can only be used in groups!"
      }, { quoted: m })
      return
    }

    try {
      // Get group metadata
      const metadata = await sock.groupMetadata(groupJid)
      const admins = metadata.participants.filter(p => 
        p.admin === 'admin' || p.admin === 'superadmin'
      )

      if (admins.length === 0) {
        await sock.sendMessage(groupJid, {
          text: "❌ No admins found in this group."
        }, { quoted: m })
        return
      }

      // Create mention message
      let message = `👑 *Group Admins* 👑\n\n`
      admins.forEach((admin, index) => {
        const phoneNumber = admin.jid.split('@')[0]
        message += `${index + 1}. @${phoneNumber}\n`
      })

      message += `\n💡 Total: ${admins.length} admin(s)`

      // Send message with mentions
      await sock.sendMessage(groupJid, {
        text: message,
        mentions: admins.map(admin => admin.jid)
      }, { quoted: m })

    } catch (error) {
      logger.error("Error in tagadmin command:", error)
      await sock.sendMessage(groupJid, {
        text: "❌ Error fetching admin list."
      }, { quoted: m })
    }
  }
}