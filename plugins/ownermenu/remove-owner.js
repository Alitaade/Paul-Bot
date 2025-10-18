export default {
  name: "removeowner",
  commands: ["removeowner", "delowner"],
  description: "Remove a bot owner (Owner only)",
  adminOnly: false, // Handled by permission system
  category: "owner",

  async execute(sock, sessionId, args, m) {
    try {
      // Import permission system
      const { default: permissionSystem } = await import("../../utils/permission-system.js")

      if (!args[0]) {
        return await sock.sendMessage(m.chat, {
          text: "❌ Please provide a user identifier.\n\n*Usage:*\n• `.removeowner @user` (reply to user)\n• `.removeowner 1234567890` (phone number)\n• `.removeowner telegram:123456789` (Telegram ID)",
        })
      }

      let targetJid = args[0]
      let platform = "whatsapp"

      // Handle different input formats
      if (m.quoted && m.quoted.sender) {
        targetJid = m.quoted.sender
      } else if (args[0].startsWith("telegram:")) {
        platform = "telegram"
        targetJid = args[0].replace("telegram:", "")
      } else if (args[0].startsWith("@")) {
        // Handle @mention format
        targetJid = args[0].replace("@", "") + "@s.whatsapp.net"
      } else if (/^\d+$/.test(args[0])) {
        // Handle phone number
        targetJid = args[0] + "@s.whatsapp.net"
      }

      const normalizedId = permissionSystem.normalizeUserIdentifier(targetJid, platform)

      // Check if user is actually an owner
      if (!permissionSystem.isOwner(targetJid, platform)) {
        return await sock.sendMessage(m.chat, {
          text: `⚠️ User is not a bot owner!\n\n👤 *User:* ${normalizedId}\n🌐 *Platform:* ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
        })
      }

      // Prevent removing the last owner
      const owners = permissionSystem.getOwners()
      if (owners.length <= 1) {
        return await sock.sendMessage(m.chat, {
          text: "❌ Cannot remove the last owner!\n\n⚠️ At least one owner must remain to manage the bot.",
        })
      }

      // Prevent self-removal (optional safety check)
      const currentUserNormalized = permissionSystem.normalizeUserIdentifier(m.sender, "whatsapp")
      if (normalizedId === currentUserNormalized) {
        return await sock.sendMessage(m.chat, {
          text: "⚠️ You cannot remove yourself as owner!\n\n💡 Ask another owner to remove you if needed.",
        })
      }

      // Remove owner
      const success = permissionSystem.removeOwner(targetJid, platform)

      if (success) {
        await sock.sendMessage(m.chat, {
          text: `✅ Successfully removed owner!\n\n👤 *Removed Owner:* ${normalizedId}\n🌐 *Platform:* ${platform.charAt(0).toUpperCase() + platform.slice(1)}\n📊 *Remaining Owners:* ${permissionSystem.getOwners().length}\n\n*Note:* Changes take effect immediately.`,
          contextInfo: {
            externalAdReply: {
              title: "👤 Owner Removed",
              body: `${normalizedId} is no longer a bot owner`,
              thumbnailUrl: "https://i.imgur.com/warning-placeholder.jpg",
              mediaType: 1,
            },
          },
        })

        // Log the owner removal for audit trail
        console.log(`[RemoveOwner] Owner removed: ${normalizedId} (${platform}) by ${m.sender}`)
      } else {
        await sock.sendMessage(m.chat, {
          text: "❌ Failed to remove owner. Please check the identifier and try again.",
        })
      }

      return { success }
    } catch (error) {
      console.error("[RemoveOwner] Error:", error)
      await sock.sendMessage(m.chat, { text: "❌ Error removing owner. Please try again." })
      return { success: false, error: error.message }
    }
  },
}
