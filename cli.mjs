#!/usr/bin/env node
import { config } from './src/core/config.mjs';
import { logger } from './src/core/logger.mjs';
import { motionStudio } from './src/core/motion-studio.mjs';
import { publisher } from './src/publisher.mjs';
import { globalWatcher } from './src/watcher.mjs';
import { startServer } from './src/server.mjs';

const [,, cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case 'status':
    case 'test': {
      logger.info('Testing platform API connections...');
      const results = await publisher.testAll();
      console.log('\n--- SOCIAL PLATFORMS STATUS ---');
      for (const [id, res] of Object.entries(results)) {
        const symbol = res.ok ? '✔' : '✖';
        const account = res.channel || res.page || res.user || res.username || res.status;
        console.log(`${symbol} ${id.toUpperCase().padEnd(12)} : ${account} ${res.error ? `(${res.error})` : ''}`);
      }
      console.log('-------------------------------\n');
      break;
    }

    case 'list': {
      logger.info(`Scanning Motion Studio jobs at: ${config.motionStudioDir}`);
      const jobs = motionStudio.listJobs();
      const ready = jobs.filter(j => j.isReady);
      console.log(`\nFound ${jobs.length} total jobs (${ready.length} ready to publish):\n`);
      for (const j of jobs) {
        const readyTag = j.isReady ? '[READY]' : `[${j.status}]`;
        const aspect = j.isVertical ? '9:16' : '16:9';
        console.log(`${readyTag.padEnd(14)} ${j.project}/${j.jobId.padEnd(20)} (${aspect}, ${Math.round(j.duration)}s) - "${j.title}"`);
      }
      console.log('');
      break;
    }

    case 'publish': {
      const project = args[0];
      const jobId = args[1];
      if (!project || !jobId) {
        console.error('Usage: node cli.mjs publish <project> <jobId> [--platforms=youtube,tiktok,...]');
        process.exit(1);
      }

      let platforms = config.defaultPlatforms;
      const platArg = args.find(a => a.startsWith('--platforms='));
      if (platArg) {
        platforms = platArg.split('=')[1].split(',').map(p => p.trim());
      }

      logger.info(`Publishing ${project}/${jobId} to ${platforms.join(', ')}...`);
      const report = await publisher.publishJob(project, jobId, platforms);
      console.log('\n--- PUBLISH REPORT ---');
      for (const [plat, res] of Object.entries(report.results)) {
        console.log(`${plat.toUpperCase().padEnd(12)}: ${res.status} ${res.url ? `-> ${res.url}` : ''} ${res.error ? `(Error: ${res.error})` : ''}`);
      }
      console.log('----------------------\n');
      break;
    }

    case 'watch': {
      const autoFlag = args.includes('--auto');
      if (autoFlag) globalWatcher.autoPublish = true;
      globalWatcher.start();
      break;
    }

    case 'ui':
    case 'start': {
      startServer();
      break;
    }

    case 'help':
    default: {
      console.log(`
OmniClip CLI — Social Auto-Publisher for Motion Studio

Usage:
  node cli.mjs ui                               Start web dashboard on http://127.0.0.1:4790
  node cli.mjs watch [--auto]                   Start watcher daemon (--auto will auto-post immediately)
  node cli.mjs list                             List jobs and publish status from Motion Studio
  node cli.mjs publish <proj> <job> [--platforms=yt,tt,fb,ig]  Publish a specific job
  node cli.mjs test                             Test API credentials for all platforms
  node cli.mjs help                             Show this help message
      `);
      break;
    }
  }
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
});
