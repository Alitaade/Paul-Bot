export default {
  name: "add",
  aliases: ["addmember", "add"],
  category: "groupmenu",
  description: "Add a member to the group",
  usage: "add <number> or reply to user",
  permissions: ["admin"],

  async execute(sock, m, { args, quoted, isAdmin, isBotAdmin }) {
    if (!m.isGroup) {
      return m.reply("❌ This command can only be used in groups!")
    }

    if (!isAdmin) {
      return m.reply("❌ Only group admins can use this command!")
    }

    if (!isBotAdmin) {
      return m.reply("❌ Bot needs to be admin to add members!")
    }

    let targetNumber
    if (quoted && quoted.sender) {
      targetNumber = quoted.sender
    } else if (args.length) {
      targetNumber = args[0].replace(/\D/g, "") + "@s.whatsapp.net"
    } else {
      return m.reply(`❌ Please provide a number or reply to a user!\n\nExample: .add 1234567890`)
    }

    try {
      const result = await sock.groupParticipantsUpdate(m.chat, [targetNumber], "add")

      for (const res of result) {
        const number = targetNumber.split("@")[0]

        switch (res.status) {
          case "200":
            m.reply(`✅ Successfully added @${number} to the group!`, { mentions: [targetNumber] })
            break
          case "401":
            m.reply(`❌ @${number} has blocked the bot!`, { mentions: [targetNumber] })
            break
          case "409":
            m.reply(`❌ @${number} is already in the group!`, { mentions: [targetNumber] })
            break
          case "408":
            // Send private invite
            const inviteCode = await sock.groupInviteCode(m.chat)
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`

            await sock
              .sendMessage(targetNumber, {
                text:
                  `📨 *Group Invitation*\n\n` +
                  `You've been invited to join: *${m.metadata.subject}*\n` +
                  `By: @${m.sender.split("@")[0]}\n\n` +
                  `${inviteLink}\n\n` +
                  `Click the link above to join the group.`,
                mentions: [m.sender],
              })
              .catch(() => {})

            m.reply(`📨 @${number} couldn't be added directly. Invitation sent via private message.`, {
              mentions: [targetNumber],
            })
            break
          case "403":
            m.reply(`❌ @${number} has privacy settings that prevent adding to groups.`, { mentions: [targetNumber] })
            break
          default:
            m.reply(`❌ Failed to add @${number}. Status: ${res.status}`, { mentions: [targetNumber] })
        }
      }
    } catch (error) {
      console.log("[v0] Error in add command:", error)
      m.reply("❌ Failed to add member!")
    }
  },
}
