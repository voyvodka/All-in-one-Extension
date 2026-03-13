/* ── Per-feature icon paths ────────────────────────────────────────── */

/**
 * Video download icon: play/film style — instantly recognisable as "video".
 * Filled circle bg + white play-triangle + small down-arrow badge.
 */
const VIDEO_ICON_PATHS = `
  <circle class="aio-icon-bg" cx="12" cy="12" r="11"/>
  <path class="aio-icon-fg" d="M9.5 7.5v9l7-4.5z" fill="#fff"/>
  <circle cx="17.5" cy="17.5" r="4.5" fill="#fff"/>
  <path d="M17.5 15.95v3.1m0 0-1.6-1.6m1.6 1.6 1.6-1.6"
    stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"
    fill="none" class="aio-icon-badge"/>
`;

/**
 * Audio download icon: music note style — instantly recognisable as "audio".
 * Filled circle bg + white music note + small down-arrow badge.
 */
const AUDIO_ICON_PATHS = `
  <circle class="aio-icon-bg" cx="12" cy="12" r="11"/>
  <path class="aio-icon-fg"
    d="M10 17.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm0-2V7l5-1.5v2"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="17.5" cy="17.5" r="4.5" fill="#fff"/>
  <path d="M17.5 15.95v3.1m0 0-1.6-1.6m1.6 1.6 1.6-1.6"
    stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"
    fill="none" class="aio-icon-badge"/>
`;

function iconMarkupFor(attr) {
  if (attr.includes('video') || attr.includes('mp4')) return VIDEO_ICON_PATHS;
  return AUDIO_ICON_PATHS;
}

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
    /* ── Video download button ────────────────────────────────── */
    [data-aio-youtube-video] .aio-yt-icon .aio-icon-bg {
      fill: #cc0000;
    }
    [data-aio-youtube-video] .aio-yt-icon .aio-icon-fg {
      stroke: #fff;
    }
    [data-aio-youtube-video] .aio-yt-icon .aio-icon-badge {
      stroke: #cc0000;
    }

    /* ── Audio download button ────────────────────────────────── */
    [data-aio-youtube-mp3-download] .aio-yt-icon .aio-icon-bg {
      fill: #1db954;
    }
    [data-aio-youtube-mp3-download] .aio-yt-icon .aio-icon-fg {
      stroke: #fff;
    }
    [data-aio-youtube-mp3-download] .aio-yt-icon .aio-icon-badge {
      stroke: #1db954;
    }

    /* ── Icon wrapper — match YouTube native yt-icon 60px ────── */
    .aio-yt-icon {
      width: 60px;
      height: 60px;
    }
    .aio-yt-icon > div {
      width: 100%;
      height: 100%;
      display: block;
    }
    .aio-yt-icon svg {
      pointer-events: none;
      display: inherit;
      width: 100%;
      height: 100%;
    }

    /* ── Hover/active feedback ────────────────────────────────── */
    [data-aio-youtube-video] button:hover .aio-icon-bg,
    [data-aio-youtube-video] button:active .aio-icon-bg {
      fill: #e60000;
    }
    [data-aio-youtube-mp3-download] button:hover .aio-icon-bg,
    [data-aio-youtube-mp3-download] button:active .aio-icon-bg {
      fill: #1ed760;
    }

    /* ── Title styling to match YouTube native ────────────────── */
    yt-share-target-renderer[data-aio-youtube-video] #title,
    yt-share-target-renderer[data-aio-youtube-mp3-download] #title {
      font-size: 12px;
      line-height: 1.4;
      margin-top: 8px;
      max-width: 72px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
    }
  `;

  document.head.appendChild(style);
}

function setCustomIcon(node, attr) {
  ensureYoutubeIconStyles();

  const paths = iconMarkupFor(attr);

  /* ── If our icon already exists, just refresh the SVG paths ────── */
  let svg = node.querySelector('.aio-yt-icon svg');
  if (svg) {
    svg.innerHTML = paths;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    return;
  }

  /* ── Build the wrapper that mirrors YouTube's native yt-icon DOM:
       <span class="... aio-yt-icon">          ← replaces <yt-icon>
         <div style="width:100%;height:100%;display:block">
           <svg viewBox="0 0 24 24" style="pointer-events:none;display:inherit;width:100%;height:100%">
             ...paths
           </svg>
         </div>
       </span>
  ─────────────────────────────────────────────────────────────────── */
  function buildIconWrapper(extraClasses) {
    const span = document.createElement('span');
    span.className = (extraClasses ? extraClasses + ' ' : '') +
      'yt-icon-shape ytSpecIconShapeHost aio-yt-icon';

    const div = document.createElement('div');
    div.style.cssText = 'width:100%;height:100%;display:block';

    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('viewBox', '0 0 24 24');
    svgEl.setAttribute('aria-hidden', 'true');
    svgEl.setAttribute('focusable', 'false');
    svgEl.style.cssText = 'pointer-events:none;display:inherit;width:100%;height:100%';
    svgEl.innerHTML = paths;

    div.appendChild(svgEl);
    span.appendChild(div);
    return span;
  }

  /* ── Replace the cloned <yt-icon> from the template ───────────── */
  const ytIcon = node.querySelector('yt-icon');
  if (ytIcon) {
    const wrapper = buildIconWrapper(ytIcon.className || '');
    ytIcon.replaceWith(wrapper);
    return;
  }

  /* ── Fallback: insert before the title inside the button ──────── */
  const button = node.querySelector('button');
  if (button) {
    const wrapper = buildIconWrapper('');
    button.insertBefore(wrapper, button.firstChild);
  }
}

function buildFallbackTarget(label, attr) {
  const wrapper = document.createElement('yt-share-target-renderer');
  wrapper.className = 'style-scope yt-third-party-share-target-section-renderer';
  wrapper.setAttribute('role', 'button');

  const button = document.createElement('button');
  button.className = 'style-scope yt-share-target-renderer';
  button.id = 'target';

  /* Mirror YouTube's native icon hierarchy:
     <span class="... aio-yt-icon">
       <div style="width:100%;height:100%;display:block">
         <svg viewBox="0 0 24 24" style="pointer-events:none;display:inherit;width:100%;height:100%">
           ...paths
         </svg>
       </div>
     </span> */
  const iconWrapper = document.createElement('span');
  iconWrapper.className =
    'yt-icon-shape style-scope yt-icon ytSpecIconShapeHost aio-yt-icon';

  const innerDiv = document.createElement('div');
  innerDiv.style.cssText = 'width:100%;height:100%;display:block';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.cssText = 'pointer-events:none;display:inherit;width:100%;height:100%';
  svg.innerHTML = iconMarkupFor(attr);

  innerDiv.appendChild(svg);
  iconWrapper.appendChild(innerDiv);

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
  const node = template ? template.cloneNode(true) : buildFallbackTarget(label, attr);
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

  setCustomIcon(node, attr);

  return node;
}
