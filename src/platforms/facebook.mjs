import fs from 'node:fs';
import { config } from '../core/config.mjs';
import { logger } from '../core/logger.mjs';
import { storage } from '../core/storage.mjs';
import { contentOptimizer } from '../core/content-optimizer.mjs';

/**
 * Facebook Reels Publisher using Meta Graph API (Video Reels Resumable Upload)
 */
export const facebook = {
  name: 'Facebook Reels',
  id: 'facebook',

  isConfigured() {
    const pages = storage.getFacebookPages();
    if (pages.length > 0) return true;
    return Boolean(config.facebook.pageId && config.facebook.pageAccessToken);
  },

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      if (!this.isConfigured()) {
        return { ok: false, error: 'Facebook credentials missing (FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN).' };
      }
      const pages = storage.getFacebookPages();
      const targetPage = pages[0] || { id: config.facebook.pageId, token: config.facebook.pageAccessToken };
      const res = await fetch(`https://graph.facebook.com/v19.0/${targetPage.id}?fields=name,id,category&access_token=${targetPage.token}`);
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      const data = await res.json();
      const pageNames = pages.map(p => p.name || p.id).join(', ');
      return { ok: true, page: pageNames || data.name || data.id, count: pages.length };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  },

  /**
   * Upload video binary to a specific Facebook Page
   */
  async uploadToSinglePage(pageId, pageToken, pageName, payload) {
    const { videoPath, title, description, hashtags = [] } = payload;
    const stats = fs.statSync(videoPath);
    const fileSize = stats.size;

    logger.platform('facebook', `Uploading Reel to [${pageName || pageId}]: ${title} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
    const finalHashtags = contentOptimizer.getPlatformHashtags('facebook', hashtags, payload.isVertical !== false);
    const fullDescription = contentOptimizer.buildCaption({
      title,
      description,
      hashtags: finalHashtags,
      platform: 'facebook'
    });

    // Step 1: Initialize
    const startUrl = `https://graph.facebook.com/v19.0/${pageId}/video_reels?upload_phase=start&access_token=${pageToken}`;
    const startRes = await fetch(startUrl, { method: 'POST' });
    if (!startRes.ok) {
      const errText = await startRes.text();
      throw new Error(`Init failed for ${pageName || pageId}: ${startRes.status} - ${errText}`);
    }
    const startData = await startRes.json();
    const videoId = startData.video_id;
    const uploadUrl = startData.upload_url;
    if (!videoId || !uploadUrl) {
      throw new Error(`Facebook did not return video_id for ${pageName || pageId}`);
    }

    // Step 2: Binary transfer
    const videoBuffer = fs.readFileSync(videoPath);
    const transferRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${pageToken}`,
        offset: '0',
        file_size: fileSize.toString(),
        'Content-Type': 'application/octet-stream'
      },
      body: videoBuffer
    });
    if (!transferRes.ok) {
      const errBody = await transferRes.text();
      throw new Error(`Binary transfer failed for ${pageName || pageId}: ${transferRes.status} - ${errBody}`);
    }

    // Step 3: Finish and Publish
    const finishParams = new URLSearchParams({
      upload_phase: 'finish',
      access_token: pageToken,
      video_id: videoId,
      video_state: 'PUBLISHED',
      description: fullDescription
    });
    const finishRes = await fetch(`https://graph.facebook.com/v19.0/${pageId}/video_reels?${finishParams.toString()}`, {
      method: 'POST'
    });
    if (!finishRes.ok) {
      const finishErr = await finishRes.text();
      throw new Error(`Finish failed for ${pageName || pageId}: ${finishRes.status} - ${finishErr}`);
    }

    const reelUrl = `https://www.facebook.com/reel/${videoId}`;
    logger.platform('facebook', `Reel published successfully on [${pageName || pageId}]: ${reelUrl}`);
    return {
      status: 'success',
      pageId,
      pageName,
      postId: videoId,
      url: reelUrl
    };
  },

  /**
   * Publish video as Facebook Reel(s) across selected or all connected pages
   */
  async publish(payload) {
    const { videoPath, title } = payload;
    if (!this.isConfigured()) {
      throw new Error('Facebook credentials missing.');
    }
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found at: ${videoPath}`);
    }

    const allPages = storage.getFacebookPages();
    let targetPages = [];

    if (Array.isArray(payload.facebookPages) && payload.facebookPages.length > 0) {
      targetPages = allPages.filter(p => payload.facebookPages.includes(p.id));
    }
    if (targetPages.length === 0) {
      targetPages = allPages.length > 0 ? allPages : [{ id: config.facebook.pageId, token: config.facebook.pageAccessToken, name: 'Default Page' }];
    }

    const results = [];
    for (const page of targetPages) {
      try {
        const res = await this.uploadToSinglePage(page.id, page.token, page.name, payload);
        results.push(res);
      } catch (err) {
        logger.error(`Error publishing to page ${page.name || page.id}: ${err.message}`);
        results.push({
          status: 'error',
          pageId: page.id,
          pageName: page.name,
          error: err.message
        });
      }
    }

    const firstSuccess = results.find(r => r.status === 'success');
    if (!firstSuccess) {
      throw new Error(`Failed to publish to Facebook: ${results.map(r => r.error).join('; ')}`);
    }

    return {
      status: 'success',
      platform: 'facebook',
      postId: firstSuccess.postId,
      url: firstSuccess.url,
      title,
      results
    };
  }
};
