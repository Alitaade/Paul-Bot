// File: commands/download/tiktok.js
import { socialMediaDownloader } from "../../lib/downloaders/social-media.js"

export default {
  name: "tiktok",
  aliases: ["tt", "tiktokdl", "ttdl"],
  category: "downloadmenu",
  description: "Download TikTok videos",
  usage: "tiktok <tiktok_url>",
  permissions: ["user"],
  async execute(sock, m, { args }) {
    if (!args.length) {
      return m.reply(`❌ Please provide a TikTok URL!\n\nExample: .tiktok https://vt.tiktok.com/...`)
    }

    const url = args[0]
    if (!url.includes("tiktok.com")) {
      return m.reply("❌ Invalid TikTok URL!")
    }

    try {
      m.reply("⏳ Downloading TikTok video, please wait...")
      const result = await socialMediaDownloader.downloadTikTok(url)

      const caption = `🎵 TikTok Video\n👤 Author: @${result.author || 'Unknown'}\n📝 Title: ${result.title || "No title"}\n⏱️ Duration: ${result.duration || 'Unknown'}`

      await sock.sendMessage(m.chat, {
        video: { url: result.videoUrl },
        caption: caption,
        mimetype: 'video/mp4'
      }, { quoted: m })

      // Send audio if available
      if (result.audioUrl) {
        await sock.sendMessage(m.chat, {
          audio: { url: result.audioUrl },
          mimetype: 'audio/mp4'
        }, { quoted: m })
      }

    } catch (error) {
      console.log("[v0] Error in tiktok command:", error)
      m.reply("❌ Failed to download TikTok video! The video might be private or unavailable.")
    }
  },
}