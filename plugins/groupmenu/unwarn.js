export default {
  name: "unwarn",
  aliases: ["delwarn", "removewarn", "clearwarn"],
  category: "groupmenu",
  description: "Remove warnings from a user",
  usage: "unwarn <number> or reply to user",
  cooldown: 5,
  permissions: ["admin"],

  async execute(sock, m, { args, quoted, isAdmin, db }) {
    if (!m.isGroup) {
      return m.reply("❌ This command can only be used in groups!")
    }

    if (!isAdmin) {
      return m.reply("❌ Only group admins can use this command!")
    }

    let targetNumber
    if (quoted && quoted.sender) {
      targetNumber = quoted.sender
    } else if (args.length) {
      targetNumber = args[0].replace(/\D/g, "") + "@s.whatsapp.net"
    } else {
      return m.reply(`❌ Please provide a number or reply to a user!\n\nExample: .unwarn 1234567890`)
    }

    try {
      if (db.groups[m.chat]?.warn?.[targetNumber]) {
        delete db.groups[m.chat].warn[targetNumber]
        const number = targetNumber.split("@")[0]

        m.reply(`✅ Successfully removed all warnings from @${number}!`, { mentions: [targetNumber] })
      } else {
        const number = targetNumber.split("@")[0]
        m.reply(`ℹ️ @${number} has no warnings to remove.`, { mentions: [targetNumber] })
      }
    } catch (error) {
      console.log("[v0] Error in unwarn command:", error)
      m.reply("❌ Failed to remove warnings!")
    }
  },
}
