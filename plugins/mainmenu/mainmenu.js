export default {
  name: "mainmenu",
  commands: ["mainmenu", "main"],
  description: "Display the main menu with all available command categories",
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

      // Generate main menu
      const menuText = await menuSystem.generateMainMenu(userInfo)

      // Send menu with main styling
      await sock.sendMessage(m.chat, {
        text: menuText,
        contextInfo: {
          externalAdReply: {
            title: "🏠 Main Menu",
            body: "Bot Command Categories",
            thumbnailUrl: "https://i.imgur.com/placeholder.jpg",
            sourceUrl: "https://github.com/yourusername/bot",
            mediaType: 1,
            renderLargerThumbnail: true,
          },
        },
      })

      return { success: true }
    } catch (error) {
      console.error("[MainMenu] Error:", error)
      await sock.sendMessage(m.chat, { text: "❌ Error loading main menu. Please try again." })
      return { success: false, error: error.message }
    }
  },
}
