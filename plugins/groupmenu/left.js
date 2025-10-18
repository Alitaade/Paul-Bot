// ==================================================================================
// GOODBYE COMMAND
// ==================================================================================
import { createComponentLogger } from "../../utils/logger.js"
import { GroupQueries } from "../../database/query.js"
import AdminChecker from "../../whatsapp/utils/admin-checker.js"

const goodbyeLog = createComponentLogger("GOODBYE")

export default {
  name: "Goodbye Settings",
  description: "Enable/disable goodbye messages when members leave or are removed",
  commands: ["goodbye", "left"],
  category: "group",
  adminOnly: true,
  usage:
    "• `.goodbye on` - Enable goodbye messages\n• `.goodbye off` - Disable goodbye messages\n• `.goodbye status` - Check goodbye status",
  
  async execute(sock, sessionId, args, m) {
    goodbyeLog.info(`[GOODBYE] Command triggered by ${m.sender} with args: ${JSON.stringify(args)}`)
    
    try {
      if (!m.isGroup) {
        goodbyeLog.warn(`[GOODBYE] Command used outside group by ${m.sender}`)
        await sock.sendMessage(m.chat, { text: "❌ This command can only be used in groups!" }, { quoted: m })
        return
      }
      
      goodbyeLog.info(`[GOODBYE] Processing in group: ${m.chat}`)
      
      const adminChecker = new AdminChecker()
      const isUserAdmin = await adminChecker.isGroupAdmin(sock, m.chat, m.sender)
      
      goodbyeLog.info(`[GOODBYE] Admin check result for ${m.sender}: ${isUserAdmin}`)
      
      if (!isUserAdmin) {
        await sock.sendMessage(m.chat, { text: "❌ Sorry, this command is only for admins ❌" }, { quoted: m })
        return
      }
      
      const action = args[0]?.toLowerCase()
      goodbyeLog.info(`[GOODBYE] Action: ${action}`)
      
      switch (action) {
        case "on":
          goodbyeLog.info(`[GOODBYE] Enabling goodbye for group: ${m.chat}`)
          await GroupQueries.setAntiCommand(m.chat, "goodbye", true)
          await sock.sendMessage(
            m.chat,
            {
              text: "👋💙 *Goodbye messages enabled!*\n\nMembers who leave will receive farewell messages.",
            },
            { quoted: m },
          )
          goodbyeLog.info(`[GOODBYE] Successfully enabled goodbye for group: ${m.chat}`)
          break
          
        case "off":
          goodbyeLog.info(`[GOODBYE] Disabling goodbye for group: ${m.chat}`)
          await GroupQueries.setAntiCommand(m.chat, "goodbye", false)
          await sock.sendMessage(
            m.chat,
            {
              text: "👋 Goodbye messages disabled.",
            },
            { quoted: m },
          )
          goodbyeLog.info(`[GOODBYE] Successfully disabled goodbye for group: ${m.chat}`)
          break
          
        case "status":
          goodbyeLog.info(`[GOODBYE] Checking status for group: ${m.chat}`)
          const goodbyeStatus = await GroupQueries.isAntiCommandEnabled(m.chat, "goodbye")
          goodbyeLog.info(`[GOODBYE] Status result: ${goodbyeStatus}`)
          await sock.sendMessage(
            m.chat,
            {
              text: `👋 Goodbye Status\n\nStatus: ${goodbyeStatus ? "✅ Enabled" : "❌ Disabled"}`,
            },
            { quoted: m },
          )
          break
          
        default:
          goodbyeLog.info(`[GOODBYE] Showing usage (no valid action provided)`)
          await sock.sendMessage(
            m.chat,
            {
              text: "• `.goodbye on` - Enable goodbye messages\n• `.goodbye off` - Disable goodbye messages\n• `.goodbye status` - Check goodbye status",
            },
            { quoted: m },
          )
      }
    } catch (error) {
      goodbyeLog.error("Error in goodbye command:", error)
      goodbyeLog.error("Error stack:", error.stack)
      await sock.sendMessage(m.chat, { text: "❌ Error managing goodbye settings" }, { quoted: m })
    }
  },
}