export default {
  name: "kick",
  aliases: ["dor", "remove"],
  category: "groupmenu",
  description: "Remove a member from the group",
  usage: "kick <number> or reply to user",
  cooldown: 5,
  permissions: ["admin"],

  async execute(sock, m, { args, quoted, isAdmin, isBotAdmin }) {
    if (!m.isGroup) {
      return m.reply("❌ This command can only be used in groups!")
    }

    if (!isAdmin) {
      return m.reply("❌ Only group admins can use this command!")
    }

    if (!isBotAdmin) {
      return m.reply("❌ Bot needs to be admin to remove members!")
    }

    let targetNumber
    if (quoted && quoted.sender) {
      targetNumber = quoted.sender
    } else if (args.length) {
      targetNumber = args[0].replace(/\D/g, "") + "@s.whatsapp.net"
    } else {
      return m.reply(`❌ Please provide a number or reply to a user!\n\nExample: .kick 1234567890`)
    }

    // Prevent kicking admins or bot itself
    const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net"
    if (targetNumber === botNumber) {
      return m.reply("❌ I cannot kick myself!")
    }

    try {
      const result = await sock.groupParticipantsUpdate(m.chat, [targetNumber], "remove")
      const number = targetNumber.split("@")[0]

      m.reply(`✅ Successfully removed @${number} from the group!`, { mentions: [targetNumber] })
    } catch (error) {
      console.log("[v0] Error in kick command:", error)
      m.reply("❌ Failed to remove member! They might be an admin or already left.")
    }
  },
}
