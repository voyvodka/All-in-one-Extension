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
const ACTION_ICON_SELECTORS = [
  'svg[aria-label="Share"]',
  'svg[aria-label="Share Post"]',
  'svg[aria-label="Paylaş"]',
  'svg[aria-label="Like"]',
  'svg[aria-label="Unlike"]',
  'svg[aria-label="Beğen"]',
  'svg[aria-label="Comment"]',
  'svg[aria-label="Save"]'
];

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

export const INSTAGRAM_SCOPE_TYPES = {
  dialog: 'dialog',
  article: 'article',
  postPage: 'post-page',
  page: 'page'
};

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

  return null;
}

export function detectInstagramScope() {
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
  const shareSvg =
    scope.querySelector('svg[aria-label="Share"]') ||
    scope.querySelector('svg[aria-label="Share Post"]') ||
    scope.querySelector('svg[aria-label="Paylaş"]');

  let templateButton = shareSvg?.closest('[role="button"]') || null;

  if (!templateButton) {
    const altSvg = scope.querySelector(
      'svg[aria-label="Like"], svg[aria-label="Unlike"], svg[aria-label="Beğen"], svg[aria-label="Comment"], svg[aria-label="Save"]'
    );
    templateButton = altSvg?.closest('[role="button"]') || null;
  }

  if (!templateButton) return { actionBar: null, shareButton: null };
  const actionBar =
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

  document.querySelectorAll(ACTION_ICON_SELECTORS.join(',')).forEach((svg) => {
    const candidate =
      svg.closest('article') ||
      svg.closest('section') ||
      svg.closest('[class]') ||
      svg.parentElement;
    if (candidate) containers.add(candidate);
  });

  return Array.from(containers);
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

  const svg = button.querySelector('svg');
  if (svg) {
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

export function insertActionButtonNear(templateButton, newButton) {
  if (!templateButton || !newButton) return;
  const wrapperSpan = templateButton.closest('span');
  const parent = (wrapperSpan && wrapperSpan.parentElement) || templateButton.parentElement;
  if (!parent) return;

  const isWrappedSpan =
    newButton.parentElement &&
    newButton.parentElement.tagName === 'SPAN' &&
    newButton.parentElement.childElementCount === 1 &&
    newButton.parentElement.firstElementChild === newButton;

  let insertNode = newButton;
  if (!isWrappedSpan && wrapperSpan && wrapperSpan.tagName === 'SPAN') {
    const span = wrapperSpan.cloneNode(false);
    span.className = wrapperSpan.className;
    span.appendChild(newButton);
    insertNode = span;
  } else if (isWrappedSpan) {
    insertNode = newButton.parentElement;
  }

  const saveButton = parent.querySelector('svg[aria-label="Save"]');
  const saveWrapper = saveButton?.closest('span') || saveButton?.closest('[role="button"]') || saveButton?.parentElement;
  const desiredRef = saveWrapper && saveWrapper.parentElement === parent ? saveWrapper : null;

  const alreadyPlaced =
    insertNode.parentElement === parent &&
    ((desiredRef && insertNode.nextSibling === desiredRef) || (!desiredRef && parent.lastElementChild === insertNode));
  if (alreadyPlaced) return;

  if (insertNode.parentElement && insertNode.parentElement !== parent) {
    insertNode.parentElement.removeChild(insertNode);
  }

  if (desiredRef) {
    parent.insertBefore(insertNode, desiredRef);
  } else {
    parent.appendChild(insertNode);
  }
}

export async function safeSendMessage(payload) {
  const normalizeError = (message) => {
    const msg = String(message || '');
    if (/context invalidated/i.test(msg)) {
      return 'Extension was reloaded. Please refresh the page and try again.';
    }
    if (/receiving end does not exist/i.test(msg)) {
      return 'Extension background is not available. Please reload the extension and refresh the page.';
    }
    return msg || 'Message failed';
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
      console.warn('AIO: instagram injection throttled due to high mutation rate');
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
  const containers = getInstagramActionContainers();
  containers.forEach((container) => {
    if (container?.closest?.('div[data-pagelet="story_tray"]')) return;
    const { actionBar, shareButton } = findInstagramActionBar(container);
    if (!actionBar || !shareButton) return;

    const existing = actionBar.querySelector(`[${INSTAGRAM_DOWNLOAD_MENU_ATTR}]`);
    if (existing) {
      if (existing.dataset.aioBound !== BOUND_FLAG) {
        bindButton(existing);
      }
      insertActionButtonNear(shareButton, existing);
      return;
    }

    const node = createActionBarDownloadButton(shareButton, {
      attr: INSTAGRAM_DOWNLOAD_MENU_ATTR,
      label: t('instagramDownloadIcon'),
      onClick: handleMenuClick
    });
    if (!node) return;
    bindButton(node);
    insertActionButtonNear(shareButton, node);
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

  const reelUrl = getReelUrl();
  if (!reelUrl) return;
  const reelTitle = getReelTitle();
  const articleCandidate = button.closest('article') || getActiveInstagramArticle() || null;
  const activeArticle = articleCandidate || document;
  const media = findInstagramMediaSources(
    articleCandidate && articleCandidate.tagName === 'ARTICLE' ? articleCandidate : null
  );

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

export function findInstagramMediaSources(targetArticle) {
  const detection = detectInstagramScope();
  let scopeType = detection.type;
  if (targetArticle) {
    const inDialog = targetArticle.closest && targetArticle.closest('div[role=\"dialog\"]');
    scopeType = inDialog ? INSTAGRAM_SCOPE_TYPES.dialog : INSTAGRAM_SCOPE_TYPES.article;
  }
  const scopeRoot = targetArticle || detection.scope || document;
  const postScope = findPostPageScope(scopeRoot);
  let mediaScope = targetArticle || postScope || scopeRoot.querySelector?.('article') || scopeRoot;
  if (scopeType === INSTAGRAM_SCOPE_TYPES.dialog && postScope) {
    mediaScope = postScope;
  }

  if (!targetArticle && scopeType === INSTAGRAM_SCOPE_TYPES.dialog && !postScope) {
    console.log('AIO: ig media skip dialog (no post scope)', { scopeType, scopeRootTag: scopeRoot?.tagName });
    return {
      bestVideo: null,
      bestImage: null,
      visibleImage: null,
      images: [],
      all: [],
      hasVideo: false,
      scopeType
    };
  }

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

  mediaScope.querySelectorAll('video').forEach((video) => {
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

  console.log('AIO: ig media collected', {
    scopeType,
    scopeRootTag: scopeRoot?.tagName,
    mediaScopeTag: mediaScope?.tagName,
    imageCount: images.length,
    allCount: media.length,
    hasVideo: hasVideoElement
  });

  return {
    bestVideo,
    bestImage,
    visibleImage,
    images,
    all: media,
    hasVideo: hasVideoElement,
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
