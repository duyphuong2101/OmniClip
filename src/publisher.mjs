import { config } from './core/config.mjs';
import { logger } from './core/logger.mjs';
import { storage } from './core/storage.mjs';
import { motionStudio } from './core/motion-studio.mjs';
import { youtube } from './platforms/youtube.mjs';
import { tiktok } from './platforms/tiktok.mjs';
import { facebook } from './platforms/facebook.mjs';
import { instagram } from './platforms/instagram.mjs';

const PLATFORMS = {
  youtube,
  tiktok,
  facebook,
  instagram
};

export const publisher = {
  getPlatforms() {
    return PLATFORMS;
  },

  getPlatform(id) {
    return PLATFORMS[id.toLowerCase()];
  },

  /**
   * Test connections to all configured platforms
   */
  async testAll() {
    const results = {};
    for (const [id, plat] of Object.entries(PLATFORMS)) {
      if (!plat.isConfigured()) {
        results[id] = { ok: false, status: 'Not Configured', reason: 'Missing credentials in .env' };
      } else {
        try {
          const test = await plat.testConnection();
          results[id] = { ...test, status: test.ok ? 'Connected' : 'Error' };
        } catch (err) {
          results[id] = { ok: false, status: 'Error', error: err.message };
        }
      }
    }
    return results;
  },

  /**
   * Publish a specific Motion Studio job to one or more platforms
   */
  async publishJob(project, jobId, targetPlatforms = null, customPayload = {}) {
    const job = motionStudio.getJob(project, jobId);
    if (!job.isReady) {
      throw new Error(`Job ${project}/${jobId} is not ready (Status: ${job.status}). Ensure it is approved & rendered in Motion Studio.`);
    }

    const platformsToPublish = (targetPlatforms && targetPlatforms.length > 0)
      ? targetPlatforms.map(p => p.toLowerCase())
      : config.defaultPlatforms;

    const payload = {
      project,
      jobId,
      videoPath: job.videoPath,
      thumbnailPath: job.thumbnailPath,
      title: customPayload.title || job.title,
      description: customPayload.description || job.description,
      hashtags: customPayload.hashtags || job.hashtags,
      privacy: customPayload.privacy || config.defaultPrivacy,
      isVertical: job.isVertical,
      facebookPages: customPayload.facebookPages || []
    };

    logger.info(`Starting publication for ${project}/${jobId} to [${platformsToPublish.join(', ')}]...`);

    const results = {};

    for (const platId of platformsToPublish) {
      const platform = this.getPlatform(platId);
      if (!platform) {
        logger.warn(`Unknown platform: ${platId}`);
        results[platId] = { status: 'error', error: `Unknown platform: ${platId}` };
        continue;
      }

      if (!platform.isConfigured()) {
        logger.warn(`Platform ${platId} is not configured in .env. Skipping.`);
        results[platId] = { status: 'skipped', error: 'Missing credentials in .env' };
        storage.recordPublishResult(project, jobId, platId, { status: 'skipped', error: 'Missing credentials' });
        continue;
      }

      try {
        logger.info(`Publishing to ${platform.name}...`);
        const result = await platform.publish(payload);
        results[platId] = result;
        storage.recordPublishResult(project, jobId, platId, result);
        logger.success(`Published successfully to ${platform.name}! URL: ${result.url || result.postId}`);
      } catch (err) {
        logger.error(`Failed to publish to ${platform.name}: ${err.message}`);
        results[platId] = { status: 'error', error: err.message };
        storage.recordPublishResult(project, jobId, platId, { status: 'error', error: err.message });
      }
    }

    // Remove from ready queue if all attempted
    storage.dequeue(project, jobId);

    return {
      project,
      jobId,
      title: payload.title,
      results
    };
  }
};
