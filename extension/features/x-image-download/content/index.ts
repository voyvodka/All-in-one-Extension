import { t } from '../../../shared/i18n.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';
import { isTwitter, registerTwitterMenuProvider, safeSendMessage } from '../../twitter/shared.js';

interface ProviderContext {
  tweetUrl: string;
  tweetTitle: string;
  article?: Element | null;
  mediaRoot?: Element | null;
  isFullscreen?: boolean;
}

export default {
  id: 'x-image-download',
  label: 'Twitter Image Download',
  description: 'Adds image download options to the tweet action menu.',
  matches: isTwitter,
  apply: () => {
    const cleanup = registerTwitterMenuProvider(
      'twitter-image',
      ({ tweetUrl, tweetTitle, article, mediaRoot, isFullscreen }: ProviderContext) => {
        if (!tweetUrl) return [];

        const scope: Element = mediaRoot ?? article ?? document.documentElement;
        const images = findTweetImages(scope);
        if (!images.length) return [];

        const label = isFullscreen
          ? t('downloadImageSingle')
          : images.length > 1
            ? t('downloadImageMultiple')
            : t('downloadImageSingle');

        return [
          {
            label,
            onClick: async () => {
              try {
                if (isFullscreen) {
                  await safeSendMessage({
                    type: MESSAGE_TYPES.X_IMAGE_DOWNLOAD,
                    openPopup: true,
                    tweetUrl,
                    tweetTitle,
                    imageUrl: images[0],
                  });
                  return;
                }

                if (images.length === 1) {
                  await safeSendMessage({
                    type: MESSAGE_TYPES.X_IMAGE_DOWNLOAD,
                    openPopup: true,
                    tweetUrl,
                    tweetTitle,
                    imageUrl: images[0],
                  });
                } else {
                  await safeSendMessage({
                    type: MESSAGE_TYPES.X_IMAGE_ZIP_DOWNLOAD,
                    openPopup: true,
                    tweetUrl,
                    tweetTitle,
                    imageUrls: images,
                  });
                }
              } catch (err) {
                console.error('twitter image download failed', err);
              }
            },
          },
        ];
      },
    );

    return () => {
      cleanup();
    };
  },
};

function findTweetImages(article: Element): string[] {
  const root = article ?? document.documentElement;
  const urls = new Set<string>();

  root.querySelectorAll<HTMLImageElement>('img[src*="twimg.com/media"]').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (!src) return;
    if (/profile_images|emoji|card_img/.test(src)) return;
    urls.add(toOriginalMediaUrl(src));
  });

  root
    .querySelectorAll<HTMLElement>('div[data-testid="tweetPhoto"] div[style*="background-image"]')
    .forEach((el) => {
      const style = el.getAttribute('style') ?? '';
      const match = style.match(/background-image:\s*url\(["']?(.*?)["']?\)/i);
      if (match?.[1]) {
        const raw = match[1];
        urls.add(toOriginalMediaUrl(raw));
      }
    });

  return Array.from(urls);
}

function toOriginalMediaUrl(src: string): string {
  try {
    const url = new URL(src, location.href);
    if (url.hostname.includes('twimg.com')) {
      if (url.searchParams.has('name')) {
        url.searchParams.set('name', 'orig');
      } else {
        url.searchParams.append('name', 'orig');
      }
    }
    return url.toString();
  } catch {
    return src;
  }
}
