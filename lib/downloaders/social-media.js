// First install the package: npm install jer-api

import { 
  igdl, 
  tiktok, 
  fbdl, 
  ytdl, 
  pindl, 
  capcut, 
  soundcloud, 
  likee
  // Removed igstalk from main imports - will import separately if available
} from "jer-api"

// Try to import igstalk separately with error handling
let igstalk;
try {
  const igstalkModule = await import('jer-api');
  igstalk = igstalkModule.igstalk;
} catch (error) {
  console.warn('igstalk not available in this version of jer-api');
}

export class SocialMediaDownloader {
  constructor() {
    // No initialization needed for jer-api
  }

  /**
   * Download Instagram content
   */
  async downloadInstagram(url) {
    try {
      const result = await igdl(url)
      
      if (!result || result.status !== 200) {
        throw new Error("Failed to fetch Instagram content")
      }

      const data = result.data
      return {
        type: data.type || 'post',
        media: data.url ? [{
          url: data.url,
          type: data.type || 'image',
          quality: 'hd'
        }] : (data.urls || []).map(item => ({
          url: typeof item === 'string' ? item : item.url,
          type: item.type || 'image',
          quality: item.quality || 'hd'
        })),
        caption: data.caption || data.title,
        username: data.username || data.author
      }
    } catch (error) {
      throw new Error(`Instagram download failed: ${error.message}`)
    }
  }

  /**
   * Download TikTok content
   */
  async downloadTikTok(url) {
    try {
      const result = await tiktok(url)
      
      if (!result || result.status !== 200) {
        throw new Error("Failed to fetch TikTok content")
      }

      const data = result.data
      return {
        title: data.title || data.caption,
        author: data.author || data.username,
        duration: data.duration,
        videoUrl: data.video || data.video_hd || data.video_sd,
        audioUrl: data.audio || data.music,
        thumbnail: data.thumbnail || data.cover,
        stats: {
          views: data.play_count || data.views,
          likes: data.digg_count || data.likes,
          comments: data.comment_count || data.comments,
          shares: data.share_count || data.shares
        }
      }
    } catch (error) {
      throw new Error(`TikTok download failed: ${error.message}`)
    }
  }

  /**
   * Download Facebook content
   */
  async downloadFacebook(url) {
    try {
      const result = await fbdl(url)
      
      if (!result || result.status !== 200) {
        throw new Error("Failed to fetch Facebook content")
      }

      const data = result.data
      return {
        title: data.title,
        videoUrl: data.video_hd || data.video_sd || data.url,
        thumbnail: data.thumbnail,
        duration: data.duration,
        quality: data.video_hd ? 'HD' : 'SD'
      }
    } catch (error) {
      throw new Error(`Facebook download failed: ${error.message}`)
    }
  }

  /**
   * Download Twitter/X content
   */
  async downloadTwitter(url) {
    try {
      // jer-api might not have Twitter support, try generic approach
      throw new Error("Twitter downloading not available in jer-api yet")
    } catch (error) {
      throw new Error(`Twitter download failed: ${error.message}`)
    }
  }

  /**
   * Download YouTube content
   */
  async downloadYouTube(url) {
    try {
      const result = await ytdl(url)
      
      if (!result || result.status !== 200) {
        throw new Error("Failed to fetch YouTube content")
      }

      const data = result.data
      return {
        title: data.title,
        author: data.channel || data.author,
        duration: data.duration,
        videoUrl: data.video?.url || data.url,
        audioUrl: data.audio?.url,
        thumbnail: data.thumbnail,
        description: data.description,
        stats: {
          views: data.views,
          likes: data.likes
        }
      }
    } catch (error) {
      throw new Error(`YouTube download failed: ${error.message}`)
    }
  }

  /**
   * Download Pinterest content
   */
  async downloadPinterest(url) {
    try {
      const result = await pindl(url)
      
      if (!result || result.status !== 200) {
        throw new Error("Failed to fetch Pinterest content")
      }

      const data = result.data
      return {
        title: data.title,
        imageUrl: data.image || data.url,
        thumbnail: data.thumbnail,
        description: data.description
      }
    } catch (error) {
      throw new Error(`Pinterest download failed: ${error.message}`)
    }
  }

  /**
   * Download CapCut content
   */
  async downloadCapCut(url) {
    try {
      const result = await capcut(url)
      
      if (!result || result.status !== 200) {
        throw new Error("Failed to fetch CapCut content")
      }

      const data = result.data
      return {
        title: data.title,
        videoUrl: data.video || data.url,
        thumbnail: data.thumbnail,
        duration: data.duration,
        author: data.author
      }
    } catch (error) {
      throw new Error(`CapCut download failed: ${error.message}`)
    }
  }

  /**
   * Download SoundCloud content
   */
  async downloadSoundCloud(url) {
    try {
      const result = await soundcloud(url)
      
      if (!result || result.status !== 200) {
        throw new Error("Failed to fetch SoundCloud content")
      }

      const data = result.data
      return {
        title: data.title,
        audioUrl: data.audio || data.url,
        thumbnail: data.thumbnail,
        duration: data.duration,
        author: data.artist || data.author
      }
    } catch (error) {
      throw new Error(`SoundCloud download failed: ${error.message}`)
    }
  }

  /**
   * Download Likee content
   */
  async downloadLikee(url) {
    try {
      const result = await likee(url)
      
      if (!result || result.status !== 200) {
        throw new Error("Failed to fetch Likee content")
      }

      const data = result.data
      return {
        title: data.title,
        videoUrl: data.video || data.url,
        thumbnail: data.thumbnail,
        author: data.author,
        duration: data.duration
      }
    } catch (error) {
      throw new Error(`Likee download failed: ${error.message}`)
    }
  }

  /**
   * Instagram stalk/profile info
   */
  async getInstagramProfile(username) {
    try {
      if (!igstalk) {
        throw new Error("igstalk function not available in current jer-api version")
      }

      const result = await igstalk(username)
      
      if (!result || result.status !== 200) {
        throw new Error("Failed to fetch Instagram profile")
      }

      return result.data
    } catch (error) {
      throw new Error(`Instagram profile fetch failed: ${error.message}`)
    }
  }

  /**
   * Check if Instagram stalking is available
   */
  isInstagramStalkAvailable() {
    return !!igstalk
  }

  /**
   * Auto-detect platform and download
   */
  async downloadAuto(url) {
    try {
      // Detect platform based on URL
      if (url.includes('instagram.com')) {
        return await this.downloadInstagram(url)
      } else if (url.includes('tiktok.com') || url.includes('vm.tiktok.com')) {
        return await this.downloadTikTok(url)
      } else if (url.includes('facebook.com') || url.includes('fb.watch')) {
        return await this.downloadFacebook(url)
      } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return await this.downloadYouTube(url)
      } else if (url.includes('pinterest.com') || url.includes('pin.it')) {
        return await this.downloadPinterest(url)
      } else if (url.includes('capcut.com')) {
        return await this.downloadCapCut(url)
      } else if (url.includes('soundcloud.com')) {
        return await this.downloadSoundCloud(url)
      } else if (url.includes('likee.')) {
        return await this.downloadLikee(url)
      } else {
        throw new Error('Unsupported platform. Supported: Instagram, TikTok, Facebook, YouTube, Pinterest, CapCut, SoundCloud, Likee')
      }
    } catch (error) {
      throw new Error(`Auto download failed: ${error.message}`)
    }
  }
}

export const socialMediaDownloader = new SocialMediaDownloader()