import {
  isTwitter,
  getTweetUrl,
  getTweetTitle,
  findShareButton,
  createTwitterOption,
  safeSendMessage
} from '../shared.js';

const MP3_ATTR = 'data-aio-twitter-mp3-download';

export default {
  id: 'twitter-mp3-download',
  label: 'Twitter MP3 Download',
  description: 'Twitter/X paylaşım menüsüne MP3 indir kısayolu ekler.',
  matches: isTwitter,
  apply: () => {
    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton();

    return () => {
      observer.disconnect();
      document.querySelectorAll(`[${MP3_ATTR}]`).forEach((node) => node.remove());
    };

    function injectButton() {
      const menus = new Set();
      document.querySelectorAll('[role="menu"] [data-testid="Dropdown"]').forEach((el) => {
        const menu = el.closest('[role="menu"]');
        if (menu) menus.add(menu);
      });

      menus.forEach((menu) => {
        if (menu.closest('[data-testid="sheetDialog"]')) return; // Premium modal
        const template = findShareButton(menu);
        const list = template?.parentElement;
        if (!list || !template) return;

        // MP3
        if (!list.querySelector(`[${MP3_ATTR}]`)) {
          const node = createTwitterOption(template, {
            attr: MP3_ATTR,
            label: 'MP3 indir',
            onClick: handleClick
          });
          if (node) list.insertBefore(node, template.nextSibling || null);
        }
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
        const tweetUrl = getTweetUrl();
        if (!tweetUrl) throw new Error('Tweet URL bulunamadı.');
        const tweetTitle = getTweetTitle();

        const response = await safeSendMessage({
          type: 'download-twitter-mp3',
          tweetUrl,
          tweetTitle
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
