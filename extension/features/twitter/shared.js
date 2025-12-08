export const isTwitter = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    const hostMatch =
      hostname.endsWith('twitter.com') ||
      hostname === 'x.com' ||
      hostname.endsWith('.x.com');
    const pathMatch = /\/status\//.test(pathname);
    const homeMatch = pathname === '/' || pathname.startsWith('/home');
    return hostMatch && (pathMatch || homeMatch);
  } catch {
    return false;
  }
};

function findStatusLink(scope) {
  const root = scope || document;
  const anchors = Array.from(root.querySelectorAll('a[href*="/status/"]'));
  const link = anchors.find((a) => {
    const href = a.getAttribute('href') || '';
    return /\/status\/\d+/.test(href);
  });
  return link ? link.href : null;
}

export function getTweetUrl(scope) {
  const root = scope || document;
  const href = location.href;
  if (/\/status\//.test(href) && !scope) return href;

  const og = root.querySelector('meta[property="og:url"]')?.getAttribute('content');
  if (og && /\/status\//.test(og)) return og;

  const canonical = root.querySelector('link[rel="canonical"]')?.href;
  if (canonical && /\/status\//.test(canonical)) return canonical;

  const statusLink = findStatusLink(scope);
  if (statusLink) return statusLink;

  return href;
}

export function getTweetTitle(scope) {
  const root = scope || document;
  const textEl = root.querySelector('[data-testid="tweetText"]');
  const rawText = textEl?.textContent?.trim();

  const url = getTweetUrl(scope);
  const idMatch = url?.match(/status\/(\d+)/);
  const tweetId = idMatch ? idMatch[1] : '';

  const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const twitterTitle = root.querySelector('meta[name="twitter:title"]')?.getAttribute('content');

  const fallbackTitle = document.title?.replace(/\s*-?\s*(Twitter|X)$/i, '').trim();
  const title = rawText || ogTitle || twitterTitle || fallbackTitle || 'twitter-video';

  return [
    title.replace(/\s+/g, ' ').trim().slice(0, 80),
    tweetId
  ]
    .filter(Boolean)
    .join('-')
    .replace(/[^\w\-ğüşöçıİĞÜŞÖÇ]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const TWITTER_DOWNLOAD_MENU_ATTR = 'data-aio-twitter-download-menu';
const TWITTER_MENU_ATTR = `${TWITTER_DOWNLOAD_MENU_ATTR}-menu`;
const BOUND_FLAG = 'true';

const menuProviders = new Map(); // id -> (context) => [{label, onClick, ...}]
let menuObserver = null;
let openMenu = null;
let injectingMenuButtons = false;

export function registerTwitterMenuProvider(id, buildOptions) {
  if (!id || typeof buildOptions !== 'function') return () => { };

  menuProviders.set(id, buildOptions);
  ensureDownloadHoverStyles();
  ensureMenuObserver();
  injectMenuButtons();

  return () => {
    menuProviders.delete(id);
    if (!menuProviders.size) {
      teardownMenuUi();
    }
  };
}

function ensureMenuObserver() {
  if (menuObserver || !document?.body) return;
  menuObserver = new MutationObserver(() => injectMenuButtons());
  menuObserver.observe(document.body, { childList: true, subtree: true });
}

function teardownMenuUi() {
  closeMenu();
  if (menuObserver) {
    menuObserver.disconnect();
    menuObserver = null;
  }
  document.querySelectorAll(`[${TWITTER_DOWNLOAD_MENU_ATTR}]`).forEach((node) => node.remove());
}

function getTwitterActionContainers() {
  return Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
}

function findTwitterActionBar(container) {
  const article = container.closest?.('article[data-testid="tweet"]') || container;

  const bookmarkBtn = article.querySelector('button[data-testid="bookmark"]');
  if (!bookmarkBtn) {
    return { actionBar: null, anchorButton: null, article };
  }

  const bookmarkGroup = bookmarkBtn.closest('div.css-175oi2r') || bookmarkBtn.parentElement;
  const row = bookmarkGroup?.parentElement || null;

  const shareBtn =
    row?.querySelector('button[aria-label*="Gönderiyi paylaş"]') ||
    row?.querySelector('button[aria-label*="Share"]') ||
    null;

  const anchorButton = shareBtn || bookmarkBtn;
  return { actionBar: row, anchorButton, article };
}

function createActionBarDownloadButton(templateButton, label) {
  if (!templateButton) return null;
  const button = templateButton.cloneNode(true);

  button.setAttribute(TWITTER_DOWNLOAD_MENU_ATTR, 'true');
  button.dataset.aioButton = 'true';
  button.setAttribute('role', 'button');
  button.tabIndex = 0;
  button.setAttribute('aria-label', label);
  button.removeAttribute('href');
  button.removeAttribute('target');
  button.removeAttribute('rel');

  const countSpan = button.querySelector('[data-testid="app-text-transition-container"]');
  if (countSpan) countSpan.textContent = '';

  const svg = button.querySelector('svg');
  if (svg) {
    const path = svg.querySelector('path');
    if (path) {
      path.setAttribute(
        'd',
        'M11.99 16l-5.7-5.7L7.7 8.88l3.29 3.3V2.59h2v9.59l3.3-3.3 1.41 1.42-5.71 5.7zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z'
      );
    }
  }

  const cloned = button.cloneNode(true);
  button.replaceWith(cloned);
  return cloned;
}

function insertActionButtonNear(anchorButton, newButton) {
  if (!anchorButton || !newButton) return;

  const group = anchorButton.closest('div.css-175oi2r') || anchorButton.parentElement;
  if (!group) return;

  const row = group.parentElement;
  if (!row) return;

  const rowContainer = row.parentElement;
  if (!rowContainer) return;

  let wrapper = newButton.closest('div.css-175oi2r');
  if (!wrapper) {
    wrapper = document.createElement('div');

    const children = Array.from(rowContainer.children).filter(el => el.tagName === 'DIV');
    const referenceWrapper = children[children.length - 1] || group.closest('div.css-175oi2r');

    if (referenceWrapper) {
      wrapper.className = referenceWrapper.className;
    } else {
      wrapper.className = 'css-175oi2r r-18u37iz r-1h0z5md r-1wron08';
    }

    wrapper.appendChild(newButton);
  }

  const children = Array.from(rowContainer.children).filter(el => el.tagName === 'DIV');
  const lastDiv = children[children.length - 1];

  if (lastDiv !== wrapper)
    lastDiv.classList.add('r-18u37iz', 'r-1h0z5md', 'r-1wron08');

  const alreadyInserted =
    rowContainer === wrapper.parentElement && wrapper.previousElementSibling === row;
  if (alreadyInserted) return;

  rowContainer.insertBefore(wrapper, row.nextElementSibling);
}

function injectMenuButtons() {
  if (!menuProviders.size || !document?.body) return;
  if (injectingMenuButtons) return;

  injectingMenuButtons = true;
  try {
    const containers = getTwitterActionContainers();

    containers.forEach((container) => {
      const { actionBar, anchorButton } = findTwitterActionBar(container);
      if (!actionBar || !anchorButton) return;

      const existing = actionBar.querySelector(`button[${TWITTER_DOWNLOAD_MENU_ATTR}]`);
      if (existing) {
        if (existing.dataset.aioBound !== BOUND_FLAG) {
          bindButton(existing);
        }
        insertActionButtonNear(anchorButton, existing);
        return;
      }

      const downloadButton = createActionBarDownloadButton(anchorButton, 'İndir');
      if (!downloadButton) return;

      bindButton(downloadButton);
      insertActionButtonNear(anchorButton, downloadButton);
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
        built.forEach((opt) => {
          if (!opt) return;
          if (opt.visible === false) return;
          options.push(opt);
        });
      }
    } catch (error) {
      console.error('Twitter menu option builder failed', error);
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

  closeMenu();

  const article = button.closest('article[data-testid="tweet"]') || document;
  const tweetUrl = getTweetUrl(article);
  if (!tweetUrl || !/\/status\/\d+/.test(tweetUrl)) {
    console.warn('Geçerli tweet URL bulunamadı', tweetUrl);
    return;
  }

  const tweetTitle = getTweetTitle(article);
  const hasVideo = !!article.querySelector('video, div[data-testid="videoComponent"]');

  const context = { tweetUrl, tweetTitle, article, hasVideo };
  const options = buildMenuOptions(context);

  if (!options.length) return;
  renderMenu(button, options);
}

function resolveTheme() {
  try {
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) {
      return {
        bg: 'rgba(15,20,25,0.98)',
        text: 'rgb(239,243,244)',
        hover: 'rgba(255,255,255,0.06)',
        border: 'rgba(255,255,255,0.08)',
        shadow: '0 12px 32px rgba(0,0,0,0.6)'
      };
    }
  } catch {
    // ignore
  }

  return {
    bg: 'rgba(255,255,255,0.98)',
    text: '#111',
    hover: 'rgba(0,0,0,0.04)',
    border: 'rgba(0,0,0,0.12)',
    shadow: '0 12px 32px rgba(0,0,0,0.15)'
  };
}

function positionMenuRelativeToButton(menu, button) {
  if (!menu || !button) return;

  const rect = button.getBoundingClientRect();
  const margin = 8;

  menu.style.visibility = 'hidden';
  menu.style.top = '0px';
  menu.style.left = '0px';

  const menuWidth = menu.offsetWidth || 160;
  const menuHeight = menu.offsetHeight || 40;

  let top = rect.bottom + margin;
  let left = rect.right - menuWidth;

  // Ekranın dışına taşmasın
  if (top + menuHeight > window.innerHeight - margin) {
    top = rect.top - menuHeight - margin;
  }
  if (top < margin) top = margin;
  if (left < margin) left = margin;
  if (left + menuWidth > window.innerWidth - margin) {
    left = window.innerWidth - menuWidth - margin;
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  menu.style.visibility = 'visible';
}

function ensureDownloadHoverStyles() {
  if (document.getElementById('aio-twitter-download-style')) return;

  const style = document.createElement('style');
  style.id = 'aio-twitter-download-style';

  style.textContent = `
    /* Normal ikon rengi */
    article[data-testid="tweet"] button[${TWITTER_DOWNLOAD_MENU_ATTR}="true"] div[dir="ltr"] {
      color: rgb(113, 118, 123) !important;
      transition: color 0.2s ease-out;
    }

    /* Dış wrapper: her zaman şeffaf kalsın */
    article[data-testid="tweet"] button[${TWITTER_DOWNLOAD_MENU_ATTR}="true"] 
      div.r-xoduu5:not([class*="r-1p0dtai"]) {
      background-color: transparent !important;
      border-radius: 9999px !important;
    }

    /* İç daire (r-1p0dtai içeren): transition tanımla */
    article[data-testid="tweet"] button[${TWITTER_DOWNLOAD_MENU_ATTR}="true"] 
      div.r-xoduu5[class*="r-1p0dtai"] {
      background-color: transparent !important;
      border-radius: 9999px !important;
      transition: background-color 0.2s ease-out;
    }

    /* Hover – ikon mavi olsun */
    article[data-testid="tweet"] button[${TWITTER_DOWNLOAD_MENU_ATTR}="true"]:hover div[dir="ltr"],
    article[data-testid="tweet"] button[${TWITTER_DOWNLOAD_MENU_ATTR}="true"]:focus-visible div[dir="ltr"] {
      color: rgb(29, 155, 240) !important;
    }

    /* Hover – SADECE içteki daire mavi arka plan alsın */
    article[data-testid="tweet"] button[${TWITTER_DOWNLOAD_MENU_ATTR}="true"]:hover 
      div.r-xoduu5[class*="r-1p0dtai"],
    article[data-testid="tweet"] button[${TWITTER_DOWNLOAD_MENU_ATTR}="true"]:focus-visible 
      div.r-xoduu5[class*="r-1p0dtai"] {
      background-color: rgba(29,155,240,0.1) !important;
    }
  `;

  document.head.appendChild(style);
}

function renderMenu(button, options) {
  const theme = resolveTheme();

  const wrapper = button.parentElement || button;
  if (wrapper && getComputedStyle(wrapper).position === 'static') {
    wrapper.style.position = 'relative';
  }

  const menu = document.createElement('div');
  menu.setAttribute(TWITTER_MENU_ATTR, 'true');
  menu.setAttribute('role', 'menu');

  Object.assign(menu.style, {
    position: 'fixed',
    top: `0`,
    right: '0',

    display: 'inline-block',
    width: 'max-content',
    maxWidth: 'calc(100vw - 20px)',
    minWidth: '160px',

    background: theme.bg,
    color: theme.text,
    borderRadius: '12px',
    padding: '4px 0',
    boxShadow: theme.shadow,
    border: `1px solid ${theme.border}`,
    zIndex: '2147483647'
  });

  options.forEach((opt) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');

    Object.assign(item.style, {
      display: 'block',
      width: '100%',
      padding: '8px 12px',
      background: 'transparent',
      border: 'none',
      textAlign: 'left',
      cursor: opt.disabled ? 'not-allowed' : 'pointer',
      color: theme.text,
      fontSize: '14px',
      whiteSpace: 'nowrap'
    });

    item.textContent = opt.label;

    item.addEventListener('mouseenter', () => {
      if (opt.disabled) return;
      item.style.background = theme.hover;
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent';
    });

    item.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (opt.disabled) return;

      closeMenu();

      try {
        await opt.onClick?.();
      } catch (error) {
        console.error('Twitter menu option click failed', error);
      } finally {
        closeMenu();
      }
    });

    menu.appendChild(item);
  });

  document.body.appendChild(menu);
  button.setAttribute('aria-expanded', 'true');

  positionMenuRelativeToButton(menu, button);

  const onDocClick = (ev) => {
    if (!menu.contains(ev.target) && ev.target !== button) {
      closeMenu();
      document.removeEventListener('click', onDocClick, true);
    }
  };
  document.addEventListener('click', onDocClick, true);

  const onScrollOrResize = () => {
    if (!document.body.contains(button) || !document.body.contains(menu)) {
      closeMenu();
      return;
    }
    positionMenuRelativeToButton(menu, button);
  };

  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  openMenu = { button, menu, onDocClick, onScrollOrResize };
}

function closeMenu() {
  if (!openMenu) return;
  openMenu.button?.setAttribute('aria-expanded', 'false');
  openMenu.menu?.remove();

  if (openMenu.onDocClick)
    document.removeEventListener('click', openMenu.onDocClick, true);

  if (openMenu.onScrollOrResize) {
    window.removeEventListener('scroll', openMenu.onScrollOrResize, true);
    window.removeEventListener('resize', openMenu.onScrollOrResize);
  }

  openMenu = null;
}

export function findShareButton(root) {
  const options = Array.from(
    root.querySelectorAll('div[role="menuitem"], button[role="menuitem"], a[role="link"]')
  );
  return options.find((el) => /copy\s*link|linki\s*kopyala/i.test(el.textContent || '')) || options[0] || null;
}

export function createTwitterOption(template, { attr, label, onClick }) {
  if (!template) return null;

  const wrapper = template.cloneNode(true);
  wrapper.setAttribute(attr, 'true');
  wrapper.setAttribute('role', 'menuitem');
  wrapper.tabIndex = 0;
  wrapper.setAttribute('aria-label', label);

  wrapper.addEventListener('click', onClick);
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event);
    }
  });

  const labelEl = wrapper.querySelector('span') || wrapper;
  labelEl.textContent = label;

  const svg = wrapper.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML =
      '<path d="M9 3h2v9.528a3.25 3.25 0 1 1-2 2.97V6zm6 3h2v6.528a3.25 3.25 0 1 1-2 2.97V6z" fill="currentColor"/>';
  }

  return wrapper;
}

export async function safeSendMessage(payload) {
  if (!chrome?.runtime?.id) {
    throw new Error('Extension context invalidated');
  }
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (err) {
    const msg = err?.message || '';
    if (typeof msg === 'string' && msg.toLowerCase().includes('context invalidated')) {
      throw new Error('Extension context invalidated');
    }
    throw err;
  }
}
