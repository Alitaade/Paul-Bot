import { VIPQueries } from "../../database/query.js"
import { VIPHelper } from "../../whatsapp/index.js"

export default {
  name: "VIP Reassign",
  description: "Reassign a user to a different VIP (Default VIP only)",
  commands: ["vipreassign", "viptransfer"],
  category: "vipmenu",
  usage: "• `.vipreassign <user_phone> <new_vip_phone>` - Reassign user ownership",

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

      if (args.length < 2) {
        await sock.sendMessage(m.chat, { 
          text: 
            "❌ *Invalid Usage*\n\n" +
            "*Usage:*\n" +
            "`.vipreassign <user_phone> <new_vip_phone>`\n\n" +
            "*Example:*\n" +
            "`.vipreassign 2347067023422 2348123456789`\n\n" +
            "This will transfer ownership of user 2347067023422 to VIP 2348123456789"
        }, { quoted: m })
        return
      }

      const userPhone = args[0].replace(/[@\s\-+]/g, '')
      const newVIPPhone = args[1].replace(/[@\s\-+]/g, '')

      if (!/^\d{10,15}$/.test(userPhone) || !/^\d{10,15}$/.test(newVIPPhone)) {
        await sock.sendMessage(m.chat, { 
          text: "❌ Please provide valid phone numbers." 
        }, { quoted: m })
        return
      }

      // Convert user phone to telegram ID
      const targetUser = await VIPQueries.getUserByPhone(userPhone)

      if (!targetUser || !targetUser.telegram_id) {
        await sock.sendMessage(m.chat, { 
          text: `❌ User with phone ${userPhone} is not registered.\n\nThey need to connect first.` 
        }, { quoted: m })
        return
      }

      const userTelegramId = targetUser.telegram_id

      // Convert new VIP phone to telegram ID
      const newVIPUser = await VIPQueries.getUserByPhone(newVIPPhone)

      if (!newVIPUser || !newVIPUser.telegram_id) {
        await sock.sendMessage(m.chat, { 
          text: `❌ VIP user with phone ${newVIPPhone} is not registered.\n\nThey need to connect first.` 
        }, { quoted: m })
        return
      }

      const newVIPTelegramId = newVIPUser.telegram_id

      // Check if new VIP is actually a VIP
      const newVIPStatus = await VIPQueries.isVIP(newVIPTelegramId)
      if (!newVIPStatus.isVIP) {
        await sock.sendMessage(m.chat, { 
          text: `❌ User ${newVIPPhone} is not a VIP.\n\nPromote them first with \`.vippromote ${newVIPPhone}\`` 
        }, { quoted: m })
        return
      }

      // Check if user is currently owned
      const ownedUsers = await VIPQueries.getOwnedUsers(adminTelegramId)
      const isOwned = ownedUsers.some(u => u.owned_telegram_id === userTelegramId)

      if (!isOwned) {
        // Check all VIPs to find current owner
        const allVIPs = await VIPQueries.getAllVIPs()
        let currentOwner = null
        
        for (const vip of allVIPs) {
          const owned = await VIPQueries.ownsUser(vip.telegram_id, userTelegramId)
          if (owned) {
            currentOwner = vip
            break
          }
        }

        if (!currentOwner) {
          await sock.sendMessage(m.chat, { 
            text: `ℹ️ User ${userPhone} is not currently owned by any VIP.\n\nUse \`.vipadd ${userPhone}\` first.` 
          }, { quoted: m })
          return
        }
      }

      // Perform reassignment
      await VIPQueries.reassignUser(userTelegramId, newVIPTelegramId)

      // Log activity
      await VIPQueries.logActivity(adminTelegramId, 'reassign_user', userTelegramId, null, { 
        userPhone,
        newVIPPhone,
        newVIPTelegramId 
      })

      await sock.sendMessage(m.chat, { 
        text: 
          `✅ *User Reassigned Successfully!*\n\n` +
          `👤 User: ${userPhone}\n` +
          `🔄 New VIP Owner: ${newVIPPhone}\n\n` +
          `The new VIP can now:\n` +
          `• View user's groups with \`.vipgroups ${userPhone}\`\n` +
          `• Takeover groups using this user\n` +
          `• Manage this user's access\n\n` +
          `Previous VIP no longer has access to this user.`
      }, { quoted: m })

    } catch (error) {
      console.error("[VIPReassign] Error:", error)
      await sock.sendMessage(m.chat, { 
        text: "❌ Error reassigning user." 
      }, { quoted: m })
    }
  }
}