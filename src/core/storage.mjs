import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, config } from './config.mjs';

const DATA_DIR = path.join(ROOT_DIR, 'data');
const PUBLISHED_FILE = path.join(DATA_DIR, 'published.json');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const FB_PAGES_FILE = path.join(DATA_DIR, 'facebook_pages.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonSafe(file, fallback = {}) {
  try {
    ensureDataDir();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.error(`Storage read error ${file}:`, err.message);
  }
  return fallback;
}

function writeJsonAtomic(file, data) {
  ensureDataDir();
  const tmpFile = `${file}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, file);
}

export const storage = {
  getPublished() {
    return readJsonSafe(PUBLISHED_FILE, {});
  },

  isPublished(jobKey, platform) {
    const published = this.getPublished();
    const entry = published[jobKey];
    if (!entry || !entry.platforms) return false;
    const plat = entry.platforms[platform.toLowerCase()];
    return Boolean(plat && plat.status === 'success');
  },

  recordPublishResult(project, jobId, platform, result) {
    const published = this.getPublished();
    const key = `${project}:${jobId}`;
    if (!published[key]) {
      published[key] = {
        project,
        jobId,
        firstPublishedAt: new Date().toISOString(),
        platforms: {}
      };
    }

    published[key].updatedAt = new Date().toISOString();
    published[key].platforms[platform.toLowerCase()] = {
      ...result,
      timestamp: new Date().toISOString()
    };

    writeJsonAtomic(PUBLISHED_FILE, published);
  },

  getHistory() {
    const published = this.getPublished();
    return Object.values(published).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  },

  getQueue() {
    return readJsonSafe(QUEUE_FILE, []);
  },

  enqueue(item) {
    const queue = this.getQueue();
    const idx = queue.findIndex(q => q.project === item.project && q.jobId === item.jobId);
    if (idx >= 0) {
      queue[idx] = { ...queue[idx], ...item, updatedAt: new Date().toISOString() };
    } else {
      queue.push({ ...item, enqueuedAt: new Date().toISOString() });
    }
    writeJsonAtomic(QUEUE_FILE, queue);
  },

  dequeue(project, jobId) {
    let queue = this.getQueue();
    queue = queue.filter(q => !(q.project === project && q.jobId === jobId));
    writeJsonAtomic(QUEUE_FILE, queue);
  },

  getFacebookPages() {
    let list = readJsonSafe(FB_PAGES_FILE, null);
    if (!list || !Array.isArray(list)) {
      list = [];
    }
    if (config.facebook.pageId && config.facebook.pageAccessToken) {
      const idx = list.findIndex(p => p.id === config.facebook.pageId);
      if (idx >= 0) {
        if (list[idx].token !== config.facebook.pageAccessToken) {
          list[idx].token = config.facebook.pageAccessToken;
          writeJsonAtomic(FB_PAGES_FILE, list);
        }
      } else {
        list.unshift({
          id: config.facebook.pageId,
          name: 'Bắt Trend Mỗi Ngày',
          token: config.facebook.pageAccessToken,
          active: true
        });
        writeJsonAtomic(FB_PAGES_FILE, list);
      }
    }
    return list;
  },

  addFacebookPage(page) {
    const pages = this.getFacebookPages();
    const idx = pages.findIndex(p => p.id === page.id);
    if (idx >= 0) {
      pages[idx] = { ...pages[idx], ...page };
    } else {
      pages.push({ ...page, active: true });
    }
    writeJsonAtomic(FB_PAGES_FILE, pages);
    return pages;
  },

  removeFacebookPage(id) {
    let pages = this.getFacebookPages();
    pages = pages.filter(p => p.id !== id);
    writeJsonAtomic(FB_PAGES_FILE, pages);
    return pages;
  }
};
