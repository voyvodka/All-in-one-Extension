import { isYoutube, createYoutubeShareTarget } from '../shared.js';

const MP4_ATTR = 'data-aio-youtube-mp4-download';

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
  id: 'youtube-mp4-download',
  label: 'YouTube MP4 Download',
  description: 'Paylaş panelinin başına MP4 indir kısayolu ekler.',
  matches: isYoutube,
  apply: () => {
    const observer = new MutationObserver(() => injectButtons());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButtons();

    return () => {
      observer.disconnect();
      document.querySelectorAll(`[${MP4_ATTR}]`).forEach((node) => node.remove());
    };

    function injectButtons() {
      const selectors = [
        'ytd-unified-share-panel-renderer #contents',
        'yt-third-party-share-target-section-renderer #contents'
      ];
      const containers = document.querySelectorAll(selectors.join(', '));

      containers.forEach((container) => {
        if (container.querySelector(`[${MP4_ATTR}]`)) return;
        const node = createYoutubeShareTarget(container, {
          attr: MP4_ATTR,
          label: 'MP4 indir',
          color: '#1d4ed8',
          onClick: handleClick
        });
        if (!node) return;
        container.prepend(node);
      });
    }

    async function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();

      const button = event.currentTarget;
      if (button.disabled) return;

      const shareTarget = button.closest(`[${MP4_ATTR}]`);
      const titleEl = shareTarget?.querySelector('#title');
      const originalText = titleEl ? titleEl.textContent : 'MP4 indir';

      titleEl.textContent = 'İndiriliyor...';
      button.disabled = true;

      try {
        const videoId = getYoutubeVideoId();
        if (!videoId) {
          throw new Error('Could not find YouTube video ID.');
        }
        const videoTitle = getYoutubeVideoTitle();

        const response = await chrome.runtime.sendMessage({
          type: 'download-mp4',
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
