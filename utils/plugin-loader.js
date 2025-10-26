// Optimized Plugin System - RAM Efficient Version
import fs from "fs/promises"
import fsr from "fs"
import path from "path"
import { fileURLToPath } from "url"
import chalk from "chalk"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Minimal logging - only essentials
const log = {
  info: (msg) => console.log(chalk.blue('[INFO]'), msg),
  warn: (msg) => console.log(chalk.yellow('[WARN]'), msg),
  error: (msg, err) => console.log(chalk.red('[ERROR]'), msg, err?.message || ''),
}

class PluginLoader {
  constructor() {
    this.plugins = new Map()
    this.commands = new Map()
    this.antiPlugins = new Map()
    this.watchers = new Map()
    this.reloadTimeouts = new Map()
    this.isInitialized = false
    this.pluginDir = path.join(__dirname, "..", "plugins")
    this.autoReloadEnabled = process.env.PLUGIN_AUTO_RELOAD !== "false"
    this.reloadDebounceMs = 1000
    
    // Temporary contact store - gets cleared after each use to prevent RAM buildup
    this.tempContactStore = new Map()
    
    log.info(`Plugin loader initialized (Auto-reload: ${this.autoReloadEnabled ? 'ON' : 'OFF'})`)
  }

  validatePlugin(plugin) {
    return !!(
      plugin && 
      typeof plugin === "object" && 
      plugin.name && 
      typeof plugin.name === "string" && 
      typeof plugin.execute === "function"
    )
  }

  async loadPlugins() {
    try {
      await this.clearWatchers()
      await this.loadAllPlugins()
      
      if (this.autoReloadEnabled) {
        await this.setupFileWatchers()
      }

      this.isInitialized = true
      log.info(`Loaded ${this.plugins.size} plugins, ${this.commands.size} commands`)
      
      // Setup periodic cleanup of temp data (every 2 minutes)
      setInterval(() => this.cleanupTempData(), 120000)
      
      return Array.from(this.plugins.values())
    } catch (error) {
      log.error("Error loading plugins:", error)
      throw error
    }
  }

  async loadAllPlugins() {
    try {
      await this.loadPluginsFromDirectory(this.pluginDir)
      this.registerAntiPlugins()
    } catch (error) {
      log.error("Error loading all plugins:", error)
    }
  }

  registerAntiPlugins() {
    for (const [pluginId, plugin] of this.plugins.entries()) {
      if (plugin && typeof plugin.processMessage === "function") {
        this.antiPlugins.set(pluginId, plugin)
      }
    }
  }

  async loadPluginsFromDirectory(dirPath, category = "main") {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true })

      for (const item of items) {
        const itemPath = path.join(dirPath, item.name)

        if (item.isDirectory()) {
          // Use directory name as category (ownermenu, groupmenu, etc.)
          const subCategory = item.name.toLowerCase()
          await this.loadPluginsFromDirectory(itemPath, subCategory)
        } else if (item.name.endsWith(".js")) {
          await this.loadPlugin(dirPath, item.name, category)
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        log.error(`Error loading plugins from ${dirPath}:`, error)
      }
    }
  }

  async loadPlugin(pluginPath, filename, category) {
    try {
      const fullPath = path.join(pluginPath, filename)
      const pluginName = path.basename(filename, ".js")
      const moduleUrl = `file://${fullPath}?t=${Date.now()}`

      const pluginModule = await import(moduleUrl)
      const plugin = pluginModule.default || pluginModule

      if (!this.validatePlugin(plugin)) {
        log.warn(`Invalid plugin structure: ${filename}`)
        return
      }

      const pluginId = `${category}:${pluginName}`
      
      // Normalize commands efficiently
      const commands = new Set()
      
      // Add plugin commands
      if (Array.isArray(plugin.commands)) {
        plugin.commands.forEach(c => {
          if (typeof c === "string") {
            const normalized = c.toLowerCase().trim()
            if (normalized) commands.add(normalized)
          }
        })
      }
      
      // Add plugin aliases
      if (Array.isArray(plugin.aliases)) {
        plugin.aliases.forEach(a => {
          if (typeof a === "string") {
            const normalized = a.toLowerCase().trim()
            if (normalized) commands.add(normalized)
          }
        })
      }
      
      // Add plugin name as command if not already included
      if (typeof plugin.name === "string") {
        const normalized = plugin.name.toLowerCase().trim()
        if (normalized) commands.add(normalized)
      }
      
      // Add filename as command if not already included
      const normalizedFilename = pluginName.toLowerCase().trim()
      if (normalizedFilename) commands.add(normalizedFilename)
      
      const uniqueCommands = Array.from(commands)

      const pluginData = {
        ...plugin,
        id: pluginId,
        category,
        filename,
        fullPath,
        pluginPath,
        commands: uniqueCommands,
      }

      this.plugins.set(pluginId, pluginData)

      // Map commands to plugin
      uniqueCommands.forEach(command => {
        if (this.commands.has(command)) {
          log.warn(`Command '${command}' already exists, overriding with plugin '${pluginData.name}'`)
        }
        this.commands.set(command, pluginId)
      })

      // Register anti-plugin if applicable
      if (typeof plugin.processMessage === "function") {
        this.antiPlugins.set(pluginId, pluginData)
      }
    } catch (error) {
      log.error(`Error loading plugin ${filename}:`, error)
    }
  }

  async setupFileWatchers() {
    try {
      await this.setupDirectoryWatchersRecursively(this.pluginDir, "main")
    } catch (error) {
      log.error("Error setting up file watchers:", error)
    }
  }

  async setupDirectoryWatchersRecursively(dirPath, category) {
    try {
      await this.setupDirectoryWatcher(dirPath, category)

      const items = await fs.readdir(dirPath, { withFileTypes: true })
      for (const item of items) {
        if (item.isDirectory()) {
          const subDirPath = path.join(dirPath, item.name)
          const subCategory = item.name.toLowerCase()
          await this.setupDirectoryWatchersRecursively(subDirPath, subCategory)
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        log.error(`Error setting up watchers for ${dirPath}:`, error)
      }
    }
  }

  async setupDirectoryWatcher(dirPath, category) {
    try {
      const watcher = fsr.watch(dirPath, { persistent: false }, (eventType, filename) => {
        if (filename && filename.endsWith(".js")) {
          this.handleFileChange(dirPath, filename, category)
        }
      })
      this.watchers.set(dirPath, watcher)
    } catch (error) {
      log.error(`Error setting up watcher for ${dirPath}:`, error)
    }
  }

  async handleFileChange(dirPath, filename, category) {
    const key = path.join(dirPath, filename)
    const existing = this.reloadTimeouts.get(key)
    if (existing) clearTimeout(existing)

    const timeout = setTimeout(async () => {
      try {
        await this.loadPlugin(dirPath, filename, category)
      } catch (error) {
        log.error(`Failed to reload plugin ${filename}:`, error)
      } finally {
        this.reloadTimeouts.delete(key)
      }
    }, this.reloadDebounceMs)

    this.reloadTimeouts.set(key, timeout)
  }

  async clearWatchers() {
    this.watchers.forEach(watcher => {
      try { watcher.close?.() } catch (_) {}
    })
    this.watchers.clear()

    this.reloadTimeouts.forEach(timeout => {
      try { clearTimeout(timeout) } catch (_) {}
    })
    this.reloadTimeouts.clear()
  }

  // Temporary contact extraction - used once then discarded
  async extractPushName(sock, m) {
    try {
      let pushName = m.pushName || m.message?.pushName || m.key?.notify
      
      // Check temp store first (only valid for current execution)
      if (!pushName && this.tempContactStore.has(m.sender)) {
        const cached = this.tempContactStore.get(m.sender)
        if (cached.pushName && (Date.now() - cached.timestamp) < 30000) { // 30 second temp cache
          pushName = cached.pushName
        }
      }
      
      if (!pushName && sock.store?.contacts?.[m.sender]) {
        const contact = sock.store.contacts[m.sender]
        pushName = contact.notify || contact.name || contact.pushName
      }

      pushName = pushName || this.generateFallbackName(m.sender)

      // Store temporarily for this execution only
      this.tempContactStore.set(m.sender, {
        pushName: pushName,
        timestamp: Date.now()
      })

      return pushName
    } catch (error) {
      return this.generateFallbackName(m.sender)
    }
  }

  generateFallbackName(jid) {
    if (!jid) return "Unknown"
    const phoneNumber = jid.split('@')[0]
    return phoneNumber && phoneNumber.length > 4 ? `User ${phoneNumber.slice(-4)}` : "Unknown User"
  }

  // Clear temp store after each command execution to prevent RAM buildup
  clearTempData() {
    this.tempContactStore.clear()
  }

  // Periodic cleanup of temp data - removes old entries
  cleanupTempData() {
    const now = Date.now()
    const maxAge = 60000 // 1 minute max age for temp data
    
    for (const [jid, data] of this.tempContactStore.entries()) {
      if (now - data.timestamp > maxAge) {
        this.tempContactStore.delete(jid)
      }
    }
  }

  findCommand(commandName) {
    if (!commandName || typeof commandName !== 'string') return null
    const normalizedCommand = commandName.toLowerCase().trim()
    const pluginId = this.commands.get(normalizedCommand)
    const plugin = pluginId ? this.plugins.get(pluginId) : null
    
    if (!plugin) {
      log.warn(`Command '${commandName}' not found in ${this.commands.size} registered commands`)
    }
    
    return plugin
  }

  async executeCommand(sock, sessionId, commandName, args, m) {
    try {
      const plugin = this.findCommand(commandName)
      if (!plugin) {
        return { success: false, silent: true }
      }
      // Ensure pushName is available (temporary extraction)
      if (!m.pushName) {
        m.pushName = await this.extractPushName(sock, m)
      }
        
      // Check if sender is bot owner (no caching - direct check)
      const isCreator = this.checkIsBotOwner(sock, m.sender)
      
      // Enhance message object with ALL needed properties
      const enhancedM = {
        ...m,
        chat: m.chat || m.key?.remoteJid || m.from,
        sender: m.sender || m.key?.participant || m.from,
        isCreator,
        isGroup: m.isGroup || (m.chat && m.chat.endsWith('@g.us')),
        isAdmin: m.isAdmin || false,
        isBotAdmin: m.isBotAdmin || false,
        groupMetadata: m.groupMetadata || null,
        participants: m.participants || null,
        sessionContext: m.sessionContext || { telegram_id: "Unknown", session_id: sessionId },
        sessionId,
        reply: m.reply,
        prefix: m.prefix || "."
      }

      // GROUP ONLY LOGIC - Direct database check (no caching)
      if (enhancedM.isGroup) {
        try {
          const { GroupQueries } = await import("../database/query.js")
          const isGroupOnlyEnabled = await GroupQueries.isGroupOnlyEnabled(enhancedM.chat)
          
          if (!isGroupOnlyEnabled && !['grouponly', 'go'].includes(commandName.toLowerCase())) {
            
            // Direct admin check (no caching for real-time accuracy)
            let isAdmin = false
            try {
              const groupMetadata = await sock.groupMetadata(enhancedM.chat)
              const participants = groupMetadata.participants || []
              const senderJid = enhancedM.sender.split('@')[0].split(':')[0] + '@s.whatsapp.net'
              
              isAdmin = participants.some(p => {
                const participantJid = p.jid.split('@')[0] + '@s.whatsapp.net'
                return participantJid === senderJid && (p.admin === "admin" || p.admin === "superadmin")
              })
            } catch (adminError) {
              isAdmin = false
            }
            
            // Show enable message to admins and bot owner only
            if (isAdmin || enhancedM.isCreator) {
              const enableMessage = 
                "❌ *Group Commands Disabled*\n\n" +
                "Group commands are currently disabled in this group.\n\n" +
                `Use *${enhancedM.prefix}grouponly on* to enable group commands.`
              
              try {
                await sock.sendMessage(enhancedM.chat, {
                  text: enableMessage
                }, { quoted: m })
              } catch (error) {
                log.error("Failed to send grouponly enable message:", error)
              }
              
              // Clear temp data before returning
              this.clearTempData()
              return { success: false, message: "Group commands disabled" }
            }
            
            // Silent ignore for regular users
            this.clearTempData()
            return { success: false, silent: true }
          }
        } catch (error) {
          log.error("Error checking grouponly status:", error)
        }
      }

      // Check permissions BEFORE executing
      const permissionCheck = await this.checkPluginPermissions(sock, plugin, enhancedM)
      if (!permissionCheck.allowed) {
        log.warn(`Permission denied for command '${commandName}': ${permissionCheck.message}`)
        this.clearTempData()
        
        // Send permission error message
        try {
          await sock.sendMessage(enhancedM.chat, {
            text: permissionCheck.message
          }, { quoted: m })
        } catch (sendError) {
          log.error("Failed to send permission error:", sendError)
        }
        
        return { success: false, error: permissionCheck.message }
      }

      // Execute plugin
      const result = await this.executePluginWithFallback(sock, sessionId, args, enhancedM, plugin)
      
      // Clear temp data after execution to prevent RAM buildup
      this.clearTempData()
      
      return { success: true, result: result }
    } catch (error) {
      log.error(`Error executing command ${commandName}:`, error)
      this.clearTempData() // Clear even on error
      return { success: false, error: `Error executing command: ${error.message}` }
    }
  }

  async executePluginWithFallback(sock, sessionId, args, m, plugin) {
    try {
      // Set admin status if needed (direct check, no caching)
      if (m.isGroup && (!m.hasOwnProperty('isAdmin') || !m.hasOwnProperty('isBotAdmin'))) {
        try {
          const groupMetadata = await sock.groupMetadata(m.chat)
          const participants = groupMetadata.participants || []
          
const botJid = sock.user?.id?.split(':')[0].split('@')[0] + '@s.whatsapp.net'
const senderJid = m.sender.split('@')[0].split(':')[0] + '@s.whatsapp.net'
          
          m.isAdmin = participants.some(p => {
            const participantJid = p.jid.split('@')[0] + '@s.whatsapp.net'
            return participantJid === senderJid && (p.admin === "admin" || p.admin === "superadmin")
          })
          
          m.isBotAdmin = participants.some(p => {
            const participantJid = p.jid.split('@')[0] + '@s.whatsapp.net'
            return participantJid === botJid && (p.admin === "admin" || p.admin === "superadmin")
          })
        } catch (adminError) {
          m.isAdmin = false
          m.isBotAdmin = false
        }
      }

      // Execute plugin based on signature
      if (plugin.execute.length === 4) {
        return await plugin.execute(sock, sessionId, args, m)
      }
      
      if (plugin.execute.length === 3) {
        const context = {
          args: args || [],
          quoted: m.quoted || null,
          isAdmin: m.isAdmin || false,
          isBotAdmin: m.isBotAdmin || false,
          isCreator: m.isCreator || false,
          store: null
        }
        return await plugin.execute(sock, m, context)
      }

      return await plugin.execute(sock, sessionId, args, m)
    } catch (error) {
      log.error(`Plugin execution failed for ${plugin.name}:`, error)
      throw error
    }
  }

  async checkPluginPermissions(sock, plugin, m) {
    try {
      if (!plugin) {
        return { allowed: false, message: "❌ Plugin not found." }
      }

      const requiredPermission = this.determineRequiredPermission(plugin)
      // Owner-only commands
      if (requiredPermission === "owner" && !m.isCreator) {
        return { allowed: false, message: "❌ This command is restricted to the bot owner only." }
      }

          // VIP-only commands - NEW
    if (requiredPermission === "vip") {
      const { VIPQueries } = await import("../database/query.js")
      const VIPHelper = (await import("../whatsapp/utils/vip-helper.js")).default
      
      const userTelegramId = VIPHelper.fromSessionId(m.sessionId)
      if (!userTelegramId) {
        return { allowed: false, message: "❌ Could not verify VIP status." }
      }

      const vipStatus = await VIPQueries.isVIP(userTelegramId)
      if (!vipStatus.isVIP && !m.isCreator) {
        return { 
          allowed: false, 
          message: "❌ This command requires VIP access.\n\nContact the bot owner for VIP privileges." 
        }
      }
    }

      // Admin permissions in groups
      if ((requiredPermission === "admin" || requiredPermission === "group_admin") && m.isGroup) {
        let isAdmin = m.isAdmin
        
        // If admin status not set, check directly
        if (typeof isAdmin === 'undefined') {
          try {
            const groupMetadata = await sock.groupMetadata(m.chat)
            const participants = groupMetadata.participants || []
            const senderJid = m.sender.split('@')[0].split(':')[0] + '@s.whatsapp.net'
            
            isAdmin = participants.some(p => {
              const participantJid = p.jid.split('@')[0].split(':')[0] + '@s.whatsapp.net'
              return participantJid === senderJid && (p.admin === "admin" || p.admin === "superadmin")
            })
          } catch (error) {
            isAdmin = false
          }
        }
        
        if (!isAdmin && !m.isCreator) {
          return { allowed: false, message: "❌ This command requires admin privileges." }
        }
      }

      // Check category restrictions
      const category = plugin.category?.toLowerCase() || ""
      
      if ((category === "group" || category === "groupmenu") && !m.isGroup) {
        return { allowed: false, message: "❌ This command can only be used in groups." }
      }

      if ((category === "private" || category === "privatemenu") && m.isGroup) {
        return { allowed: false, message: "❌ This command can only be used in private chat." }
      }

      // Owner menu commands should only work for owner
      if (category === "ownermenu" && !m.isCreator) {
        return { allowed: false, message: "❌ This command is restricted to the bot owner only." }
      }

      return { allowed: true }
    } catch (error) {
      log.error("Error checking permissions:", error)
      return { allowed: false, message: "❌ Permission check failed." }
    }
  }

checkIsBotOwner(sock, userJid) {
    try {
      if (!sock?.user?.id || !userJid) return false

      // Extract phone numbers for comparison - handle both formats
      const botNumber = sock.user.id.split(':')[0].split('@')[0]
      // Handle userJid format: "2347067023422:63@s.whatsapp.net" or "2347067023422@s.whatsapp.net"
      const userNumber = userJid.split('@')[0].split(':')[0]

      const isOwner = botNumber === userNumber
      return isOwner
    } catch (error) {
      log.error("Error in owner check:", error)
      return false
    }
  }
 
  determineRequiredPermission(plugin) {
    if (!plugin) return "user"

    // Check permissions array first
    if (plugin.permissions && Array.isArray(plugin.permissions) && plugin.permissions.length > 0) {
      const perms = plugin.permissions.map(p => String(p).toLowerCase())
      
      if (perms.includes("owner")) return "owner"
      if (perms.includes("admin") || perms.includes("system_admin")) return "admin"
      if (perms.includes("group_admin")) return "group_admin"
      if (perms.includes("vip")) return "vip"  // NEW VIP PERMISSION
    }

    // Legacy flags
    if (plugin.ownerOnly === true) return "owner"
    if (plugin.adminOnly === true) return "group_admin"
    if (plugin.vipOnly === true) return "vip"  // NEW VIP FLAG

    // Category-based permissions - This is key for your issue!
    const category = plugin.category?.toLowerCase() || ""
    
    // Owner menu plugins should require owner permission
    if (category === "ownermenu" || category.includes("owner")) {
      return "owner"
    }

      // VIP menu plugins require VIP permission - NEW
  if (category === "vipmenu" || category.includes("vip")) {
    return "vip"
  }

    if (category.includes("group") || category === "groupmenu") {
      return "group_admin"
    }

    // Check filename for owner-related commands
    if (plugin.filename?.toLowerCase().includes("owner")) {
      return "owner"
    }

      // Check filename for VIP commands - NEW
  if (plugin.filename?.toLowerCase().includes("vip")) {
    return "vip"
  }

    return "user"
  }

  async processAntiPlugins(sock, sessionId, m) {
    for (const plugin of this.antiPlugins.values()) {
      try {
        if (!sock || !sessionId || !m || !plugin) continue

        let enabled = true
        if (typeof plugin.isEnabled === "function") {
          enabled = await plugin.isEnabled(m.chat)
        }
        if (!enabled) continue

        let shouldProcess = true
        if (typeof plugin.shouldProcess === "function") {
          shouldProcess = await plugin.shouldProcess(m)
        }
        if (!shouldProcess) continue

        if (typeof plugin.processMessage === "function") {
          await plugin.processMessage(sock, sessionId, m)
        }
      } catch (pluginErr) {
        log.warn(`Anti-plugin error in ${plugin?.name || "unknown"}: ${pluginErr.message}`)
      }
    }
  }

  async shutdown() {
    await this.clearWatchers()
    this.clearTempData() // Clear any remaining temp data
  }

  // Utility methods - minimal implementations
  getAvailableCommands(category = null) {
    const commands = []
    const seenPlugins = new Set()

    for (const [command, pluginId] of this.commands.entries()) {
      const plugin = this.plugins.get(pluginId)
      if (seenPlugins.has(pluginId)) continue
      seenPlugins.add(pluginId)

      const pluginCategory = plugin.category.split("/")[0]
      if (!category || pluginCategory === category || plugin.category === "both") {
        commands.push({
          command: plugin.commands[0],
          plugin: plugin.name,
          description: plugin.description,
          category: plugin.category,
        })
      }
    }
    return commands
  }

  getPluginStats() {
    return {
      totalPlugins: this.plugins.size,
      totalCommands: this.commands.size,
      totalAntiPlugins: this.antiPlugins.size,
      isInitialized: this.isInitialized,
      autoReloadEnabled: this.autoReloadEnabled,
      watchersActive: this.watchers.size,
    }
  }

  listPlugins() {
    return Array.from(this.plugins.values())
      .map(plugin => ({
        id: plugin.id,
        name: plugin.name,
        category: plugin.category,
        commands: plugin.commands || [],
        hasAntiFeatures: typeof plugin.processMessage === "function",
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
}

// Create singleton instance
const pluginLoader = new PluginLoader()

// Graceful shutdown
const shutdown = async () => {
  await pluginLoader.shutdown()
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

export default pluginLoader