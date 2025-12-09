import { t } from '../../../shared/i18n.js';
import { isTwitter, registerTwitterMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'twitter-image-download',
  label: 'Twitter Image Download',
  description: 'Adds image download options to the tweet action menu.',
  matches: isTwitter,
  apply: () => {
    const cleanup = registerTwitterMenuProvider(
      'twitter-image',
      ({ tweetUrl, tweetTitle, article, mediaRoot, isFullscreen }) => {
        if (!tweetUrl) return [];

        const scope = mediaRoot || article || document;
        const images = findTweetImages(scope);
        if (!images.length) return [];

        const label = isFullscreen
          ? t('downloadImageSingle')
          : (images.length > 1 ? t('downloadImageMultiple') : t('downloadImageSingle'));

        return [
          {
            label,
            onClick: async () => {
              try {
                if (isFullscreen) {
                  // 🔹 Tam ekran: sadece açık olan resmi indir
                  await safeSendMessage({
                    type: 'download-twitter-image',
                    tweetUrl,
                    tweetTitle,
                    imageUrl: images[0]
                  });
                  return;
                }

                // 🔹 Normal tweet davranışı
                if (images.length === 1) {
                  await safeSendMessage({
                    type: 'download-twitter-image',
                    tweetUrl,
                    tweetTitle,
                    imageUrl: images[0]
                  });
                } else {
                  await safeSendMessage({
                    type: 'download-twitter-images-zip',
                    tweetUrl,
                    tweetTitle,
                    imageUrls: images
                  });
                }
              } catch (err) {
                console.error('twitter image download failed', err);
              }
            }
          }
        ];
      }
    );

    return () => {
      cleanup();
    };
  }
};


function findTweetImages(article) {
  const root = article || document;
  const urls = new Set();

  root
    .querySelectorAll('img[src*="twimg.com/media"]')
    .forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (!src) return;
      if (/profile_images|emoji|card_img/.test(src)) return; // avatar/emoji/card atla
      urls.add(toOriginalMediaUrl(src));
    });

  root
    .querySelectorAll('div[data-testid="tweetPhoto"] div[style*="background-image"]')
    .forEach((el) => {
      const style = el.getAttribute('style') || '';
      const match = style.match(/background-image:\s*url\(["']?(.*?)["']?\)/i);
      if (match && match[1]) {
        const raw = match[1];
        urls.add(toOriginalMediaUrl(raw));
      }
    });

  return Array.from(urls);
}

function toOriginalMediaUrl(src) {
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
