import { socialMediaDownloader } from "../../lib/downloaders/social-media.js"

export default {
  name: "ig",
  aliases: ["instagram", "instadl", "igdown", "igdl"],
  category: "downloadmenu",
  description: "Download Instagram posts (photos/videos)",
  usage: "ig <instagram_url>",
  permissions: ["user"],

  async execute(sock, m, { args }) {

    if (!args.length) {
      return m.reply(`❌ Please provide an Instagram URL!\n\nExample: .ig https://instagram.com/p/...`)
    }

    const url = args[0]

    if (!url.includes("instagram.com")) {
      return m.reply("❌ Invalid Instagram URL!")
    }

    try {
      m.reply("⏳ Downloading Instagram content, please wait...")

      const result = await socialMediaDownloader.downloadInstagram(url)

      if (!result.media || result.media.length === 0) {
        return m.reply("❌ No media found or post is private!")
      }

      // Send each media item
      for (let i = 0; i < result.media.length; i++) {
        const media = result.media[i]
        const caption =
          i === 0
            ? `📸 *Instagram Post*\n👤 *User:* @${result.username}\n📝 *Caption:* ${result.caption || "No caption"}`
            : ""

        if (media.type === "video") {
          await sock.sendMessage(m.chat, {
            video: { url: media.url },
            caption: caption,
          }, {quoted: m})
        } else {
          await sock.sendMessage(m.chat, {
            image: { url: media.url },
            caption: caption,
          }, {quoted: m})
        }
      }

    } catch (error) {
      console.log("[v0] Error in ig command:", error)
      m.reply("❌ Failed to download Instagram content! The post might be private or unavailable.")
    }
  },
}
