import fs from 'node:fs';
import { config } from '../core/config.mjs';
import { logger } from '../core/logger.mjs';
import { contentOptimizer } from '../core/content-optimizer.mjs';

/**
 * Instagram Reels Publisher using Instagram Graph API
 * Supports Resumable Upload protocol & URL-based upload
 */
export const instagram = {
  name: 'Instagram Reels',
  id: 'instagram',

  isConfigured() {
    return Boolean(config.instagram.accountId && config.instagram.accessToken);
  },

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      if (!this.isConfigured()) {
        return { ok: false, error: 'Instagram credentials missing (INSTAGRAM_ACCOUNT_ID or INSTAGRAM_ACCESS_TOKEN).' };
      }
      const res = await fetch(`https://graph.facebook.com/v19.0/${config.instagram.accountId}?fields=username,name,profile_picture_url&access_token=${config.instagram.accessToken}`);
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      const data = await res.json();
      return { ok: true, username: data.username || data.name };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * Publish video as an Instagram Reel
   */
  async publish(payload) {
    const { videoPath, title, description, hashtags = [] } = payload;

    if (!this.isConfigured()) {
      throw new Error('Instagram credentials missing. Please set INSTAGRAM_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN in .env');
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found at: ${videoPath}`);
    }

    const accountId = config.instagram.accountId;
    const token = config.instagram.accessToken;
    const stats = fs.statSync(videoPath);
    const fileSize = stats.size;

    logger.platform('instagram', `Creating Instagram Reel container for: ${title} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);

    const finalHashtags = contentOptimizer.getPlatformHashtags('instagram', hashtags, payload.isVertical !== false);
    const caption = contentOptimizer.buildCaption({
      title,
      description,
      hashtags: finalHashtags,
      platform: 'instagram'
    });

    let containerId = null;

    // Check if we use public video URL or Resumable Upload
    if (config.instagram.publicHost && payload.publicVideoUrl) {
      // Method A: Hosted video URL
      logger.platform('instagram', `Using hosted URL: ${payload.publicVideoUrl}`);
      const params = new URLSearchParams({
        media_type: 'REELS',
        video_url: payload.publicVideoUrl,
        caption,
        share_to_feed: String(config.instagram.shareToFeed),
        access_token: token
      });
      const res = await fetch(`https://graph.facebook.com/v19.0/${accountId}/media?${params.toString()}`, { method: 'POST' });
      if (!res.ok) {
        throw new Error(`Instagram URL container create failed: ${res.status} - ${await res.text()}`);
      }
      const data = await res.json();
      containerId = data.id;
    } else {
      // Method B: Resumable Upload Session
      logger.platform('instagram', `Initializing Resumable Upload session...`);
      const initParams = new URLSearchParams({
        media_type: 'REELS',
        upload_type: 'resumable',
        caption,
        share_to_feed: String(config.instagram.shareToFeed),
        access_token: token
      });

      const initRes = await fetch(`https://graph.facebook.com/v19.0/${accountId}/media?${initParams.toString()}`, { method: 'POST' });
      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`Instagram resumable init failed: ${initRes.status} - ${errText}`);
      }

      const initData = await initRes.json();
      containerId = initData.id;
      const uploadUri = initData.uri;

      if (!uploadUri) {
        throw new Error('Instagram did not return resumable upload uri.');
      }

      logger.platform('instagram', `Uploading binary video stream to Instagram container ${containerId}...`);

      const videoBuffer = fs.readFileSync(videoPath);
      const uploadRes = await fetch(uploadUri, {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${token}`,
          offset: '0',
          file_size: fileSize.toString(),
          'Content-Type': 'application/octet-stream'
        },
        body: videoBuffer
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Instagram binary upload failed: ${uploadRes.status} - ${errText}`);
      }
    }

    logger.platform('instagram', `Container created: ${containerId}. Waiting for video processing...`);

    // Step 2: Poll container status until FINISHED
    let isReady = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(`https://graph.facebook.com/v19.0/${containerId}?fields=status_code,status&access_token=${token}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const code = statusData.status_code;
        if (code === 'FINISHED') {
          isReady = true;
          break;
        } else if (code === 'ERROR' || code === 'EXPIRED') {
          throw new Error(`Instagram video processing error: ${statusData.status || code}`);
        }
      }
    }

    if (!isReady) {
      throw new Error('Instagram container processing timed out after 60s.');
    }

    logger.platform('instagram', `Processing finished. Publishing Reel...`);

    // Step 3: Publish container
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: token
    });

    const publishRes = await fetch(`https://graph.facebook.com/v19.0/${accountId}/media_publish?${publishParams.toString()}`, {
      method: 'POST'
    });

    if (!publishRes.ok) {
      const pubErr = await publishRes.text();
      throw new Error(`Instagram media publish failed: ${publishRes.status} - ${pubErr}`);
    }

    const pubData = await publishRes.json();
    const mediaId = pubData.id;
    const postUrl = `https://www.instagram.com/reel/${mediaId}`;

    logger.platform('instagram', `Instagram Reel published successfully: ${postUrl}`);

    return {
      status: 'success',
      platform: 'instagram',
      postId: mediaId,
      url: postUrl,
      title
    };
  }
};
