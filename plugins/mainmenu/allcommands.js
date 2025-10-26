import { createComponentLogger } from "../../utils/logger.js"
import pluginLoader from "../../utils/plugin-loader.js"
import { VIPQueries } from "../../database/query.js"
import VIPHelper from "../../whatsapp/index.js"

const log = createComponentLogger("ALL-COMMANDS")

export default {
  name: "AllCommands",
  description: "Display all available commands organized by category",
  commands: ["allcommands", "commands", "help", "allmenu"],
  category: "both",
  adminOnly: false,
  usage:
    "• `.allcommands` - Show all available commands\n• `.commands` - Alias for allcommands\n• `.help` - Alias for allcommands",

  async execute(sock, sessionId, args, m) {
    try {
      // Check if user is VIP
      const userTelegramId = VIPHelper.fromSessionId(sessionId)
      let isVIP = false
      if (userTelegramId) {
        const vipStatus = await VIPQueries.isVIP(userTelegramId)
        isVIP = vipStatus.isVIP
      }

      // Get all available commands
      const allCommands = pluginLoader.getAvailableCommands()
      const categories = {
        chat: [],
        group: [],
        both: [],
      }

      // Organize commands by category (FILTER OUT VIPMENU)
      allCommands.forEach((cmd) => {
        // Skip vipmenu commands if user is not VIP
        if (cmd.category === 'vipmenu' && !isVIP) {
          return
        }

        const category = cmd.category || "both"
        if (categories[category]) {
          categories[category].push(cmd)
        } else {
          categories.both.push(cmd) // Default to 'both' if category not found
        }
      })

      // Build the command list message
      let message = `📚 ALL AVAILABLE COMMANDS\n\n`
      let commandCount = 0

      // Display commands by category
      Object.entries(categories).forEach(([categoryName, commands]) => {
        if (commands.length > 0) {
          const categoryTitle = categoryName.charAt(0).toUpperCase() + categoryName.slice(1)
          message += `*${categoryTitle} Commands:*\n`
          commands.forEach((cmd, index) => {
            commandCount++
            const adminBadge = cmd.adminOnly ? " 👑" : ""
            message += `${commandCount}. .${cmd.command}${adminBadge}\n`
            message += `   📝 ${cmd.description}\n`
            if (cmd.usage && cmd.usage !== `${cmd.command} - ${cmd.description}`) {
              message += `   💡 ${cmd.usage.split("\n")[0]}\n`
            }
            message += `\n`
          })
        }
      })

      message += `\n📊 Total Commands: ${commandCount}\n`
      message += `👑 = Admin Only Commands\n`
      if (isVIP) {
        message += `⭐ = VIP Commands (you have access)\n`
      }
      message += `💡 Use .menu to return to main menu`

      await sock.sendMessage(
        m.chat,
        {
          text: message,
        },
        {
          quoted: m,
        },
      )

      log.info(`All commands list sent to ${m.sender}`)
    } catch (error) {
      log.error("Error in allcommands plugin:", error)
      try {
        await sock.sendMessage(
          m.chat,
          {
            text: "❌ Error loading commands list. Please try again later.",
          },
          {
            quoted: m,
          },
        )
      } catch (sendError) {
        log.error("Failed to send error message:", sendError)
      }
    }
  },
}