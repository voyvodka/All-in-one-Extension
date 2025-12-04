import { isInstagram, registerInstagramMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'instagram-reels-mp4',
  label: 'Instagram Reels MP4',
  description: 'Instagram reels paylaşım paneline MP4 indir kısayolu ekler.',
  matches: isInstagram,
  apply: () => {
    const cleanupProvider = registerInstagramMenuProvider('instagram-video', ({ reelUrl, reelTitle, media }) => {
      const bestVideo = media?.bestVideo;
      const hasVideo = Boolean(bestVideo) || media?.hasVideo;
      if (!reelUrl || !hasVideo) return [];

      return [
        {
          label: 'MP4 indir',
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
      console.error('MP4 download failed:', response?.error);
    }
  } catch (error) {
    console.error('Error sending MP4 download message:', error);
  }
}
