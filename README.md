# OmniClip 🚀

**OmniClip** is an automated cross-platform video publishing engine connecting **Motion Studio** outputs directly to trending short-form video networks:
- 🔴 **YouTube Shorts** (YouTube Data API v3 Resumable Upload)
- 🎵 **TikTok** (TikTok Content Posting API v2 & Session Cookie)
- 🔵 **Facebook Reels** (Meta Graph API Video Reels)
- 📷 **Instagram Reels** (Instagram Graph API)

---

## Architecture: Motion Studio & OmniClip Integration

```
┌────────────────────────────────────────────────────────┐
│                   MOTION STUDIO                        │
│  (Brief -> AI Director -> Storyboard -> Approve -> MP4)│
└──────────────────────────┬─────────────────────────────┘
                           │ Render complete (status: "done")
                           ▼
             D:\Motion Studio\out\<project>\<job>\
             • final.mp4 (or final_9x16.mp4)
             • captions.srt & stills/
             • brief.json & script.json
                           │
                           ▼ (Auto-detected)
┌────────────────────────────────────────────────────────┐
│                      OMNICLIP                          │
│   • Background Watcher daemon                          │
│   • Auto-extracts Title, Description, Trending Tags    │
│   • Manages OAuth Tokens & Resumable Chunk Uploads     │
│   • Web Dashboard UI (http://127.0.0.1:4790)           │
└──────────────┬───────────┬───────────┬─────────────────┘
               │           │           │
               ▼           ▼           ▼
        YouTube Shorts   TikTok   Facebook Reels & IG Reels
```

1. Create a project, generate briefs, and approve storyboards in **Motion Studio** (`http://127.0.0.1:4780`).
2. When the video is approved and rendering completes (`final.mp4` under `out/`), **OmniClip** detects it immediately.
3. If **Auto-Publish** is enabled: OmniClip automatically extracts metadata, formats hashtags (`#Shorts`, `#Reels`, `#TikTok`), and uploads the video to all target channels.
4. If Auto-Publish is disabled: The video is queued on the OmniClip Web Dashboard (`http://127.0.0.1:4790`) where you can review, preview, edit captions, and click **🚀 Publish Now**.

---

## Installation & Quick Start

### 1. Configure Credentials
Edit `D:\OmniClip\.env` and provide your API credentials (refer to the comprehensive [SETUP_GUIDE.md](SETUP_GUIDE.md)).

```env
MOTION_STUDIO_DIR="D:/Motion Studio"
AUTO_PUBLISH=false
DEFAULT_PLATFORMS="youtube,tiktok,facebook,instagram"

# YouTube
YOUTUBE_CLIENT_ID=""
YOUTUBE_CLIENT_SECRET=""
YOUTUBE_REFRESH_TOKEN=""

# TikTok
TIKTOK_ACCESS_TOKEN=""

# Facebook & Instagram
FACEBOOK_PAGE_ID=""
FACEBOOK_PAGE_ACCESS_TOKEN=""
INSTAGRAM_ACCOUNT_ID=""
INSTAGRAM_ACCESS_TOKEN=""
```

### 2. Launch the Web Dashboard
```bash
node D:\OmniClip\cli.mjs ui
```
Open your browser and navigate to: **http://127.0.0.1:4790**

---

## CLI Commands

| Command | Description |
| :--- | :--- |
| `node cli.mjs ui` | Start the Web Dashboard and background Watcher |
| `node cli.mjs watch --auto` | Run the watcher in auto-publish mode (posts immediately when rendered) |
| `node cli.mjs list` | List all videos in Motion Studio with their readiness status |
| `node cli.mjs test` | Test API connections and credentials across all 4 platforms |
| `node cli.mjs publish <project> <job>` | Publish a specific job immediately via command line |

---

## Directory Structure

- `cli.mjs`: Main CLI entry point.
- `src/server.mjs`: HTTP server serving the Web Dashboard and REST/SSO APIs.
- `src/watcher.mjs`: Background directory scanner monitoring Motion Studio `out/`.
- `src/publisher.mjs`: Multi-platform upload orchestrator.
- `src/platforms/`: Platform API drivers:
  - `youtube.mjs`: Resumable upload for YouTube Shorts.
  - `tiktok.mjs`: TikTok Content Posting API v2 driver.
  - `facebook.mjs`: Meta Reels binary chunk upload.
  - `instagram.mjs`: Instagram Reels container creation & publish.
- `ui/`: Web Dashboard interface (vanilla HTML/CSS/JS, zero external framework dependencies).
- `data/`: Local persistent store for publication records (`published.json`) and queues (`queue.json`), preventing duplicate uploads.
