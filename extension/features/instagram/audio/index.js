import { isInstagram, registerInstagramMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'instagram-reels-mp3',
  label: 'Instagram Reels MP3',
  description: 'Instagram reels paylaşım paneline Ses indir kısayolu ekler.',
  matches: isInstagram,
  apply: () => {
    const cleanupProvider = registerInstagramMenuProvider('instagram-audio', ({ reelUrl, reelTitle, media }) => {
      const bestVideo = media?.bestVideo;
      const hasVideo = Boolean(bestVideo) || media?.hasVideo;
      if (!reelUrl || !hasVideo) return [];

      return [
        {
          label: 'Audio indir',
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
