const MP3_ATTR = 'data-aio-youtube-mp3-download';

const isYoutube = (url) => {
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

function setCustomIcon(node, fill = '#0ea5e9') {
  const PATHS = `
    <circle cx="12" cy="12" r="10" fill="${fill}"></circle>
    <path d="M12 6v7.5m0 0-3-3m3 3 3-3M7 17h10"
      stroke="#fff"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"
    />
  `;

  // 1) Eğer zaten bizim kontrolümüzde bir svg varsa sadece içini güncelle
  let svg = node.querySelector('.aio-mp3-icon svg') || node.querySelector('yt-icon svg');
  if (svg) {
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.height = '100%';
    svg.innerHTML = PATHS;
    return;
  }

  // 2) yt-icon varsa tamamen kaldırıp yerine kendi span + svg’mizi koy
  const ytIcon = node.querySelector('yt-icon');
  if (ytIcon) {
    const wrapper = document.createElement('span');
    // YouTube stiline benzesin diye class’ları kopyala
    wrapper.className = (ytIcon.className || '') + ' yt-icon-shape ytSpecIconShapeHost aio-mp3-icon';

    wrapper.innerHTML = `
      <svg viewBox="0 0 24 24"
        height="100%"
        aria-hidden="true"
        focusable="false">
        ${PATHS}
      </svg>
    `;

    ytIcon.replaceWith(wrapper);
    return;
  }

  // 3) Hiç ikon yoksa (çok edge case) başa bir tane ekle
  const button = node.querySelector('button');
  if (button) {
    const wrapper = document.createElement('span');
    wrapper.className = 'yt-icon-shape ytSpecIconShapeHost aio-mp3-icon';
    wrapper.innerHTML = `
      <svg viewBox="0 0 24 24"
        height="100%"
        aria-hidden="true"
        focusable="false">
        ${PATHS}
      </svg>
    `;
    button.insertBefore(wrapper, button.firstChild);
  }
}

function createMp3ShareTarget(container, onClick) {
  // Var olan bir share target’ı baz al (ör: WhatsApp)
  const template = container.querySelector('yt-share-target-renderer');

  // Template varsa onu klonla, yoksa fallback’e düş
  const node = template ? template.cloneNode(true) : buildFallbackTarget();
  if (!node) return null;

  node.setAttribute('data-aio-youtube-mp3-download', 'true');

  const button = node.querySelector('button') || node.querySelector('#target');
  if (!button) return null;

  // Buton temel ayarları
  button.id = 'target';
  button.title = 'MP3 indir';
  button.setAttribute('aria-label', 'MP3 indir');
  button.onclick = onClick; // eski listener’lar varsa override et

  // Başlık – tema uyumluluğu için style-target önemli
  const titleEl = node.querySelector('#title');
  if (titleEl) {
    titleEl.textContent = 'MP3 indir';
    // Bazı template’lerde zaten var, biz garanti altına alalım:
    titleEl.setAttribute('style-target', 'title');
  }

  setCustomIcon(node, '#0ea5e9');

  return node;
}

function buildFallbackTarget() {
  const wrapper = document.createElement('yt-share-target-renderer');
  wrapper.className = 'style-scope yt-third-party-share-target-section-renderer';
  wrapper.setAttribute('role', 'button');

  const button = document.createElement('button');
  button.className = 'style-scope yt-share-target-renderer';
  button.id = 'target';

  const icon = document.createElement('yt-icon');
  icon.className = 'icon-resize style-scope yt-share-target-renderer';
  icon.setAttribute('active', 'true');
  icon.setAttribute('size', '60');

  const iconShape = document.createElement('span');
  iconShape.className = 'yt-icon-shape style-scope yt-icon ytSpecIconShapeHost';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <circle cx="12" cy="12" r="10" fill="#0ea5e9"></circle>
    <path d="M12 6v7.5m0 0-3-3m3 3 3-3M7 17h10" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  `;

  iconShape.appendChild(svg);
  icon.appendChild(iconShape);

  const title = document.createElement('div');
  title.id = 'title';
  title.className = 'style-scope yt-share-target-renderer';
  title.textContent = 'MP3 indir';

  button.appendChild(icon);
  button.appendChild(title);
  wrapper.appendChild(button);

  return wrapper;
}

function getYoutubeVideoId() {
  const bySearch = new URLSearchParams(location.search).get('v');
  if (bySearch) return bySearch;

  const ogUrl = document.querySelector('link[rel="canonical"]')?.href;
  if (ogUrl) {
    try {
      const ogId = new URLSearchParams(new URL(ogUrl).search).get('v');
      if (ogId) return ogId;
    } catch (e) { /* Ignore invalid URL */ }
  }

  const metaId = document.querySelector('meta[itemprop="videoId"]')?.getAttribute('content');
  if (metaId) return metaId;

  // Shorts URLs look like /shorts/{id}
  if (location.pathname.startsWith('/shorts/')) {
    return location.pathname.split('/')[2] || null;
  }

  // Fallback for different YouTube structures
  if (location.pathname.startsWith('/watch')) {
    return location.pathname.split('/')[2];
  }

  return null;
}

function getYoutubeVideoTitle() {
  const titleElement = document.querySelector('h1.style-scope.ytd-watch-metadata yt-formatted-string');
  if (titleElement) return titleElement.textContent.trim();

  const fallbackTitle = document.querySelector('h1.ytd-video-primary-info-renderer');
  if (fallbackTitle) return fallbackTitle.textContent.trim();

  const shortsTitle = document.querySelector('yt-formatted-string.ytd-reel-player-header-renderer');
  if (shortsTitle) return shortsTitle.textContent.trim();

  const metaOgTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (metaOgTitle) return metaOgTitle.trim();

  const metaTitle = document.querySelector('meta[name="title"]')?.getAttribute('content');
  if (metaTitle) return metaTitle.trim();

  if (document.title) return document.title.replace(/\s*-?\s*YouTube$/i, '').trim();

  return 'youtube-video';
}


export default {
  id: 'youtube-mp3-download',
  label: 'YouTube MP3 Download',
  description: 'Paylaş panelinin başına MP3 indir kısayolu ekler.',
  matches: isYoutube,
  apply: () => {
    const observer = new MutationObserver(() => injectButtons());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButtons();

    return () => {
      observer.disconnect();
      document.querySelectorAll(`[${MP3_ATTR}]`).forEach((node) => node.remove());
    };

    function injectButtons() {
      const selectors = [
        'ytd-unified-share-panel-renderer #contents',
        'yt-third-party-share-target-section-renderer #contents'
      ];
      const containers = document.querySelectorAll(selectors.join(', '));

      containers.forEach((container) => {
        if (container.querySelector(`[${MP3_ATTR}]`)) return;
        const node = createMp3ShareTarget(container, handleClick);
        if (!node) return;
        node.setAttribute(MP3_ATTR, 'true');
        container.prepend(node);
      });
    }

    async function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();

      const button = event.currentTarget;
      if (button.disabled) return;

      const shareTarget = button.closest(`[${MP3_ATTR}]`);
      const titleEl = shareTarget?.querySelector('#title');
      const originalText = titleEl ? titleEl.textContent : 'MP3 indir';

      titleEl.textContent = 'İndiriliyor...';
      button.disabled = true;

      try {
        const videoId = getYoutubeVideoId();
        if (!videoId) {
          throw new Error('Could not find YouTube video ID.');
        }
        const videoTitle = getYoutubeVideoTitle();

        const response = await chrome.runtime.sendMessage({
          type: 'download-mp3',
          videoId: videoId,
          videoTitle: videoTitle || videoId
        });

        if (response?.success) {
          if (titleEl) titleEl.textContent = 'İndirme başladı!';
        } else {
          console.error('Download failed or was cancelled:', response?.error);
          if (titleEl) titleEl.textContent = 'Hata!';
        }
      } catch (error) {
        console.error('Error sending download message:', error);
        if (titleEl) titleEl.textContent = 'Hata!';
      } finally {
        setTimeout(() => {
          if (titleEl) titleEl.textContent = originalText;
          button.disabled = false;
        }, 2500); // Revert button text after 2.5 seconds
      }
    }
  }
};
