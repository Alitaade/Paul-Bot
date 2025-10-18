import { gameManager } from "../../lib/game managers/game-manager.js"
import TicTacToeGame from "../../lib/game managers/tictactoe.js"

export default {
  name: "tictactoe",
  commands: ["tictactoe", "ttt", "xo"],
  description: "⭕ Start a TicTacToe game - Classic 3x3 grid battle vs human or bot!",
  adminOnly: false,
  groupOnly: false,

  async execute(sock, sessionId, args, m) {
    try {
      // Register the game if not already registered
      if (!gameManager.gameTypes.has("tictactoe")) {
        gameManager.registerGame("tictactoe", TicTacToeGame)
      }

      // Check if user wants to start the game
      if (args.length === 0) {
        const gameInfo = `⭕ *TICTACTOE GAME* ❌

📖 *How to Play:*
• Classic 3x3 grid game for 2 players
• Take turns placing symbols on the grid
• First to get 3 in a row wins!
• Rows, columns, or diagonals count!

🎮 *Game Modes:*
• 👥 **Human vs Human** - Classic multiplayer
• 🤖 **Human vs Bot** - Challenge PaulBot AI
• 🎯 **Bot Difficulties:** Easy, Medium, Hard

🤖 *Bot AI Features:*
• 🟢 **Easy** - Random moves, beginner friendly
• 🟡 **Medium** - Smart moves, blocks & attacks
• 🔴 **Hard** - Perfect play using minimax algorithm

📋 *Grid Layout:*
\`\`\`
 1 | 2 | 3 
-----------
 4 | 5 | 6 
-----------
 7 | 8 | 9 
\`\`\`

📝 *Commands During Game:*
• Type \`join\` to play as ⭕ (human vs human)
• Type \`1-9\` to place your symbol
• Host can end game with \`endgame\`

⚙️ *Start Options:*
• \`${m.prefix}tictactoe start\` - Human vs Human
• \`${m.prefix}tictactoe bot\` - vs Bot (Medium)
• \`${m.prefix}tictactoe bot easy\` - vs Easy Bot
• \`${m.prefix}tictactoe bot medium\` - vs Medium Bot
• \`${m.prefix}tictactoe bot hard\` - vs Hard Bot

Ready for a strategic battle? 🧠⚔️

━━━━━━━━━━━━━━━━━━━━
🤖 *PaulBot Gaming System*`

        await sock.sendMessage(m.chat, { text: gameInfo }, { quoted: m })
        return { success: true }
      }

      // Parse command arguments
      const command = args[0].toLowerCase()
      const options = {}

      // Handle bot mode
      if (command === 'bot') {
        options.vsBot = true
        options.botDifficulty = 'medium' // default
        
        // Check for difficulty specification
        if (args.length > 1) {
          const difficulty = args[1].toLowerCase()
          if (['easy', 'medium', 'hard'].includes(difficulty)) {
            options.botDifficulty = difficulty
          }
        }
      } else if (command !== 'start') {
        await sock.sendMessage(m.chat, {
          text: `❌ Invalid option! Available options:\n👥 start - Human vs Human\n🤖 bot [easy|medium|hard] - vs Bot\n\nExamples:\n• \`${m.prefix}tictactoe start\`\n• \`${m.prefix}tictactoe bot\`\n• \`${m.prefix}tictactoe bot hard\``
        }, { quoted: m })
        return { success: false }
      }

      // Start the game
      const result = await gameManager.startGame(
        sock, 
        m.chat, 
        "tictactoe", 
        m.sender, 
        options
      )

      if (result.success) {
        console.log(`[TicTacToe] Game started by ${m.sender} in ${m.chat} (${options.vsBot ? 'vs Bot' : 'vs Human'})`)
      } else {
        await sock.sendMessage(m.chat, { 
          text: result.message 
        }, { quoted: m })
      }

      return result

    } catch (error) {
      console.error("[TicTacToe] Error:", error)
      await sock.sendMessage(m.chat, {
        text: "❌ Error starting TicTacToe game. Please try again."
      }, { quoted: m })
      return { success: false, error: error.message }
    }
  },
}