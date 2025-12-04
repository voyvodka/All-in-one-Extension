export const isInstagram = (url) => {
  try {
    const { hostname } = new URL(url);
    // Paylaşım paneli ana sayfa/profilde de açılabildiği için sadece alan adına bak.
    const hostMatch = hostname.endsWith('instagram.com') || hostname === 'www.instagram.com';
    return hostMatch;
  } catch {
    return false;
  }
};

export const INSTAGRAM_DOWNLOAD_MENU_ATTR = 'data-aio-instagram-download-menu';

function normalizeReelUrl(href) {
  if (!href) return null;
  try {
    const url = new URL(href, 'https://www.instagram.com');
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'reels') {
      segments[0] = 'reel';
    }
    url.pathname = segments.length ? `/${segments.join('/')}/` : '/';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export function getReelUrl() {
  const absolutize = (href) => normalizeReelUrl(href);

  const fromDialogOrArticle = (() => {
    const dialog = document.querySelector('div[role="dialog"]');
    const focusArticle = document.activeElement?.closest?.('article') || null;
    const dialogArticle = dialog?.querySelector('article') || dialog?.closest('article') || null;
    const pageArticle = document.querySelector('article');
    const scopes = [focusArticle, dialogArticle, pageArticle, document];
    for (const scope of scopes) {
      if (!scope) continue;
      const link =
        scope.querySelector('a[href*="/reel/"]') ||
        scope.querySelector('a[href*="/p/"]');
      const candidate = absolutize(link?.getAttribute('href'));
      if (candidate) return candidate;
    }
    return null;
  })();
  if (fromDialogOrArticle) return fromDialogOrArticle;

  const og = normalizeReelUrl(document.querySelector('meta[property="og:url"]')?.getAttribute('content'));
  if (og) return og;

  const canonical = normalizeReelUrl(document.querySelector('link[rel="canonical"]')?.href);
  if (canonical) return canonical;

  return normalizeReelUrl(location.href) || location.href;
}

export function getReelTitle() {
  const titleFromDialog = (() => {
    const dialog = document.querySelector('div[role="dialog"]');
    const article = dialog?.closest('article') || dialog?.querySelector('article') || document.querySelector('article');
    if (!article) return null;

    const caption = article.querySelector('h1, h2, h3, [data-testid="post-comment-root"] span[dir]')?.textContent;
    if (caption) return caption.trim();

    const altText = article.querySelector('img[alt]')?.getAttribute('alt');
    if (altText) return altText.trim();

    return null;
  })();
  if (titleFromDialog) return titleFromDialog;

  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle) return ogTitle.trim();

  const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
  if (twitterTitle) return twitterTitle.trim();

  if (document.title) return document.title.replace(/\s*-?\s*Instagram$/i, '').trim();

  return 'instagram-reel';
}

export function findShareOptionTemplate(dialog) {
  const options = Array.from(dialog.querySelectorAll('div[role="button"][tabindex], a[role="link"]'))
    .filter((el) => {
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();
      if (aria.includes('close') || title.includes('close')) return false;
      if (aria.includes('kapat') || title.includes('kapat')) return false;
      return true;
    });

  return options.find((el) => /copy\s*link|linki\s*kopyala|bağlantı\s*kopyala/i.test(el.textContent || '')) || options[0] || null;
}

export function createInstagramOption(template, { attr, label, onClick }) {
  const wrapper = template?.parentElement ? template.parentElement.cloneNode(true) : document.createElement('div');
  if (!wrapper) return null;

  const button = wrapper.querySelector('div[role="button"], a[role="link"]') || template;
  if (!button) return null;

  wrapper.setAttribute(attr, 'true');
  button.setAttribute('role', 'button');
  button.tabIndex = 0;
  button.setAttribute('aria-label', label);
  button.removeAttribute('href');
  button.removeAttribute('target');
  button.removeAttribute('rel');

  const cleanButton = button.cloneNode(true);
  button.replaceWith(cleanButton);

  cleanButton.addEventListener('click', onClick);
  cleanButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event);
    }
  });

  const labelEl = cleanButton.querySelector('span') || cleanButton;
  labelEl.textContent = label;

  const svg = cleanButton.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML = '<path d="M9 3h2v9.528a3.25 3.25 0 1 1-2 2.97V3zm6 3h2v6.528a3.25 3.25 0 1 1-2 2.97V6z" fill="currentColor"/>';
  }

  return wrapper;
}

function pickFromSrcset(srcset) {
  if (!srcset) return { url: null, width: 0 };
  return srcset
    .split(',')
    .map((entry) => entry.trim())
    .map((entry) => {
      const [url, size] = entry.split(/\s+/);
      const width = parseInt((size || '').replace(/\D/g, ''), 10);
      return { url, width: Number.isFinite(width) ? width : 0 };
    })
    .sort((a, b) => b.width - a.width)[0] || { url: null, width: 0 };
}

function parseWidthFromUrl(url) {
  if (!url) return 0;
  try {
    const target = new URL(url, location.href);
    const combined = `${target.pathname}${target.search}`;
    const matchSp = combined.match(/(?:[sp])(\d{2,4})x(\d{2,4})/i);
    if (matchSp) {
      const w = parseInt(matchSp[1], 10);
      return Number.isFinite(w) ? w : 0;
    }
    const matchPlain = combined.match(/(\d{3,4})x(\d{3,4})/);
    if (matchPlain) {
      const w = parseInt(matchPlain[1], 10);
      return Number.isFinite(w) ? w : 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

function normalizeMediaUrl(raw) {
  if (!raw) return null;
  if (/^blob:|^data:/i.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  try {
    return new URL(raw, location.href).href;
  } catch {
    return null;
  }
}

function inferExt(url, fallback) {
  if (!url) return fallback;
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})(?:$|\?)/i);
    if (match?.[1]) {
      const ext = match[1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'mp4', 'm4v', 'mov'].includes(ext)) {
        return ext;
      }
    }
  } catch {
    // ignore
  }
  return fallback;
}

function isLikelyAvatar({ url, alt, width }) {
  const altText = (alt || '').toLowerCase();
  const urlText = (url || '').toLowerCase();
  const small = Number.isFinite(width) && width > 0 && width <= 200;
  if (/profile\s*picture|profil\s*fotograf|profil\s*foto|profil\s*fotografi/.test(altText)) return true;
  if (/profile_pic|pfp|avatar/.test(urlText)) return true;
  if (small && /s\d{2,3}x\d{2,3}/.test(urlText)) return true;
  return false;
}

export function getActiveInstagramArticle() {
  const dialog = document.querySelector('div[role="dialog"]');
  const dialogArticle = dialog?.querySelector('article') || dialog?.closest('article');
  if (dialogArticle) return dialogArticle;

  const focusArticle = document.activeElement?.closest?.('article');
  if (focusArticle) return focusArticle;

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const visibleArticles = Array.from(document.querySelectorAll('article')).map((el) => {
    const rect = el.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    return { el, area: visibleWidth * visibleHeight };
  });
  const bestVisible = visibleArticles.sort((a, b) => b.area - a.area)[0];
  if (bestVisible?.area > 0) return bestVisible.el;

  return document.querySelector('article');
}

export function findInstagramActionBar(article) {
  const scope = article || getActiveInstagramArticle() || document;
  const shareSvg =
    scope.querySelector('svg[aria-label="Share"]') ||
    scope.querySelector('svg[aria-label="Share Post"]') ||
    scope.querySelector('svg[aria-label="Paylaş"]');
  const shareButton = shareSvg?.closest('[role="button"]');
  if (!shareButton) return { actionBar: null, shareButton: null };
  const actionBar =
    shareButton.closest('section') ||
    shareButton.parentElement ||
    shareButton.closest('[class]');
  return { actionBar, shareButton };
}

export function createActionBarDownloadButton(templateButton, { attr, label, onClick }) {
  if (!templateButton) return null;
  const button = templateButton.cloneNode(true);
  button.setAttribute(attr, 'true');
  button.dataset.aioButton = 'true';
  button.setAttribute('role', 'button');
  button.tabIndex = 0;
  button.setAttribute('aria-label', label);
  button.removeAttribute('href');
  button.removeAttribute('target');
  button.removeAttribute('rel');

  button.querySelectorAll('*').forEach((el) => {
    el.removeAttribute?.('href');
    el.removeAttribute?.('target');
    el.removeAttribute?.('rel');
  });

  const svg = button.querySelector('svg');
  if (svg) {
    svg.setAttribute('aria-label', 'İndir');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.removeAttribute('preserveAspectRatio'); // IG ile aynı davranış

    svg.innerHTML = `
      <title>İndir</title>
      <path
        d="M12 3v11
          M7 11l5 5 5-5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <line
        x1="1" y1="22"
        x2="23" y2="22"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    `;
  }



  button.addEventListener('click', onClick);
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event);
    }
  });

  return button;
}

export function findInstagramMediaSources(targetArticle) {
  const article = targetArticle || getActiveInstagramArticle();
  const scope = article || document;

  const media = [];
  let hasVideoElement = false;
  const addMedia = (rawUrl, type, weight = 0, extra = {}) => {
    const url = normalizeMediaUrl(rawUrl);
    if (!url) return;
    media.push({
      url,
      type,
      weight: Number.isFinite(weight) ? weight : 0,
      ext: inferExt(url, type === 'image' ? 'jpg' : 'mp4'),
      ...extra
    });
  };

  scope.querySelectorAll('video').forEach((video) => {
    hasVideoElement = true;
    const src = video.currentSrc || video.getAttribute('src');
    const weight = video.videoWidth || parseInt(video.getAttribute('width'), 10) || parseWidthFromUrl(src) || 0;
    addMedia(src, 'video', weight);
    video.querySelectorAll('source[src]').forEach((source) => {
      const raw = source.getAttribute('src');
      const res = parseInt(source.getAttribute('res') || source.getAttribute('data-res') || source.getAttribute('size') || '', 10) || parseWidthFromUrl(raw) || 0;
      addMedia(raw, 'video', res);
    });
  });

  scope.querySelectorAll('img').forEach((img) => {
    const fromSrcset = pickFromSrcset(img.getAttribute('srcset'));
    const candidate = fromSrcset.url || img.currentSrc || img.getAttribute('src');
    const weight = fromSrcset.width || img.naturalWidth || parseInt(img.getAttribute('width'), 10) || parseWidthFromUrl(candidate) || 0;
    const isAvatar = isLikelyAvatar({ url: candidate, alt: img.getAttribute('alt'), width: weight });
    const normalized = normalizeMediaUrl(candidate);
    if (!normalized) return;
    media.push({
      url: normalized,
      type: 'image',
      weight: Number.isFinite(weight) ? weight : 0,
      ext: inferExt(normalized, 'jpg'),
      isAvatar,
      element: img
    });
  });

  const imagesAll = media.filter((item) => item.type === 'image');
  const images = imagesAll.filter((item) => !item.isAvatar);
  const visibleImages = images
    .map((img) => ({
      ...img,
      visibleScore: visibilityScore(img.element)
    }))
    .filter((img) => img.visibleScore > 0.05);
  const bestVideo = media
    .filter((item) => item.type === 'video')
    .sort((a, b) => b.weight - a.weight)[0] || null;
  const imagePool = images.length ? images : imagesAll;
  const bestImage = (imagePool.length ? imagePool : imagesAll)
    .sort((a, b) => b.weight - a.weight)[0] || null;
  const visibleImage = (visibleImages.length ? visibleImages : imagePool)
    .sort((a, b) => (b.visibleScore || 0) - (a.visibleScore || 0) || b.weight - a.weight)[0] || null;

  return {
    bestVideo,
    bestImage,
    visibleImage,
    images,
    all: media,
    hasVideo: hasVideoElement
  };
}

function isElementVisible(el) {
  return visibilityScore(el) >= 0.1;
}

function visibilityScore(el) {
  if (!el) return 0;
  const style = window.getComputedStyle ? getComputedStyle(el) : null;
  if (style) {
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) <= 0.05) return 0;
  }
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const visibleWidth = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  const area = rect.width * rect.height;
  const visibleArea = visibleWidth * visibleHeight;
  if (area <= 0) return 0;
  return visibleArea / area;
}
