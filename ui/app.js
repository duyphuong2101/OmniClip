let allJobs = [];
let currentFilter = 'ready';
let activeJob = null;

// DOM Elements
const videoGrid = document.getElementById('videoGrid');
const historyList = document.getElementById('historyList');
const countReady = document.getElementById('countReady');
const countHistory = document.getElementById('countHistory');
const searchInput = document.getElementById('searchInput');
const btnRefresh = document.getElementById('btnRefresh');
const autoPublishToggle = document.getElementById('autoPublishToggle');
const autoPublishStatus = document.getElementById('autoPublishStatus');

// Modal Elements
const publishModal = document.getElementById('publishModal');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelPublish = document.getElementById('btnCancelPublish');
const btnSubmitPublish = document.getElementById('btnSubmitPublish');
const modalVideoPlayer = document.getElementById('modalVideoPlayer');
const modalVideoMeta = document.getElementById('modalVideoMeta');
const postTitle = document.getElementById('postTitle');
const postDescription = document.getElementById('postDescription');
const postHashtags = document.getElementById('postHashtags');
const postPrivacy = document.getElementById('postPrivacy');

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadStatus();
  loadJobs();
  loadHistory();
  checkSsoReturnParams();

  // Periodic poll every 6 seconds
  setInterval(() => {
    loadJobs(true);
    loadStatus(true);
  }, 6000);
});

function setupEventListeners() {
  // Home Sub Tabs (Videos vs Published History)
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const paneId = btn.dataset.tab === 'videos' ? 'tabVideos' : 'tabHistory';
      const pane = document.getElementById(paneId);
      if (pane) pane.classList.add('active');
      if (btn.dataset.tab === 'history') loadHistory();
    });
  });

  // Top Nav Brand Click -> Go to Home
  const navBrand = document.getElementById('navBrand');
  if (navBrand) {
    navBrand.addEventListener('click', () => {
      showView('home');
    });
  }

  // Header Settings Icon Click -> Go to Settings
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  if (btnOpenSettings) {
    btnOpenSettings.addEventListener('click', () => {
      showView('settings');
    });
  }

  // Back to Home from Settings View
  const btnBackToHome = document.getElementById('btnBackToHome');
  if (btnBackToHome) {
    btnBackToHome.addEventListener('click', () => {
      showView('home');
    });
  }

  // Filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderJobs();
    });
  });

  // Search
  searchInput.addEventListener('input', () => {
    renderJobs();
  });

  // Refresh
  btnRefresh.addEventListener('click', () => {
    loadStatus();
    loadJobs();
    loadHistory();
    loadSettingsCredentials();
  });

  // Auto Publish Switch
  autoPublishToggle.addEventListener('change', async () => {
    const isAuto = autoPublishToggle.checked;
    updateAutoPublishBadge(isAuto);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoPublish: isAuto })
      });
    } catch (err) {
      console.error('Failed to update autoPublish setting:', err);
    }
  });

  // Modal Close
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelPublish.addEventListener('click', closeModal);

  // Submit Publish
  btnSubmitPublish.addEventListener('click', handlePublishSubmit);
}

function updateAutoPublishBadge(isAuto) {
  if (isAuto) {
    autoPublishStatus.textContent = 'ON (Auto)';
    autoPublishStatus.className = 'status-badge on';
  } else {
    autoPublishStatus.textContent = 'OFF';
    autoPublishStatus.className = 'status-badge off';
  }
}

async function loadStatus(silent = false) {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (!silent) {
      autoPublishToggle.checked = Boolean(data.autoPublish);
      updateAutoPublishBadge(Boolean(data.autoPublish));
    }

    const plats = data.platforms || {};
    updateSocialBadge('youtube', 'YouTube Shorts', plats.youtube, 'badgeYt', 'dotYoutube', 'cardYoutube');
    updateSocialBadge('tiktok', 'TikTok', plats.tiktok, 'badgeTt', 'dotTiktok', 'cardTiktok');
    updateSocialBadge('facebook', 'Facebook Reels', plats.facebook, 'badgeFb', 'dotFacebook', 'cardFacebook');
    updateSocialBadge('instagram', 'Instagram Reels', plats.instagram, 'badgeIg', 'dotInstagram', 'cardInstagram');
  } catch (err) {
    console.error('Load status error:', err);
  }
}

function updateSocialBadge(id, name, statusObj = {}, badgeId, dotId, cardId) {
  const badge = document.getElementById(badgeId);
  const dot = document.getElementById(dotId);
  if (!badge || !dot) return;

  const isConnected = Boolean(statusObj && statusObj.ok);
  dot.className = `status-dot ${isConnected ? 'green' : 'red'}`;

  const accountInfo = statusObj ? (statusObj.channel || statusObj.page || statusObj.user || statusObj.username || '') : '';
  const tooltip = isConnected 
    ? `${name}: Connected (${accountInfo})` 
    : `${name}: Disconnected (Click to configure SSO)`;

  badge.title = tooltip;

  badge.onclick = () => {
    showView('settings');
    const card = document.getElementById(cardId);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.borderColor = '#6366f1';
      card.style.boxShadow = '0 0 16px rgba(99, 102, 241, 0.4)';
      setTimeout(() => {
        card.style.borderColor = '';
        card.style.boxShadow = '';
      }, 2500);
    }
  };
}

async function loadJobs(silent = false) {
  try {
    const res = await fetch('/api/jobs');
    const data = await res.json();
    allJobs = data.jobs || [];
    countReady.textContent = data.readyCount || 0;
    renderJobs();
  } catch (err) {
    if (!silent) {
      videoGrid.innerHTML = `<div class="empty-state">Error connecting to server: ${err.message}</div>`;
    }
  }
}

function renderJobs() {
  const query = searchInput.value.toLowerCase().trim();
  let filtered = allJobs;

  if (currentFilter === 'ready') {
    filtered = filtered.filter(j => j.isReady);
  }

  if (query) {
    filtered = filtered.filter(j => 
      (j.title && j.title.toLowerCase().includes(query)) ||
      (j.project && j.project.toLowerCase().includes(query)) ||
      (j.jobId && j.jobId.toLowerCase().includes(query)) ||
      (j.hashtags && j.hashtags.some(h => h.toLowerCase().includes(query)))
    );
  }

  if (filtered.length === 0) {
    videoGrid.innerHTML = `<div class="empty-state">No matching videos found.</div>`;
    return;
  }

  videoGrid.innerHTML = filtered.map(job => {
    const thumbUrl = job.thumbnailPath ? `/api/thumbnail?path=${encodeURIComponent(job.thumbnailPath)}` : '';
    const durMin = Math.floor(job.duration / 60);
    const durSec = Math.round(job.duration % 60).toString().padStart(2, '0');
    const durStr = `${durMin}:${durSec}`;

    const published = job.publishedHistory || {};
    const ytDone = published.youtube?.status === 'success';
    const ttDone = published.tiktok?.status === 'success';
    const fbDone = published.facebook?.status === 'success';
    const igDone = published.instagram?.status === 'success';

    return `
      <div class="video-card">
        <div class="video-thumb-wrap ${job.isVertical ? 'vertical' : ''}">
          ${thumbUrl ? `<img class="video-thumb-img" src="${thumbUrl}" alt="Thumbnail">` : `<div style="padding: 20px; color: #64748b; text-align: center;">No thumbnail available</div>`}
          <span class="aspect-badge">${job.isVertical ? '9:16 (Shorts/Reels)' : '16:9'}</span>
          <span class="duration-badge">${durStr}</span>
        </div>
        <div class="card-body">
          <div class="card-project">${escapeHtml(job.project)} • ${escapeHtml(job.jobId)}</div>
          <h3 class="card-title">${escapeHtml(job.title)}</h3>
          <p class="card-desc">${escapeHtml(job.description || '')}</p>

          <div class="published-status-row">
            <div class="platform-icons-status">
              <span class="p-icon-pill ${ytDone ? 'success' : ''}" title="YouTube">YT</span>
              <span class="p-icon-pill ${ttDone ? 'success' : ''}" title="TikTok">TT</span>
              <span class="p-icon-pill ${fbDone ? 'success' : ''}" title="Facebook">FB</span>
              <span class="p-icon-pill ${igDone ? 'success' : ''}" title="Instagram">IG</span>
            </div>
            ${job.isReady 
              ? `<button class="btn btn-sm btn-primary" onclick="openPublishModal('${job.project}', '${job.jobId}')">🚀 Publish</button>`
              : `<span class="status-badge off">${escapeHtml(job.status)}</span>`
            }
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.openPublishModal = async function(project, jobId) {
  const job = allJobs.find(j => j.project === project && j.jobId === jobId);
  if (!job) return;

  activeJob = job;
  postTitle.value = job.title;
  postDescription.value = job.brief?.keyMessage || job.description || '';
  postHashtags.value = (job.hashtags || []).join(' ');

  modalVideoPlayer.src = `/api/video?path=${encodeURIComponent(job.videoPath)}`;
  modalVideoMeta.innerHTML = `
    <strong>Project:</strong> ${escapeHtml(job.project)}<br>
    <strong>Duration:</strong> ${Math.round(job.duration)}s | <strong>Resolution:</strong> ${job.width}x${job.height} (${job.isVertical ? 'Vertical 9:16' : 'Horizontal'})<br>
    <strong>File:</strong> <code>${escapeHtml(job.videoFile)}</code>
  `;

  // Load Facebook Pages for Multi-Page selection
  loadFacebookPagesForModal();

  publishModal.classList.remove('hidden');
};

async function loadFacebookPagesForModal() {
  const group = document.getElementById('fbPagesSelectorGroup');
  const container = document.getElementById('fbPagesCheckboxes');
  const chkFb = document.getElementById('chkFacebook');
  if (!container || !group) return;

  if (chkFb) {
    group.style.display = chkFb.checked ? 'block' : 'none';
    chkFb.onchange = () => {
      group.style.display = chkFb.checked ? 'block' : 'none';
    };
  }

  try {
    const res = await fetch('/api/facebook/pages');
    const data = await res.json();
    const pages = data.pages || [];
    if (pages.length === 0) {
      container.innerHTML = '<span style="font-size:11px;color:#94a3b8;">No Facebook pages configured yet.</span>';
      return;
    }
    container.innerHTML = pages.map(p => `
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
        <input type="checkbox" class="chk-fb-page" value="${escapeHtml(p.id)}" checked>
        <span>📄 ${escapeHtml(p.name)} <code style="font-size:10px;color:#94a3b8;">(${escapeHtml(p.id)})</code></span>
      </label>
    `).join('');
  } catch (err) {
    container.innerHTML = '<span style="font-size:11px;color:#ef4444;">Failed to load pages</span>';
  }
}

function closeModal() {
  publishModal.classList.add('hidden');
  modalVideoPlayer.pause();
  modalVideoPlayer.src = '';
  activeJob = null;
}

async function handlePublishSubmit() {
  if (!activeJob) return;

  const platforms = [];
  if (document.getElementById('chkYoutube').checked) platforms.push('youtube');
  if (document.getElementById('chkTiktok').checked) platforms.push('tiktok');
  if (document.getElementById('chkFacebook').checked) platforms.push('facebook');
  if (document.getElementById('chkInstagram').checked) platforms.push('instagram');

  if (platforms.length === 0) {
    alert('Please select at least one platform to publish.');
    return;
  }

  const hashtags = postHashtags.value.split(/\s+/).filter(Boolean);

  const selectedFbPages = [];
  document.querySelectorAll('.chk-fb-page:checked').forEach(c => selectedFbPages.push(c.value));

  btnSubmitPublish.disabled = true;
  btnSubmitPublish.textContent = 'Publishing...';

  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: activeJob.project,
        jobId: activeJob.jobId,
        platforms,
        facebookPages: selectedFbPages,
        title: postTitle.value,
        description: postDescription.value,
        hashtags,
        privacy: postPrivacy.value
      })
    });

    const report = await res.json();
    if (report.error) {
      alert(`Publishing error: ${report.error}`);
    } else {
      let msg = `Publishing report for [${activeJob.jobId}]:\n`;
      for (const [p, r] of Object.entries(report.results || {})) {
        msg += `• ${p.toUpperCase()}: ${r.status === 'success' ? '✔ Success (' + (r.url || '') + ')' : '✖ Failed (' + (r.error || '') + ')'}\n`;
      }
      alert(msg);
      closeModal();
      loadJobs();
      loadHistory();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    btnSubmitPublish.disabled = false;
    btnSubmitPublish.textContent = '🚀 Publish Now';
  }
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const items = await res.json();
    countHistory.textContent = items.length;

    if (items.length === 0) {
      historyList.innerHTML = `<div class="empty-state">No published videos recorded yet.</div>`;
      return;
    }

    historyList.innerHTML = items.map(item => {
      const timeStr = new Date(item.updatedAt || item.firstPublishedAt).toLocaleString('en-US');
      const plats = item.platforms || {};

      const links = Object.entries(plats).map(([p, r]) => {
        if (r.status === 'success' && r.url) {
          return `<a href="${r.url}" target="_blank" class="history-link-btn">${p.toUpperCase()} ↗</a>`;
        } else if (r.status === 'error') {
          return `<span class="history-link-btn" style="background:#7f1d1d;" title="${r.error}">${p.toUpperCase()} (Error)</span>`;
        }
        return '';
      }).join(' ');

      return `
        <div class="history-item">
          <div class="history-info">
            <h4>${escapeHtml(item.project)} / ${escapeHtml(item.jobId)}</h4>
            <div class="history-time">${timeStr}</div>
          </div>
          <div class="history-links">
            ${links || '<span style="color:#64748b; font-size:12px;">No links</span>'}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Load history error:', err);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ------------------------------------------------------------------
// Settings & SSO Management
// ------------------------------------------------------------------

function showView(viewName) {
  const viewHome = document.getElementById('viewHome');
  const viewSettings = document.getElementById('viewSettings');
  const btnSettings = document.getElementById('btnOpenSettings');

  if (viewName === 'settings') {
    if (viewHome) viewHome.classList.add('hidden');
    if (viewSettings) viewSettings.classList.remove('hidden');
    if (btnSettings) {
      btnSettings.classList.add('btn-primary');
      btnSettings.classList.remove('btn-secondary');
    }
    loadSettingsCredentials();
  } else {
    if (viewHome) viewHome.classList.remove('hidden');
    if (viewSettings) viewSettings.classList.add('hidden');
    if (btnSettings) {
      btnSettings.classList.remove('btn-primary');
      btnSettings.classList.add('btn-secondary');
    }
  }
}

function checkSsoReturnParams() {
  const hash = window.location.hash;
  const search = window.location.search || (hash.includes('?') ? hash.slice(hash.indexOf('?')) : '');
  const params = new URLSearchParams(search);

  if (hash.includes('settings') || params.has('connected') || params.has('error')) {
    showView('settings');
  } else {
    showView('home');
  }

  const alertBox = document.getElementById('settingsAlert');
  if (!alertBox) return;

  if (params.has('connected')) {
    const conn = params.get('connected');
    const msgMap = {
      youtube: '🎉 Google / YouTube Shorts connected successfully via SSO!',
      tiktok: '🎉 TikTok Creator account connected successfully via SSO!',
      facebook_instagram: '🎉 Facebook Page & Instagram Reels connected successfully via SSO!'
    };
    alertBox.textContent = msgMap[conn] || '🎉 SSO connection successful!';
    alertBox.className = 'settings-alert success';
    alertBox.classList.remove('hidden');
    window.history.replaceState({}, document.title, window.location.pathname + '#settings');
  } else if (params.has('error')) {
    const err = params.get('error');
    alertBox.textContent = `⚠ SSO Error: ${err}`;
    alertBox.className = 'settings-alert error';
    alertBox.classList.remove('hidden');
    window.history.replaceState({}, document.title, window.location.pathname + '#settings');
  }
}

async function loadSettingsCredentials(statusPlatforms = null) {
  try {
    const res = await fetch('/api/settings/credentials');
    const data = await res.json();

    // Check actual verification status if provided
    let statusMap = statusPlatforms;
    if (!statusMap) {
      try {
        const sRes = await fetch('/api/status');
        const sData = await sRes.json();
        statusMap = sData.platforms || {};
      } catch (e) {
        statusMap = {};
      }
    }

    // YouTube
    const yt = data.youtube || {};
    const ytVerified = Boolean(statusMap.youtube && statusMap.youtube.ok);
    document.getElementById('inputYtClientId').value = yt.clientId || '';
    document.getElementById('inputYtClientSecret').value = yt.clientSecret || '';

    if (ytVerified) {
      document.getElementById('ytStatusBadge').textContent = 'CONNECTED';
      document.getElementById('ytStatusBadge').className = 'status-badge on';
      document.getElementById('ytConnectedBox').classList.remove('hidden');
      document.getElementById('ytSsoBox').classList.add('hidden');
      document.getElementById('ytCredBox').classList.add('hidden');
      if (statusMap.youtube?.channel) {
        document.getElementById('ytChannelName').textContent = statusMap.youtube.channel;
      }
    } else {
      const isError = Boolean(statusMap.youtube?.error);
      document.getElementById('ytStatusBadge').textContent = isError ? 'Token Error' : 'Disconnected';
      document.getElementById('ytStatusBadge').className = isError ? 'status-badge off text-danger' : 'status-badge off';
      document.getElementById('ytConnectedBox').classList.add('hidden');
      document.getElementById('ytSsoBox').classList.remove('hidden');
      document.getElementById('ytCredBox').classList.remove('hidden');
      if (isError) {
        const alertBox = document.getElementById('settingsAlert');
        if (alertBox) {
          alertBox.textContent = `YouTube Connection Error: ${statusMap.youtube.error}. (Note: Google API Keys starting with AIzaSy... cannot be used as Refresh Tokens).`;
          alertBox.className = 'settings-alert error';
          alertBox.classList.remove('hidden');
        }
      }
    }

    // TikTok
    const tt = data.tiktok || {};
    document.getElementById('inputTtClientKey').value = tt.clientKey || '';
    document.getElementById('inputTtClientSecret').value = tt.clientSecret || '';
    if (document.getElementById('inputTtSessionId') && tt.sessionId) {
      document.getElementById('inputTtSessionId').value = tt.sessionId;
    }
    if (tt.isConnected) {
      document.getElementById('ttStatusBadge').textContent = 'CONNECTED';
      document.getElementById('ttStatusBadge').className = 'status-badge on';
      document.getElementById('ttConnectedBox').classList.remove('hidden');
      document.getElementById('ttSsoBox').classList.add('hidden');
      document.getElementById('ttCredBox').classList.add('hidden');
    } else {
      document.getElementById('ttStatusBadge').textContent = 'Disconnected';
      document.getElementById('ttStatusBadge').className = 'status-badge off';
      document.getElementById('ttConnectedBox').classList.add('hidden');
      document.getElementById('ttSsoBox').classList.remove('hidden');
      document.getElementById('ttCredBox').classList.remove('hidden');
    }

    // Facebook
    const fb = data.facebook || {};
    if (document.getElementById('inputFbAppId')) document.getElementById('inputFbAppId').value = fb.appId || '';
    if (document.getElementById('inputFbAppSecret')) document.getElementById('inputFbAppSecret').value = fb.appSecret || '';
    if (document.getElementById('inputFbPageId')) document.getElementById('inputFbPageId').value = fb.pageId || '';

    const fbStatusBadge = document.getElementById('fbStatusBadge');
    const fbConnectedBox = document.getElementById('fbConnectedBox');
    const fbCredBox = document.getElementById('fbCredBox');
    const fbSsoBox = document.getElementById('fbSsoBox');
    const fbAlertBox = document.getElementById('fbAlertBox');
    const fbAlertMsg = document.getElementById('fbAlertMsg');

    if (fb.isConnected) {
      if (fbStatusBadge) {
        fbStatusBadge.textContent = 'CONNECTED';
        fbStatusBadge.className = 'status-badge on';
      }
      if (fbConnectedBox) fbConnectedBox.classList.remove('hidden');
      if (fbAlertBox) fbAlertBox.classList.add('hidden');
      if (fbCredBox) fbCredBox.classList.add('hidden');
      if (fbSsoBox) fbSsoBox.classList.add('hidden');
      if (document.getElementById('fbPageName')) {
        document.getElementById('fbPageName').textContent = fb.pageName ? `${fb.pageName} (ID: ${fb.pageId})` : `Facebook Page ID: ${fb.pageId}`;
      }
    } else if (fb.isExpired) {
      if (fbStatusBadge) {
        fbStatusBadge.textContent = 'EXPIRED';
        fbStatusBadge.className = 'status-badge off';
      }
      if (fbConnectedBox) fbConnectedBox.classList.remove('hidden');
      if (fbAlertBox) {
        fbAlertBox.classList.remove('hidden');
        if (fbAlertMsg) fbAlertMsg.textContent = `⚠️ Facebook Page Token has expired! Please paste a fresh Page Token below to continue.`;
      }
      if (fbCredBox) fbCredBox.classList.remove('hidden');
      if (fbSsoBox) fbSsoBox.classList.remove('hidden');
      if (document.getElementById('fbPageName')) {
        document.getElementById('fbPageName').textContent = `Facebook Page ID: ${fb.pageId || 'Token Expired'}`;
      }
    } else {
      if (fbStatusBadge) {
        fbStatusBadge.textContent = 'Disconnected';
        fbStatusBadge.className = 'status-badge off';
      }
      if (fbConnectedBox) fbConnectedBox.classList.add('hidden');
      if (fbAlertBox) fbAlertBox.classList.add('hidden');
      if (fbCredBox) fbCredBox.classList.remove('hidden');
      if (fbSsoBox) fbSsoBox.classList.remove('hidden');
    }

    // Instagram
    const ig = data.instagram || {};
    if (document.getElementById('inputIgAccountId')) {
      document.getElementById('inputIgAccountId').value = ig.accountId || '';
    }
    const igStatusBadge = document.getElementById('igStatusBadge');
    const igConnectedBox = document.getElementById('igConnectedBox');
    const igCredBox = document.getElementById('igCredBox');

    if (ig.isConnected) {
      if (igStatusBadge) {
        igStatusBadge.textContent = 'CONNECTED';
        igStatusBadge.className = 'status-badge on';
      }
      if (igConnectedBox) igConnectedBox.classList.remove('hidden');
      if (igCredBox) igCredBox.classList.add('hidden');
      if (document.getElementById('igAccountName')) {
        document.getElementById('igAccountName').textContent = `@${ig.username || ig.accountId}`;
      }
    } else {
      if (igStatusBadge) {
        igStatusBadge.textContent = 'Disconnected';
        igStatusBadge.className = 'status-badge off';
      }
      if (igConnectedBox) igConnectedBox.classList.add('hidden');
      if (igCredBox) igCredBox.classList.remove('hidden'); // ALWAYS VISIBLE WHEN NOT CONNECTED
    }

    loadSettingsFacebookPages();
  } catch (err) {
    console.error('Failed to load settings credentials:', err);
  }
}

window.triggerSsoLogin = function(platform) {
  if (platform === 'youtube') {
    const clientId = document.getElementById('inputYtClientId').value.trim();
    if (!clientId) {
      alert('Please enter and save your Google Client ID below first before connecting.');
      document.getElementById('inputYtClientId').focus();
      return;
    }
    window.location.href = '/auth/youtube/login';
  } else if (platform === 'tiktok') {
    const clientKey = document.getElementById('inputTtClientKey').value.trim();
    if (!clientKey) {
      alert('Please enter and save your TikTok Client Key below first before connecting.');
      document.getElementById('inputTtClientKey').focus();
      return;
    }
    window.location.href = '/auth/tiktok/login';
  } else if (platform === 'meta' || platform === 'facebook') {
    const appId = document.getElementById('inputFbAppId').value.trim();
    if (!appId) {
      alert('Please enter and save your Meta App ID below first before connecting.');
      document.getElementById('inputFbAppId').focus();
      return;
    }
    window.location.href = '/auth/facebook/login';
  }
};

window.saveCredentials = async function(type) {
  const payload = {};
  if (type === 'youtube') {
    payload.youtubeClientId = document.getElementById('inputYtClientId').value.trim();
    payload.youtubeClientSecret = document.getElementById('inputYtClientSecret').value.trim();
    payload.youtubeRefreshToken = document.getElementById('inputYtRefreshToken').value.trim();
  } else if (type === 'tiktok') {
    payload.tiktokClientKey = document.getElementById('inputTtClientKey').value.trim();
    payload.tiktokClientSecret = document.getElementById('inputTtClientSecret').value.trim();
    if (document.getElementById('inputTtSessionId')) {
      payload.tiktokSessionId = document.getElementById('inputTtSessionId').value.trim();
    }
  } else if (type === 'facebook') {
    payload.facebookAppId = document.getElementById('inputFbAppId')?.value.trim() || '';
    payload.facebookAppSecret = document.getElementById('inputFbAppSecret')?.value.trim() || '';
    if (document.getElementById('inputFbPageId')) {
      payload.facebookPageId = document.getElementById('inputFbPageId').value.trim();
    }
    if (document.getElementById('inputFbPageToken') && document.getElementById('inputFbPageToken').value.trim()) {
      payload.facebookPageAccessToken = document.getElementById('inputFbPageToken').value.trim();
    }
  } else if (type === 'instagram') {
    if (document.getElementById('inputIgAccountId')) {
      payload.instagramAccountId = document.getElementById('inputIgAccountId').value.trim();
    }
    if (document.getElementById('inputIgAccessToken') && document.getElementById('inputIgAccessToken').value.trim()) {
      payload.instagramAccessToken = document.getElementById('inputIgAccessToken').value.trim();
    }
  } else if (type === 'meta') {
    payload.facebookAppId = document.getElementById('inputFbAppId').value.trim();
    payload.facebookAppSecret = document.getElementById('inputFbAppSecret').value.trim();
    if (document.getElementById('inputFbPageId')) {
      payload.facebookPageId = document.getElementById('inputFbPageId').value.trim();
    }
    if (document.getElementById('inputFbPageToken') && document.getElementById('inputFbPageToken').value.trim()) {
      payload.facebookPageAccessToken = document.getElementById('inputFbPageToken').value.trim();
    }
    if (document.getElementById('inputIgAccountId')) {
      payload.instagramAccountId = document.getElementById('inputIgAccountId').value.trim();
    }
  }

  try {
    const res = await fetch('/api/settings/save-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      alert('App credentials saved successfully! You can now click Sign in with SSO.');
      loadSettingsCredentials();
      loadStatus();
    }
  } catch (err) {
    alert(`Error saving credentials: ${err.message}`);
  }
};

window.disconnectPlatform = async function(platform) {
  if (!confirm(`Are you sure you want to disconnect ${platform.toUpperCase()}?`)) return;

  try {
    const res = await fetch('/api/settings/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform })
    });
    const data = await res.json();
    if (data.ok) {
      if (platform === 'tiktok') {
        const badge = document.getElementById('ttStatusBadge');
        if (badge) { badge.textContent = 'Disconnected'; badge.className = 'status-badge off'; }
        document.getElementById('ttConnectedBox')?.classList.add('hidden');
        document.getElementById('ttSsoBox')?.classList.remove('hidden');
        document.getElementById('ttCredBox')?.classList.remove('hidden');
        const sessionInput = document.getElementById('inputTtSessionId');
        if (sessionInput) sessionInput.value = '';
      }
      await loadSettingsCredentials();
      await loadStatus();
    }
  } catch (err) {
    alert(`Error disconnecting: ${err.message}`);
  }
};

async function loadSettingsFacebookPages() {
  const container = document.getElementById('metaPagesList');
  const countEl = document.getElementById('metaPagesCount');
  if (!container) return;

  try {
    const res = await fetch('/api/facebook/pages');
    const data = await res.json();
    const pages = data.pages || [];
    if (countEl) countEl.textContent = pages.length;

    if (pages.length === 0) {
      container.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">No pages registered yet. Use form below to add a Page ID & Token.</span>';
      return;
    }

    container.innerHTML = pages.map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(15,23,42,0.5);padding:8px 12px;border-radius:6px;border:1px solid var(--border-color);">
        <div>
          <strong style="font-size:13px;display:block;">📄 ${escapeHtml(p.name)}</strong>
          <span style="font-size:11px;color:var(--text-muted);">ID: <code>${escapeHtml(p.id)}</code></span>
        </div>
        <button class="btn btn-sm btn-outline text-danger" style="padding:4px 8px;font-size:11px;" onclick="removeFacebookPage('${escapeHtml(p.id)}')">Remove</button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<span style="font-size:12px;color:var(--danger);">${err.message}</span>`;
  }
}

window.removeFacebookPage = async function(id) {
  if (!confirm(`Remove page ${id}?`)) return;
  try {
    const res = await fetch('/api/facebook/pages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (data.ok) {
      loadSettingsFacebookPages();
      loadStatus();
    }
  } catch (err) {
    alert(`Failed to remove page: ${err.message}`);
  }
};
