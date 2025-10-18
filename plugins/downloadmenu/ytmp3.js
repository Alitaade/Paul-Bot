import { youtubeDownloader } from "../../lib/downloaders/youtube.js"

export default {
  name: "ytmp3",
  aliases: ["ytaudio", "ytplayaudio", "youtubemp3"],
  category: "downloadmenu",
  description: "Download YouTube video as MP3 audio",
  usage: "ytmp3 <youtube_url>",
  cooldown: 10,
  permissions: ["user"],

  async execute(sock, m, { args, isLimit, setLimit }) {
    if (!isLimit) {
      return m.reply("❌ You have reached your daily limit!")
    }

    if (!args.length) {
      return m.reply(`❌ Please provide a YouTube URL!\n\nExample: .ytmp3 https://youtube.com/watch?v=...`)
    }

    const url = args[0]

    if (!url.includes("youtu")) {
      return m.reply("❌ Invalid YouTube URL!")
    }

    try {
      m.reply("⏳ Downloading audio, please wait...")

      const result = await youtubeDownloader.downloadAudio(url)

      const audioMessage = {
        audio: { url: result.downloadUrl },
        mimetype: "audio/mpeg",
        contextInfo: {
          externalAdReply: {
            title: result.title,
            body: `${result.channel} • ${Math.floor(result.duration / 60)}:${(result.duration % 60).toString().padStart(2, "0")}`,
            previewType: "PHOTO",
            thumbnailUrl: result.thumbnail,
            mediaType: 1,
            renderLargerThumbnail: true,
            sourceUrl: url,
          },
        },
      }

      await m.reply(audioMessage)
      setLimit(m)
    } catch (error) {
      console.log("[v0] Error in ytmp3 command:", error)
      m.reply("❌ Failed to download audio! Please try again or check if the URL is valid.")
    }
  },
}
