import { t } from '../../../shared/i18n.js';
import {
  isYoutube,
  createYoutubeShareTarget,
  getYoutubeVideoId,
  getYoutubeVideoTitle
} from '../../youtube/shared.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';

const MP4_ATTR = 'data-aio-youtube-video';

export default {
  id: 'yt-video-download',
  label: 'YouTube Video Download',
  description: 'Paylaş panelinin başına Video indir kısayolu ekler.',
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
          label: t('downloadVideo'),
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
      const originalText = titleEl ? titleEl.textContent : t('downloadVideo');

      if (titleEl) titleEl.textContent = t('downloading') || 'İndiriliyor...';
      button.disabled = true;

      try {
        const videoId = getYoutubeVideoId();
        if (!videoId) {
          throw new Error('Could not find YouTube video ID.');
        }
        const videoTitle = getYoutubeVideoTitle();

        const response = await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.YT_VIDEO_DOWNLOAD,
          openPopup: true,
          videoId,
          videoTitle: videoTitle || videoId
        });

        if (response?.success) {
          if (titleEl) titleEl.textContent = t('downloadStarted') || 'İndirme başladı!';
        } else {
          console.error('Download failed or was cancelled:', response?.error);
          if (titleEl) titleEl.textContent = t('error') || 'Hata!';
        }
      } catch (error) {
        console.error('Error sending download message:', error);
        if (titleEl) titleEl.textContent = t('error') || 'Hata!';
      } finally {
        setTimeout(() => {
          if (titleEl) titleEl.textContent = originalText;
          button.disabled = false;
        }, 2500);
      }
    }
  }
};
