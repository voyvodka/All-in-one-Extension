import { t } from '../../../shared/i18n.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';
import {
  isInstagram,
  registerInstagramMenuProvider,
  safeSendMessage,
  findInstagramMediaSources,
  detectInstagramScope,
  INSTAGRAM_DOWNLOAD_MENU_ATTR,
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
  prev: ['Previous', 'Önceki', 'Geri', 'Back', 'Go back'],
};

const NAV_BUTTON_SELECTOR = 'button, div[role="button"]';

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
            action: () => startSingleImageDownload({ reelUrl, reelTitle, image: primaryImage }),
          });
        }
        // Show bulk download when carousel has multiple slides OR when
        // multiple distinct images are found in the DOM.
        const showBulk =
          (isCarousel && carouselTotal > 1) || (Array.isArray(images) && images.length > 1);
        if (showBulk) {
          options.push({
            label: t('downloadImageMultiple'),
            action: () =>
              startBulkImageDownload({
                article: activeArticle,
                reelUrl,
                reelTitle,
                fallbackImages: images,
              }),
          });
        }
        return options;
      },
    );

    return () => {
      cleanupProvider?.();
    };
  },
};

function pickPrimaryImage({
  bestImage,
  visibleImage,
}: {
  bestImage?: ImageInfo | null;
  visibleImage?: ImageInfo | null;
}): ImageInfo | null {
  return visibleImage ?? bestImage ?? null;
}

async function startSingleImageDownload({
  reelUrl,
  reelTitle,
  image,
}: {
  reelUrl: string;
  reelTitle: string;
  image: ImageInfo;
}): Promise<void> {
  if (!image?.url) return;
  try {
    await safeSendMessage({
      type: MESSAGE_TYPES.IG_IMAGE_DOWNLOAD,
      openPopup: true,
      reelUrl,
      reelTitle: reelTitle || 'instagram-image',
      directMedia: {
        url: image.url,
        type: 'image',
        ext: image.ext || 'jpg',
      },
      imageUrl: image.url,
    });
  } catch (error) {
    console.error('Error sending image download message:', error);
  }
}

async function startBulkImageDownload({
  article,
  reelUrl,
  reelTitle,
  fallbackImages = [],
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
    await safeSendMessage({
      type: MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD,
      openPopup: true,
      reelUrl,
      reelTitle: reelTitle || 'instagram-reel',
      imageUrls: urls,
    });
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

  const isInStoryContext = (node: Element): boolean =>
    Boolean(node?.closest?.('div[data-pagelet="story_tray"]')) ||
    /^\/stories\//i.test(location.pathname);

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

  const getMediaRect = (): DOMRect | null => {
    const roots = [
      scopeRoot,
      scopeRoot.closest?.('article') ?? null,
      scopeRoot.closest?.('div[role="dialog"]') ?? null,
      document.querySelector('div[role="dialog"]'),
      document.querySelector('main[role="main"]'),
      document.querySelector('main'),
    ].filter(Boolean) as Element[];

    const seenRoots = new Set<Element>();
    const mediaCandidates: Array<{ area: number; rect: DOMRect }> = [];
    roots.forEach((root) => {
      if (!root || seenRoots.has(root)) return;
      seenRoots.add(root);

      root.querySelectorAll('video, img').forEach((media) => {
        if (!(media instanceof HTMLElement)) return;
        const rect = media.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (rect.width < 120 || rect.height < 120 || area <= 0) return;
        mediaCandidates.push({ area, rect });
      });
    });

    return mediaCandidates.sort((a, b) => b.area - a.area)[0]?.rect ?? null;
  };

  const scoreButtonByGeometry = (btn: Element, direction: 'next' | 'prev'): number => {
    if (!btn || !sameInteractionScope(btn) || isInStoryContext(btn)) {
      return Number.POSITIVE_INFINITY;
    }
    if (btn.closest?.(`[${INSTAGRAM_DOWNLOAD_MENU_ATTR}]`)) {
      return Number.POSITIVE_INFINITY;
    }
    if (!btn.querySelector?.('svg')) {
      return Number.POSITIVE_INFINITY;
    }

    const mediaRect = getMediaRect();
    if (!mediaRect) return Number.POSITIVE_INFINITY;

    const rect = btn.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.width > 96 || rect.height > 96) {
      return Number.POSITIVE_INFINITY;
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const midY = mediaRect.top + mediaRect.height / 2;
    const bandTop = mediaRect.top + mediaRect.height * 0.15;
    const bandBottom = mediaRect.bottom - mediaRect.height * 0.15;
    if (centerY < bandTop || centerY > bandBottom) {
      return Number.POSITIVE_INFINITY;
    }

    const onWrongSide =
      direction === 'prev'
        ? centerX > mediaRect.left + mediaRect.width * 0.45
        : centerX < mediaRect.right - mediaRect.width * 0.45;
    if (onWrongSide) {
      return Number.POSITIVE_INFINITY;
    }

    const edgeDistance =
      direction === 'prev'
        ? Math.abs(centerX - mediaRect.left)
        : Math.abs(centerX - mediaRect.right);
    const maxEdgeDistance = Math.max(96, mediaRect.width * 0.2);
    if (edgeDistance > maxEdgeDistance) {
      return Number.POSITIVE_INFINITY;
    }

    const yDistance = Math.abs(centerY - midY);
    return edgeDistance + yDistance * 1.5;
  };

  const findButtonByGeometry = (direction: 'next' | 'prev'): Element | null => {
    const localCandidates = Array.from(
      scopeRoot?.querySelectorAll?.(NAV_BUTTON_SELECTOR) ?? [],
    ).filter((btn) => Number.isFinite(scoreButtonByGeometry(btn, direction)));
    const local =
      localCandidates.sort(
        (a, b) => scoreButtonByGeometry(a, direction) - scoreButtonByGeometry(b, direction),
      )[0] ?? null;
    if (local) return local;

    const globalCandidates = Array.from(document.querySelectorAll(NAV_BUTTON_SELECTOR)).filter(
      (btn) => Number.isFinite(scoreButtonByGeometry(btn, direction)),
    );
    return (
      globalCandidates.sort(
        (a, b) => scoreButtonByGeometry(a, direction) - scoreButtonByGeometry(b, direction),
      )[0] ?? null
    );
  };

  const findButton = (labels: string[], direction: 'next' | 'prev'): Element | null => {
    const selector = labels
      .map((lbl) => `button[aria-label*="${lbl}"], div[role="button"][aria-label*="${lbl}"]`)
      .join(',');

    if (selector) {
      const localCandidates = Array.from(scopeRoot?.querySelectorAll?.(selector) ?? []).filter(
        (btn) => !isInStoryContext(btn),
      );
      const local = pickClosest(localCandidates);
      if (local) return local;

      const globalCandidates = Array.from(document.querySelectorAll(selector))
        .filter((btn) => !isInStoryContext(btn))
        .filter((btn) => sameInteractionScope(btn));
      const global = pickClosest(globalCandidates);
      if (global) return global;
    }

    return findButtonByGeometry(direction);
  };

  const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  const clickNav = (btn: Element): void => {
    if (!btn) return;
    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => {
      const evt = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      });
      btn.dispatchEvent(evt);
    });
  };

  if (scopeRoot instanceof HTMLElement && scopeRoot.scrollIntoView) {
    scopeRoot.scrollIntoView({ block: 'center', inline: 'center' });
  }

  addFromState();

  {
    let prevButton = findButton(NAV_LABELS['prev'] ?? [], 'prev');
    const start = Date.now();
    while (prevButton && prevButton.isConnected && Date.now() - start < 5000) {
      if (prevButton.getAttribute('aria-disabled') === 'true') break;
      clickNav(prevButton);
      await delay(200);
      addFromState();
      prevButton = findButton(NAV_LABELS['prev'] ?? [], 'prev');
    }
  }

  let lastCount = gathered.length;
  let stagnantSteps = 0;
  const maxStagnant = 8;
  for (let step = 0; step < 120; step++) {
    const nextButton = findButton(NAV_LABELS['next'] ?? [], 'next');
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
