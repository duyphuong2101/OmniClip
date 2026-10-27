import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * Simple .env parser to avoid mandatory external dependencies
 */
function loadEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return {};

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const result = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();

    // Remove quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    result[key] = val;
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }

  return result;
}

const env = loadEnv();

function readJsonFile(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`Error reading JSON ${filePath}:`, err.message);
  }
  return fallback;
}

const defaultConfig = readJsonFile(path.join(ROOT_DIR, 'config', 'default.json'));

export const config = {
  motionStudioDir: path.resolve(process.env.MOTION_STUDIO_DIR || defaultConfig.motionStudioDir || 'D:/Motion Studio'),
  port: parseInt(process.env.PORT || defaultConfig.port || '4790', 10),
  pollIntervalSeconds: parseInt(defaultConfig.pollIntervalSeconds || '5', 10),
  autoPublish: (process.env.AUTO_PUBLISH || String(defaultConfig.autoPublish)).toLowerCase() === 'true',
  defaultPlatforms: (process.env.DEFAULT_PLATFORMS ? process.env.DEFAULT_PLATFORMS.split(',').map(p => p.trim()) : defaultConfig.defaultPlatforms) || ['youtube', 'tiktok', 'facebook', 'instagram'],
  defaultPrivacy: process.env.DEFAULT_PRIVACY || defaultConfig.defaultPrivacy || 'public',
  defaultHashtags: defaultConfig.defaultHashtags || ['#Trending', '#Viral', '#Shorts', '#Reels', '#Insights'],

  // Platforms Config
  youtube: {
    enabled: (process.env.YOUTUBE_ENABLED || '').toLowerCase() === 'true' || Boolean(process.env.YOUTUBE_REFRESH_TOKEN),
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || '',
    category: defaultConfig.platforms?.youtube?.category || '22',
    madeForKids: Boolean(defaultConfig.platforms?.youtube?.madeForKids)
  },
  tiktok: {
    enabled: (process.env.TIKTOK_ENABLED || '').toLowerCase() === 'true' || Boolean(process.env.TIKTOK_REFRESH_TOKEN || process.env.TIKTOK_ACCESS_TOKEN),
    clientKey: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    refreshToken: process.env.TIKTOK_REFRESH_TOKEN || '',
    accessToken: process.env.TIKTOK_ACCESS_TOKEN || '',
    sessionId: process.env.TIKTOK_SESSION_ID || '',
    privacyLevel: defaultConfig.platforms?.tiktok?.privacyLevel || 'PUBLIC_TO_EVERYONE',
    allowComments: defaultConfig.platforms?.tiktok?.allowComments ?? true,
    allowDuet: defaultConfig.platforms?.tiktok?.allowDuet ?? true,
    allowStitch: defaultConfig.platforms?.tiktok?.allowStitch ?? true
  },
  facebook: {
    enabled: (process.env.FACEBOOK_ENABLED || '').toLowerCase() === 'true' || Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN),
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    pageId: process.env.FACEBOOK_PAGE_ID || '',
    pageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || ''
  },
  instagram: {
    enabled: (process.env.INSTAGRAM_ENABLED || '').toLowerCase() === 'true' || Boolean(process.env.INSTAGRAM_ACCESS_TOKEN),
    accountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
    publicHost: process.env.INSTAGRAM_PUBLIC_HOST || '',
    shareToFeed: defaultConfig.platforms?.instagram?.shareToFeed ?? true
  }
};

export function reloadConfig() {
  loadEnv();
  config.youtube.enabled = (process.env.YOUTUBE_ENABLED || '').toLowerCase() === 'true' || Boolean(process.env.YOUTUBE_REFRESH_TOKEN);
  config.youtube.clientId = process.env.YOUTUBE_CLIENT_ID || '';
  config.youtube.clientSecret = process.env.YOUTUBE_CLIENT_SECRET || '';
  config.youtube.refreshToken = process.env.YOUTUBE_REFRESH_TOKEN || '';

  config.tiktok.enabled = (process.env.TIKTOK_ENABLED || '').toLowerCase() === 'true' || Boolean(process.env.TIKTOK_REFRESH_TOKEN || process.env.TIKTOK_ACCESS_TOKEN || process.env.TIKTOK_SESSION_ID);
  config.tiktok.clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  config.tiktok.clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
  config.tiktok.refreshToken = process.env.TIKTOK_REFRESH_TOKEN || '';
  config.tiktok.accessToken = process.env.TIKTOK_ACCESS_TOKEN || '';
  config.tiktok.sessionId = process.env.TIKTOK_SESSION_ID || '';

  config.facebook.enabled = (process.env.FACEBOOK_ENABLED || '').toLowerCase() === 'true' || Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
  config.facebook.appId = process.env.FACEBOOK_APP_ID || '';
  config.facebook.appSecret = process.env.FACEBOOK_APP_SECRET || '';
  config.facebook.pageId = process.env.FACEBOOK_PAGE_ID || '';
  config.facebook.pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';

  config.instagram.enabled = (process.env.INSTAGRAM_ENABLED || '').toLowerCase() === 'true' || Boolean(process.env.INSTAGRAM_ACCESS_TOKEN);
  config.instagram.accountId = process.env.INSTAGRAM_ACCOUNT_ID || '';
  config.instagram.accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || '';
  config.instagram.publicHost = process.env.INSTAGRAM_PUBLIC_HOST || '';
  return config;
}

export function updateEnv(updates) {
  const envPath = path.join(ROOT_DIR, '.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = content.split(/\r?\n/);
  const updatedKeys = new Set();

  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      updatedKeys.add(key);
      const val = updates[key];
      return `${key}="${val}"`;
    }
    return line;
  });

  for (const [key, val] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      newLines.push(`${key}="${val}"`);
    }
  }

  fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');

  for (const [k, v] of Object.entries(updates)) {
    process.env[k] = v;
  }
  reloadConfig();
}
