const MP3_ATTR = 'data-aio-instagram-mp3-download';

const isInstagram = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    const hostMatch = hostname.endsWith('instagram.com') || hostname === 'www.instagram.com';
    const pathMatch = pathname.includes('/reel/') || pathname.includes('/reels/') || pathname.includes('/p/');
    return hostMatch && pathMatch;
  } catch {
    return false;
  }
};

function getReelUrl() {
  const og = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
  if (og) return og;

  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  if (canonical) return canonical;

  return location.href;
}

function getReelTitle() {
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle) return ogTitle.trim();

  const twitterTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
  if (twitterTitle) return twitterTitle.trim();

  if (document.title) return document.title.replace(/\s*-?\s*Instagram$/i, '').trim();

  return 'instagram-reel';
}

function findShareOptionTemplate(dialog) {
  const options = Array.from(dialog.querySelectorAll('div[role="button"][tabindex], a[role="link"]'));
  return options.find((el) => /copy\s*link|linki\s*kopyala|bağlantı\s*kopyala/i.test(el.textContent || '')) || options[0] || null;
}

function createMp3Option(template, onClick) {
  const wrapper = template?.parentElement ? template.parentElement.cloneNode(true) : document.createElement('div');
  if (!wrapper) return null;

  const button = wrapper.querySelector('div[role="button"], a[role="link"]') || template;
  if (!button) return null;

  wrapper.setAttribute(MP3_ATTR, 'true');
  button.setAttribute('role', 'button');
  button.tabIndex = 0;
  button.setAttribute('aria-label', 'MP3 indir');
  button.removeAttribute('href');
  button.removeAttribute('target');
  button.removeAttribute('rel');

  // Clear existing handlers by replacing with clone
  const cleanButton = button.cloneNode(true);
  button.replaceWith(cleanButton);

  cleanButton.addEventListener('click', onClick);
  cleanButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event);
    }
  });

  const labelEl = cleanButton.querySelector('span') || cleanButton;
  labelEl.textContent = 'MP3 indir';

  const svg = cleanButton.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML = '<path d="M9 3h2v9.528a3.25 3.25 0 1 1-2 2.97V3zm6 3h2v6.528a3.25 3.25 0 1 1-2 2.97V6z" fill="currentColor"/>';
  }

  return wrapper;
}

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

        const node = createMp3Option(template, handleClick);
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
          reelTitle
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
