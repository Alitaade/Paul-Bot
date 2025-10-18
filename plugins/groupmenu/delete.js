export default {
  name: "del",
  aliases: ["delete", "del"],
  category: "groupmenu",
  description: "Delete a message by replying to it",
  usage: "Reply to a message with .del",
  permissions: ["admin"],

  async execute(sock, m, { quoted, isAdmin, isBotAdmin }) {
    if (!m.isGroup) {
      return m.reply("❌ This command can only be used in groups!")
    }

    if (!isAdmin) {
      return m.reply("❌ Only group admins can use this command!")
    }

    if (!quoted) {
      return m.reply("❌ Please reply to the message you want to delete!\n\nExample: Reply to a message and type .del")
    }

    try {
      // Check if the quoted message is from the bot itself
      const isBotMessage = quoted.key?.fromMe === true

      // If it's not a bot message and bot is not admin, inform the user
      if (!isBotMessage && !isBotAdmin) {
        return m.reply("❌ Bot needs to be admin to delete messages from other users!")
      }

      // Attempt to delete the message
      await sock.sendMessage(m.chat, {
        delete: {
          remoteJid: quoted.key.remoteJid,
          fromMe: quoted.key.fromMe,
          id: quoted.key.id,
          participant: quoted.key.participant
        }
      })

      // Optional: Delete the command message itself after a brief delay
      setTimeout(async () => {
        try {
          await sock.sendMessage(m.chat, {
            delete: {
              remoteJid: m.key.remoteJid,
              fromMe: m.key.fromMe,
              id: m.key.id,
              participant: m.key.participant
            }
          })
        } catch (err) {
          // Silently fail if can't delete command message
        }
      }, 500)

    } catch (error) {
      console.log("[Delete] Error deleting message:", error)
      
      // Provide specific error messages
      if (error.message?.includes("forbidden")) {
        return m.reply("❌ Cannot delete this message. It might be too old or the bot lacks permissions.")
      } else if (error.message?.includes("not-authorized")) {
        return m.reply("❌ Bot is not authorized to delete this message.")
      } else {
        return m.reply("❌ Failed to delete the message. The message might be too old or already deleted.")
      }
    }
  },
}