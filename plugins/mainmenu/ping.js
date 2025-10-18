export default {
  name: "status",
  commands: ["status", "ping", "botinfo"],
  description: "Display bot status, uptime, and system information",
  adminOnly: false,
 category: "both",
  async execute(sock, sessionId, args, m) {
    try {
      // Get system information
      const uptime = process.uptime()
      const memUsage = process.memoryUsage()
      const startTime = Date.now()

      // Calculate response time
      const tempMsg = await sock.sendMessage(m.chat, { text: "📊 Calculating..." }, {quoted: m})
      const responseTime = Date.now() - startTime

      // Format memory usage
      const memUsed = (memUsage.heapUsed / 1024 / 1024).toFixed(2)
      const memTotal = (memUsage.heapTotal / 1024 / 1024).toFixed(2)

      // Format uptime
      const uptimeString = this.formatUptime(uptime)

      // Get plugin stats
      const { default: pluginLoader } = await import("../../utils/plugin-loader.js")
      const stats = pluginLoader.getPluginStats()

      const statusText =
        `┌─❖\n` +
        `│ Bot Status Information\n` +
        `└┬❖\n` +
        `┌┤ 📊 System Stats\n` +
        `│└────────┈⳹\n` +
        `│⚡ Response Time: ${responseTime}ms\n` +
        `│⏱ Uptime: ${uptimeString}\n` +
        `│💾 Memory: ${memUsed}MB / ${memTotal}MB\n` +
        `│🔧 Node.js: ${process.version}\n` +
        `│└────────┈⳹\n\n` +
        `┌┤ 🤖 Bot Stats\n` +
        `│└────────┈⳹\n` +
        `│📦 Total Plugins: ${stats.totalPlugins}\n` +
        `│📝 Total Commands: ${stats.totalCommands}\n` +
        `│🛡 Anti-Plugins: ${stats.totalAntiPlugins}\n` +
        `│🔄 Auto-Reload: ${stats.autoReloadEnabled ? "ON" : "OFF"}\n` +
        `│👁 Watchers: ${stats.watchersActive}\n` +
        `│└────────┈⳹\n\n` +
        `© paulbot`

      // Edit the temporary message
      await sock.sendMessage(m.chat, {
        text: statusText,
        edit: tempMsg.key,
      }, {quoted: m} )

      return { success: true }
    } catch (error) {
      console.error("[Status] Error:", error)
      await sock.sendMessage(m.chat, { text: "❌ Error getting bot status. Please try again." })
      return { success: false, error: error.message }
    }
  },

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
    if (minutes > 0) return `${minutes}m ${secs}s`
    return `${secs}s`
  },
}
