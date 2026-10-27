# Step-by-Step API Setup Guide for OmniClip

This guide explains how to register developer applications and obtain API credentials for each supported platform to configure `D:\OmniClip\.env`.

---

## 1. YOUTUBE SHORTS (YouTube Data API v3)

YouTube is the most stable and easiest channel to configure. No app review is required for personal or internal accounts.

### Step 1: Create a Project in Google Cloud Console
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `OmniClip Publisher`).
3. Go to **APIs & Services** > **Library**, search for **YouTube Data API v3**, and click **Enable**.

### Step 2: Create OAuth 2.0 Credentials
1. Go to **APIs & Services** > **OAuth consent screen**:
   - Select **External**, enter an App name and user support email.
   - Under **Scopes**, add: `https://www.googleapis.com/auth/youtube.upload`.
   - Under **Test users**, add the Gmail address associated with your YouTube channel.
2. Go to **Credentials** > **Create Credentials** > **OAuth client ID**:
   - Application type: **Web application** (or Desktop app).
   - Add Authorized redirect URIs:
     - `http://127.0.0.1:4790/auth/youtube/callback` (for OmniClip one-click SSO login)
     - `https://developers.google.com/oauthplayground` (for manual token generation)
   - Click **Create** and copy your **Client ID** and **Client Secret**.

### Step 3: Obtain Refresh Token via OAuth 2.0 Playground (Manual Method)
1. Open [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Click the gear icon (Settings) in the top right corner:
   - Check **Use your own OAuth credentials**.
   - Paste your **Client ID** and **Client Secret** created in Step 2.
3. In the left column (Step 1), scroll to **YouTube Data API v3** and select `https://www.googleapis.com/auth/youtube.upload`.
4. Click **Authorize APIs** and log in with your YouTube channel account (grant permissions).
5. On Step 2, click **Exchange authorization code for tokens**.
6. Copy the generated **Refresh token**.

*Note:* Alternatively, you can save your Client ID and Client Secret directly in the OmniClip Settings Dashboard (`http://127.0.0.1:4790/#settings`) and click **Sign in with Google / YouTube (SSO)**.

### Step 4: Configure `.env`
```env
YOUTUBE_ENABLED=true
YOUTUBE_CLIENT_ID="<your_client_id>"
YOUTUBE_CLIENT_SECRET="<your_client_secret>"
YOUTUBE_REFRESH_TOKEN="<your_refresh_token>"
```

---

## 2. TIKTOK (Content Posting API & Session Cookie)

### Method A: Fast Connect via Chrome Session Cookie (Recommended)
1. Open Google Chrome and log into your TikTok account at [https://www.tiktok.com](https://www.tiktok.com).
2. Press `F12` to open Developer Tools.
3. Navigate to **Application** > **Cookies** > `https://www.tiktok.com`.
4. Locate the cookie named `sessionid` and copy its **Value**.
5. Paste it into the OmniClip Settings Dashboard or `.env`:
```env
TIKTOK_ENABLED=true
TIKTOK_SESSION_ID="<your_sessionid_cookie_value>"
```

### Method B: TikTok Developer Portal (Content Posting API v2)
1. Visit the [TikTok Developer Portal](https://developers.tiktok.com/).
2. Create a developer account and register a new application.
3. Add the **Content Posting API** product to your app.
4. Required Scopes: `video.upload`, `video.publish`, `user.info.basic`.
5. Add the redirect URI: `http://127.0.0.1:4790/auth/tiktok/callback`.
6. Add credentials to `.env`:
```env
TIKTOK_ENABLED=true
TIKTOK_CLIENT_KEY="<your_client_key>"
TIKTOK_CLIENT_SECRET="<your_client_secret>"
TIKTOK_ACCESS_TOKEN="<your_access_token>"
```

---

## 3. FACEBOOK REELS & INSTAGRAM REELS (Meta Graph API)

### Step 1: Create a Meta App
1. Go to [Meta for Developers](https://developers.facebook.com/).
2. Click **My Apps** > **Create App** > Select type **Business**.
3. Enter an App Name (e.g. `OmniClip Social`).

### Step 2: Link Facebook Page and Instagram Account
1. Ensure you have an active Facebook Fanpage.
2. Switch your Instagram account to a **Professional / Creator Account**.
3. In Facebook Page Settings > **Linked Accounts**, link your Page with your Instagram account.

### Step 3: Obtain Access Token (Graph API Explorer)
1. Navigate to the [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Select your Meta App in the top dropdown.
3. Under **User or Page**, select your Facebook Fanpage.
4. Add permissions:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
   - `publish_video`
   - `instagram_basic`
   - `instagram_content_publish`
5. Click **Generate Access Token**.
6. Open the **Access Token Tool** to convert it to a **Long-Lived Page Access Token** (never expires for Pages).

### Step 4: Retrieve IDs
- **Facebook Page ID**: Found in the "About" section of your Facebook Fanpage.
- **Instagram Business Account ID**: Query in Graph API Explorer:
  `GET /v19.0/me?fields=instagram_business_account` -> Returns your Instagram ID.

### Step 5: Configure `.env`
```env
FACEBOOK_ENABLED=true
FACEBOOK_PAGE_ID="<your_facebook_page_id>"
FACEBOOK_PAGE_ACCESS_TOKEN="<your_long_lived_page_token>"

INSTAGRAM_ENABLED=true
INSTAGRAM_ACCOUNT_ID="<your_instagram_business_account_id>"
INSTAGRAM_ACCESS_TOKEN="<your_page_access_token_with_instagram_permissions>"
```

---

## Verification & Testing

Once your `.env` file is filled in, run the verification command:
```bash
node D:\OmniClip\cli.mjs test
```
When you see a green checkmark `✔` next to each platform, your connections are authenticated and ready for publishing!
