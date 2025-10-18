export default {
  name: "kickall",
  commands: ["kickall"],
  description: "Remove all non-admin members from the group (Owner only)",
  adminOnly: true,

  async execute(sock, sessionId, args, m) {
    try {
      // Check if it's a group
      if (!m.isGroup) {
        return await sock.sendMessage(m.chat, {
          text: "❌ This command can only be used in groups!",
        })
      }

      // Get group metadata
      const groupMetadata = await sock.groupMetadata(m.chat)
      const participants = groupMetadata.participants
      const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net"

      // Check if bot is admin
      const botParticipant = participants.find((p) => p.jid === botNumber)
      if (!botParticipant || !botParticipant.admin) {
        return await sock.sendMessage(m.chat, {
          text: "❌ I need to be an admin to remove members!",
        })
      }

      // Get non-admin members
      const nonAdmins = participants.filter((p) => !p.admin && p.jid !== botNumber && p.jid !== m.sender)

      if (nonAdmins.length === 0) {
        return await sock.sendMessage(m.chat, {
          text: "ℹ️ No non-admin members to remove!",
        })
      }

      // Confirmation message
      await sock.sendMessage(m.chat, {
        text:
          `⚠️ *KICKALL CONFIRMATION*\n\n` +
          `📊 Members to remove: ${nonAdmins.length}\n` +
          `👥 Total participants: ${participants.length}\n\n` +
          `This action will remove ALL non-admin members!\n` +
          `Reply with "CONFIRM KICKALL" to proceed.`,
      })

      return { success: true, pendingConfirmation: true }
    } catch (error) {
      console.error("[KickAll] Error:", error)
      await sock.sendMessage(m.chat, {
        text: "❌ Error executing kickall command!",
      })
      return { success: false, error: error.message }
    }
  },
}
