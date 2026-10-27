import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, updateEnv, ROOT_DIR } from './core/config.mjs';
import { logger } from './core/logger.mjs';
import { storage } from './core/storage.mjs';
import { motionStudio } from './core/motion-studio.mjs';
import { publisher } from './publisher.mjs';
import { globalWatcher } from './watcher.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(__dirname, '../ui');

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // ----------------------------------------------------
    // API Endpoints
    // ----------------------------------------------------

    // 1. System Status
    if (pathname === '/api/status' && method === 'GET') {
      const connections = await publisher.testAll();
      return sendJson(res, 200, {
        name: 'OmniClip',
        version: '1.0.0',
        motionStudioDir: config.motionStudioDir,
        motionStudioAvailable: motionStudio.isAvailable(),
        watcherRunning: globalWatcher.isRunning,
        autoPublish: globalWatcher.autoPublish,
        defaultPlatforms: config.defaultPlatforms,
        platforms: connections
      });
    }

    // 2. Toggle Auto-Publish Settings
    if (pathname === '/api/settings' && method === 'POST') {
      const body = await parseBody(req);
      if (typeof body.autoPublish === 'boolean') {
        globalWatcher.autoPublish = body.autoPublish;
      }
      return sendJson(res, 200, {
        ok: true,
        autoPublish: globalWatcher.autoPublish
      });
    }

    // 3. List all Motion Studio jobs
    if (pathname === '/api/jobs' && method === 'GET') {
      const jobs = motionStudio.listJobs();
      return sendJson(res, 200, {
        total: jobs.length,
        readyCount: jobs.filter(j => j.isReady).length,
        jobs
      });
    }

    // 4. Test platform connections
    if (pathname === '/api/test-platforms' && method === 'POST') {
      const results = await publisher.testAll();
      return sendJson(res, 200, results);
    }

    // 5. Trigger publication
    if (pathname === '/api/publish' && method === 'POST') {
      const body = await parseBody(req);
      const { project, jobId, platforms, title, description, hashtags, privacy } = body;

      if (!project || !jobId) {
        return sendError(res, 400, 'project and jobId are required.');
      }

      const report = await publisher.publishJob(project, jobId, platforms, {
        title,
        description,
        hashtags,
        privacy,
        facebookPages: body.facebookPages || []
      });

      return sendJson(res, 200, report);
    }

    // 6. Get publication history
    if (pathname === '/api/history' && method === 'GET') {
      return sendJson(res, 200, storage.getHistory());
    }

    // 7. Get pending queue
    if (pathname === '/api/queue' && method === 'GET') {
      return sendJson(res, 200, storage.getQueue());
    }

    // 8. Serve local video with Range support for preview player
    if (pathname === '/api/video' && method === 'GET') {
      const videoPath = parsedUrl.searchParams.get('path');
      if (!videoPath || !fs.existsSync(videoPath)) {
        return sendError(res, 404, 'Video not found');
      }

      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4'
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4'
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
      }
      return;
    }

    // 9. Serve thumbnail preview
    if (pathname === '/api/thumbnail' && method === 'GET') {
      const thumbPath = parsedUrl.searchParams.get('path');
      if (!thumbPath || !fs.existsSync(thumbPath)) {
        return sendError(res, 404, 'Thumbnail not found');
      }
      const stat = fs.statSync(thumbPath);
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': stat.size
      });
      fs.createReadStream(thumbPath).pipe(res);
      return;
    }

    // ----------------------------------------------------
    // SSO & OAuth Endpoints
    // ----------------------------------------------------

    // 10. YouTube OAuth Login & Callback
    if (pathname === '/auth/youtube/login') {
      if (!config.youtube.clientId) {
        res.writeHead(302, { Location: '/#settings?error=youtube_missing_client_id' });
        return res.end();
      }
      const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly');
      const redirectUri = encodeURIComponent(`http://127.0.0.1:${config.port}/auth/youtube/callback`);
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.youtube.clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
      res.writeHead(302, { Location: url });
      return res.end();
    }

    if (pathname === '/auth/youtube/callback') {
      const code = parsedUrl.searchParams.get('code');
      const error = parsedUrl.searchParams.get('error');
      if (error || !code) {
        res.writeHead(302, { Location: `/#settings?error=${encodeURIComponent(error || 'no_code')}` });
        return res.end();
      }
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: config.youtube.clientId,
            client_secret: config.youtube.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: `http://127.0.0.1:${config.port}/auth/youtube/callback`
          }).toString()
        });
        const tokenData = await tokenRes.json();
        if (tokenData.refresh_token) {
          updateEnv({
            YOUTUBE_REFRESH_TOKEN: tokenData.refresh_token,
            YOUTUBE_ENABLED: 'true'
          });
          logger.success('YouTube OAuth connection successful!');
          res.writeHead(302, { Location: '/#settings?connected=youtube' });
        } else {
          res.writeHead(302, { Location: '/#settings?error=no_refresh_token_returned' });
        }
        return res.end();
      } catch (err) {
        res.writeHead(302, { Location: `/#settings?error=${encodeURIComponent(err.message)}` });
        return res.end();
      }
    }

    // 11. TikTok OAuth Login & Callback
    if (pathname === '/auth/tiktok/login') {
      if (!config.tiktok.clientKey) {
        res.writeHead(302, { Location: '/#settings?error=tiktok_missing_client_key' });
        return res.end();
      }
      const scope = encodeURIComponent('user.info.basic,video.upload,video.publish');
      const redirectUriStr = process.env.TIKTOK_REDIRECT_URI || `http://127.0.0.1:${config.port}/auth/tiktok/callback`;
      const redirectUri = encodeURIComponent(redirectUriStr);

      const codeVerifier = crypto.randomBytes(32).toString('hex');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('hex');
      globalThis._tiktokPkceVerifier = codeVerifier;
      try {
        fs.writeFileSync(path.join(ROOT_DIR, 'data', 'tiktok_verifier.txt'), codeVerifier, 'utf8');
      } catch (e) {}

      const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${config.tiktok.clientKey}&scope=${scope}&response_type=code&redirect_uri=${redirectUri}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
      res.writeHead(302, { Location: url });
      return res.end();
    }

    if (pathname === '/auth/tiktok/callback') {
      const code = parsedUrl.searchParams.get('code');
      const error = parsedUrl.searchParams.get('error');
      if (error || !code) {
        res.writeHead(302, { Location: `/#settings?error=${encodeURIComponent(error || 'no_code')}` });
        return res.end();
      }
      try {
        const redirectUri = process.env.TIKTOK_REDIRECT_URI || `http://127.0.0.1:${config.port}/auth/tiktok/callback`;
        let codeVerifier = globalThis._tiktokPkceVerifier || '';
        if (!codeVerifier) {
          try {
            codeVerifier = fs.readFileSync(path.join(ROOT_DIR, 'data', 'tiktok_verifier.txt'), 'utf8').trim();
          } catch (e) {}
        }
        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: config.tiktok.clientKey,
            client_secret: config.tiktok.clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code_verifier: codeVerifier
          }).toString()
        });
        const tokenData = await tokenRes.json();
        logger.info(`TikTok token response: ${JSON.stringify(tokenData)}`);

        if (tokenData.data?.access_token || tokenData.access_token) {
          const accessToken = tokenData.data?.access_token || tokenData.access_token;
          const refreshToken = tokenData.data?.refresh_token || tokenData.refresh_token || '';
          updateEnv({
            TIKTOK_ACCESS_TOKEN: accessToken,
            TIKTOK_REFRESH_TOKEN: refreshToken,
            TIKTOK_ENABLED: 'true'
          });
          logger.success('TikTok OAuth connection successful!');
          res.writeHead(302, { Location: `http://127.0.0.1:${config.port}/#settings?connected=tiktok` });
        } else {
          const errMsg = tokenData.error_description || tokenData.error?.message || tokenData.message || tokenData.error || 'tiktok_failed';
          logger.error(`TikTok OAuth error: ${errMsg}`);
          res.writeHead(302, { Location: `http://127.0.0.1:${config.port}/#settings?error=${encodeURIComponent(errMsg)}` });
        }
        return res.end();
      } catch (err) {
        res.writeHead(302, { Location: `/#settings?error=${encodeURIComponent(err.message)}` });
        return res.end();
      }
    }

    // 12. Facebook & Instagram OAuth Login & Callback
    if (pathname === '/auth/facebook/login') {
      const appId = config.facebook.appId || process.env.FACEBOOK_APP_ID;
      if (!appId) {
        res.writeHead(302, { Location: '/#settings?error=facebook_missing_app_id' });
        return res.end();
      }
      const host = req.headers.host || `127.0.0.1:${config.port}`;
      const scope = encodeURIComponent('pages_show_list,pages_read_engagement,pages_manage_posts,publish_video,instagram_basic,instagram_content_publish');
      const redirectUri = encodeURIComponent(`http://${host}/auth/facebook/callback`);
      const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
      res.writeHead(302, { Location: url });
      return res.end();
    }

    if (pathname === '/auth/facebook/callback') {
      const code = parsedUrl.searchParams.get('code');
      const error = parsedUrl.searchParams.get('error');
      if (error || !code) {
        res.writeHead(302, { Location: `/#settings?error=${encodeURIComponent(error || 'no_code')}` });
        return res.end();
      }
      try {
        const appId = config.facebook.appId || process.env.FACEBOOK_APP_ID;
        const appSecret = config.facebook.appSecret || process.env.FACEBOOK_APP_SECRET;
        const host = req.headers.host || `127.0.0.1:${config.port}`;
        const redirectUri = `http://${host}/auth/facebook/callback`;

        const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`);
        const tokenData = await tokenRes.json();
        const userToken = tokenData.access_token;

        if (!userToken) {
          throw new Error(tokenData.error?.message || 'Failed to obtain user access token from Facebook');
        }

        const longLivedRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userToken}`);
        const longLivedData = await longLivedRes.json();
        const longToken = longLivedData.access_token || userToken;

        const accountsRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${longToken}`);
        const accountsData = await accountsRes.json();
        const pages = accountsData.data || [];

        if (pages.length === 0) {
          throw new Error('No Facebook Pages found in this account. Please create or manage at least one Page.');
        }

        const firstPage = pages[0];
        const updates = {
          FACEBOOK_PAGE_ID: firstPage.id,
          FACEBOOK_PAGE_ACCESS_TOKEN: firstPage.access_token,
          FACEBOOK_ENABLED: 'true'
        };

        if (firstPage.instagram_business_account) {
          updates.INSTAGRAM_ACCOUNT_ID = firstPage.instagram_business_account.id;
          updates.INSTAGRAM_ACCESS_TOKEN = firstPage.access_token;
          updates.INSTAGRAM_ENABLED = 'true';
        }

        updateEnv(updates);
        logger.success(`Facebook (${firstPage.name}) and Instagram connected via SSO!`);
        res.writeHead(302, { Location: '/#settings?connected=facebook_instagram' });
        return res.end();
      } catch (err) {
        res.writeHead(302, { Location: `/#settings?error=${encodeURIComponent(err.message)}` });
        return res.end();
      }
    }

    // 13. Settings API: Save App Credentials
    if (pathname === '/api/settings/save-credentials' && method === 'POST') {
      const body = await parseBody(req);
      const updates = {};
      if (body.youtubeClientId !== undefined) updates.YOUTUBE_CLIENT_ID = body.youtubeClientId.trim();
      if (body.youtubeClientSecret !== undefined) updates.YOUTUBE_CLIENT_SECRET = body.youtubeClientSecret.trim();
      if (body.youtubeRefreshToken !== undefined && body.youtubeRefreshToken.trim()) {
        updates.YOUTUBE_REFRESH_TOKEN = body.youtubeRefreshToken.trim();
        updates.YOUTUBE_ENABLED = 'true';
      }
      if (body.tiktokClientKey !== undefined) updates.TIKTOK_CLIENT_KEY = body.tiktokClientKey.trim();
      if (body.tiktokClientSecret !== undefined) updates.TIKTOK_CLIENT_SECRET = body.tiktokClientSecret.trim();
      if (body.tiktokSessionId !== undefined) {
        updates.TIKTOK_SESSION_ID = body.tiktokSessionId.trim();
        if (body.tiktokSessionId.trim()) {
          updates.TIKTOK_ENABLED = 'true';
        }
      }
      if (body.facebookAppId !== undefined) updates.FACEBOOK_APP_ID = body.facebookAppId.trim();
      if (body.facebookAppSecret !== undefined) updates.FACEBOOK_APP_SECRET = body.facebookAppSecret.trim();
      if (body.facebookPageId !== undefined) updates.FACEBOOK_PAGE_ID = body.facebookPageId.trim();
      if (body.facebookPageAccessToken !== undefined) {
        updates.FACEBOOK_PAGE_ACCESS_TOKEN = body.facebookPageAccessToken.trim();
        if (body.facebookPageAccessToken.trim()) {
          updates.FACEBOOK_ENABLED = 'true';
          const targetPageId = updates.FACEBOOK_PAGE_ID || config.facebook.pageId;
          if (targetPageId) {
            storage.addFacebookPage({ id: targetPageId, token: updates.FACEBOOK_PAGE_ACCESS_TOKEN });
          }
        }
      }
      if (body.instagramAccountId !== undefined) updates.INSTAGRAM_ACCOUNT_ID = body.instagramAccountId.trim();
      if (body.instagramAccessToken !== undefined && body.instagramAccessToken.trim()) {
        updates.INSTAGRAM_ACCESS_TOKEN = body.instagramAccessToken.trim();
        updates.INSTAGRAM_ENABLED = 'true';
      } else if (body.instagramAccountId && (updates.FACEBOOK_PAGE_ACCESS_TOKEN || config.facebook.pageAccessToken)) {
        updates.INSTAGRAM_ACCESS_TOKEN = updates.FACEBOOK_PAGE_ACCESS_TOKEN || config.facebook.pageAccessToken;
        updates.INSTAGRAM_ENABLED = 'true';
      }
      if (body.motionStudioDir !== undefined) updates.MOTION_STUDIO_DIR = body.motionStudioDir.trim();

      updateEnv(updates);
      return sendJson(res, 200, { ok: true, message: 'Credentials updated successfully' });
    }

    // 14. Settings API: Disconnect platform
    if (pathname === '/api/settings/disconnect' && method === 'POST') {
      const body = await parseBody(req);
      const platform = (body.platform || '').toLowerCase();
      const updates = {};
      if (platform === 'youtube') {
        updates.YOUTUBE_REFRESH_TOKEN = '';
        updates.YOUTUBE_ENABLED = 'false';
      } else if (platform === 'tiktok') {
        updates.TIKTOK_ACCESS_TOKEN = '';
        updates.TIKTOK_REFRESH_TOKEN = '';
        updates.TIKTOK_SESSION_ID = '';
        updates.TIKTOK_ENABLED = 'false';
      } else if (platform === 'facebook') {
        const oldId = config.facebook.pageId;
        updates.FACEBOOK_PAGE_ID = '';
        updates.FACEBOOK_PAGE_ACCESS_TOKEN = '';
        updates.FACEBOOK_ENABLED = 'false';
        if (oldId) storage.removeFacebookPage(oldId);
      } else if (platform === 'instagram') {
        updates.INSTAGRAM_ACCOUNT_ID = '';
        updates.INSTAGRAM_ACCESS_TOKEN = '';
        updates.INSTAGRAM_ENABLED = 'false';
      }
      updateEnv(updates);
      return sendJson(res, 200, { ok: true, platform, disconnected: true });
    }

    // 15. Settings API: Get Credentials
    if (pathname === '/api/settings/credentials' && method === 'GET') {
      const fbStatus = await publisher.getPlatform('facebook').testConnection();
      const igStatus = await publisher.getPlatform('instagram').testConnection();
      return sendJson(res, 200, {
        youtube: {
          clientId: config.youtube.clientId || '',
          clientSecret: config.youtube.clientSecret || '',
          isConnected: Boolean(config.youtube.refreshToken)
        },
        tiktok: {
          clientKey: config.tiktok.clientKey || '',
          clientSecret: config.tiktok.clientSecret || '',
          sessionId: config.tiktok.sessionId ? '••••••••' : '',
          isConnected: Boolean(config.tiktok.sessionId || config.tiktok.accessToken || config.tiktok.refreshToken)
        },
        facebook: {
          appId: config.facebook.appId || process.env.FACEBOOK_APP_ID || '',
          appSecret: config.facebook.appSecret || process.env.FACEBOOK_APP_SECRET || '',
          pageId: config.facebook.pageId || '',
          pageName: fbStatus.ok ? fbStatus.page : '',
          pageAccessToken: config.facebook.pageAccessToken ? '••••••••' : '',
          isConnected: Boolean(config.facebook.pageAccessToken && fbStatus.ok),
          isExpired: Boolean(config.facebook.pageAccessToken && !fbStatus.ok),
          error: !fbStatus.ok ? fbStatus.error : null
        },
        instagram: {
          accountId: config.instagram.accountId || '',
          username: igStatus.ok ? igStatus.username : '',
          accessToken: config.instagram.accessToken ? '••••••••' : '',
          isConnected: Boolean(igStatus.ok),
          isExpired: Boolean(config.instagram.accessToken && !igStatus.ok && config.instagram.accountId),
          error: !igStatus.ok ? igStatus.error : null
        }
      });
    }

    // 16. Facebook Pages Management (Multi-Page)
    if (pathname === '/api/facebook/pages' && method === 'GET') {
      const pages = storage.getFacebookPages().map(p => ({
        id: p.id,
        name: p.name || p.id,
        active: p.active !== false
      }));
      return sendJson(res, 200, { pages });
    }

    if (pathname === '/api/facebook/pages' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.id || !body.token) {
        return sendError(res, 400, 'Page ID and Token are required.');
      }
      // verify page
      try {
        const verifyRes = await fetch(`https://graph.facebook.com/v19.0/${body.id}?fields=name,id&access_token=${body.token}`);
        const verifyData = await verifyRes.json();
        const pageName = verifyData.name || body.name || `Page ${body.id}`;
        const pages = storage.addFacebookPage({
          id: body.id.trim(),
          name: pageName,
          token: body.token.trim(),
          active: true
        });
        return sendJson(res, 200, { ok: true, pages });
      } catch (err) {
        return sendError(res, 400, `Cannot verify page: ${err.message}`);
      }
    }

    if (pathname === '/api/facebook/pages' && method === 'DELETE') {
      const body = await parseBody(req);
      if (!body.id) {
        return sendError(res, 400, 'Page ID is required.');
      }
      const pages = storage.removeFacebookPage(body.id);
      return sendJson(res, 200, { ok: true, pages });
    }

    // ----------------------------------------------------
    // Static UI Files
    // ----------------------------------------------------
    let filePath = path.join(UI_DIR, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.svg': 'image/svg+xml',
        '.json': 'application/json'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Fallback to index.html
    const indexPath = path.join(UI_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }

    sendError(res, 404, 'Not found');
  } catch (err) {
    logger.error(`HTTP Handler Error: ${err.message}`);
    sendError(res, 500, err.message);
  }
});

export function startServer(port = config.port) {
  server.listen(port, '127.0.0.1', () => {
    logger.success(`OmniClip Dashboard running at: http://127.0.0.1:${port}`);
    logger.info(`Connected to Motion Studio at: ${config.motionStudioDir}`);
    // Start background watcher
    globalWatcher.start();
  });
  return server;
}

// Auto start if run directly
if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  startServer();
}
