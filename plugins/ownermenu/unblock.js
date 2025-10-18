export default {
  name: "unblock",
  aliases: ["unblokir", "unblockuser"],
  category: "ownermenu",
  description: "Unblock a user",
  usage: "unblock <number>",
  cooldown: 5,
  permissions: ["owner"],

  async execute(sock, m, { args, isCreator }) {
    if (!isCreator) {
      return m.reply("❌ This command is only for bot owners!")
    }

    if (!args.length) {
      return m.reply("❌ Please provide a number to unblock!\n\nExample: .unblock 1234567890")
    }

    const targetNumber = args[0].replace(/\D/g, "") + "@s.whatsapp.net"

    try {
      await sock.updateBlockStatus(targetNumber, "unblock")
      const number = targetNumber.split("@")[0]

      m.reply(`✅ Successfully unblocked @${number}!`, { mentions: [targetNumber] })
    } catch (error) {
      console.log("[v0] Error in unblock command:", error)
      m.reply("❌ Failed to unblock user!")
    }
  },
}
