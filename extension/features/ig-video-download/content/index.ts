import { t } from '../../../shared/i18n.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';
import { isInstagram, registerInstagramMenuProvider, safeSendMessage } from '../../instagram/shared.js';
import type { InstagramMenuProviderContext } from '../../instagram/shared.js';

export default {
  id: 'ig-video-download',
  label: 'Instagram Reels Video',
  description: 'Adds a video download shortcut for Instagram Reels.',
  matches: isInstagram,
  apply: () => {
    const cleanupProvider = registerInstagramMenuProvider(
      'instagram-video',
      ({ reelUrl, reelTitle, media }: InstagramMenuProviderContext) => {
        const bestVideo = media?.bestVideo ?? null;
        const hasVideo = Boolean(bestVideo) || Boolean(media?.hasVideo);
        if (!reelUrl || !hasVideo) return [];

        return [
          {
            label: t('downloadVideo'),
            action: () => startVideoDownload({ reelUrl, reelTitle, directMedia: bestVideo ? { url: bestVideo.url ?? '', type: bestVideo.type, ext: bestVideo.ext } : null })
          }
        ];
      }
    );

    return () => {
      cleanupProvider?.();
    };
  }
};

async function startVideoDownload({
  reelUrl,
  reelTitle,
  directMedia
}: {
  reelUrl: string;
  reelTitle: string;
  directMedia: { url: string; type?: string; ext?: string } | null;
}): Promise<void> {
  try {
    await safeSendMessage({
      type: MESSAGE_TYPES.IG_VIDEO_DOWNLOAD,
      openPopup: true,
      reelUrl,
      reelTitle: reelTitle || 'instagram-reel',
      directMedia
    });
  } catch (error) {
    console.error('Error sending Video download message:', error);
  }
}
