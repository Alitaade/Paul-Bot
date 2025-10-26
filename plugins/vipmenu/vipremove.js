import { VIPQueries } from "../../database/query.js"
import { VIPHelper } from "../../whatsapp/index.js"

export default {
  name: "VIP Remove",
  description: "Release a user from your ownership",
  commands: ["vipremove", "viprelease"],
  category: "vipmenu",
  usage: "• `.vipremove <phone>` - Release a user you own",

  async execute(sock, sessionId, args, m) {
    try {
      const vipTelegramId = VIPHelper.fromSessionId(sessionId)
      if (!vipTelegramId) {
        await sock.sendMessage(m.chat, { text: "❌ Could not identify your session" }, { quoted: m })
        return
      }

      const vipStatus = await VIPQueries.isVIP(vipTelegramId)
      if (!vipStatus.isVIP) {
        await sock.sendMessage(m.chat, { 
          text: "❌ You don't have VIP access." 
        }, { quoted: m })
        return
      }

      // Parse target phone
      let targetPhone = null
      
      if (args.length > 0) {
        targetPhone = args[0].replace(/[@\s\-+]/g, '')
      }
// Replace lines 31-38 in vipremove.js
if (!targetPhone || !/^\d{10,15}$/.test(targetPhone)) {
  await sock.sendMessage(m.chat, { 
    text: "❌ Please provide a valid phone number.\n\nUsage: `.vipremove 2347067023422`" 
  }, { quoted: m })
  return
}

// Convert phone to telegram ID
const targetUser = await VIPQueries.getUserByPhone(targetPhone)

if (!targetUser || !targetUser.telegram_id) {
  await sock.sendMessage(m.chat, { 
    text: `❌ User with phone ${targetPhone} is not registered.` 
  }, { quoted: m })
  return
}

const targetTelegramId = targetUser.telegram_id

      // Check ownership
      const owns = await VIPQueries.ownsUser(vipTelegramId, targetTelegramId)
      if (!owns && !vipStatus.isDefault) {
        await sock.sendMessage(m.chat, { 
          text: `❌ You do not own user ${targetPhone}.\n\nYou can only release users you claimed.` 
        }, { quoted: m })
        return
      }

      // Release user
      await VIPQueries.unclaimUser(targetTelegramId, vipStatus.isDefault ? null : vipTelegramId)

      // Log activity
      await VIPQueries.logActivity(vipTelegramId, 'release_user', targetTelegramId, null, { targetPhone })

      await sock.sendMessage(m.chat, { 
        text: 
          `✅ *User Released Successfully!*\n\n` +
          `📱 Phone: ${targetPhone}\n` +
          `🆔 Telegram ID: ${targetTelegramId}\n\n` +
          `This user is no longer under your control.\n` +
          `They can be claimed by any VIP now.`
      }, { quoted: m })

    } catch (error) {
      console.error("[VIPRemove] Error:", error)
      await sock.sendMessage(m.chat, { 
        text: "❌ Error releasing user." 
      }, { quoted: m })
    }
  }
}