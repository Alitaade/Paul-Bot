export default {
  name: "join",
  aliases: ["joingroup"],
  category: "ownermenu",
  description: "Join a WhatsApp group using invite link",
  usage: "join <group_invite_link>",
  cooldown: 10,
  permissions: ["owner"],

  async execute(sock, m, { args, isCreator }) {
    if (!isCreator) {
      return m.reply("❌ This command is only for bot owners!")
    }

    if (!args.length) {
      return m.reply("❌ Please provide a group invite link!\n\nExample: .join https://chat.whatsapp.com/...")
    }

    const link = args[0]

    if (!link.includes("chat.whatsapp.com")) {
      return m.reply("❌ Invalid WhatsApp group link!")
    }

    try {
      // Extract invite code from link
      const inviteCode = link.split("https://chat.whatsapp.com/")[1]

      if (!inviteCode) {
        return m.reply("❌ Invalid group invite link format!")
      }

      m.reply("⏳ Joining group, please wait...")

      await sock.groupAcceptInvite(inviteCode)
      m.reply("✅ Successfully joined the group!")
    } catch (error) {
      console.log("[v0] Error in join command:", error)

      // Handle specific error cases
      if (error.output?.statusCode === 400) {
        m.reply("❌ Group not found or invite link is invalid!")
      } else if (error.output?.statusCode === 401) {
        m.reply("❌ Bot was kicked from this group!")
      } else if (error.output?.statusCode === 409) {
        m.reply("❌ Bot is already in this group!")
      } else if (error.output?.statusCode === 410) {
        m.reply("❌ Group invite link has been reset!")
      } else if (error.output?.statusCode === 500) {
        m.reply("❌ Group is full!")
      } else {
        m.reply("❌ Failed to join group! Please check the invite link.")
      }
    }
  },
}
