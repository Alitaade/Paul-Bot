import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  name: "Menu",
  description: "Show main bot menu with all available categories",
  commands: ["menu", "start", "bot"],
  adminOnly: false,
  category: "both",
  usage: "• .menu - Show complete menu with all categories",
  async execute(sock, sessionId, args, m) {
    try {
      // Check connection state first
      if (!sock || !sock.user) {
        console.log("[Menu] Socket not ready, retrying...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!sock || !sock.user) {
          throw new Error("Bot connection not ready");
        }
      }

      // Import menu system with error handling
      let menuSystem;
      try {
        const menuModule = await import("../../utils/menu-system.js");
        menuSystem = menuModule.default;
      } catch (err) {
        console.error("[Menu] Failed to import menu system:", err);
        throw new Error("Menu system not available");
      }
      
      // Get user info safely
      const userInfo = {
        name: m.pushName || m.sender?.split('@')[0] || "User",
        id: m.sender,
      };
      
      // Get menu folders with timeout
      const folders = await Promise.race([
        menuSystem.scanMenuFolders(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
      ]);
      
      const currentTime = new Date();
      const timeGreeting = menuSystem.getTimeGreeting();
      
      // Build caption text
      let captionText = `┌─❖\n`;
      captionText += `│ PAUL BOT\n`;
      captionText += `└┬❖\n`;
      captionText += `┌┤ ${timeGreeting}\n`;
      captionText += `│└────────┈⳹\n`;
      captionText += `│👤 ᴜsᴇʀ: ${userInfo.name}\n`;
      captionText += `│📅 ᴅᴀᴛᴇ: ${currentTime.toLocaleDateString()}\n`;
      captionText += `│⏰ ᴛɪᴍᴇ: ${currentTime.toLocaleTimeString()}\n`;
      captionText += `│🛠 ᴠᴇʀsɪᴏɴ: 1.0.0\n`;
      captionText += `└─────────────┈⳹\n\n`;
      captionText += `🎯 Select a menu category:\n`;
      captionText += `📊 Total Categories: ${folders.length + 1}\n\n`;
      
      // Priority order for menus
      const priorityMenus = [
        'mainmenu', 'groupmenu', 'downloadmenu', 'gamemenu', 
        'aimenu', 'ownermenu', 'convertmenu', 'bugmenu'
      ];
      
      // Sort folders by priority, then alphabetically
      const sortedFolders = folders.sort((a, b) => {
        const aIndex = priorityMenus.indexOf(a.name.toLowerCase());
        const bIndex = priorityMenus.indexOf(b.name.toLowerCase());
        if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });
      
      // Add allmenu option first
      captionText += `📶 *.allmenu* - View all commands\n\n`;
      
      // Add menu categories as text
      captionText += `╭━━━━━━━━━━━━━━━╮\n`;
      captionText += `│   MENU CATEGORIES   │\n`;
      captionText += `╰━━━━━━━━━━━━━━━╯\n\n`;
      
      for (const folder of sortedFolders) {
        const emoji = menuSystem.getMenuEmoji(folder.name);
        const commandName = `.${folder.name.toLowerCase()}`;
        captionText += `${emoji} *${commandName}*\n`;
        captionText += `   └ ${folder.displayName}\n\n`;
      }
      
      captionText += `\n━━━━━━━━━━━━━━━━━━\n`;
      captionText += `Type any command to view that menu\n`;
      captionText += `© PAUL BOT`;

      // Try to get user's profile picture with timeout
      let imageUrl = null;
      try {
        imageUrl = await Promise.race([
          sock.profilePictureUrl(m.sender, "image"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Profile pic timeout")), 3000))
        ]);
        console.log("[Menu] Using user profile picture");
      } catch (profileErr) {
        console.log("[Menu] Profile picture not available, trying local image");
        
        // Try local file approach
        const possiblePaths = [
          path.resolve(process.cwd(), "Defaults", "images", "menu.jpg"),
          path.resolve(process.cwd(), "defaults", "images", "menu.jpg"), 
          path.resolve(process.cwd(), "assets", "images", "menu.jpg")
        ];
        
        for (const imagePath of possiblePaths) {
          if (fs.existsSync(imagePath)) {
            console.log(`[Menu] Using local image: ${imagePath}`);
            // Send with local image
            await sock.sendMessage(m.chat, {
              image: fs.readFileSync(imagePath),
              caption: captionText
            }, { quoted: m });
            return { success: true };
          }
        }
      }
      
      // Send message with image or text only
      if (imageUrl) {
        await sock.sendMessage(m.chat, {
          image: { url: imageUrl },
          caption: captionText
        }, { quoted: m });
      } else {
        // Send text-only message
        await sock.sendMessage(m.chat, {
          text: captionText
        }, { quoted: m });
      }
      
      console.log("[Menu] Message sent successfully!");
      return { success: true };
      
    } catch (error) {
      console.error("[Menu] Critical Error:", error);
      
      // Last resort: send basic error message
      try {
        await sock.sendMessage(m.chat, { 
          text: `❌ Menu Error: ${error.message}\n\nTry again in a few seconds or type *.allmenu* for text-only menu.` 
        }, { quoted: m });
      } catch (finalError) {
        console.error("[Menu] Even error message failed:", finalError);
      }
      
      return { success: false, error: error.message };
    }
  },
};