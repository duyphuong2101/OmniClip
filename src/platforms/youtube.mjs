import fs from 'node:fs';
import { config } from '../core/config.mjs';
import { logger } from '../core/logger.mjs';
import { contentOptimizer } from '../core/content-optimizer.mjs';

/**
 * YouTube Shorts Publisher using YouTube Data API v3 Resumable Upload protocol
 */
export const youtube = {
  name: 'YouTube Shorts',
  id: 'youtube',

  isConfigured() {
    return Boolean(config.youtube.refreshToken && config.youtube.clientId && config.youtube.clientSecret);
  },

  /**
   * Refresh Google OAuth2 access token
   */
  async getAccessToken() {
    if (!this.isConfigured()) {
      throw new Error('YouTube credentials missing. Please set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in .env');
    }

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const params = new URLSearchParams({
      client_id: config.youtube.clientId,
      client_secret: config.youtube.clientSecret,
      refresh_token: config.youtube.refreshToken,
      grant_type: 'refresh_token'
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Failed to refresh YouTube access token: ${res.status} - ${errBody}`);
    }

    const data = await res.json();
    return data.access_token;
  },

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      const token = await this.getAccessToken();
      const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      const data = await res.json();
      const title = data.items?.[0]?.snippet?.title || 'Unknown Channel';
      return { ok: true, channel: title };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * Upload video to YouTube Shorts
   */
  async publish(payload) {
    const { videoPath, title, description, hashtags = [], thumbnailPath, privacy = config.defaultPrivacy } = payload;

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found at: ${videoPath}`);
    }

    const accessToken = await this.getAccessToken();
    const stats = fs.statSync(videoPath);
    const fileSize = stats.size;

    logger.platform('youtube', `Preparing upload: ${title} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);

    const isVertical = payload.isVertical !== false;
    const finalHashtags = contentOptimizer.getPlatformHashtags('youtube', hashtags, isVertical);

    // Ensure title has #Shorts if vertical and not already present
    let finalTitle = title.trim();
    if (isVertical && !finalTitle.includes('#Shorts')) {
      const truncated = contentOptimizer.truncateWords(finalTitle, 88);
      finalTitle = `${truncated} #Shorts`;
    }

    const fullDescription = contentOptimizer.buildCaption({
      title,
      description,
      hashtags: finalHashtags,
      platform: 'youtube'
    });

    const metadata = {
      snippet: {
        title: finalTitle.slice(0, 100),
        description: fullDescription.slice(0, 5000),
        tags: finalHashtags.map(h => h.replace('#', '')),
        categoryId: config.youtube.category || '22'
      },
      status: {
        privacyStatus: privacy,
        selfDeclaredMadeForKids: config.youtube.madeForKids
      }
    };

    // Step 1: Initiate resumable upload session
    const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': fileSize.toString(),
        'X-Upload-Content-Type': 'video/mp4'
      },
      body: JSON.stringify(metadata)
    });

    if (!initRes.ok) {
      const errBody = await initRes.text();
      throw new Error(`YouTube init upload failed: ${initRes.status} - ${errBody}`);
    }

    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      throw new Error('YouTube did not return a resumable upload location header.');
    }

    logger.platform('youtube', `Uploading video stream to YouTube...`);

    // Step 2: Upload binary video
    const videoBuffer = fs.readFileSync(videoPath);
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize.toString()
      },
      body: videoBuffer
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      throw new Error(`YouTube video upload failed: ${uploadRes.status} - ${errBody}`);
    }

    const uploadData = await uploadRes.json();
    const videoId = uploadData.id;
    const postUrl = `https://youtube.com/shorts/${videoId}`;

    logger.platform('youtube', `Video successfully uploaded! ID: ${videoId}`);

    // Optional Step 3: Set custom thumbnail if available
    if (thumbnailPath && fs.existsSync(thumbnailPath)) {
      try {
        const thumbBuffer = fs.readFileSync(thumbnailPath);
        await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'image/jpeg',
            'Content-Length': thumbBuffer.length.toString()
          },
          body: thumbBuffer
        });
        logger.platform('youtube', `Custom thumbnail uploaded for ${videoId}`);
      } catch (thumbErr) {
        logger.warn(`Could not upload custom thumbnail to YouTube: ${thumbErr.message}`);
      }
    }

    return {
      status: 'success',
      platform: 'youtube',
      postId: videoId,
      url: postUrl,
      title: finalTitle
    };
  }
};
