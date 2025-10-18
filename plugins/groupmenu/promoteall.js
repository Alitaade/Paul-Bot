export default {
  name: "promoteall",
  commands: ["promoteall"],
  description: "Promote all group members to admin (Owner only)",
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
          text: "❌ I need to be an admin to promote members!",
        })
      }

      // Get non-admin members
      const nonAdmins = participants.filter((p) => !p.admin && p.jid !== botNumber)

      if (nonAdmins.length === 0) {
        return await sock.sendMessage(m.chat, {
          text: "ℹ️ All members are already admins!",
        })
      }

      // Promote all non-admin members
      const memberIds = nonAdmins.map((p) => p.jid)

      await sock.groupParticipantsUpdate(m.chat, memberIds, "promote")

      await sock.sendMessage(m.chat, {
        text:
          `✅ *PROMOTE ALL COMPLETED*\n\n` +
          `👑 Promoted: ${memberIds.length} members\n` +
          `📊 Total admins now: ${participants.length}\n\n` +
          `All group members are now administrators!`,
      })

      return { success: true, promoted: memberIds.length }
    } catch (error) {
      console.error("[PromoteAll] Error:", error)
      await sock.sendMessage(m.chat, {
        text: "❌ Error promoting all members!",
      })
      return { success: false, error: error.message }
    }
  },
}
