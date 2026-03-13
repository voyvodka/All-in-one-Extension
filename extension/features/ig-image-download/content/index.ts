import { t } from '../../../shared/i18n.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';
import {
  isInstagram,
  registerInstagramMenuProvider,
  safeSendMessage,
  findInstagramMediaSources,
  detectInstagramScope
} from '../../instagram/shared.js';

interface ImageInfo {
  url: string;
  ext?: string;
}

interface MediaContext {
  bestImage?: ImageInfo | null;
  visibleImage?: ImageInfo | null;
  images?: ImageInfo[];
  bestVideo?: unknown;
  hasVideo?: boolean;
  isCarousel?: boolean;
  carouselTotal?: number;
}

interface ProviderContext {
  reelUrl: string;
  reelTitle: string;
  activeArticle: Element | null;
  media: MediaContext;
}

const NAV_LABELS: Record<string, string[]> = {
  next: ['Next', 'Sonraki', 'İleri'],
  prev: ['Previous', 'Önceki', 'Geri', 'Back', 'Go back']
};

export default {
  id: 'ig-image-download',
  label: 'Instagram Photo Download',
  description: 'Adds photo download shortcuts for Instagram Reels.',
  matches: isInstagram,
  apply: () => {
    const cleanupProvider = registerInstagramMenuProvider(
      'instagram-image',
      ({ reelUrl, reelTitle, activeArticle, media }: ProviderContext) => {
        const bestImage = media?.bestImage;
        const visibleImage = media?.visibleImage;
        const images = media?.images ?? [];
        const isCarousel = media?.isCarousel ?? false;
        const carouselTotal = media?.carouselTotal ?? 0;
        const hasVideoContent = Boolean(media?.bestVideo) || media?.hasVideo;
        const hasPhotos = Boolean(bestImage || visibleImage);
        if (!reelUrl || hasVideoContent || !hasPhotos) return [];

        const primaryImage = pickPrimaryImage({ bestImage, visibleImage });
        const options: Array<{ label: string; action: () => void }> = [];
        if (primaryImage) {
          options.push({
            label: t('downloadImageSingle'),
            action: () => startSingleImageDownload({ reelUrl, reelTitle, image: primaryImage })
          });
        }
        // Show bulk download when carousel has multiple slides OR when
        // multiple distinct images are found in the DOM.
        const showBulk = (isCarousel && carouselTotal > 1) || (Array.isArray(images) && images.length > 1);
        if (showBulk) {
          options.push({
            label: t('downloadImageMultiple'),
            action: () =>
              startBulkImageDownload({ article: activeArticle, reelUrl, reelTitle, fallbackImages: images })
          });
        }
        return options;
      }
    );

    return () => {
      cleanupProvider?.();
    };
  }
};

function pickPrimaryImage({
  bestImage,
  visibleImage
}: {
  bestImage?: ImageInfo | null;
  visibleImage?: ImageInfo | null;
}): ImageInfo | null {
  return visibleImage ?? bestImage ?? null;
}

async function startSingleImageDownload({
  reelUrl,
  reelTitle,
  image
}: {
  reelUrl: string;
  reelTitle: string;
  image: ImageInfo;
}): Promise<void> {
  if (!image?.url) return;
  try {
    const response = await safeSendMessage({
      type: MESSAGE_TYPES.IG_IMAGE_DOWNLOAD,
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

async function startBulkImageDownload({
  article,
  reelUrl,
  reelTitle,
  fallbackImages = []
}: {
  article: Element | null;
  reelUrl: string;
  reelTitle: string;
  fallbackImages?: ImageInfo[];
}): Promise<void> {
  const collected = await collectCarouselImages(article);
  const finalList = collected.length ? collected : fallbackImages;
  const seen = new Set<string>();
  const urls: string[] = [];
  finalList.forEach((img) => {
    if (!img?.url) return;
    if (seen.has(img.url)) return;
    seen.add(img.url);
    urls.push(img.url);
  });
  if (!urls.length) return;

  try {
    const response = await safeSendMessage({
      type: MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD,
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

async function collectCarouselImages(article: Element | null): Promise<ImageInfo[]> {
  const gathered: ImageInfo[] = [];
  const seen = new Set<string>();
  const { scope: detectedScope } = detectInstagramScope();
  const scopeRoot: Element = article ?? detectedScope ?? document.documentElement;
  const addFromState = () => {
    const { images, visibleImage } = findInstagramMediaSources(scopeRoot);
    const list: ImageInfo[] = [];
    if (visibleImage) list.push(visibleImage as ImageInfo);
    if (Array.isArray(images)) list.push(...(images as ImageInfo[]));
    list.forEach((img) => {
      if (!img?.url) return;
      if (seen.has(img.url)) return;
      seen.add(img.url);
      gathered.push(img);
    });
  };

  const isInStoryTray = (node: Element): boolean =>
    Boolean(node?.closest?.('div[data-pagelet="story_tray"]'));

  const sameInteractionScope = (btn: Element): boolean => {
    if (!btn || !btn.closest) return false;
    const scopeArticle = scopeRoot?.closest?.('article') ?? null;
    const btnArticle = btn.closest('article');
    if (scopeArticle && btnArticle) return scopeArticle === btnArticle;

    const scopeDialog = scopeRoot?.closest?.('div[role="dialog"]') ?? null;
    const btnDialog = btn.closest('div[role="dialog"]');
    if (scopeDialog && btnDialog) return scopeDialog === btnDialog;

    if (!scopeArticle && !scopeDialog) {
      const scopeMain =
        scopeRoot?.closest?.('main') ??
        (scopeRoot === document.documentElement ? document.querySelector('main') : null);
      const btnMain = btn.closest('main');
      if (scopeMain && btnMain) return scopeMain === btnMain;
      return true;
    }

    return false;
  };

  const distanceToScope = (btn: Element): number => {
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

  const pickClosest = (buttons: Element[]): Element | null => {
    const list = (buttons ?? []).filter(Boolean);
    if (!list.length) return null;
    return list.sort((a, b) => distanceToScope(a) - distanceToScope(b))[0] ?? null;
  };

  const findButton = (labels: string[]): Element | null => {
    const selector = labels
      .map((lbl) => `button[aria-label*="${lbl}"], div[role="button"][aria-label*="${lbl}"]`)
      .join(',');

    const localCandidates = Array.from(scopeRoot?.querySelectorAll?.(selector) ?? []).filter(
      (btn) => !isInStoryTray(btn)
    );
    const local = pickClosest(localCandidates);
    if (local) return local;

    const globalCandidates = Array.from(document.querySelectorAll(selector))
      .filter((btn) => !isInStoryTray(btn))
      .filter((btn) => sameInteractionScope(btn));
    return pickClosest(globalCandidates);
  };

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const clickNav = (btn: Element): void => {
    if (!btn) return;
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => {
      const evt = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0
      });
      btn.dispatchEvent(evt);
    });
  };

  if (scopeRoot instanceof HTMLElement && scopeRoot.scrollIntoView) {
    scopeRoot.scrollIntoView({ block: 'center', inline: 'center' });
  }

  addFromState();

  {
    let prevButton = findButton(NAV_LABELS['prev'] ?? []);
    const start = Date.now();
    while (prevButton && prevButton.isConnected && Date.now() - start < 5000) {
      if (prevButton.getAttribute('aria-disabled') === 'true') break;
      clickNav(prevButton);
      await delay(200);
      addFromState();
      prevButton = findButton(NAV_LABELS['prev'] ?? []);
    }
  }

  let lastCount = gathered.length;
  let stagnantSteps = 0;
  const maxStagnant = 8;
  for (let step = 0; step < 120; step++) {
    const nextButton = findButton(NAV_LABELS['next'] ?? []);
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
