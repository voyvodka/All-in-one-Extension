const MP_ICON_PATHS = `
  <circle class="aio-mp-icon-bg" cx="12" cy="12" r="10"></circle>
  <path
    class="aio-mp-icon-fg"
    d="M12 6v7.5m0 0-3-3m3 3 3-3M7 17h10"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
  />
`;

const iconMarkup = () => MP_ICON_PATHS;

export const isYoutube = (url) => {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'youtu.be' ||
      hostname.endsWith('youtube.com') ||
      hostname.endsWith('youtube-nocookie.com')
    );
  } catch {
    return false;
  }
};

/* ------------ Ortak videoId / title helper'ları ------------ */

export function getYoutubeVideoId() {
  const bySearch = new URLSearchParams(location.search).get('v');
  if (bySearch) return bySearch;

  const ogUrl = document.querySelector('link[rel="canonical"]')?.href;
  if (ogUrl) {
    try {
      const ogId = new URLSearchParams(new URL(ogUrl).search).get('v');
      if (ogId) return ogId;
    } catch {
      // ignore
    }
  }

  const metaId = document.querySelector('meta[itemprop="videoId"]')?.getAttribute('content');
  if (metaId) return metaId;

  if (location.pathname.startsWith('/shorts/')) {
    return location.pathname.split('/')[2] || null;
  }

  if (location.pathname.startsWith('/watch')) {
    return location.pathname.split('/')[2] || null;
  }

  return null;
}

export function getYoutubeVideoTitle() {
  const titleElement = document.querySelector(
    'h1.style-scope.ytd-watch-metadata yt-formatted-string'
  );
  if (titleElement) return titleElement.textContent.trim();

  const fallbackTitle = document.querySelector('h1.ytd-video-primary-info-renderer');
  if (fallbackTitle) return fallbackTitle.textContent.trim();

  const shortsTitle = document.querySelector(
    'yt-formatted-string.ytd-reel-player-header-renderer'
  );
  if (shortsTitle) return shortsTitle.textContent.trim();

  const metaOgTitle = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute('content');
  if (metaOgTitle) return metaOgTitle.trim();

  const metaTitle = document.querySelector('meta[name="title"]')?.getAttribute('content');
  if (metaTitle) return metaTitle.trim();

  if (document.title) return document.title.replace(/\s*-?\s*YouTube$/i, '').trim();

  return 'youtube-video';
}

/* ------------ Icon stilini YouTube'a yaklaştır ------------ */

function ensureYoutubeIconStyles() {
  if (document.getElementById('aio-youtube-icon-style')) return;

  const style = document.createElement('style');
  style.id = 'aio-youtube-icon-style';

  style.textContent = `
    /* Genel ikon görünümü – YouTube'un icon/round stiline yaslan */
    .aio-mp3-icon .aio-mp-icon-bg {
      fill: var(--yt-spec-static-brand-red, #f22c1d);
    }

    [data-aio-youtube-video] .aio-mp3-icon .aio-mp-icon-bg {
      fill: var(--yt-spec-brand-button-background, #3ea6ff);
    }

    [data-aio-youtube-mp3-download] .aio-mp3-icon .aio-mp-icon-bg {
      fill: var(--yt-spec-brand-button-background, #22c55e);
    }

    .aio-mp3-icon .aio-mp-icon-fg {
      stroke: #fff;
    }

    /* Share target başlığı YouTube font/renkleri ile uyumlu kalsın */
    yt-share-target-renderer[role="button"][data-aio-youtube-video] #title,
    yt-share-target-renderer[role="button"][data-aio-youtube-mp3-download] #title {
      font-size: 12px;
    }
  `;

  document.head.appendChild(style);
}

function setCustomIcon(node) {
  ensureYoutubeIconStyles();

  const paths = iconMarkup();

  let svg = node.querySelector('.aio-mp3-icon svg');
  if (svg) {
    svg.innerHTML = paths;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.height = '100%';
    return;
  }

  const ytIcon = node.querySelector('yt-icon');
  if (ytIcon) {
    const wrapper = document.createElement('span');

    wrapper.className =
      (ytIcon.className || '') +
      ' yt-icon-shape ytSpecIconShapeHost aio-mp3-icon';

    wrapper.innerHTML = `
      <svg viewBox="0 0 24 24"
        height="100%"
        aria-hidden="true"
        focusable="false">
        ${paths}
      </svg>
    `;

    ytIcon.replaceWith(wrapper);
    return;
  }

  const button = node.querySelector('button');
  if (button) {
    const wrapper = document.createElement('span');
    wrapper.className = 'yt-icon-shape ytSpecIconShapeHost aio-mp3-icon';
    wrapper.innerHTML = `
      <svg viewBox="0 0 24 24"
        height="100%"
        aria-hidden="true"
        focusable="false">
        ${paths}
      </svg>
    `;
    button.insertBefore(wrapper, button.firstChild);
  }
}

function buildFallbackTarget(label) {
  const wrapper = document.createElement('yt-share-target-renderer');
  wrapper.className = 'style-scope yt-third-party-share-target-section-renderer';
  wrapper.setAttribute('role', 'button');

  const button = document.createElement('button');
  button.className = 'style-scope yt-share-target-renderer';
  button.id = 'target';

  const iconWrapper = document.createElement('span');
  iconWrapper.className =
    'yt-icon-shape style-scope yt-icon ytSpecIconShapeHost aio-mp3-icon';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.height = '100%';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = iconMarkup();

  iconWrapper.appendChild(svg);

  const title = document.createElement('div');
  title.id = 'title';
  title.className = 'style-scope yt-share-target-renderer';
  title.textContent = label;
  title.setAttribute('style-target', 'title');

  button.appendChild(iconWrapper);
  button.appendChild(title);
  wrapper.appendChild(button);

  return wrapper;
}

export function createYoutubeShareTarget(container, { attr, label, onClick }) {
  const template = container.querySelector('yt-share-target-renderer');
  const node = template ? template.cloneNode(true) : buildFallbackTarget(label);
  if (!node) return null;

  node.setAttribute(attr, 'true');

  const button = node.querySelector('button') || node.querySelector('#target');
  if (!button) return null;

  button.id = 'target';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.onclick = onClick;

  const titleEl = node.querySelector('#title');
  if (titleEl) {
    titleEl.textContent = label;
    titleEl.setAttribute('style-target', 'title');
  }

  setCustomIcon(node);

  return node;
}
