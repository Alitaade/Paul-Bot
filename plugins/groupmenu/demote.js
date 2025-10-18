export default {
  name: "demote",
  aliases: ["demoteuser", "removeadmin"],
  category: "groupmenu",
  description: "Demote a group admin to regular member",
  usage: "demote <number> or reply to user",
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
      return m.reply("❌ Bot needs to be admin to demote members!")
    }

    let targetNumber
    if (quoted && quoted.sender) {
      targetNumber = quoted.sender
    } else if (args.length) {
      targetNumber = args[0].replace(/\D/g, "") + "@s.whatsapp.net"
    } else {
      return m.reply(`❌ Please provide a number or reply to a user!\n\nExample: .demote 1234567890`)
    }

    // Prevent demoting bot itself
    const botNumber = sock.user.id.split(":")[0] + "@s.whatsapp.net"
    if (targetNumber === botNumber) {
      return m.reply("❌ I cannot demote myself!")
    }

    try {
      await sock.groupParticipantsUpdate(m.chat, [targetNumber], "demote")
      const number = targetNumber.split("@")[0]

      m.reply(`✅ Successfully demoted @${number} from admin!`, { mentions: [targetNumber] })
    } catch (error) {
      console.log("[v0] Error in demote command:", error)
      m.reply("❌ Failed to demote user! They might not be an admin or not in the group.")
    }
  },
}
