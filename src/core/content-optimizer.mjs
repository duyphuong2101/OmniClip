/**
 * Content Optimizer for OmniClip
 * Optimizes phrasing, Hooks, Call-To-Action (CTA), and generates SEO/Viral Hashtags.
 * Handles diacritic normalization for hashtags and platform-specific tagging tiers.
 */

// Common stop words (English and Vietnamese) to exclude during keyword extraction
const STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'this', 'that', 'from', 'into', 'your', 'about',
  'what', 'when', 'where', 'which', 'who', 'how', 'all', 'any', 'both', 'each',
  'va', 'la', 'cua', 'cho', 'cac', 'nhung', 'mot', 'trong', 'duoc', 'voi', 've',
  'nay', 'khi', 'de', 'tai', 'ra', 'vao', 'den', 'nhu', 'theo', 'nhieu', 'it',
  'co', 'khong', 'the', 'thi', 'ma', 'nen', 'se', 'da', 'dang', 'hay', 'hoac'
]);

// Topic presets for smart niche hashtag suggestions
const TOPIC_PRESETS = [
  {
    keywords: ['business', 'startup', 'sales', 'marketing', 'entrepreneur', 'finance', 'money', 'kinh doanh', 'khoi nghiep', 'ban hang', 'doanh nghiep', 'kiem tien', 'tai chinh'],
    tags: ['#Business', '#Startup', '#Entrepreneurship', '#MarketingTips', '#BusinessLessons', '#Finance']
  },
  {
    keywords: ['tech', 'technology', 'ai', 'artificial intelligence', 'chatgpt', 'software', 'coding', 'programming', 'app', 'tool', 'developer', 'cong nghe', 'tri tue nhan tao', 'phan mem', 'lap trinh'],
    tags: ['#Technology', '#ArtificialIntelligence', '#TechTips', '#Coding', '#AI', '#Software']
  },
  {
    keywords: ['education', 'learning', 'self development', 'skills', 'books', 'mindset', 'success', 'motivation', 'lessons', 'productivity', 'hoc tap', 'phat trien ban than', 'ky nang', 'sach', 'tu duy', 'thanh cong', 'dong luc'],
    tags: ['#SelfImprovement', '#DailyLearning', '#LifeSkills', '#DailyMotivation', '#PositiveMindset', '#Productivity']
  },
  {
    keywords: ['tips', 'guide', 'how to', 'tutorial', 'hacks', 'life hacks', 'secrets', 'meo vat', 'huong dan', 'cach lam', 'bi quyet'],
    tags: ['#TipsAndTricks', '#LifeHacks', '#HowTo', '#Tutorial', '#QuickTips']
  },
  {
    keywords: ['health', 'weight loss', 'fitness', 'gym', 'nutrition', 'workout', 'yoga', 'wellness', 'suc khoe', 'giam can', 'the hinh', 'dinh duong'],
    tags: ['#Health', '#Fitness', '#HealthyLifestyle', '#Workout', '#Wellness']
  },
  {
    keywords: ['entertainment', 'comedy', 'funny', 'humor', 'laugh', 'meme', 'relax', 'giai tri', 'hai huoc', 'vui', 'cuoi', 'thu gian'],
    tags: ['#Comedy', '#Humor', '#DailyLaughs', '#Entertainment', '#Relatable']
  }
];

export const contentOptimizer = {
  /**
   * Strip Vietnamese unicode diacritics (Unicode Normalization)
   */
  removeVietnameseAccents(str = '') {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D');
  },

  /**
   * Convert a phrase into a PascalCase hashtag (e.g. "tech tips" -> "#TechTips")
   */
  toPascalCaseTag(phrase = '') {
    const clean = this.removeVietnameseAccents(phrase)
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .trim();
    if (!clean) return '';

    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';

    const capitalized = words
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');

    return `#${capitalized}`;
  },

  /**
   * Safely truncate text at word boundaries without cutting words in half
   */
  truncateWords(text = '', maxLength = 70) {
    if (!text) return '';
    const clean = text.trim();
    if (clean.length <= maxLength) return clean;

    const sub = clean.slice(0, maxLength);
    const lastSpace = sub.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) {
      return sub.slice(0, lastSpace).trim() + '...';
    }
    return sub.trim() + '...';
  },

  /**
   * Clean and optimize Title (Hook Title with smart intent detection)
   */
  optimizeTitle(rawTitle = '', brief = {}, script = {}) {
    let title = rawTitle || brief.topic || '';

    // If no topic, use the first scene narration from script
    if (!title && script.scenes?.[0]?.text) {
      title = this.truncateWords(script.scenes[0].text, 75);
    }

    if (!title) {
      title = 'Valuable Video Insights';
    }

    title = title.trim();

    // Add smart hook emoji based on semantics if none exists
    const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]/u.test(title);
    if (!hasEmoji && title.length < 80) {
      const lower = this.removeVietnameseAccents(title).toLowerCase();
      let prefix = '';

      if (/mistake|error|warning|danger|careful|avoid|dont|sai lam|dung |canh bao|nguy hiem|can than|tranh /.test(lower)) {
        prefix = '⚠️';
      } else if (/secret|tips|hack|how to|guide|tutorial|method|bi quyet|meo |cach |huong dan|bi kip/.test(lower)) {
        prefix = '💡';
      } else if (/secret|truth|surprise|shocking|unexpected|unbelievable|mindblown|bi mat|su that|bat ngo|ai ngo|it nguoi biet|kinh ngac/.test(lower)) {
        prefix = '🔥';
      } else if (/top|summary|list|steps|ways|tong hop|nhung dieu|danh sach|\d+ buoc|\d+ cach/.test(lower)) {
        prefix = '🚀';
      } else {
        const hooks = ['🔥', '💡', '📌', '✨'];
        prefix = hooks[Math.abs(this.hashCode(title)) % hooks.length];
      }

      title = `${prefix} ${title}`;
    }

    return title;
  },

  /**
   * Generate contextualized Call-To-Action (CTA) based on topic and key message
   */
  generateCTA(topic = '', keyMessage = '') {
    const text = this.removeVietnameseAccents(`${topic} ${keyMessage}`).toLowerCase();

    // Tutorials, how-to, tips, knowledge -> Save CTA
    if (/tips|hack|how|guide|tutorial|learn|lesson|knowledge|formula|meo|cach|huong dan|bi quyet|hoc|kien thuc/.test(text)) {
      return '📌 Save this for later and share it with your friends!\n👉 Follow for more daily tips & insights! ❤️';
    }

    // Discussion, debate, review -> Comment CTA
    if (/think|opinion|review|why|should|perspective|nghi sao|y kien|quan diem|danh gia|tai sao|co nen/.test(text)) {
      return '💬 What are your thoughts on this? Leave a comment below! 👇\n👉 Like ❤️ and Follow to join upcoming discussions!';
    }

    // Default CTA
    const defaultCtas = [
      '👉 Hit Like ❤️ and Follow for insightful videos every day!\n💬 What is your perspective? Comment below! 👇',
      '📌 Found this helpful? Like ❤️ and Follow so you never miss new content!\n💬 Share your thoughts in the comments 👇'
    ];
    return defaultCtas[Math.abs(this.hashCode(topic || keyMessage || 'cta')) % defaultCtas.length];
  },

  /**
   * Construct clean, non-repetitive video description
   */
  buildCleanDescription(brief = {}, script = {}) {
    const parts = [];

    if (brief.keyMessage) {
      parts.push(brief.keyMessage.trim());
    } else if (brief.summary) {
      parts.push(brief.summary.trim());
    } else if (script.scenes && script.scenes.length > 1) {
      // Short summary from subsequent scenes
      const snippet = script.scenes.slice(1, 3).map(s => s.text).join(' ').trim();
      if (snippet) {
        parts.push(this.truncateWords(snippet, 180));
      }
    }

    // Append contextual CTA
    parts.push(this.generateCTA(brief.topic, brief.keyMessage));

    return parts.join('\n\n');
  },

  /**
   * Extract and generate smart SEO/Viral Hashtags
   */
  generateSmartHashtags({ topic = '', keyMessage = '', project = '', isVertical = true, customTags = [] } = {}) {
    const hashtagsSet = new Set();

    // 1. Hashtags passed from config or brief
    if (Array.isArray(customTags)) {
      for (const t of customTags) {
        if (t && typeof t === 'string') {
          const tag = t.startsWith('#') ? t : `#${t}`;
          hashtagsSet.add(tag);
        }
      }
    }

    // 2. Analyze topic and project for niche tags
    const combinedText = `${topic} ${project} ${keyMessage}`.toLowerCase();
    const cleanCombinedNoAccents = this.removeVietnameseAccents(combinedText);

    // Match in TOPIC_PRESETS
    for (const preset of TOPIC_PRESETS) {
      const match = preset.keywords.some(k => 
        cleanCombinedNoAccents.includes(this.removeVietnameseAccents(k))
      );
      if (match) {
        preset.tags.forEach(t => hashtagsSet.add(t));
      }
    }

    // 3. Convert entire topic to hashtag if reasonable length
    if (topic) {
      const wholeTopicTag = this.toPascalCaseTag(topic);
      if (wholeTopicTag && wholeTopicTag.length <= 25 && wholeTopicTag.length >= 4) {
        hashtagsSet.add(wholeTopicTag);
      }

      // Extract 2-word meaningful phrases from topic
      const words = this.removeVietnameseAccents(topic)
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));

      for (let i = 0; i < words.length; i++) {
        // Accept single word if length >= 5 characters
        if (words[i].length >= 5) {
          hashtagsSet.add(`#${words[i].charAt(0).toUpperCase() + words[i].slice(1).toLowerCase()}`);
        }
        // Bigrams
        if (i < words.length - 1 && (words[i] + words[i+1]).length <= 20) {
          const bigram = words[i].charAt(0).toUpperCase() + words[i].slice(1).toLowerCase() +
                         words[i+1].charAt(0).toUpperCase() + words[i+1].slice(1).toLowerCase();
          hashtagsSet.add(`#${bigram}`);
        }
        // Trigrams if concise (<= 24 chars)
        if (i < words.length - 2 && (words[i] + words[i+1] + words[i+2]).length <= 24) {
          const trigram = words[i].charAt(0).toUpperCase() + words[i].slice(1).toLowerCase() +
                          words[i+1].charAt(0).toUpperCase() + words[i+1].slice(1).toLowerCase() +
                          words[i+2].charAt(0).toUpperCase() + words[i+2].slice(1).toLowerCase();
          hashtagsSet.add(`#${trigram}`);
        }
      }
    }

    // 4. Add trending vertical video tags
    if (isVertical) {
      hashtagsSet.add('#Trending');
      hashtagsSet.add('#Viral');
    }

    return Array.from(hashtagsSet).filter(Boolean).slice(0, 10);
  },

  /**
   * Tier and optimize hashtags tailored for each platform
   */
  getPlatformHashtags(platform = '', baseHashtags = [], isVertical = true) {
    const plat = platform.toLowerCase();
    const nicheTags = new Set(baseHashtags);
    const platformLeadTags = [];

    // Strip platform-specific tags from nicheTags for dedicated routing
    const allPlatformTags = [
      '#Shorts', '#YouTubeShorts', '#Short',
      '#TikTok', '#TikTokViral', '#LearnOnTikTok', '#TikTokTrending',
      '#Reels', '#FacebookReels', '#InstagramReels', '#InstaReels', '#ReelsViral'
    ];
    for (const pt of allPlatformTags) {
      nicheTags.delete(pt);
    }

    switch (plat) {
      case 'youtube': {
        if (isVertical) {
          platformLeadTags.push('#Shorts');
          platformLeadTags.push('#YouTubeShorts');
        }
        break;
      }

      case 'tiktok': {
        platformLeadTags.push('#LearnOnTikTok');
        platformLeadTags.push('#TikTokTrending');
        break;
      }

      case 'facebook': {
        if (isVertical) {
          platformLeadTags.push('#Reels');
          platformLeadTags.push('#FacebookReels');
          platformLeadTags.push('#ReelsViral');
        }
        break;
      }

      case 'instagram': {
        if (isVertical) {
          platformLeadTags.push('#Reels');
          platformLeadTags.push('#InstagramReels');
          platformLeadTags.push('#InstaReels');
        }
        break;
      }
    }

    // Combine platform-leading tags with niche tags
    const combined = [...platformLeadTags, ...Array.from(nicheTags)];
    return Array.from(new Set(combined)).filter(Boolean).slice(0, 8);
  },

  /**
   * Build clean caption without repeating title or duplicate hashtags
   */
  buildCaption({ title = '', description = '', hashtags = [], platform = '' }) {
    const parts = [];
    const cleanTitle = (title || '').trim();
    const cleanDesc = (description || '').trim();

    // 1. Hook / Title
    if (cleanTitle) {
      parts.push(cleanTitle);
    }

    // 2. Body (Description / CTA) - only add if body does not start with title
    if (cleanDesc) {
      if (!cleanDesc.startsWith(cleanTitle)) {
        parts.push(cleanDesc);
      } else {
        const remaining = cleanDesc.slice(cleanTitle.length).trim();
        if (remaining) parts.push(remaining);
      }
    }

    // 3. Hashtags
    if (Array.isArray(hashtags) && hashtags.length > 0) {
      parts.push(hashtags.join(' '));
    }

    const fullCaption = parts.join('\n\n').trim();

    // Platform character limits
    if (platform === 'tiktok' || platform === 'facebook') {
      return fullCaption.slice(0, 2000);
    }
    if (platform === 'instagram') {
      return fullCaption.slice(0, 2200);
    }

    return fullCaption;
  },

  hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
};
