import { VIPQueries } from "../../database/query.js"
import { VIPHelper } from "../../whatsapp/index.js"

export default {
  name: "VIP Promote",
  description: "Promote a user to VIP status (Default VIP only)",
  commands: ["vippromote"],
  category: "vipmenu",
  usage: "• `.vippromote <phone>` - Promote user to VIP Level 1",

  async execute(sock, sessionId, args, m) {
    try {
      const adminTelegramId = VIPHelper.fromSessionId(sessionId)
      if (!adminTelegramId) {
        await sock.sendMessage(m.chat, { text: "❌ Could not identify your session" }, { quoted: m })
        return
      }

      // Check if user is Default VIP
      const adminStatus = await VIPQueries.isVIP(adminTelegramId)
      if (!adminStatus.isDefault && adminStatus.level !== 99) {
        await sock.sendMessage(m.chat, { 
          text: "❌ This command is only available to Default VIP (bot owner)." 
        }, { quoted: m })
        return
      }

      // Parse target phone
      let targetPhone = null
      
      if (args.length > 0) {
        targetPhone = args[0].replace(/[@\s\-+]/g, '')
      } else if (m.quoted && m.quoted.sender) {
        targetPhone = VIPHelper.extractPhone(m.quoted.sender)
      }

      if (!targetPhone || !/^\d{10,15}$/.test(targetPhone)) {
        await sock.sendMessage(m.chat, { 
          text: "❌ Please provide a valid phone number.\n\nUsage:\n• `.vippromote 2347067023422`\n• Reply to a message with `.vippromote`" 
        }, { quoted: m })
        return
      }

      // Convert phone to telegram ID
      const targetUser = await VIPQueries.getUserByPhone(targetPhone)

      if (!targetUser || !targetUser.telegram_id) {
        await sock.sendMessage(m.chat, { 
          text: `❌ User with phone ${targetPhone} is not registered.\n\nThey need to connect first via Telegram.` 
        }, { quoted: m })
        return
      }

      const targetTelegramId = targetUser.telegram_id

      // Check if target is already a VIP
      const targetStatus = await VIPQueries.isVIP(targetTelegramId)
      if (targetStatus.isVIP) {
        await sock.sendMessage(m.chat, { 
          text: `ℹ️ User ${targetPhone} is already a VIP (Level ${targetStatus.level}).\n\nUse \`.vipdemote ${targetPhone}\` to remove VIP status.` 
        }, { quoted: m })
        return
      }

      // Check if user is connected (with warning, not blocking)
      const targetSock = await VIPHelper.getUserSocket(targetTelegramId)
      const lastArg = args[args.length - 1]
      
      if (!targetSock && lastArg !== 'confirm') {
        await sock.sendMessage(m.chat, { 
          text: `⚠️ Warning: User ${targetPhone} (${targetUser.first_name || 'Unknown'}) is not currently connected.\n\nThey will become VIP but must be online to use VIP features.\n\nProceed with promotion? Reply with \`.vippromote ${targetPhone} confirm\`` 
        }, { quoted: m })
        return
      }

      // Promote to VIP Level 1
      await VIPQueries.promoteToVIP(targetTelegramId, 1)

      // Log activity
      await VIPQueries.logActivity(adminTelegramId, 'promote_vip', targetTelegramId, null, { 
        targetPhone,
        level: 1 
      })

      await sock.sendMessage(m.chat, { 
        text: 
          `✅ *VIP Promotion Successful!*\n\n` +
          `📱 Phone: ${targetPhone}\n` +
          `👤 Name: ${targetUser.first_name || 'Unknown'}\n` +
          `🆔 Telegram ID: ${targetTelegramId}\n` +
          `⭐ VIP Level: 1\n\n` +
          `User can now:\n` +
          `• Claim other users with \`.vipadd\`\n` +
          `• View groups with \`.vipgroups\`\n` +
          `• Takeover groups with \`.viptakeover\`\n` +
          `• Manage their users with \`.viplist\`\n\n` +
          `💡 They will see VIP commands in \`.vipmenu\``
      }, { quoted: m })

    } catch (error) {
      console.error("[VIPPromote] Error:", error)
      await sock.sendMessage(m.chat, { 
        text: "❌ Error promoting user to VIP." 
      }, { quoted: m })
    }
  }
}