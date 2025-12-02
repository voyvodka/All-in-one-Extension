export const isTwitter = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    const hostMatch = hostname.endsWith('twitter.com') || hostname === 'x.com' || hostname.endsWith('.x.com');
    const pathMatch = /\/status\//.test(pathname);
    const homeMatch = pathname === '/' || pathname.startsWith('/home');
    return hostMatch && (pathMatch || homeMatch);
  } catch {
    return false;
  }
};

function findStatusLink() {
  const anchors = Array.from(document.querySelectorAll('a[href*="/status/"]'));
  const link = anchors.find((a) => {
    const href = a.getAttribute('href') || '';
    return /\/status\/\d+/.test(href);
  });
  return link ? link.href : null;
}

export function getTweetUrl() {
  const href = location.href;
  if (/\/status\//.test(href)) return href;

  const og = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
  if (og && /\/status\//.test(og)) return og;

  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  if (canonical && /\/status\//.test(canonical)) return canonical;

  const statusLink = findStatusLink();
  if (statusLink) return statusLink;

  return href;
}

export function getTweetTitle() {
  const textEl = document.querySelector('[data-testid="tweetText"]');
  const rawText = textEl?.textContent?.trim();

  const url = getTweetUrl();
  const idMatch = url?.match(/status\/(\d+)/);
  const tweetId = idMatch ? idMatch[1] : '';

  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');

  const fallbackTitle = document.title?.replace(/\s*-?\s*(Twitter|X)$/i, '').trim();
  const title = rawText || ogTitle || twitterTitle || fallbackTitle || 'twitter-video';

  return [
    title.replace(/\s+/g, ' ').trim().slice(0, 80),
    tweetId
  ]
    .filter(Boolean)
    .join('-')
    .replace(/[^\w\-ğüşöçıİĞÜŞÖÇ]+/gi, '-') // keep Turkish chars while normalizing separators
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function findShareButton(root) {
  const options = Array.from(root.querySelectorAll('div[role="menuitem"], button[role="menuitem"], a[role="link"]'));
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
    svg.innerHTML = '<path d="M9 3h2v9.528a3.25 3.25 0 1 1-2 2.97V3zm6 3h2v6.528a3.25 3.25 0 1 1-2 2.97V6z" fill="currentColor"/>';
  }

  return wrapper;
}
