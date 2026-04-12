const { parse } = require('node-html-parser');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(200).json({
        title: '', author: '', releaseDate: '', language: 'Other', bodyText: '',
        warning: `Could not fetch this page (${response.status}). This site may require login or block automated access (e.g. Facebook, Instagram). Please fill in the fields manually.`,
      });
    }

    const html = await response.text();
    const root = parse(html);

    const title =
      root.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      root.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
      root.querySelector('title')?.text?.trim() ||
      root.querySelector('h1')?.text?.trim() ||
      '';

    const author = extractAuthor(root);
    const releaseDate = extractDate(root);
    const language = detectLanguage(root.querySelector('html')?.getAttribute('lang') || '');
    const bodyText = extractBodyText(root);
    const mediaUrls = extractMediaUrls(root, url);

    return res.status(200).json({
      title: title.trim(),
      author: author.trim(),
      releaseDate,
      language,
      bodyText,
      mediaUrls,
    });

  } catch (error) {
    console.error('Fetch article error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch article' });
  }
};

function extractAuthor(root) {
  const metaAuthor =
    root.querySelector('meta[name="author"]')?.getAttribute('content') ||
    root.querySelector('meta[property="article:author"]')?.getAttribute('content') ||
    root.querySelector('meta[name="twitter:creator"]')?.getAttribute('content');

  if (metaAuthor) return metaAuthor;

  const jsonLd = extractJsonLd(root);
  if (jsonLd?.author) {
    const a = jsonLd.author;
    if (typeof a === 'string') return a;
    if (Array.isArray(a)) return a.map(x => x.name || x).join(', ');
    if (a.name) return a.name;
  }

  const selectors = [
    '[rel="author"]', '.author', '.byline', '.post-author',
    '[data-testid="author"]', '.article-author', '.writer',
  ];
  for (const sel of selectors) {
    const text = root.querySelector(sel)?.text?.trim();
    if (text && text.length < 100) return text;
  }

  return '';
}

function extractDate(root) {
  const metaDate =
    root.querySelector('meta[property="article:modified_time"]')?.getAttribute('content') ||
    root.querySelector('meta[property="og:updated_time"]')?.getAttribute('content') ||
    root.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
    root.querySelector('meta[itemprop="dateModified"]')?.getAttribute('content') ||
    root.querySelector('meta[itemprop="datePublished"]')?.getAttribute('content') ||
    root.querySelector('meta[name="date"]')?.getAttribute('content');

  if (metaDate) return formatDate(metaDate);

  const jsonLd = extractJsonLd(root);
  if (jsonLd) {
    const date = jsonLd.dateModified || jsonLd.datePublished;
    if (date) return formatDate(date);
  }

  const timeEl = root.querySelector('time[datetime]');
  if (timeEl) return formatDate(timeEl.getAttribute('datetime'));

  return '';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

function detectLanguage(langAttr) {
  const lang = (langAttr || '').toLowerCase();
  if (!lang) return 'Other';
  if (lang.startsWith('en')) return 'English';
  if (lang.startsWith('zh') || lang.startsWith('cmn') || lang === 'yue') return 'Chinese';
  return 'Other';
}

function extractJsonLd(root) {
  try {
    const scripts = root.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const data = JSON.parse(script.text);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = item['@type'];
        if (type === 'Article' || type === 'NewsArticle' || type === 'BlogPosting') {
          return item;
        }
      }
      if (items[0]) return items[0];
    }
  } catch {}
  return null;
}

function extractMediaUrls(root, pageUrl) {
  const mediaUrls = [];
  const origin = new URL(pageUrl).origin;

  // Resolve a potentially relative URL to absolute using the page origin
  function toAbsolute(src) {
    if (!src) return null;
    if (src.startsWith('http')) return src;
    if (src.startsWith('//')) return 'https:' + src;
    if (src.startsWith('/')) return origin + src;
    return null; // skip ambiguous relative paths like "images/foo.jpg"
  }

  // Priority 1: OG metadata — site-declared representative media, no size filtering needed
  const ogImage = toAbsolute(
    root.querySelector('meta[property="og:image:secure_url"]')?.getAttribute('content') ||
    root.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
    root.querySelector('meta[name="og:image"]')?.getAttribute('content')
  );
  const ogVideo = toAbsolute(
    root.querySelector('meta[property="og:video"]')?.getAttribute('content') ||
    root.querySelector('meta[property="og:video:url"]')?.getAttribute('content')
  );

  if (ogImage) mediaUrls.push({ type: 'Image', url: ogImage });
  if (ogVideo) mediaUrls.push({ type: 'Video', url: ogVideo });

  // Always scan article body for additional images — OG image is just the cover,
  // articles typically have many more figures and illustrations worth keeping.
  const seen = new Set(mediaUrls.map(m => m.url));
  {
    const doc = parse(root.toString());
    ['script', 'style', 'nav', 'footer', 'header', 'aside', 'noscript'].forEach(sel =>
      doc.querySelectorAll(sel).forEach(el => el.remove())
    );

    // Focus on the main content area to avoid nav/UI images
    const contentEl =
      doc.querySelector('article') ||
      doc.querySelector('main') ||
      doc.querySelector('[role="main"]') ||
      doc.querySelector('.article-body') ||
      doc.querySelector('#content') ||
      doc;

    function addMedia(type, url) {
      if (!url || seen.has(url)) return;
      seen.add(url);
      mediaUrls.push({ type, url });
    }

    // Collect <video> src and poster attributes
    for (const video of contentEl.querySelectorAll('video')) {
      addMedia('Image', toAbsolute(video.getAttribute('poster')));
      addMedia('Video', toAbsolute(video.getAttribute('src')));
    }

    // Collect <img> tags
    for (const img of contentEl.querySelectorAll('img')) {
      const src = toAbsolute(
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src')
      );
      if (!src) continue;

      // Check HTML attributes first (explicit dimensions)
      const attrW = parseInt(img.getAttribute('width') || '0', 10);
      const attrH = parseInt(img.getAttribute('height') || '0', 10);
      if (attrW >= 400 && attrH >= 300) {
        addMedia('Image', src);
        continue;
      }

      // Most modern pages use CSS sizing — no HTML attributes present.
      // Fall back to URL heuristics: skip obvious icons/logos/avatars/buttons.
      if (attrW === 0 && attrH === 0) {
        const lower = src.toLowerCase();
        const isDecorative = /icon|logo|avatar|badge|button|sprite|pixel|tracking|1x1|placeholder/i.test(lower);
        const hasImageExt = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(lower);
        if (!isDecorative && hasImageExt) {
          addMedia('Image', src);
        }
      }
    }
  }

  return mediaUrls;
}

function extractBodyText(root) {
  // Work on a fresh parse to avoid mutating the original
  const doc = parse(root.toString());

  const removeSelectors = [
    'script', 'style', 'nav', 'footer', 'header', 'aside',
    'noscript', 'iframe', '.ad', '.advertisement', '.sidebar',
    '.related', '.comments', '.social-share',
  ];
  for (const sel of removeSelectors) {
    doc.querySelectorAll(sel).forEach(el => el.remove());
  }

  const contentEl =
    doc.querySelector('article') ||
    doc.querySelector('main') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('.article-body') ||
    doc.querySelector('.post-content') ||
    doc.querySelector('.entry-content') ||
    doc.querySelector('#content') ||
    doc.querySelector('body');

  if (!contentEl) return '';

  return contentEl.text
    .replace(/\t/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
