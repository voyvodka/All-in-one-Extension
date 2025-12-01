import {
  isInstagram,
  getReelUrl,
  getReelTitle,
  findShareOptionTemplate,
  createInstagramOption
} from '../instagram-shared.js';

const MP3_ATTR = 'data-aio-instagram-mp3-download';

export default {
  id: 'instagram-reels-mp3',
  label: 'Instagram Reels MP3',
  description: 'Instagram reels paylaşım paneline MP3 indir kısayolu ekler.',
  matches: isInstagram,
  apply: () => {
    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton();

    return () => {
      observer.disconnect();
      document.querySelectorAll(`[${MP3_ATTR}]`).forEach((node) => node.remove());
    };

    function injectButton() {
      const dialogs = document.querySelectorAll('div[role="dialog"]');
      dialogs.forEach((dialog) => {
        const template = findShareOptionTemplate(dialog);
        const itemWrapper = template?.parentElement;
        const list = itemWrapper?.parentElement;
        if (!list || list.querySelector(`[${MP3_ATTR}]`)) return;

        const node = createInstagramOption(template, {
          attr: MP3_ATTR,
          label: 'MP3 indir',
          onClick: handleClick
        });
        if (!node) return;
        list.insertBefore(node, itemWrapper.nextSibling || null);
      });
    }

    async function handleClick(event) {
      event.preventDefault();
      event.stopPropagation();

      const button = event.currentTarget;
      if (button.dataset?.disabled === 'true') return;

      button.dataset.disabled = 'true';
      const labelEl = button.querySelector('span') || button;
      const originalText = labelEl.textContent;
      labelEl.textContent = 'İndiriliyor...';

      try {
        const reelUrl = getReelUrl();
        if (!reelUrl) {
          throw new Error('Reel URL bulunamadı.');
        }
        const reelTitle = getReelTitle();

        const response = await chrome.runtime.sendMessage({
          type: 'download-instagram-mp3',
          reelUrl,
          reelTitle: reelTitle || 'instagram-reel'
        });

        if (response?.success) {
          labelEl.textContent = 'İndirme başladı!';
        } else {
          labelEl.textContent = 'Hata!';
          console.error('Download failed:', response?.error);
        }
      } catch (error) {
        console.error('Error sending download message:', error);
        labelEl.textContent = 'Hata!';
      } finally {
        setTimeout(() => {
          labelEl.textContent = originalText;
          button.dataset.disabled = 'false';
        }, 2500);
      }
    }
  }
};
