import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { generateWAMessageFromContent, proto, prepareWAMessageMedia } from '@whiskeysockets/baileys';

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

      // Import menu system
      let menuSystem;
      try {
        const menuModule = await import("../../utils/menu-system.js");
        menuSystem = menuModule.default;
      } catch (err) {
        console.error("[Menu] Failed to import menu system:", err);
        throw new Error("Menu system not available");
      }
      
      // Get user info
      const userInfo = {
        name: m.pushName || m.sender?.split('@')[0] || "User",
        id: m.sender,
      };
      
      // Get menu folders
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
      captionText += `🎯 Select a menu category below:\n`;
      captionText += `📊 Total Categories: ${folders.length + 1}\n`;
      
      // Priority order for menus
      const priorityMenus = [
        'mainmenu', 'groupmenu', 'downloadmenu', 'gamemenu', 
        'aimenu', 'ownermenu', 'convertmenu', 'bugmenu'
      ];
      
      // Sort folders by priority
      const sortedFolders = folders.sort((a, b) => {
        const aIndex = priorityMenus.indexOf(a.name.toLowerCase());
        const bIndex = priorityMenus.indexOf(b.name.toLowerCase());
        if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      });

      // Try to get image (profile picture or local file)
      let imageBuffer = null;
      try {
        // Try to get profile picture with proper error handling
        const ppUrl = await sock.profilePictureUrl(m.sender, "image").catch(() => null);
        
        if (ppUrl) {
          console.log("[Menu] Profile picture URL found:", ppUrl);
          const response = await fetch(ppUrl);
          if (response.ok) {
            imageBuffer = Buffer.from(await response.arrayBuffer());
            console.log("[Menu] Using user profile picture");
          }
        }
      } catch (err) {
        console.log("[Menu] Profile picture fetch error:", err.message);
      }
      
      // Fallback to local image if profile picture not available
      if (!imageBuffer) {
        console.log("[Menu] Trying local image");
        
        const possiblePaths = [
          path.resolve(process.cwd(), "Defaults", "images", "menu.jpg"),
          path.resolve(process.cwd(), "defaults", "images", "menu.jpg"), 
          path.resolve(process.cwd(), "assets", "images", "menu.jpg")
        ];
        
        for (const imagePath of possiblePaths) {
          if (fs.existsSync(imagePath)) {
            imageBuffer = fs.readFileSync(imagePath);
            console.log(`[Menu] Using local image: ${imagePath}`);
            break;
          }
        }
      }

      // Build menu sections
      const menuSections = [{
        title: "Menu Categories",
        highlight_label: "Popular",
        rows: []
      }];

      // Add allmenu first
      menuSections[0].rows.push({
        header: "📶 All Commands",
        title: "All Menu",
        description: "View all available commands",
        id: ".allmenu"
      });

      // Add each menu category
      for (const folder of sortedFolders) {
        const emoji = menuSystem.getMenuEmoji(folder.name);
        menuSections[0].rows.push({
          header: emoji,
          title: folder.displayName,
          description: `View ${folder.displayName.toLowerCase()} commands`,
          id: `.${folder.name.toLowerCase()}`
        });
      }

      // Prepare header with image if available
      let headerConfig = {
        title: "🤖 PAUL BOT MENU",
        subtitle: timeGreeting,
        hasMediaAttachment: false
      };

      if (imageBuffer) {
        try {
          // Use prepareWAMessageMedia to properly prepare the image
          const mediaMessage = await prepareWAMessageMedia(
            { image: imageBuffer },
            { upload: sock.waUploadToServer }
          );
          
          headerConfig = {
            title: "🤖 PAUL BOT MENU",
            subtitle: timeGreeting,
            hasMediaAttachment: true,
            imageMessage: mediaMessage.imageMessage
          };
          console.log("[Menu] Image header prepared successfully");
        } catch (imgErr) {
          console.error("[Menu] Failed to prepare image header:", imgErr.message);
          // Continue without image
        }
      }

      // Create interactive message
      const msg = generateWAMessageFromContent(m.chat, {
        viewOnceMessage: {
          message: {
            messageContextInfo: {
              deviceListMetadata: {},
              deviceListMetadataVersion: 2
            },
            interactiveMessage: proto.Message.InteractiveMessage.create({
              contextInfo: {
                quotedMessage: m.message,
                participant: m.sender,
                remoteJid: m.chat,
                stanzaId: m.key.id
              },
              body: proto.Message.InteractiveMessage.Body.create({
                text: captionText
              }),
              footer: proto.Message.InteractiveMessage.Footer.create({
                text: "© PAUL BOT - Select a category"
              }),
              header: proto.Message.InteractiveMessage.Header.create(headerConfig),
              nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                buttons: [
                  {
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                      title: "📋 Select Menu",
                      sections: menuSections
                    })
                  },
                  {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                      display_text: "📶 All Commands",
                      id: ".allmenu"
                    })
                  },
                  {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                      display_text: "ℹ️ Bot Info",
                      id: ".botinfo"
                    })
                  },
                  {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                      display_text: "💬 Support Group",
                      url: "https://chat.whatsapp.com/YOUR_GROUP_LINK",
                      merchant_url: "https://chat.whatsapp.com/YOUR_GROUP_LINK"
                    })
                  }
                ]
              })
            })
          }
        }
      }, {});

      // Send the message
      await sock.relayMessage(msg.key.remoteJid, msg.message, {
        messageId: msg.key.id
      });

      console.log("[Menu] Interactive menu sent successfully!");
      return { success: true };
      
    } catch (error) {
      console.error("[Menu] Critical Error:", error);
      
      // Fallback to text-only menu
      try {
        let fallbackText = `❌ Interactive menu failed, here's text version:\n\n`;
        
        const menuModule = await import("../../utils/menu-system.js");
        const menuSystem = menuModule.default;
        const folders = await menuSystem.scanMenuFolders();
        
        fallbackText += `🎯 *PAUL BOT MENU*\n\n`;
        fallbackText += `📶 *.allmenu* - View all commands\n\n`;
        
        for (const folder of folders) {
          const emoji = menuSystem.getMenuEmoji(folder.name);
          fallbackText += `${emoji} *.${folder.name.toLowerCase()}*\n`;
        }
        
        await sock.sendMessage(m.chat, { 
          text: fallbackText
        }, { quoted: m });
      } catch (finalError) {
        console.error("[Menu] Even fallback failed:", finalError);
        await sock.sendMessage(m.chat, { 
          text: `❌ Menu Error: ${error.message}\n\nType *.allmenu* for text-only menu.` 
        }, { quoted: m });
      }
      
      return { success: false, error: error.message };
    }
  },
};