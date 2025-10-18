import axios from "axios"
import ytdl from "ytdl-core"

export class YouTubeDownloader {
  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY || ""
  }

  /**
   * Download YouTube audio (MP3)
   */
  async downloadAudio(url) {
    try {
      // Validate YouTube URL
      if (!ytdl.validateURL(url)) {
        throw new Error("Invalid YouTube URL")
      }

      const info = await ytdl.getInfo(url)
      const audioFormats = ytdl.filterFormats(info.formats, "audioonly")

      if (audioFormats.length === 0) {
        throw new Error("No audio formats available")
      }

      const bestAudio = audioFormats[0]

      return {
        title: info.videoDetails.title,
        channel: info.videoDetails.author.name,
        duration: info.videoDetails.lengthSeconds,
        thumbnail: info.videoDetails.thumbnails[0]?.url,
        downloadUrl: bestAudio.url,
        quality: bestAudio.audioBitrate,
      }
    } catch (error) {
      throw new Error(`YouTube audio download failed: ${error.message}`)
    }
  }

  /**
   * Download YouTube video (MP4)
   */
  async downloadVideo(url, quality = "720p") {
    try {
      if (!ytdl.validateURL(url)) {
        throw new Error("Invalid YouTube URL")
      }

      const info = await ytdl.getInfo(url)
      const videoFormats = ytdl.filterFormats(info.formats, "videoandaudio")

      let selectedFormat = videoFormats.find((f) => f.qualityLabel === quality)
      if (!selectedFormat) {
        selectedFormat = videoFormats[0] // Fallback to first available
      }

      return {
        title: info.videoDetails.title,
        channel: info.videoDetails.author.name,
        duration: info.videoDetails.lengthSeconds,
        description: info.videoDetails.description,
        uploadDate: info.videoDetails.uploadDate,
        thumbnail: info.videoDetails.thumbnails[0]?.url,
        downloadUrl: selectedFormat.url,
        quality: selectedFormat.qualityLabel,
      }
    } catch (error) {
      throw new Error(`YouTube video download failed: ${error.message}`)
    }
  }

  /**
   * Search YouTube videos
   */
  async search(query, maxResults = 10) {
    try {
      const response = await axios.get("https://www.googleapis.com/youtube/v3/search", {
        params: {
          key: this.apiKey,
          q: query,
          part: "snippet",
          type: "video",
          maxResults,
        },
      })

      return response.data.items.map((item) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.medium.url,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }))
    } catch (error) {
      throw new Error(`YouTube search failed: ${error.message}`)
    }
  }
}

export const youtubeDownloader = new YouTubeDownloader()
