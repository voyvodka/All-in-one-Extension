import { t } from '../../../shared/i18n.js';
import { isInstagram, registerInstagramMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'instagram-reels-mp3',
  label: 'Instagram Reels Audio',
  description: 'Adds an audio download shortcut for Instagram Reels.',
  matches: isInstagram,
  apply: () => {
    const cleanupProvider = registerInstagramMenuProvider('instagram-audio', ({ reelUrl, reelTitle, media }) => {
      const bestVideo = media?.bestVideo;
      const hasVideo = Boolean(bestVideo) || media?.hasVideo;
      if (!reelUrl || !hasVideo) return [];

      return [
        {
          label: t('downloadAudio'),
          action: () => startAudioDownload({ reelUrl, reelTitle, directMedia: bestVideo || null })
        }
      ];
    });

    return () => {
      cleanupProvider?.();
    };
  }
};

async function startAudioDownload({ reelUrl, reelTitle, directMedia }) {
  try {
    const response = await safeSendMessage({
      type: 'download-instagram-mp3',
      reelUrl,
      reelTitle: reelTitle || 'instagram-reel',
      directMedia
    });
    if (!response?.success) {
      console.error('Audio download failed:', response?.error);
    }
  } catch (error) {
    console.error('Error sending Audio download message:', error);
  }
}
