import { VIPQueries } from "../../database/query.js"
import { VIPHelper } from "../../whatsapp/index.js"

export default {
  name: "VIP Demote",
  description: "Demote a VIP user back to regular status (Default VIP only)",
  commands: ["vipdemote"],
  category: "vipmenu",
  usage: "• `.vipdemote <phone>` - Remove VIP status from user",

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
          text: "❌ Please provide a valid phone number.\n\nUsage:\n• `.vipdemote 2347067023422`\n• Reply to a message with `.vipdemote`" 
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

      // Check if target is a VIP
      const targetStatus = await VIPQueries.isVIP(targetTelegramId)
      if (!targetStatus.isVIP) {
        await sock.sendMessage(m.chat, { 
          text: `ℹ️ User ${targetPhone} is not a VIP user.\n\nNothing to demote.` 
        }, { quoted: m })
        return
      }

      // Prevent demoting default VIP
      if (targetStatus.isDefault) {
        await sock.sendMessage(m.chat, { 
          text: `❌ Cannot demote Default VIP user.\n\nUse database access to change default VIP status.` 
        }, { quoted: m })
        return
      }

      // Get owned users count
      const ownedUsers = await VIPQueries.getOwnedUsers(targetTelegramId)

      // Demote VIP
      await VIPQueries.demoteVIP(targetTelegramId)

      // Release all owned users
      for (const user of ownedUsers) {
        await VIPQueries.unclaimUser(user.owned_telegram_id)
      }

      // Log activity
      await VIPQueries.logActivity(adminTelegramId, 'demote_vip', targetTelegramId, null, { 
        targetPhone,
        usersReleased: ownedUsers.length 
      })

      await sock.sendMessage(m.chat, { 
        text: 
          `✅ *VIP Demotion Successful!*\n\n` +
          `📱 Phone: ${targetPhone}\n` +
          `👤 Name: ${targetUser.first_name || 'Unknown'}\n` +
          `🆔 Telegram ID: ${targetTelegramId}\n` +
          `⭐ Previous Level: ${targetStatus.level}\n\n` +
          `Actions Taken:\n` +
          `• VIP status removed\n` +
          `• ${ownedUsers.length} owned users released\n` +
          `• VIP commands disabled\n\n` +
          `User is now a regular bot user.`
      }, { quoted: m })

    } catch (error) {
      console.error("[VIPDemote] Error:", error)
      await sock.sendMessage(m.chat, { 
        text: "❌ Error demoting VIP user." 
      }, { quoted: m })
    }
  }
}