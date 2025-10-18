import { mediaConverter } from "../../lib/converters/media-converter.js"

export default {
  name: "toaudio",
  aliases: ["toaud", "tomp3"],
  category: "convertmenu",
  description: "Convert video to audio format",
  usage: "toaudio (reply to video)",
  cooldown: 10,
  permissions: ["user"],

  async execute(sock, m, { quoted }) {
    if (!quoted || (!quoted.video && !quoted.audio)) {
      return m.reply("❌ Please reply to a video or audio file!")
    }

    try {
      m.reply("⏳ Converting to audio, please wait...")

      // Download the media
      const mediaBuffer = await quoted.download()

      // Convert to audio
      const audioBuffer = await mediaConverter.toAudio(mediaBuffer, "mp3")

      // Send as audio
      await m.reply({
        audio: audioBuffer,
        mimetype: "audio/mpeg",
        fileName: `converted_audio_${Date.now()}.mp3`,
      })
    } catch (error) {
      console.log("[v0] Error in toaudio command:", error)
      m.reply("❌ Failed to convert to audio! Please try with a different file.")
    }
  },
}
