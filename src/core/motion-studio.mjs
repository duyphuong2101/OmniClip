import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { storage } from './storage.mjs';
import { contentOptimizer } from './content-optimizer.mjs';

function readJsonSafe(file, fallback = null) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    // Ignore parse error
  }
  return fallback;
}

export const motionStudio = {
  getDir() {
    return config.motionStudioDir;
  },

  isAvailable() {
    return fs.existsSync(this.getDir());
  },

  /**
   * List all projects in Motion Studio
   */
  listProjects() {
    const profilesDir = path.join(this.getDir(), 'profiles');
    if (!fs.existsSync(profilesDir)) return [];
    return fs.readdirSync(profilesDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  },

  /**
   * Get full details of a specific job
   */
  getJob(project, jobId) {
    const jobOutDir = path.join(this.getDir(), 'out', project, jobId);
    const briefPath = path.join(this.getDir(), 'briefs', project, `${jobId}.json`);
    const statusPath = path.join(jobOutDir, 'status.json');
    const scriptPath = path.join(jobOutDir, 'script.json');

    const status = readJsonSafe(statusPath, { status: 'unknown' });
    const brief = readJsonSafe(briefPath, {});
    const script = readJsonSafe(scriptPath, { scenes: [] });

    // Look for video file: prefer 9:16 vertical render if exists (final_9x16.mp4), else final.mp4
    let videoFile = null;
    let videoPath = null;
    let isVertical = false;

    const verticalCandidate = path.join(jobOutDir, 'final_9x16.mp4');
    const defaultFinal = path.join(jobOutDir, 'final.mp4');

    if (fs.existsSync(verticalCandidate)) {
      videoFile = 'final_9x16.mp4';
      videoPath = verticalCandidate;
      isVertical = true;
    } else if (fs.existsSync(defaultFinal)) {
      videoFile = 'final.mp4';
      videoPath = defaultFinal;
      // Check outputs dimensions from status.json
      if (status.outputs?.width && status.outputs?.height) {
        isVertical = status.outputs.height > status.outputs.width;
      } else if (brief.format === '9:16') {
        isVertical = true;
      }
    }

    // Look for captions file
    const captionsPath = path.join(jobOutDir, 'captions.srt');
    const hasCaptions = fs.existsSync(captionsPath);

    // Look for thumbnail / still image
    let thumbnailPath = null;
    const stillsDir = path.join(jobOutDir, 'stills');
    if (fs.existsSync(stillsDir)) {
      const stills = fs.readdirSync(stillsDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
      if (stills.length > 0) {
        thumbnailPath = path.join(stillsDir, stills[0]);
      }
    }

    // Auto-generate optimized title, description and smart hashtags
    const title = contentOptimizer.optimizeTitle(brief.topic, brief, script);
    const description = contentOptimizer.buildCleanDescription(brief, script);
    const hashtags = contentOptimizer.generateSmartHashtags({
      topic: brief.topic,
      keyMessage: brief.keyMessage,
      project,
      isVertical,
      customTags: config.defaultHashtags
    });

    const jobKey = `${project}:${jobId}`;
    const publishedHistory = storage.getPublished()[jobKey]?.platforms || {};

    return {
      project,
      jobId,
      jobKey,
      status: status.status || 'unknown',
      isReady: status.status === 'done' && Boolean(videoPath),
      isVertical,
      duration: status.outputs?.duration || status.duration || 0,
      width: status.outputs?.width || 1080,
      height: status.outputs?.height || 1920,
      videoPath,
      videoFile,
      hasCaptions,
      captionsPath: hasCaptions ? captionsPath : null,
      thumbnailPath,
      brief,
      script,
      title,
      description,
      hashtags,
      publishedHistory,
      updatedAt: status.updatedAt || new Date().toISOString()
    };
  },

  /**
   * Scan all jobs in out/ directory
   */
  listJobs() {
    const outDir = path.join(this.getDir(), 'out');
    if (!fs.existsSync(outDir)) return [];

    const jobs = [];
    const projects = fs.readdirSync(outDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const project of projects) {
      const projOutDir = path.join(outDir, project);
      const jobDirs = fs.readdirSync(projOutDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const jobId of jobDirs) {
        try {
          const job = this.getJob(project, jobId);
          jobs.push(job);
        } catch (err) {
          // Skip invalid folders
        }
      }
    }

    // Sort: newest first
    return jobs.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  },

  /**
   * Filter jobs that are ready to publish (status: "done" and video file exists)
   */
  getReadyJobs() {
    return this.listJobs().filter(j => j.isReady);
  }
};
