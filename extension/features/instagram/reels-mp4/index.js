import {
  isInstagram,
  getReelUrl,
  getReelTitle,
  findShareOptionTemplate,
  createInstagramOption
} from '../shared.js';

const MP4_ATTR = 'data-aio-instagram-mp4-download';

export default {
  id: 'instagram-reels-mp4',
  label: 'Instagram Reels MP4',
  description: 'Instagram reels paylaşım paneline MP4 indir kısayolu ekler.',
  matches: isInstagram,
  apply: () => {
    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton();

    return () => {
      observer.disconnect();
      document.querySelectorAll(`[${MP4_ATTR}]`).forEach((node) => node.remove());
    };

    function injectButton() {
      const dialogs = document.querySelectorAll('div[role="dialog"]');
      dialogs.forEach((dialog) => {
        const template = findShareOptionTemplate(dialog);
        const itemWrapper = template?.parentElement;
        const list = itemWrapper?.parentElement;
        if (!list || list.querySelector(`[${MP4_ATTR}]`)) return;

        const node = createInstagramOption(template, {
          attr: MP4_ATTR,
          label: 'MP4 indir',
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
          type: 'download-instagram-mp4',
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
