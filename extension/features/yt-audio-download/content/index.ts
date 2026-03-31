import { t } from '../../../shared/i18n.js';
import {
  isYoutube,
  createYoutubeShareTarget,
  getYoutubeVideoId,
  getYoutubeVideoTitle,
} from '../../youtube/shared.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';

const MP3_ATTR = 'data-aio-youtube-mp3-download';

export default {
  id: 'yt-audio-download',
  label: 'YouTube Audio Download',
  description: 'Paylaş panelinin başına Ses indir kısayolu ekler.',
  matches: isYoutube,
  apply: () => {
    const observer = new MutationObserver(() => injectButtons());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButtons();

    return () => {
      observer.disconnect();
      document.querySelectorAll(`[${MP3_ATTR}]`).forEach((node) => node.remove());
    };

    function injectButtons(): void {
      const selectors = [
        'ytd-unified-share-panel-renderer #contents',
        'yt-third-party-share-target-section-renderer #contents',
      ];
      const containers = document.querySelectorAll(selectors.join(', '));

      containers.forEach((container) => {
        if (container.querySelector(`[${MP3_ATTR}]`)) return;
        const node = createYoutubeShareTarget(container as HTMLElement, {
          attr: MP3_ATTR,
          label: t('downloadAudio'),
          onClick: handleClick,
        });
        if (!node) return;
        container.prepend(node);
      });
    }

    async function handleClick(event: MouseEvent): Promise<void> {
      event.preventDefault();
      event.stopPropagation();

      const button = event.currentTarget as HTMLButtonElement;
      if (button.disabled) return;

      const shareTarget = button.closest(`[${MP3_ATTR}]`);
      const titleEl = shareTarget?.querySelector('#title') as HTMLElement | null;
      const originalText = titleEl ? titleEl.textContent : t('downloadAudio');

      if (titleEl) titleEl.textContent = t('downloading');
      button.disabled = true;

      try {
        const videoId = getYoutubeVideoId();
        if (!videoId) {
          throw new Error('Could not find YouTube video ID.');
        }
        const videoTitle = getYoutubeVideoTitle();

        const response = await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.YT_AUDIO_DOWNLOAD,
          openPopup: true,
          videoId,
          videoTitle: videoTitle || videoId,
        });

        if (response?.success) {
          if (titleEl) titleEl.textContent = t('downloadStarted');
        } else {
          if (titleEl) titleEl.textContent = t('error');
        }
      } catch (error) {
        console.error('Error sending download message:', error);
        if (titleEl) titleEl.textContent = t('error');
      } finally {
        setTimeout(() => {
          if (titleEl) titleEl.textContent = originalText ?? '';
          button.disabled = false;
        }, 2500);
      }
    }
  },
};
