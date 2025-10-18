import { socialMediaDownloader } from "../../lib/downloaders/social-media.js"

export default {
  name: "download",
  aliases: ["download", "socialdl", "mediadl"],
  category: "downloadmenu", 
  description: "Download content from Instagram, TikTok, Facebook, Twitter/X, YouTube",
  usage: "dl <social_media_url>",
  permissions: ["user"],
  async execute(sock, m, { args }) {
    if (!args.length) {
      return m.reply(`❌ Please provide a social media URL!\n\nSupported platforms:\n• Instagram\n• TikTok\n• Facebook\n• YouTube\n• Pinterest\n• CapCut\n• SoundCloud\n• Likee\n\nExample: .dl https://instagram.com/p/...`)
    }

    const url = args[0]
    
    // Basic URL validation
    const supportedDomains = ['instagram.com', 'tiktok.com', 'vm.tiktok.com', 'facebook.com', 'fb.watch', 'youtube.com', 'youtu.be', 'pinterest.com', 'pin.it', 'capcut.com', 'soundcloud.com', 'likee.']
    const isSupported = supportedDomains.some(domain => url.includes(domain))
    
    if (!isSupported) {
      return m.reply("❌ Unsupported platform! Please use a URL from:\n• Instagram\n• TikTok\n• Facebook\n• YouTube\n• Pinterest\n• CapCut\n• SoundCloud\n• Likee")
    }

    try {
      m.reply("⏳ Downloading content, please wait...")
      const result = await socialMediaDownloader.downloadAuto(url)

      // Handle different response formats based on platform
      if (result.media && result.media.length > 0) {
        // Instagram-style response with multiple media
        for (let i = 0; i < result.media.length; i++) {
          const media = result.media[i]
          const caption = i === 0 ? this.formatCaption(result, url) : ""

          if (media.type === "video" || media.type === "mp4") {
            await sock.sendMessage(m.chat, {
              video: { url: media.url },
              caption: caption,
              mimetype: 'video/mp4'
            }, { quoted: m })
          } else {
            await sock.sendMessage(m.chat, {
              image: { url: media.url },
              caption: caption,
            }, { quoted: m })
          }
        }
      } else if (result.videoUrl) {
        // Video content (TikTok, Facebook, YouTube)
        const caption = this.formatCaption(result, url)
        
        await sock.sendMessage(m.chat, {
          video: { url: result.videoUrl },
          caption: caption,
          mimetype: 'video/mp4'
        }, { quoted: m })

        // Send audio separately if available (YouTube, SoundCloud)
        if (result.audioUrl && (url.includes('youtube') || url.includes('soundcloud'))) {
          await sock.sendMessage(m.chat, {
            audio: { url: result.audioUrl },
            mimetype: 'audio/mp4'
          }, { quoted: m })
        }
      } else if (result.imageUrl) {
        // Image content (Pinterest)
        const caption = this.formatCaption(result, url)
        
        await sock.sendMessage(m.chat, {
          image: { url: result.imageUrl },
          caption: caption,
        }, { quoted: m })
      } else if (result.audioUrl && url.includes('soundcloud')) {
        // Audio content (SoundCloud)
        const caption = this.formatCaption(result, url)
        
        await sock.sendMessage(m.chat, {
          audio: { url: result.audioUrl },
          caption: caption,
          mimetype: 'audio/mp4'
        }, { quoted: m })
      } else if (result.text && url.includes('twitter')) {
        // Twitter text content
        const caption = this.formatCaption(result, url)
        m.reply(caption)
      } else {
        m.reply("❌ No downloadable media found in this post!")
      }

    } catch (error) {
      console.log("[v0] Error in dl command:", error)
      
      let errorMessage = "❌ Failed to download content! "
      
      if (url.includes('instagram')) {
        errorMessage += "The post might be private or unavailable."
      } else if (url.includes('tiktok')) {
        errorMessage += "The video might be private or region-blocked."
      } else if (url.includes('facebook')) {
        errorMessage += "The post might be private or require login."
      } else if (url.includes('pinterest')) {
        errorMessage += "The pin might be deleted or unavailable."
      } else if (url.includes('capcut')) {
        errorMessage += "The template might be private or unavailable."
      } else if (url.includes('soundcloud')) {
        errorMessage += "The track might be private or region-blocked."
      } else if (url.includes('likee')) {
        errorMessage += "The video might be private or unavailable."
      }
      
      m.reply(errorMessage)
    }
  },

  formatCaption(result, url) {
    let caption = ""
    
    if (url.includes('instagram')) {
      caption = `📸 Instagram Post\n👤 User: @${result.username || 'Unknown'}\n📝 Caption: ${result.caption || "No caption"}`
    } else if (url.includes('tiktok')) {
      caption = `🎵 TikTok Video\n👤 Author: @${result.author || 'Unknown'}\n📝 Title: ${result.title || "No title"}\n⏱️ Duration: ${result.duration || 'Unknown'}`
    } else if (url.includes('facebook')) {
      caption = `📘 Facebook Video\n📝 Title: ${result.title || "No title"}\n⏱️ Duration: ${result.duration || 'Unknown'}`
    } else if (url.includes('pinterest')) {
      caption = `📌 Pinterest Pin\n📝 Title: ${result.title || "No title"}\n📄 Description: ${result.description || "No description"}`
    } else if (url.includes('capcut')) {
      caption = `✂️ CapCut Template\n📝 Title: ${result.title || "No title"}\n👤 Author: ${result.author || 'Unknown'}\n⏱️ Duration: ${result.duration || 'Unknown'}`
    } else if (url.includes('soundcloud')) {
      caption = `🎵 SoundCloud Track\n📝 Title: ${result.title || "No title"}\n👤 Artist: ${result.author || 'Unknown'}\n⏱️ Duration: ${result.duration || 'Unknown'}`
    } else if (url.includes('likee')) {
      caption = `💫 Likee Video\n📝 Title: ${result.title || "No title"}\n👤 Author: ${result.author || 'Unknown'}\n⏱️ Duration: ${result.duration || 'Unknown'}`
    }
    
    return caption
  }
}