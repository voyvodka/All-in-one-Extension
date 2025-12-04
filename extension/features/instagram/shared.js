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
