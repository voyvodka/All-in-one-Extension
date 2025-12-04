import { isInstagram, registerInstagramMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'instagram-reels-mp3',
  label: 'Instagram Reels MP3',
  description: 'Instagram reels paylaşım paneline MP3 indir kısayolu ekler.',
  matches: isInstagram,
  apply: () => {
    const cleanupProvider = registerInstagramMenuProvider('instagram-audio', ({ reelUrl, reelTitle, media }) => {
      const bestVideo = media?.bestVideo;
      const hasVideo = Boolean(bestVideo) || media?.hasVideo;
      if (!reelUrl || !hasVideo) return [];

      return [
        {
          label: 'MP3 indir',
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
      console.error('MP3 download failed:', response?.error);
    }
  } catch (error) {
    console.error('Error sending MP3 download message:', error);
  }
}
