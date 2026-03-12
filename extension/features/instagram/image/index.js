import { t } from '../../../shared/i18n.js';
import {
  isInstagram,
  registerInstagramMenuProvider,
  safeSendMessage,
  findInstagramMediaSources,
  detectInstagramScope
} from '../shared.js';

const NAV_LABELS = {
  next: ['Next', 'Sonraki', 'İleri'],
  prev: ['Previous', 'Önceki', 'Geri', 'Back', 'Go back']
};

export default {
  id: 'ig-image-download',
  label: 'Instagram Photo Download',
  description: 'Adds photo download shortcuts for Instagram Reels.',
  matches: isInstagram,
  apply: () => {
    const cleanupProvider = registerInstagramMenuProvider('instagram-image', ({ reelUrl, reelTitle, activeArticle, media }) => {
      const bestImage = media?.bestImage;
      const visibleImage = media?.visibleImage;
      const images = media?.images || [];
      const hasVideoContent = Boolean(media?.bestVideo) || media?.hasVideo;
      const hasPhotos = Boolean(bestImage || visibleImage);
      if (!reelUrl || hasVideoContent || !hasPhotos) return [];

      const primaryImage = pickPrimaryImage({ bestImage, visibleImage });
      const options = [];
      if (primaryImage) {
        options.push({
          label: t('downloadImageSingle'),
          action: () => startSingleImageDownload({ reelUrl, reelTitle, image: primaryImage })
        });
      }
      if (Array.isArray(images) && images.length > 1) {
        options.push({
          label: t('downloadImageMultiple'),
          action: () => startBulkImageDownload({ article: activeArticle, reelUrl, reelTitle, fallbackImages: images })
        });
      }
      return options;
    });

    return () => {
      cleanupProvider?.();
    };
  }
};

export function createInstagramImageDownloadHandler({
  buildTimestampFile,
  createJob,
  addJob,
  updateJob,
  inferExtFromUrl,
  registerDownloadId
}) {
  return async function startInstagramImageDownload({ reelUrl, reelTitle, mediaUrl }) {
    if (!mediaUrl) {
      return { success: false, error: t('instagramPhotoUrlMissing') };
    }

    const baseTitle = reelTitle || 'instagram-image';
    const ext = inferExtFromUrl(mediaUrl, 'jpg');
    const ts = Date.now();
    const fileName = buildTimestampFile('ig-image-download', ext, ts);
    const job = createJob({
      type: 'ig-image-download',
      title: baseTitle,
      fileName,
      sourceUrl: reelUrl,
      mediaUrl
    });
    await addJob(job);

    const result = await new Promise((resolve) => {
      chrome.downloads.download(
        {
          url: mediaUrl,
          filename: fileName,
          saveAs: true
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
            console.error('Download failed:', errMsg);
            updateJob(job.id, (j) => {
              j.status = 'failed';
              j.error = errMsg;
            });
            resolve({ success: false, error: errMsg });
          } else if (downloadId) {
            console.log('Download started with ID:', downloadId);
            registerDownloadId?.(downloadId, job.id);
            updateJob(job.id, (j) => {
              j.status = 'downloading';
              j.downloadId = downloadId;
            });
            resolve({ success: true });
          } else {
            console.log('Download cancelled by user.');
            updateJob(job.id, (j) => {
              j.status = 'failed';
              j.error = 'USER_CANCELED';
            });
            resolve({ success: false, error: 'USER_CANCELED' });
          }
        }
      );
    });

    return result;
  };
}

function pickPrimaryImage({ bestImage, visibleImage }) {
  return visibleImage || bestImage || null;
}

async function startSingleImageDownload({ reelUrl, reelTitle, image }) {
  if (!image?.url) return;
  try {
    const response = await safeSendMessage({
      type: 'ig-image-download',
      openPopup: true,
      reelUrl,
      reelTitle: reelTitle || 'instagram-image',
      directMedia: {
        url: image.url,
        type: 'image',
        ext: image.ext || 'jpg'
      },
      imageUrl: image.url
    });
    if (!response?.success) {
      console.error('Image download failed:', response?.error);
    }
  } catch (error) {
    console.error('Error sending image download message:', error);
  }
}

async function startBulkImageDownload({ article, reelUrl, reelTitle, fallbackImages = [] }) {
  const collected = await collectCarouselImages(article);
  const finalList = collected.length ? collected : fallbackImages;
  const seen = new Set();
  const urls = [];
  finalList.forEach((img) => {
    if (!img?.url) return;
    if (seen.has(img.url)) return;
    seen.add(img.url);
    urls.push(img.url);
  });
  if (!urls.length) return;

  try {
    const response = await safeSendMessage({
      type: 'ig-image-zip-download',
      openPopup: true,
      reelUrl,
      reelTitle: reelTitle || 'instagram-reel',
      imageUrls: urls
    });
    if (!response?.success) {
      console.error('Bulk image zip error:', response?.error);
    }
  } catch (error) {
    console.error('Bulk image zip send failed:', error);
  }
}

async function collectCarouselImages(article) {
  const gathered = [];
  const seen = new Set();
  const { scope: detectedScope } = detectInstagramScope();
  const scopeRoot = article || detectedScope || document;
  const addFromState = () => {
    const { images, visibleImage } = findInstagramMediaSources(scopeRoot);
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

  const isInStoryTray = (node) => Boolean(node?.closest?.('div[data-pagelet="story_tray"]'));
  const sameInteractionScope = (btn) => {
    if (!btn || !btn.closest) return false;
    const scopeArticle = scopeRoot?.closest?.('article') || null;
    const btnArticle = btn.closest('article');
    if (scopeArticle && btnArticle) return scopeArticle === btnArticle;

    const scopeDialog = scopeRoot?.closest?.('div[role="dialog"]') || null;
    const btnDialog = btn.closest('div[role="dialog"]');
    if (scopeDialog && btnDialog) return scopeDialog === btnDialog;

    if (!scopeArticle && !scopeDialog) {
      const scopeMain = scopeRoot?.closest?.('main') || (scopeRoot === document ? document.querySelector('main') : null);
      const btnMain = btn.closest('main');
      if (scopeMain && btnMain) return scopeMain === btnMain;
      return true;
    }

    return false;
  };
  const distanceToScope = (btn) => {
    try {
      const a = scopeRoot.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      return Math.hypot(ax - bx, ay - by);
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };
  const pickClosest = (buttons) => {
    const list = (buttons || []).filter(Boolean);
    if (!list.length) return null;
    return list.sort((a, b) => distanceToScope(a) - distanceToScope(b))[0] || null;
  };
  const findButton = (labels) => {
    const selector = labels
      .map((lbl) => `button[aria-label*="${lbl}"], div[role="button"][aria-label*="${lbl}"]`)
      .join(',');

    const localCandidates = Array.from(scopeRoot?.querySelectorAll?.(selector) || [])
      .filter((btn) => !isInStoryTray(btn));
    const local = pickClosest(localCandidates);
    if (local) return local;

    // Fallback for cases where IG renders nav buttons outside the article/dialog subtree.
    // Never touch story tray navigation.
    const globalCandidates = Array.from(document.querySelectorAll(selector))
      .filter((btn) => !isInStoryTray(btn))
      .filter((btn) => sameInteractionScope(btn));
    return pickClosest(globalCandidates);
  };
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clickNav = (btn) => {
    if (!btn) return;
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => {
      const evt = new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 });
      btn.dispatchEvent(evt);
    });
  };

  if (scopeRoot?.scrollIntoView) {
    scopeRoot.scrollIntoView({ block: 'center', inline: 'center' });
  }

  addFromState();

  // Step 1: go to the first slide
  {
    let prevButton = findButton(NAV_LABELS.prev);
    const start = Date.now();
    while (prevButton && prevButton.isConnected && Date.now() - start < 5000) {
      if (prevButton.getAttribute('aria-disabled') === 'true') break;
      clickNav(prevButton);
      await delay(200);
      addFromState();
      prevButton = findButton(NAV_LABELS.prev);
    }
  }

  // Step 2: traverse forward collecting all slides
  let lastCount = gathered.length;
  let stagnantSteps = 0;
  const maxStagnant = 8;
  for (let step = 0; step < 120; step++) {
    const nextButton = findButton(NAV_LABELS.next);
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
