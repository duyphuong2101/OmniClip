import fs from 'node:fs';
import path from 'node:path';
import { config } from './core/config.mjs';
import { logger } from './core/logger.mjs';
import { storage } from './core/storage.mjs';
import { motionStudio } from './core/motion-studio.mjs';
import { publisher } from './publisher.mjs';

export class Watcher {
  constructor(options = {}) {
    this.pollIntervalMs = (options.pollIntervalSeconds || config.pollIntervalSeconds || 5) * 1000;
    this.autoPublish = options.autoPublish !== undefined ? options.autoPublish : config.autoPublish;
    this.isRunning = false;
    this.timer = null;
    this.seenJobs = new Set();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info(`Starting Motion Studio Watcher...`);
    logger.info(`Target directory: ${config.motionStudioDir}`);
    logger.info(`Auto-publish mode: ${this.autoPublish ? 'ENABLED (Will post immediately on render done)' : 'DISABLED (Queuing for review)'}`);

    if (!motionStudio.isAvailable()) {
      logger.warn(`Motion Studio directory not found at: ${config.motionStudioDir}. Retrying in background...`);
    }

    // Initial check
    this.scan();

    // Start polling loop
    this.timer = setInterval(() => this.scan(), this.pollIntervalMs);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info(`Watcher stopped.`);
  }

  async scan() {
    try {
      if (!motionStudio.isAvailable()) return;

      const jobs = motionStudio.listJobs();

      for (const job of jobs) {
        // We only care about jobs with status 'done' and ready video
        if (!job.isReady) continue;

        const jobKey = `${job.project}:${job.jobId}`;

        // Check if any platform has already succeeded
        const history = storage.getPublished()[jobKey]?.platforms || {};
        const anySuccess = Object.values(history).some(p => p.status === 'success');

        if (anySuccess) {
          this.seenJobs.add(jobKey);
          continue;
        }

        if (!this.seenJobs.has(jobKey)) {
          this.seenJobs.add(jobKey);
          logger.success(`Detected newly completed video: ${job.project} / ${job.jobId} - "${job.title}"`);

          if (this.autoPublish) {
            logger.info(`Auto-publishing triggered for ${jobKey}...`);
            try {
              await publisher.publishJob(job.project, job.jobId);
            } catch (pubErr) {
              logger.error(`Error during auto-publishing ${jobKey}: ${pubErr.message}`);
            }
          } else {
            logger.info(`Staging ${jobKey} into ready-to-publish queue.`);
            storage.enqueue({
              project: job.project,
              jobId: job.jobId,
              title: job.title,
              videoPath: job.videoPath,
              duration: job.duration,
              status: 'ready_to_publish'
            });
          }
        }
      }
    } catch (err) {
      logger.error(`Watcher scan error: ${err.message}`);
    }
  }
}

export const globalWatcher = new Watcher();
