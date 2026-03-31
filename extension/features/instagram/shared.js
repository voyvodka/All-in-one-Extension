import { t } from '../../shared/i18n.js';

export const isInstagram = (url) => {
  try {
    const { hostname } = new URL(url);
    const hostMatch = hostname.endsWith('instagram.com') || hostname === 'www.instagram.com';
    return hostMatch;
  } catch {
    return false;
  }
};

export const INSTAGRAM_DOWNLOAD_MENU_ATTR = 'data-aio-instagram-download-menu';
const MENU_MENU_ATTR = `${INSTAGRAM_DOWNLOAD_MENU_ATTR}-menu`;
const BOUND_FLAG = 'true';
const menuProviders = new Map();
let menuObserver = null;
let openMenu = null;
let injectScheduled = false;
let injectingMenuButtons = false;
let lastInjectAt = 0;
let burstStart = 0;
let burstCount = 0;
let resumeObserverTimer = null;

function buildAriaSelectors(labels) {
  const icons = labels.map((label) => `svg[aria-label="${label}"]`);
  const buttons = labels.flatMap((label) => [
    `[role="button"][aria-label="${label}"]`,
    `button[aria-label="${label}"]`
  ]);
  return {
    labels,
    icons,
    buttons,
    all: [...icons, ...buttons]
  };
}

const ACTION_BUTTON_SELECTOR = '[role="button"],button';
const ACTION_BAR_MAX_BUTTONS = 12;

// Instagram always keeps SVG aria-labels in English regardless of UI language.
// These are navigation / media-control SVG labels that should never count as
// social action buttons.
const NAV_CONTROL_SVG_LABELS = new Set([
  'previous', 'next', 'back', 'close',
  'play', 'pause',
  'audio is muted', 'audio is on', 'toggle audio',
  'down chevron icon', 'chevron down',
]);

function normalizeComparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getElementLabel(node) {
  if (!node) return '';
  const label =
    node.getAttribute?.('aria-label') ||
    node.getAttribute?.('title') ||
    node.querySelector?.('title')?.textContent ||
    node.textContent ||
    '';
  return normalizeComparableText(label);
}

function getImmediateChild(root, node) {
  let cur = node;
  while (cur && cur.parentElement !== root) {
    cur = cur.parentElement;
  }
  return cur && cur.parentElement === root ? cur : null;
}

function isKnownShareButton(button) {
  if (!button) return false;
  if (button.matches?.(SHARE_SELECTOR)) return true;
  return Boolean(button.querySelector?.(SHARE_SELECTOR));
}

function isKnownSaveButton(button) {
  const label = getElementLabel(button);
  return label.includes('save') || label.includes('kaydet');
}

function isLikelyActionButton(button) {
  if (!button?.matches?.(ACTION_BUTTON_SELECTOR)) return false;
  if (button.hasAttribute?.(INSTAGRAM_DOWNLOAD_MENU_ATTR) || button.closest?.(`[${INSTAGRAM_DOWNLOAD_MENU_ATTR}]`)) {
    return false;
  }
  if (!button.querySelector?.('svg')) return false;
  if (button.querySelector('img, video, picture, canvas')) return false;
  if (button.querySelector('h1, h2, h3, h4, h5, h6')) return false;

  // Instagram keeps SVG aria-labels in English regardless of UI language —
  // use this as a language-agnostic way to exclude nav/media-control buttons.
  const svgLabel = normalizeComparableText(
    button.querySelector('svg')?.getAttribute('aria-label') || ''
  );
  if (svgLabel && NAV_CONTROL_SVG_LABELS.has(svgLabel)) return false;

  const label = getElementLabel(button);
  if (label.length > 48) return false;

  const rect = typeof button.getBoundingClientRect === 'function' ? button.getBoundingClientRect() : null;
  if (rect && rect.width > 0 && rect.height > 0) {
    if (rect.width > 180 || rect.height > 120) return false;
  }

  return true;
}

function getLikelyActionButtons(scope) {
  if (!scope?.querySelectorAll) return [];
  const buttons = new Set();
  scope.querySelectorAll(ACTION_BUTTON_SELECTOR).forEach((node) => {
    if (!isLikelyActionButton(node)) return;
    buttons.add(node);
  });
  return Array.from(buttons);
}

function getDirectChildButtonGroups(root) {
  if (!root?.children) return [];
  return Array.from(root.children)
    .map((child) => ({ node: child, buttons: getLikelyActionButtons(child) }))
    .filter(({ buttons }) => buttons.length);
}

function hasMoreSpecificActionChild(root, anchor) {
  const directChild = getImmediateChild(root, anchor);
  if (!directChild || directChild === anchor) return false;
  return getLikelyActionButtons(directChild).length >= 2;
}

function scoreActionBarCandidate(node, { requireSingleShare = false } = {}) {
  if (!node?.querySelectorAll) return Number.NEGATIVE_INFINITY;

  const buttons = getLikelyActionButtons(node);
  const count = buttons.length;
  if (count < 2 || count > ACTION_BAR_MAX_BUTTONS) {
    return Number.NEGATIVE_INFINITY;
  }

  const childGroups = getDirectChildButtonGroups(node);
  const primaryGroupCount = childGroups.reduce((max, group) => Math.max(max, group.buttons.length), 0);
  const shareCount = buttons.filter((button) => isKnownShareButton(button)).length;
  const hasKnownSave = buttons.some((button) => isKnownSaveButton(button));
  const mediaCount = node.querySelectorAll('img, video, picture').length;
  const textLength = normalizeComparableText(node.textContent || '').replace(/\b\d+\b/g, '').length;

  let score = 0;
  score += Math.max(0, 14 - (Math.abs(count - 4) * 3));
  score += Math.min(8, primaryGroupCount * 3);
  if (childGroups.length >= 2) score += 4;
  if (node.tagName === 'SECTION') score += 5;
  if (node.tagName === 'DIV') score += 2;
  if (node.tagName === 'HEADER') score -= 20;

  if (shareCount === 1) {
    score += 6;
  } else if (shareCount > 1) {
    score -= 3;
  } else if (requireSingleShare) {
    score -= 2;
  }

  if (hasKnownSave) score += 2;

  if (mediaCount === 0) {
    score += 4;
  } else {
    score -= Math.min(10, mediaCount * 2);
  }

  if (textLength <= 24) {
    score += 3;
  } else if (textLength > 80) {
    score -= 6;
  }

  if (node.querySelector('input, textarea, form')) {
    score -= 10;
  }

  return score;
}

function pickTemplateButton(actionBar) {
  const shareButton = findShareButton(actionBar);
  if (shareButton) return shareButton;

  const childGroups = getDirectChildButtonGroups(actionBar)
    .sort((a, b) => b.buttons.length - a.buttons.length);
  const primaryGroup = childGroups[0];
  if (primaryGroup?.buttons?.length) {
    return primaryGroup.buttons[primaryGroup.buttons.length - 1];
  }

  const buttons = getLikelyActionButtons(actionBar);
  return buttons[buttons.length - 1] || null;
}

const ACTION_ARIA_LABELS = [
  'Share',
  'Share Post',
  'Paylaş',
  'Like',
  'Unlike',
  'Beğen',
  'Comment',
  'Save'
];
const SHARE_ARIA_LABELS = ['Share', 'Share Post', 'Paylaş'];
const ACTION_SELECTORS = buildAriaSelectors(ACTION_ARIA_LABELS);
const SHARE_SELECTORS = buildAriaSelectors(SHARE_ARIA_LABELS);
const ACTION_SELECTOR = ACTION_SELECTORS.all.join(',');
const SHARE_SELECTOR = SHARE_SELECTORS.all.join(',');

function findShareButton(scope) {
  if (!scope) return null;
  const directMatch = scope.matches?.(SHARE_SELECTOR) ? scope : null;
  const shareEl = directMatch || scope.querySelector?.(SHARE_SELECTOR);
  if (!shareEl) return null;
  return shareEl.closest?.('[role="button"], button') || shareEl;
}

function getUniqueButtonsBySelector(scope, selector) {
  if (!scope?.querySelectorAll) return [];
  const buttons = new Set();
  scope.querySelectorAll(selector).forEach((el) => {
    const button = el.closest?.('[role="button"], button') || el;
    if (button) buttons.add(button);
  });
  return Array.from(buttons);
}

function countShareButtons(scope) {
  return getUniqueButtonsBySelector(scope, SHARE_SELECTOR).length;
}

function countActionIcons(scope) {
  return getLikelyActionButtons(scope).length;
}

function findActionBarContainer(startEl, { requireSingleShare = false, stopAt = null } = {}) {
  const limit = stopAt || startEl?.closest?.('article') || null;
  const search = (stopNode, mustBeSingleShare) => {
    let node = startEl && startEl.nodeType === 1 ? startEl : startEl?.parentElement || null;
    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    while (node && node !== document.body) {
      const score = scoreActionBarCandidate(node, { requireSingleShare: mustBeSingleShare });
      if (score > Number.NEGATIVE_INFINITY && !hasMoreSpecificActionChild(node, startEl)) {
        return node;
      }
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
      if (stopNode && node === stopNode) break;
      node = node.parentElement;
    }
    return bestScore > Number.NEGATIVE_INFINITY ? best : null;
  };

  let found = search(limit, requireSingleShare);
  if (found) return found;
  if (requireSingleShare) {
    found = search(limit, false);
    if (found) return found;
  }
  if (limit) {
    found = search(null, requireSingleShare);
    if (found) return found;
    if (requireSingleShare) return search(null, false);
  }
  return null;
}

function normalizeReelUrl(href) {
  if (!href) return null;
  try {
    const url = new URL(href, 'https://www.instagram.com');
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'reels' && segments.length > 1) {
      segments[0] = 'reel';
    }

    // Keep only canonical media permalink paths.
    let kind = segments[0];
    let shortcode = segments[1];
    if (!['reel', 'p', 'tv'].includes(kind) && segments.length > 2) {
      const altKind = segments[1] === 'reels' ? 'reel' : segments[1];
      if (['reel', 'p', 'tv'].includes(altKind)) {
        kind = altKind;
        shortcode = segments[2];
      }
    }
    if (!kind || !shortcode) return null;
    if (!['reel', 'p', 'tv'].includes(kind)) return null;
    if (kind === 'reel' && shortcode === 'audio') return null;

    url.pathname = `/${kind}/${shortcode}/`;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function findPermalinkInScope(scope) {
  if (!scope?.querySelectorAll) return null;
  const anchors = Array.from(scope.querySelectorAll('a[href]'));
  let best = null;
  let bestScore = -1;
  let firstCandidate = null;
  for (const a of anchors) {
    const href = a.getAttribute('href');
    if (!href) continue;
    if (!href.includes('/reel/') && !href.includes('/reels/') && !href.includes('/p/') && !href.includes('/tv/')) continue;
    const normalized = normalizeReelUrl(href);
    if (!normalized) continue;
    if (!firstCandidate) firstCandidate = normalized;
    const container = a.closest('article, section, div') || a;
    const score = visibilityScore(container);
    if (score > bestScore) {
      bestScore = score;
      best = normalized;
    }
  }
  return best || firstCandidate;
}

export function getReelUrl(scopeHint = null) {
  if (isReelsFeedPage()) {
    const fromLocation = normalizeReelUrl(location.href);
    if (fromLocation) return fromLocation;
  }

  const fromDialogOrArticle = (() => {
    const dialog = document.querySelector('div[role="dialog"]');
    const focusArticle = document.activeElement?.closest?.('article') || null;
    const dialogArticle = dialog?.querySelector('article') || dialog?.closest('article') || null;
    const pageArticle = document.querySelector('article');
    const detectedScope = detectInstagramScope?.()?.scope || null;
    const scopes = [scopeHint, focusArticle, dialogArticle, detectedScope, pageArticle, document];
    for (const scope of scopes) {
      if (!scope) continue;
      const candidate = findPermalinkInScope(scope);
      if (candidate) return candidate;
    }
    return null;
  })();
  if (fromDialogOrArticle) return fromDialogOrArticle;

  const og = normalizeReelUrl(document.querySelector('meta[property="og:url"]')?.getAttribute('content'));
  if (og) return og;

  const canonical = normalizeReelUrl(document.querySelector('link[rel="canonical"]')?.href);
  if (canonical) return canonical;

  return normalizeReelUrl(location.href);
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
  if (/profile\s*picture|profil\s*fotograf|profil\s*foto|profil\s*fotografi|profil\s*resmi/.test(altText)) return true;
  if (/profile_pic|pfp|avatar/.test(urlText)) return true;
  if (small && /s\d{2,3}x\d{2,3}/.test(urlText)) return true;
  return false;
}

export const INSTAGRAM_SCOPE_TYPES = {
  dialog: 'dialog',
  article: 'article',
  reelsFeed: 'reels-feed',
  postPage: 'post-page',
  page: 'page'
};

function isReelsFeedPage() {
  try {
    const segments = String(location?.pathname || '/').split('/').filter(Boolean);
    if (!segments.length) return false;
    const idx = segments.findIndex((seg) => seg === 'reels' || seg === 'reel');
    if (idx === -1) return false;
    if (segments.length === idx + 1) return true;
    const main = document.querySelector('main[role="main"]') || document.querySelector('main');
    const videoCount = (main || document).querySelectorAll('video').length;
    return videoCount > 1;
  } catch {
    return false;
  }
}

function isPostPermalinkPage() {
  try {
    const segments = String(location?.pathname || '/').split('/').filter(Boolean);
    if (!segments.length) return false;
    if (isReelsFeedPage()) return false;
    const idx = segments.findIndex((seg) => seg === 'p' || seg === 'reel' || seg === 'reels' || seg === 'tv');
    if (idx === -1) return false;
    if (segments[idx] === 'reels' && segments.length === idx + 1) return false;
    return segments.length > idx + 1;
  } catch {
    return false;
  }
}

function findPostPageScope(root = document) {
  const selectors = [
    'div[role=\"presentation\"] ul._acay',
    'ul._acay',
    'div._aagu',
    'div._aagv',
    'div._acnb',
    'div.html-div'
  ];

  const stopAt =
    root && root.nodeType === 1 && typeof root.closest === 'function'
      ? root.closest('main[role=\"main\"]')
      : null;
  const pickContainer = (el) => {
    if (!el) return null;
    let cur = el.closest('article, section, div') || el;
    while (cur && cur !== stopAt && cur !== document.body) {
      const mediaCount = cur.querySelectorAll('img, video, picture').length;
      if (mediaCount > 0 && mediaCount < 50) return cur;
      cur = cur.parentElement;
    }
    return null;
  };

  for (const selector of selectors) {
    const el = root.querySelector(selector);
    const container = pickContainer(el);
    if (container) return container;
  }

  const firstImg = root.querySelector('img');
  const imgContainer = pickContainer(firstImg);
  if (imgContainer) return imgContainer;

  const firstVideo = root.querySelector('video');
  const videoContainer = pickContainer(firstVideo);
  if (videoContainer) return videoContainer;

  return null;
}

export function detectInstagramScope() {
  const reelsFeed = isReelsFeedPage();
  const postPermalink = isPostPermalinkPage();

  const dialog = document.querySelector('div[role="dialog"]');
  if (dialog) {
    const dialogPostScope = findPostPageScope(dialog);
    if (dialogPostScope) {
      return { scope: dialogPostScope, type: INSTAGRAM_SCOPE_TYPES.dialog };
    }
  }
  const dialogArticle = dialog?.querySelector('article') || dialog?.closest('article');
  if (dialogArticle || dialog) {
    return { scope: dialogArticle || dialog, type: INSTAGRAM_SCOPE_TYPES.dialog };
  }

  // On the main reels feed page, treat the whole page/main as reels scope even if
  // stray <article> nodes exist elsewhere in the DOM.
  if (reelsFeed) {
    const main = document.querySelector('main[role="main"]') || document.querySelector('main');
    const postScope = findPostPageScope(main || document);
    return { scope: main || postScope || document, type: INSTAGRAM_SCOPE_TYPES.reelsFeed };
  }

  if (postPermalink) {
    const main = document.querySelector('main[role="main"]') || document.querySelector('main');
    const postScope = findPostPageScope(main || document);
    return { scope: postScope || main || document, type: INSTAGRAM_SCOPE_TYPES.postPage };
  }

  const focusArticle = document.activeElement?.closest?.('article');
  if (focusArticle) {
    return { scope: focusArticle, type: INSTAGRAM_SCOPE_TYPES.article };
  }

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const visibleArticles = Array.from(document.querySelectorAll('article')).map((el) => {
    const rect = el.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    return { el, area: visibleWidth * visibleHeight };
  });
  const bestVisible = visibleArticles.sort((a, b) => b.area - a.area)[0];
  if (bestVisible?.area > 0) {
    return { scope: bestVisible.el, type: INSTAGRAM_SCOPE_TYPES.article };
  }

  const main = document.querySelector('main[role="main"]') || document.querySelector('main');
  const postScope = findPostPageScope(main || document);
  if (postScope) {
    return { scope: postScope, type: INSTAGRAM_SCOPE_TYPES.postPage };
  }
  if (main) {
    return { scope: main, type: INSTAGRAM_SCOPE_TYPES.postPage };
  }

  return { scope: document, type: INSTAGRAM_SCOPE_TYPES.page };
}

export function getActiveInstagramArticle() {
  const { scope } = detectInstagramScope();
  return scope || document;
}

export function findInstagramActionBar(article) {
  const scope = article || getActiveInstagramArticle() || document;
  const shareButton = findShareButton(scope);
  let templateButton = shareButton;
  let actionBar = null;

  if (shareButton) {
    actionBar =
      findActionBarContainer(shareButton, { requireSingleShare: true }) ||
      findActionBarContainer(shareButton);
  }

  if (!actionBar) {
    const buttons = getLikelyActionButtons(scope);
    let bestScore = Number.NEGATIVE_INFINITY;

    buttons.forEach((button) => {
      const candidateBar = findActionBarContainer(button);
      if (!candidateBar) return;

      const candidateScore = scoreActionBarCandidate(candidateBar);
      if (candidateScore <= bestScore) return;

      bestScore = candidateScore;
      actionBar = candidateBar;
      templateButton = pickTemplateButton(candidateBar) || button;
    });
  }

  if (!templateButton && actionBar) {
    templateButton = pickTemplateButton(actionBar);
  }

  if (!templateButton) return { actionBar: null, shareButton: null };

  actionBar =
    actionBar ||
    findActionBarContainer(templateButton, { requireSingleShare: Boolean(shareButton) }) ||
    findActionBarContainer(templateButton) ||
    templateButton.closest('section') ||
    templateButton.parentElement ||
    templateButton.closest('[class]');
  return { actionBar, shareButton: templateButton };
}

export function getInstagramActionContainers() {
  const containers = new Set();
  document.querySelectorAll('article').forEach((el) => containers.add(el));

  const dialog = document.querySelector('div[role="dialog"]');
  if (dialog) containers.add(dialog);

  const detected = detectInstagramScope();
  if (detected?.scope) containers.add(detected.scope);

  getLikelyActionButtons(document).forEach((button) => {
    const candidate =
      button.closest('article') ||
      button.closest('section') ||
      button.closest('[class]') ||
      button.parentElement;
    if (candidate) containers.add(candidate);
  });

  return Array.from(containers);
}

function collectInstagramActionBars() {
  const actionBars = new Map();
  const shareButtons = getUniqueButtonsBySelector(document, SHARE_SELECTOR);
  shareButtons.forEach((shareButton) => {
    const actionBar =
      findActionBarContainer(shareButton, { requireSingleShare: true }) ||
      findActionBarContainer(shareButton);
    if (!actionBar || actionBars.has(actionBar)) return;
    actionBars.set(actionBar, shareButton);
  });

  getInstagramActionContainers().forEach((container) => {
    const result = findInstagramActionBar(container);
    if (!result.actionBar || !result.shareButton || actionBars.has(result.actionBar)) return;
    actionBars.set(result.actionBar, result.shareButton);
  });

  if (actionBars.size) {
    return Array.from(actionBars, ([actionBar, shareButton]) => ({ actionBar, shareButton }));
  }

  getLikelyActionButtons(document).forEach((button) => {
    const actionBar = findActionBarContainer(button);
    if (!actionBar || actionBars.has(actionBar)) return;
    const templateButton = pickTemplateButton(actionBar) || button;
    if (!templateButton) return;
    actionBars.set(actionBar, templateButton);
  });
  return Array.from(actionBars, ([actionBar, shareButton]) => ({ actionBar, shareButton }));
}

export function createActionBarDownloadButton(templateButton, { attr, label, onClick }) {
  if (!templateButton) return null;
  const downloadLabel = label || t('instagramDownloadIcon');
  const button = templateButton.cloneNode(true);
  button.removeAttribute('aria-pressed'); // avoid inheriting liked state styling
  button.removeAttribute('aria-checked');
  button.style.color = '';
  button.setAttribute(attr, 'true');
  button.dataset.aioButton = 'true';
  button.setAttribute('role', 'button');
  button.tabIndex = 0;
  button.setAttribute('aria-label', downloadLabel);
  button.removeAttribute('href');
  button.removeAttribute('target');
  button.removeAttribute('rel');

  button.querySelectorAll('*').forEach((el) => {
    el.removeAttribute?.('href');
    el.removeAttribute?.('target');
    el.removeAttribute?.('rel');
  });

  const svgs = button.querySelectorAll('svg');
  svgs.forEach((svg) => {
    svg.setAttribute('aria-label', downloadLabel);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.removeAttribute('preserveAspectRatio'); // IG ile aynı davranış
    svg.removeAttribute('color');
    svg.style.color = 'currentColor';

    svg.innerHTML = `
      <title>${downloadLabel}</title>
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
  });



  button.addEventListener('click', onClick);
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event);
    }
  });

  return button;
}

export function insertActionButtonNear(templateButton, newButton, actionBarHint = null) {
  if (!templateButton || !newButton) return;
  const actionBar = actionBarHint || findActionBarContainer(templateButton) || templateButton.parentElement;
  if (!actionBar) return;

  const templateRoot = getImmediateChild(actionBar, templateButton) || templateButton;
  const templateWrapper = templateRoot !== templateButton ? templateRoot : null;
  const existingWrapper = getImmediateChild(actionBar, newButton);

  let insertNode = newButton;
  if (templateWrapper) {
    if (existingWrapper && existingWrapper !== newButton) {
      insertNode = existingWrapper;
    } else {
      const wrapper = templateWrapper.cloneNode(false);
      wrapper.appendChild(newButton);
      insertNode = wrapper;
    }
  } else if (existingWrapper && existingWrapper !== newButton) {
    insertNode = existingWrapper;
  }

  const saveButton = actionBar.querySelector(
    'svg[aria-label="Save"], [role="button"][aria-label="Save"], button[aria-label="Save"]'
  );
  const saveRoot = saveButton?.closest?.('[role="button"], button') || saveButton;
  let desiredRef = saveRoot ? getImmediateChild(actionBar, saveRoot) : null;
  const templateSibling = templateRoot?.nextElementSibling || null;
  if (!desiredRef && templateSibling && templateSibling !== insertNode) {
    desiredRef = templateSibling;
  }

  const alreadyPlaced =
    insertNode.parentElement === actionBar &&
    (
      (desiredRef && insertNode.nextSibling === desiredRef) ||
      (!desiredRef && templateRoot && templateRoot.nextElementSibling === insertNode) ||
      (!desiredRef && !templateRoot && actionBar.lastElementChild === insertNode)
    );
  if (alreadyPlaced) return;

  if (insertNode.parentElement && insertNode.parentElement !== actionBar) {
    insertNode.parentElement.removeChild(insertNode);
  }

  if (desiredRef) {
    actionBar.insertBefore(insertNode, desiredRef);
  } else {
    actionBar.appendChild(insertNode);
  }
}

export async function safeSendMessage(payload) {
  const normalizeError = (message) => {
    const msg = String(message || '');
    if (/context invalidated/i.test(msg)) {
      return 'Uzanti yeniden yuklendi. Sayfayi yenileyip tekrar dene.';
    }
    if (/receiving end does not exist/i.test(msg)) {
      return 'Uzanti arka plani kullanilamiyor. Uzantiyi ve sayfayi yenileyip tekrar dene.';
    }
    return msg || 'Mesaj gonderilemedi';
  };

  if (!chrome?.runtime?.id) {
    return { success: false, error: normalizeError('Extension context invalidated') };
  }

  return await new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: normalizeError(chrome.runtime.lastError.message) });
          return;
        }
        resolve(response);
      });
    } catch (error) {
      const normalized = normalizeError(error?.message);
      if (!/context invalidated/i.test(String(error?.message || ''))) {
        console.error('Instagram message send failed', error);
      }
      resolve({ success: false, error: normalized });
    }
  });
}

export function registerInstagramMenuProvider(id, buildOptions) {
  if (!id || typeof buildOptions !== 'function') return () => { };
  menuProviders.set(id, buildOptions);
  ensureMenuObserver();
  scheduleInjectMenuButtons();

  return () => {
    menuProviders.delete(id);
    if (!menuProviders.size) {
      teardownMenuUi();
    }
  };
}

function ensureMenuObserver() {
  if (menuObserver || !document?.body) return;
  menuObserver = new MutationObserver(() => {
    if (!menuProviders.size) return;
    if (injectingMenuButtons) return;
    scheduleInjectMenuButtons();
  });
  menuObserver.observe(document.body, { childList: true, subtree: true });
}

function scheduleInjectMenuButtons() {
  if (injectScheduled) return;
  injectScheduled = true;
  requestAnimationFrame(() => {
    const now = Date.now();
    const minGapMs = 120;
    const delay = Math.max(0, minGapMs - (now - lastInjectAt));
    setTimeout(() => {
      injectScheduled = false;
      injectMenuButtons();
    }, delay);
  });
}

function teardownMenuUi() {
  closeMenu();
  if (menuObserver) {
    menuObserver.disconnect();
    menuObserver = null;
  }
  if (resumeObserverTimer) {
    clearTimeout(resumeObserverTimer);
    resumeObserverTimer = null;
  }
  document.querySelectorAll(`[${INSTAGRAM_DOWNLOAD_MENU_ATTR}]`).forEach((node) => node.remove());
}

function injectMenuButtons() {
  if (!menuProviders.size) return;
  if (injectingMenuButtons) return;

  const now = Date.now();
  if (!burstStart || now - burstStart > 2000) {
    burstStart = now;
    burstCount = 0;
  }
  burstCount += 1;
  if (burstCount > 60) {
    if (menuObserver) {
      menuObserver.disconnect();
      menuObserver = null;
    }
    if (!resumeObserverTimer) {
      resumeObserverTimer = setTimeout(() => {
        resumeObserverTimer = null;
        ensureMenuObserver();
        scheduleInjectMenuButtons();
      }, 5000);
    }
    return;
  }

  injectingMenuButtons = true;
  lastInjectAt = now;

  try {
    const actionBars = collectInstagramActionBars();
    const targets = actionBars.length
      ? actionBars
      : getInstagramActionContainers().map((container) => findInstagramActionBar(container));

    targets.forEach(({ actionBar, shareButton }) => {
      if (!actionBar || !shareButton) return;
      if (actionBar?.closest?.('div[data-pagelet="story_tray"]')) return;
      if (actionBar.tagName === 'HEADER') return;

      const existing = actionBar.querySelector(`[${INSTAGRAM_DOWNLOAD_MENU_ATTR}]`);
      if (existing) {
        if (existing.dataset.aioBound !== BOUND_FLAG) {
          bindButton(existing);
        }
        insertActionButtonNear(shareButton, existing, actionBar);
        return;
      }

      const node = createActionBarDownloadButton(shareButton, {
        attr: INSTAGRAM_DOWNLOAD_MENU_ATTR,
        label: t('instagramDownloadIcon'),
        onClick: handleMenuClick
      });
      if (!node) return;
      bindButton(node);
      insertActionButtonNear(shareButton, node, actionBar);
    });
  } finally {
    injectingMenuButtons = false;
  }
}

function bindButton(button) {
  button.dataset.aioBound = BOUND_FLAG;
  button.removeEventListener('click', handleMenuClick);
  button.addEventListener('click', handleMenuClick);
}

function buildMenuOptions(context) {
  const options = [];
  menuProviders.forEach((builder) => {
    try {
      const built = builder(context);
      if (Array.isArray(built)) {
        options.push(...built);
      }
    } catch (error) {
      console.error('Instagram menu option builder failed', error);
    }
  });
  return options;
}

function handleMenuClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget;
  if (button.dataset?.disabled === 'true') return;

  if (openMenu?.button === button) {
    closeMenu();
    return;
  }

  const actionBar = findActionBarContainer(button);
  const articleCandidate =
    button.closest('article') ||
    actionBar?.closest?.('article') ||
    actionBar ||
    getActiveInstagramArticle() ||
    null;
  const reelUrl = getReelUrl(articleCandidate);
  if (!reelUrl) return;
  const reelTitle = getReelTitle();
  const activeArticle = articleCandidate || document;
  const media = findInstagramMediaSources(articleCandidate);

  const options = buildMenuOptions({ reelUrl, reelTitle, activeArticle, media });
  renderMenu(button, options);
}

function resolveThemeColors() {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = document.body?.dataset?.theme === 'dark' || prefersDark;
  if (isDark) {
    return {
      bg: 'rgba(17,17,17,0.96)',
      text: 'rgba(255,255,255,0.95)',
      border: 'rgba(255,255,255,0.08)',
      hover: 'rgba(255,255,255,0.08)',
      shadow: '0 10px 30px rgba(0,0,0,0.35)'
    };
  }
  return {
    bg: 'rgba(255,255,255,0.98)',
    text: '#111',
    border: 'rgba(0,0,0,0.12)',
    hover: 'rgba(0,0,0,0.05)',
    shadow: '0 12px 32px rgba(0,0,0,0.12)'
  };
}

function positionMenu(menu, button) {
  if (!menu || !button?.isConnected) {
    closeMenu();
    return;
  }
  const rect = button.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const menuWidth = menu.offsetWidth || 160;
  const left = Math.max(8, Math.min(rect.left, viewportWidth - menuWidth - 8));
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${left}px`;
}

function renderMenu(button, options) {
  closeMenu();
  if (!options.length) return;

  const colors = resolveThemeColors();
  const menu = document.createElement('div');
  menu.setAttribute(MENU_MENU_ATTR, 'true');
  menu.style.position = 'fixed';
  menu.style.background = colors.bg;
  menu.style.color = colors.text;
  menu.style.border = `1px solid ${colors.border}`;
  menu.style.borderRadius = '10px';
  menu.style.boxShadow = colors.shadow;
  menu.style.padding = '6px';
  menu.style.zIndex = '2147483647';
  menu.style.minWidth = '140px';

  options.forEach((opt) => {
    const item = document.createElement('button');
    item.textContent = opt.label;
    item.style.display = 'block';
    item.style.width = '100%';
    item.style.background = 'transparent';
    item.style.color = colors.text;
    item.style.border = 'none';
    item.style.padding = '8px 10px';
    item.style.textAlign = 'left';
    item.style.cursor = 'pointer';
    item.style.fontSize = '14px';
    item.style.fontWeight = '500';
    item.style.borderRadius = '8px';
    item.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeMenu();
      opt.action();
    });
    item.addEventListener('mouseenter', () => {
      item.style.background = colors.hover;
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent';
    });
    menu.appendChild(item);
  });

  const onDoc = (ev) => {
    if (!menu.contains(ev.target) && ev.target !== button) {
      closeMenu();
    }
  };
  document.addEventListener('click', onDoc);

  const onScroll = () => positionMenu(menu, button);
  const onResize = () => positionMenu(menu, button);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  document.body.appendChild(menu);
  positionMenu(menu, button);
  openMenu = { button, menu, onDoc, onScroll, onResize };
}

function closeMenu() {
  if (openMenu?.menu && openMenu.menu.parentElement) {
    openMenu.menu.parentElement.removeChild(openMenu.menu);
  }
  if (openMenu?.onDoc) {
    document.removeEventListener('click', openMenu.onDoc);
  }
  if (openMenu?.onScroll) {
    document.removeEventListener('scroll', openMenu.onScroll, true);
  }
  if (openMenu?.onResize) {
    window.removeEventListener('resize', openMenu.onResize);
  }
  openMenu = null;
}

/* ── Carousel helpers ──────────────────────────────────────────────── */

/**
 * Detect carousel within a scope and return info about the active slide.
 *
 * Instagram carousels use a `<ul>` with `<li>` children.
 * - The first `<li>` is a spacer (width: 1px, translateX = totalWidth).
 * - Only 2-3 real slides are in the DOM at any time (virtual rendering).
 * - Dot indicators: `._acnb` divs, where `._acnf` marks the active dot.
 *
 * IMPORTANT: The DOM only contains ~2-3 `<li>` slides regardless of total
 * count. We cannot map dot-index to `<li>` array-index. Instead we use
 * translateX math:
 *   slideWidth  = spacer.translateX / totalDots
 *   slideIndex  = Math.round(li.translateX / slideWidth)
 * and match against the active dot index.
 *
 * Returns `null` if no carousel is found.
 */
function detectCarousel(scope) {
  if (!scope?.querySelectorAll) return null;

  // Find the dot indicator container — it contains `._acnb` children
  const dots = Array.from(scope.querySelectorAll('div._acnb'));
  if (dots.length < 2) return null; // Not a carousel (0 or 1 dot)

  // Active dot has class `_acnf`
  let activeIndex = dots.findIndex((d) => d.classList.contains('_acnf'));
  if (activeIndex < 0) activeIndex = 0; // fallback to first

  // Find the <ul> that contains the carousel slides
  const ul = scope.querySelector('ul');
  if (!ul) return null;

  const allLis = Array.from(ul.children).filter((li) => li.tagName === 'LI');

  // Helper: extract translateX pixel value from inline style
  const getTranslateX = (el) => {
    const transform = el?.style?.transform || '';
    const match = transform.match(/translateX\(\s*([-\d.]+)\s*px\s*\)/);
    return match ? parseFloat(match[1]) : null;
  };

  // Separate spacer (width:1px) from real slides
  const spacer = allLis.find((li) => {
    const w = li.style?.width;
    return w === '1px' || w === '0px';
  });
  const slides = allLis.filter((li) => {
    const w = li.style?.width;
    return !(w === '1px' || w === '0px');
  });

  if (slides.length < 1) return null;

  // Compute slideWidth from the spacer's translateX (= totalSlides × slideWidth)
  const spacerX = spacer ? getTranslateX(spacer) : null;
  let slideWidth = 0;
  if (spacerX !== null && spacerX > 0 && dots.length > 0) {
    slideWidth = spacerX / dots.length;
  } else {
    // Fallback: derive from two consecutive slides
    const xValues = slides
      .map((li) => getTranslateX(li))
      .filter((x) => x !== null)
      .sort((a, b) => a - b);
    if (xValues.length >= 2) {
      slideWidth = xValues[1] - xValues[0];
    }
  }

  // Find the active slide by matching translateX-derived index to dot index
  let activeSlide = slides[0]; // fallback

  if (slideWidth > 0) {
    let bestDist = Number.POSITIVE_INFINITY;
    const expectedX = activeIndex * slideWidth;

    slides.forEach((li) => {
      const x = getTranslateX(li);
      if (x === null) return;
      const dist = Math.abs(x - expectedX);
      if (dist < bestDist) {
        bestDist = dist;
        activeSlide = li;
      }
    });
  }

  return {
    totalSlides: dots.length,
    activeIndex,
    activeSlide,
    slides,
    dots
  };
}

/**
 * Given a carousel slide element, extract image(s) from it.
 */
function extractImagesFromSlide(slide) {
  if (!slide?.querySelectorAll) return [];
  const results = [];
  slide.querySelectorAll('img').forEach((img) => {
    const fromSrcset = pickFromSrcset(img.getAttribute('srcset'));
    const candidate = fromSrcset.url || img.currentSrc || img.getAttribute('src');
    const weight = fromSrcset.width || img.naturalWidth || parseInt(img.getAttribute('width'), 10) || parseWidthFromUrl(candidate) || 0;
    const isAvatar = isLikelyAvatar({ url: candidate, alt: img.getAttribute('alt'), width: weight });
    const normalized = normalizeMediaUrl(candidate);
    if (!normalized) return;
    results.push({
      url: normalized,
      type: 'image',
      weight: Number.isFinite(weight) ? weight : 0,
      ext: inferExt(normalized, 'jpg'),
      isAvatar,
      element: img
    });
  });
  return results;
}

export function findInstagramMediaSources(targetArticle) {
  const detection = detectInstagramScope();
  let scopeType = detection.type;
  const isPermalink = isPostPermalinkPage();
  if (targetArticle) {
    const inDialog = targetArticle.closest && targetArticle.closest('div[role=\"dialog\"]');
    scopeType = inDialog
      ? INSTAGRAM_SCOPE_TYPES.dialog
      : (isReelsFeedPage() ? INSTAGRAM_SCOPE_TYPES.reelsFeed : (isPermalink ? INSTAGRAM_SCOPE_TYPES.postPage : INSTAGRAM_SCOPE_TYPES.article));
  }
  const scopeRoot = isPermalink ? (detection.scope || targetArticle || document) : (targetArticle || detection.scope || document);
  const articleRoot =
    targetArticle?.tagName === 'ARTICLE'
      ? targetArticle
      : targetArticle?.closest?.('article') || scopeRoot?.closest?.('article') || null;
  const postScope = findPostPageScope(scopeRoot);
  // Prefer the tighter post container when available; on Reels/Feed pages the button container
  // might not include the actual media nodes.
  let mediaScope = articleRoot || targetArticle || scopeRoot.querySelector?.('article') || scopeRoot;
  if (postScope && (scopeType === INSTAGRAM_SCOPE_TYPES.dialog || scopeType === INSTAGRAM_SCOPE_TYPES.postPage || isPermalink)) {
    mediaScope = postScope;
  }
  if (scopeType === INSTAGRAM_SCOPE_TYPES.reelsFeed) {
    const reelsRoot =
      (scopeRoot?.nodeType === 1 && scopeRoot.closest?.('main')) ||
      document.querySelector('main[role="main"]') ||
      document.querySelector('main') ||
      scopeRoot;
    if (reelsRoot) {
      mediaScope = reelsRoot;
    }
  }

  if (!targetArticle && scopeType === INSTAGRAM_SCOPE_TYPES.dialog && !postScope) {
    return {
      bestVideo: null,
      bestImage: null,
      visibleImage: null,
      images: [],
      all: [],
      hasVideo: false,
      isCarousel: false,
      carouselTotal: 0,
      scopeType
    };
  }

  /* ── Detect carousel ──────────────────────────────────────────────── */
  let carousel = null;
  const attemptedCarouselScopes = new Set();
  const tryDetectCarousel = (root) => {
    if (!root || attemptedCarouselScopes.has(root)) return null;
    attemptedCarouselScopes.add(root);
    return detectCarousel(root);
  };

  carousel = tryDetectCarousel(mediaScope)
    || tryDetectCarousel(articleRoot)
    || tryDetectCarousel(scopeRoot);

  if (!carousel && mediaScope?.parentElement) {
    let walkUp = mediaScope.parentElement;
    while (walkUp && walkUp !== document.body) {
      carousel = tryDetectCarousel(walkUp);
      if (carousel) break;
      walkUp = walkUp.parentElement;
    }
  }

  const media = [];
  let hasVideoElement = false;
  const seenVideos = new Set();
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

  const collectVideosFromScope = (root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('video').forEach((video) => {
      if (seenVideos.has(video)) return;
      seenVideos.add(video);
      hasVideoElement = true;
      const visibleScore = visibilityScore(video);
      const src = video.currentSrc || video.getAttribute('src');
      const weight = video.videoWidth || parseInt(video.getAttribute('width'), 10) || parseWidthFromUrl(src) || 0;
      addMedia(src, 'video', weight, { visibleScore });
      video.querySelectorAll('source[src]').forEach((source) => {
        const raw = source.getAttribute('src');
        const res = parseInt(source.getAttribute('res') || source.getAttribute('data-res') || source.getAttribute('size') || '', 10) || parseWidthFromUrl(raw) || 0;
        addMedia(raw, 'video', res, { visibleScore });
      });
    });
  };

  collectVideosFromScope(mediaScope);
  if (!seenVideos.size && articleRoot && articleRoot !== mediaScope) {
    collectVideosFromScope(articleRoot);
  }
  if (!seenVideos.size && isPermalink) {
    const main = document.querySelector('main[role="main"]') || document.querySelector('main');
    collectVideosFromScope(main || document);
  }

  /* ── Collect images ───────────────────────────────────────────────── */
  let activeSlideImage = null;

  if (carousel) {
    // In a carousel: collect images from ALL slides in DOM but mark
    // which one is the active slide image.
    const activeSlideImages = extractImagesFromSlide(carousel.activeSlide)
      .filter((img) => !img.isAvatar);

    carousel.slides.forEach((slide) => {
      const slideImages = extractImagesFromSlide(slide);
      slideImages.forEach((img) => {
        // Tag images from the active slide
        const isInActiveSlide = (slide === carousel.activeSlide);
        media.push({ ...img, isActiveSlide: isInActiveSlide });
      });
    });

    // Pick the best image from the active slide
    activeSlideImage = activeSlideImages
      .sort((a, b) => b.weight - a.weight)[0] || null;
  } else {
    // No carousel — collect all images from the media scope
    mediaScope.querySelectorAll('img').forEach((img) => {
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
  }

  const imagesAll = media.filter((item) => item.type === 'image');
  const images = imagesAll.filter((item) => !item.isAvatar);
  const visibleImages = images
    .map((img) => ({
      ...img,
      visibleScore: visibilityScore(img.element)
    }))
    .filter((img) => img.visibleScore > 0.05);
  const videoPool = media.filter((item) => item.type === 'video');
  let bestVideo = null;
  if (scopeType === INSTAGRAM_SCOPE_TYPES.reelsFeed) {
    bestVideo =
      videoPool
        .sort((a, b) => (b.visibleScore || 0) - (a.visibleScore || 0) || b.weight - a.weight)[0] || null;
  } else {
    bestVideo =
      videoPool
        .sort((a, b) => b.weight - a.weight)[0] || null;
  }
  const ogVideoUrl = document.querySelector('meta[property="og:video"], meta[property="og:video:secure_url"]')?.getAttribute('content');
  if (!hasVideoElement && normalizeMediaUrl(ogVideoUrl)) {
    hasVideoElement = true;
  }
  const imagePool = images.length ? images : imagesAll;

  /* ── Pick the primary image ───────────────────────────────────────── */
  let bestImage;
  let visibleImage;

  if (carousel && activeSlideImage) {
    // In carousel mode, the active slide image is always the primary pick.
    bestImage = activeSlideImage;
    visibleImage = activeSlideImage;
  } else {
    bestImage = (imagePool.length ? imagePool : imagesAll)
      .sort((a, b) => b.weight - a.weight)[0] || null;
    visibleImage = (visibleImages.length ? visibleImages : imagePool)
      .sort((a, b) => (b.visibleScore || 0) - (a.visibleScore || 0) || b.weight - a.weight)[0] || null;
  }

  const isCarousel = Boolean(carousel);
  const carouselTotal = carousel ? carousel.totalSlides : 0;

  return {
    bestVideo,
    bestImage,
    visibleImage,
    images,
    all: media,
    hasVideo: hasVideoElement,
    isCarousel,
    carouselTotal,
    scopeType
  };
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
