export default {
  name: "gamemenu",
  commands: ["gamemenu"],
  description: "Display gaming and entertainment commands menu",
  adminOnly: false,

  async execute(sock, sessionId, args, m) {
    try {
      // Import menu system
      const { default: menuSystem } = await import("../../utils/menu-system.js")

      // Get user info
      const userInfo = {
        name: m.pushName || "User",
        id: m.sender,
      }

      // Generate game menu
      const menuText = await menuSystem.generateCategoryMenu("gamemenu", userInfo, m.isCreator || false)

      // Send menu with gaming-specific styling
      await sock.sendMessage(m.chat, {
        text: menuText,
        contextInfo: {
          externalAdReply: {
            title: "🎮 Game Menu",
            body: "Fun Games & Entertainment Commands",
            thumbnailUrl: "https://i.imgur.com/placeholder.jpg",
            sourceUrl: "https://github.com/yourusername/bot",
            mediaType: 1,
            renderLargerThumbnail: false,
          },
        },
      }, { quoted: m })

      return { success: true }
    } catch (error) {
      console.error("[GameMenu] Error:", error)
      await sock.sendMessage(m.chat, { text: "❌ Error loading game menu. Please try again." }, { quoted: m })
      return { success: false, error: error.message }
    }
  },
}
