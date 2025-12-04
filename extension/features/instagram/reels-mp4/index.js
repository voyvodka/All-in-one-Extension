import {
  isInstagram,
  getReelUrl,
  getReelTitle,
  findInstagramMediaSources,
  findInstagramActionBar,
  createActionBarDownloadButton,
  INSTAGRAM_DOWNLOAD_MENU_ATTR
} from '../shared.js';

const MENU_ATTR = INSTAGRAM_DOWNLOAD_MENU_ATTR;
const MENU_MENU_ATTR = `${MENU_ATTR}-menu`;
let openMenu = null;
const BOUND_FLAG = 'true';

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
      document.querySelectorAll(`[${MENU_ATTR}]`).forEach((node) => node.remove());
      closeMenu();
    };

    function injectButton() {
      const articles = document.querySelectorAll('article');
      articles.forEach((article) => {
        const { actionBar, shareButton } = findInstagramActionBar(article);
        if (!actionBar || !shareButton) return;

        const existing = actionBar.querySelector(`[${MENU_ATTR}]`);
        if (existing) {
          if (existing.dataset.aioBound === BOUND_FLAG) return;
          bindButton(existing);
          return;
        }

        const node = createActionBarDownloadButton(shareButton, {
          attr: MENU_ATTR,
          label: 'İndir',
          onClick: handleMenuClick
        });
        if (!node) return;
        bindButton(node);
        shareButton.parentElement?.insertBefore(node, shareButton.nextSibling || null);
      });
    }

    function bindButton(button) {
      button.dataset.aioBound = BOUND_FLAG;
      button.removeEventListener('click', handleMenuClick);
      button.addEventListener('click', handleMenuClick);
    }

    function closeMenu() {
      if (openMenu?.menu && openMenu.menu.parentElement) {
        openMenu.menu.parentElement.removeChild(openMenu.menu);
      }
      if (openMenu?.onDoc) {
        document.removeEventListener('click', openMenu.onDoc);
      }
      if (openMenu?.onScroll) {
        document.removeEventListener('scroll', openMenu.onScroll, true);
      }
      if (openMenu?.onResize) {
        window.removeEventListener('resize', openMenu.onResize);
      }
      openMenu = null;
    }

    function handleMenuClick(event) {
      event.preventDefault();
      event.stopPropagation();

      const button = event.currentTarget;
      if (button.dataset?.disabled === 'true') return;

      if (openMenu?.button === button) {
        closeMenu();
        return;
      }

      const reelUrl = getReelUrl();
      if (!reelUrl) return;
      const reelTitle = getReelTitle();
      const activeArticle = button.closest('article') || null;
      const { bestVideo, bestImage, visibleImage, images, hasVideo } = findInstagramMediaSources(activeArticle);
      const hasVideoContent = Boolean(bestVideo) || hasVideo;
      const hasPhotoOnly = !hasVideoContent && Boolean(bestImage || visibleImage);

      const options = [];
      if (hasVideoContent) {
        options.push({
          label: 'MP4 indir',
          action: () => startDownload('download-instagram-mp4', reelUrl, reelTitle, bestVideo)
        });
        options.push({
          label: 'MP3 indir',
          action: () => startDownload('download-instagram-mp3', reelUrl, reelTitle, bestVideo)
        });
      } else if (hasPhotoOnly) {
        const primaryImage = visibleImage || bestImage;
        if (primaryImage) {
          options.push({
            label: 'Fotoğraf indir',
            action: () => startDownload('download-instagram-image', reelUrl, reelTitle, primaryImage)
          });
        }
        if (Array.isArray(images) && images.length > 1) {
          options.push({
            label: 'Tüm fotoğrafları indir (ZIP)',
            action: () => startBulkImageDownload(activeArticle, reelUrl, reelTitle, images)
          });
        }
      }

      renderMenu(button, options);
    }

    function resolveThemeColors() {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = document.body?.dataset?.theme === 'dark' || prefersDark;
      if (isDark) {
        return {
          bg: 'rgba(17,17,17,0.96)',
          text: 'rgba(255,255,255,0.95)',
          border: 'rgba(255,255,255,0.08)',
          hover: 'rgba(255,255,255,0.08)',
          shadow: '0 10px 30px rgba(0,0,0,0.35)'
        };
      }
      return {
        bg: 'rgba(255,255,255,0.98)',
        text: '#111',
        border: 'rgba(0,0,0,0.12)',
        hover: 'rgba(0,0,0,0.05)',
        shadow: '0 12px 32px rgba(0,0,0,0.12)'
      };
    }

    function positionMenu(menu, button) {
      if (!menu || !button?.isConnected) {
        closeMenu();
        return;
      }
      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const menuWidth = menu.offsetWidth || 160;
      const left = Math.max(8, Math.min(rect.left, viewportWidth - menuWidth - 8));
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.left = `${left}px`;
    }

    function renderMenu(button, options) {
      closeMenu();
      if (!options.length) return;

      const colors = resolveThemeColors();
      const menu = document.createElement('div');
      menu.setAttribute(MENU_MENU_ATTR, 'true');
      menu.style.position = 'fixed';
      menu.style.background = colors.bg;
      menu.style.color = colors.text;
      menu.style.border = `1px solid ${colors.border}`;
      menu.style.borderRadius = '10px';
      menu.style.boxShadow = colors.shadow;
      menu.style.padding = '6px';
      menu.style.zIndex = '2147483647';
      menu.style.minWidth = '140px';

      options.forEach((opt) => {
        const item = document.createElement('button');
        item.textContent = opt.label;
        item.style.display = 'block';
        item.style.width = '100%';
        item.style.background = 'transparent';
        item.style.color = colors.text;
        item.style.border = 'none';
        item.style.padding = '8px 10px';
        item.style.textAlign = 'left';
        item.style.cursor = 'pointer';
        item.style.fontSize = '14px';
        item.style.fontWeight = '500';
        item.style.borderRadius = '8px';
        item.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          closeMenu();
          opt.action();
        });
        item.addEventListener('mouseenter', () => {
          item.style.background = colors.hover;
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = 'transparent';
        });
        menu.appendChild(item);
      });

      const onDoc = (ev) => {
        if (!menu.contains(ev.target) && ev.target !== button) {
          closeMenu();
        }
      };
      document.addEventListener('click', onDoc);

      const onScroll = () => positionMenu(menu, button);
      const onResize = () => positionMenu(menu, button);
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);

      document.body.appendChild(menu);
      positionMenu(menu, button);
      openMenu = { button, menu, onDoc, onScroll, onResize };
    }

    async function startDownload(type, reelUrl, reelTitle, directCandidate) {
      const directMedia = directCandidate
        ? {
            url: directCandidate.url,
            type: directCandidate.type,
            ext: directCandidate.ext
          }
        : null;

      try {
        const response = await chrome.runtime.sendMessage({
          type,
          reelUrl,
          reelTitle: reelTitle || 'instagram-reel',
          directMedia
        });

        if (!response?.success) {
          console.error('Download failed:', response?.error);
        }
      } catch (error) {
        console.error('Error sending download message:', error);
      }
    }

    async function collectCarouselImages(article) {
      const gathered = [];
      const seen = new Set();
      const addFromState = () => {
        const { images, visibleImage } = findInstagramMediaSources(article);
        const list = [];
        if (visibleImage) list.push(visibleImage);
        if (Array.isArray(images)) list.push(...images);
        list.forEach((img) => {
          if (!img?.url) return;
          if (seen.has(img.url)) return;
          seen.add(img.url);
          gathered.push(img);
        });
      };

      const scope = article || document;
      const findButton = (labels) => {
        const selector = labels.map((lbl) => `button[aria-label*="${lbl}"], div[role="button"][aria-label*="${lbl}"]`).join(',');
        const roots = [article, scope];
        for (const root of roots) {
          if (!root) continue;
          const btn = root.querySelector(selector);
          if (btn) return btn;
        }
        return null;
      };
      const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const clickNav = (btn) => {
        if (!btn) return;
        ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => {
          const evt = new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 });
          btn.dispatchEvent(evt);
        });
      };

      if (article?.scrollIntoView) {
        article.scrollIntoView({ block: 'center', inline: 'center' });
      }

      addFromState();

      // Step 1: go to the first slide
      {
        const prevButton = findButton(['Previous', 'Önceki', 'Geri', 'Back', 'Go back']);
        const start = Date.now();
        while (prevButton && prevButton.isConnected && Date.now() - start < 5000) {
          if (prevButton.getAttribute('aria-disabled') === 'true') break;
          clickNav(prevButton);
          await delay(200);
          addFromState();
        }
      }

      // Step 2: traverse forward collecting all slides
      let lastCount = gathered.length;
      let stagnantSteps = 0;
      const maxStagnant = 8;
      for (let step = 0; step < 120; step++) {
        const nextButton = findButton(['Next', 'Sonraki', 'İleri']);
        if (!nextButton) break;
        if (nextButton.getAttribute('aria-disabled') === 'true') break;
        clickNav(nextButton);
        await delay(220);
        addFromState();
        if (gathered.length === lastCount) {
          stagnantSteps += 1;
        } else {
          stagnantSteps = 0;
          lastCount = gathered.length;
        }
        if (stagnantSteps >= maxStagnant) break;
      }

      return gathered;
    }

    async function startBulkImageDownload(article, reelUrl, reelTitle, imageList = []) {
      const allImages = await collectCarouselImages(article);
      const seen = new Set();
      const urls = [];
      const finalList = allImages.length ? allImages : imageList || [];
      finalList.forEach((img) => {
        if (!img?.url) return;
        if (seen.has(img.url)) return;
        seen.add(img.url);
        urls.push(img.url);
      });
      if (!urls.length) return;
      try {
        await chrome.runtime.sendMessage({
          type: 'download-instagram-images-zip',
          reelUrl,
          reelTitle: reelTitle || 'instagram-reel',
          imageUrls: urls
        });
      } catch (error) {
        console.error('Bulk image zip error:', error);
      }
    }
  }
};
