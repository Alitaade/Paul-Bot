import ffmpeg from "fluent-ffmpeg"
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg"
import fs from "fs"
import path from "path"

export class MediaConverter {
  constructor() {
    this.tempDir = "./temp"
    this.ensureTempDir()

    // Configure ffmpeg binary path if available
    try {
      if (ffmpegPath) {
        ffmpeg.setFfmpegPath(ffmpegPath)
      }
    } catch (_) {
      // Ignore; rely on system ffmpeg if present
    }
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }
  }

  /**
   * Convert video to audio
   */
  async toAudio(inputBuffer, format = "mp3") {
    return new Promise((resolve, reject) => {
      const inputPath = path.join(this.tempDir, `input_${Date.now()}.mp4`)
      const outputPath = path.join(this.tempDir, `output_${Date.now()}.${format}`)

      fs.writeFileSync(inputPath, inputBuffer)

      ffmpeg(inputPath)
        .toFormat(format)
        .on("end", () => {
          const audioBuffer = fs.readFileSync(outputPath)
          fs.unlinkSync(inputPath)
          fs.unlinkSync(outputPath)
          resolve(audioBuffer)
        })
        .on("error", (err) => {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
          reject(err)
        })
        .save(outputPath)
    })
  }

  /**
   * Convert to voice note (PTT)
   */
  async toPTT(inputBuffer) {
    return new Promise((resolve, reject) => {
      const inputPath = path.join(this.tempDir, `input_${Date.now()}.mp4`)
      const outputPath = path.join(this.tempDir, `output_${Date.now()}.ogg`)

      fs.writeFileSync(inputPath, inputBuffer)

      ffmpeg(inputPath)
        .toFormat("ogg")
        .audioCodec("libopus")
        .on("end", () => {
          const audioBuffer = fs.readFileSync(outputPath)
          fs.unlinkSync(inputPath)
          fs.unlinkSync(outputPath)
          resolve(audioBuffer)
        })
        .on("error", (err) => {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
          reject(err)
        })
        .save(outputPath)
    })
  }

  /**
   * Convert to GIF
   */
  async toGif(inputBuffer) {
    return new Promise((resolve, reject) => {
      const inputPath = path.join(this.tempDir, `input_${Date.now()}.mp4`)
      const outputPath = path.join(this.tempDir, `output_${Date.now()}.gif`)

      fs.writeFileSync(inputPath, inputBuffer)

      ffmpeg(inputPath)
        .toFormat("gif")
        .size("320x240")
        .fps(15)
        .on("end", () => {
          const gifBuffer = fs.readFileSync(outputPath)
          fs.unlinkSync(inputPath)
          fs.unlinkSync(outputPath)
          resolve(gifBuffer)
        })
        .on("error", (err) => {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
          reject(err)
        })
        .save(outputPath)
    })
  }

  /**
   * Convert to image
   */
  async toImage(inputBuffer, format = "png") {
    return new Promise((resolve, reject) => {
      const inputPath = path.join(this.tempDir, `input_${Date.now()}.webp`)
      const outputPath = path.join(this.tempDir, `output_${Date.now()}.${format}`)

      fs.writeFileSync(inputPath, inputBuffer)

      ffmpeg(inputPath)
        .toFormat(format)
        .frames(1)
        .on("end", () => {
          const imageBuffer = fs.readFileSync(outputPath)
          fs.unlinkSync(inputPath)
          fs.unlinkSync(outputPath)
          resolve(imageBuffer)
        })
        .on("error", (err) => {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath)
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
          reject(err)
        })
        .save(outputPath)
    })
  }
}

export const mediaConverter = new MediaConverter()
