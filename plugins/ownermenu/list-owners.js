export default {
  name: "listowners",
  commands: ["listowners", "owners"],
  description: "List all bot owners (Owner only)",
  adminOnly: false, // Handled by permission system
  category: "owner",

  async execute(sock, sessionId, args, m) {
    try {
      // Import permission system
      const { default: permissionSystem } = await import("../../utils/permission-system.js")

      const owners = permissionSystem.getOwners()
      const stats = permissionSystem.getStats()

      if (owners.length === 0) {
        return await sock.sendMessage(m.chat, {
          text: "❌ No owners configured.\n\n💡 Use `.addowner` to add owners.",
        })
      }

      let ownerText = `┌─❖\n`
      ownerText += `│ Bot Owners List\n`
      ownerText += `└┬❖\n`
      ownerText += `┌┤ 👑 ${owners.length} Owner(s)\n`
      ownerText += `│└────────┈⳹\n\n`

      const whatsappOwners = owners.filter((owner) => !owner.startsWith("telegram:"))
      const telegramOwners = owners.filter((owner) => owner.startsWith("telegram:"))

      let index = 1

      if (whatsappOwners.length > 0) {
        ownerText += `📱 *WhatsApp Owners (${whatsappOwners.length}):*\n`
        for (const owner of whatsappOwners) {
          const identifier = owner.replace("@s.whatsapp.net", "")
          ownerText += `👑 ${index}. *${identifier}*\n`
          ownerText += `   └ Platform: WhatsApp\n\n`
          index++
        }
      }

      if (telegramOwners.length > 0) {
        ownerText += `💬 *Telegram Owners (${telegramOwners.length}):*\n`
        for (const owner of telegramOwners) {
          const identifier = owner.replace("telegram:", "")
          ownerText += `👑 ${index}. *${identifier}*\n`
          ownerText += `   └ Platform: Telegram\n\n`
          index++
        }
      }

      ownerText += `📊 *System Stats:*\n`
      ownerText += `• Total Owners: ${owners.length}\n`
      ownerText += `• WhatsApp: ${whatsappOwners.length}\n`
      ownerText += `• Telegram: ${telegramOwners.length}\n`
      ownerText += `• Cache Size: ${stats.cacheSize}\n`
      ownerText += `• Cache Timeout: ${Math.round(stats.cacheTimeout / 1000)}s\n\n`

      ownerText += `🛠 *Management:*\n`
      ownerText += `• Add Owner: .addowner <user>\n`
      ownerText += `• Remove Owner: .removeowner <user>\n\n`
      ownerText += `© paulbot`

      await sock.sendMessage(m.chat, {
        text: ownerText,
        contextInfo: {
          externalAdReply: {
            title: "👑 Bot Owners",
            body: `${owners.length} owner(s) configured across ${whatsappOwners.length > 0 && telegramOwners.length > 0 ? "2 platforms" : "1 platform"}`,
            thumbnailUrl: "https://i.imgur.com/placeholder.jpg",
            sourceUrl: "https://github.com/yourusername/bot",
            mediaType: 1,
            renderLargerThumbnail: false,
          },
        },
      })

      return {
        success: true,
        owners,
        stats: { whatsappOwners: whatsappOwners.length, telegramOwners: telegramOwners.length },
      }
    } catch (error) {
      console.error("[ListOwners] Error:", error)
      await sock.sendMessage(m.chat, { text: "❌ Error listing owners. Please try again." })
      return { success: false, error: error.message }
    }
  },
}
