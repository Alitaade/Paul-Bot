import { youtubeDownloader } from "../../lib/downloaders/youtube.js"

export default {
  name: "ytmp4",
  aliases: ["ytvideo", "ytplayvideo", "youtubemp4"],
  category: "downloadmenu",
  description: "Download YouTube video as MP4",
  usage: "ytmp4 <youtube_url>",
  cooldown: 15,
  permissions: ["user"],

  async execute(sock, m, { args, isLimit, setLimit }) {
    if (!isLimit) {
      return m.reply("❌ You have reached your daily limit!")
    }

    if (!args.length) {
      return m.reply(`❌ Please provide a YouTube URL!\n\nExample: .ytmp4 https://youtube.com/watch?v=...`)
    }

    const url = args[0]

    if (!url.includes("youtu")) {
      return m.reply("❌ Invalid YouTube URL!")
    }

    try {
      m.reply("⏳ Downloading video, please wait...")

      const result = await youtubeDownloader.downloadVideo(url)

      const caption =
        `📍 *Title:* ${result.title}\n` +
        `🚀 *Channel:* ${result.channel}\n` +
        `⏱️ *Duration:* ${Math.floor(result.duration / 60)}:${(result.duration % 60).toString().padStart(2, "0")}\n` +
        `📅 *Upload Date:* ${result.uploadDate}\n` +
        `🎬 *Quality:* ${result.quality}`

      await m.reply({
        video: { url: result.downloadUrl },
        caption: caption,
      })

      setLimit(m)
    } catch (error) {
      console.log("[v0] Error in ytmp4 command:", error)
      m.reply("❌ Failed to download video! Please try again or check if the URL is valid.")
    }
  },
}
