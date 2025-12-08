import { isInstagram, registerInstagramMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'instagram-reels-mp4',
  label: 'Instagram Reels MP4',
  description: 'Instagram reels paylaşım paneline Video indir kısayolu ekler.',
  matches: isInstagram,
  apply: () => {
    const cleanupProvider = registerInstagramMenuProvider('instagram-video', ({ reelUrl, reelTitle, media }) => {
      const bestVideo = media?.bestVideo;
      const hasVideo = Boolean(bestVideo) || media?.hasVideo;
      if (!reelUrl || !hasVideo) return [];

      return [
        {
          label: 'Video İndir',
          action: () => startVideoDownload({ reelUrl, reelTitle, directMedia: bestVideo || null })
        }
      ];
    });

    return () => {
      cleanupProvider?.();
    };
  }
};

async function startVideoDownload({ reelUrl, reelTitle, directMedia }) {
  try {
    const response = await safeSendMessage({
      type: 'download-instagram-mp4',
      reelUrl,
      reelTitle: reelTitle || 'instagram-reel',
      directMedia
    });
    if (!response?.success) {
      console.error('Video download failed:', response?.error);
    }
  } catch (error) {
    console.error('Error sending Video download message:', error);
  }
}
