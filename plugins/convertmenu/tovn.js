import { mediaConverter } from "../../lib/converters/media-converter.js"

export default {
  name: "tovn",
  aliases: ["toptt", "tovoice"],
  category: "convertmenu",
  description: "Convert video/audio to voice note (PTT)",
  usage: "tovn (reply to video/audio)",
  cooldown: 10,
  permissions: ["user"],

  async execute(sock, m, { quoted }) {
    if (!quoted || (!quoted.video && !quoted.audio)) {
      return m.reply("❌ Please reply to a video or audio file!")
    }

    try {
      m.reply("⏳ Converting to voice note, please wait...")

      // Download the media
      const mediaBuffer = await quoted.download()

      // Convert to PTT
      const pttBuffer = await mediaConverter.toPTT(mediaBuffer)

      // Send as voice note
      await m.reply({
        audio: pttBuffer,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
      })
    } catch (error) {
      console.log("[v0] Error in tovn command:", error)
      m.reply("❌ Failed to convert to voice note! Please try with a different file.")
    }
  },
}
