import { isTwitter, registerTwitterMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'twitter-mp4-download',
  label: 'Twitter MP4 Download',
  description: 'Tweet altındaki indirme menüsüne MP4 indir seçeneğini ekler.',
  matches: isTwitter,
  apply: () => {
    const cleanup = registerTwitterMenuProvider('twitter-video', ({ tweetUrl, tweetTitle, hasVideo }) => {
      if (!tweetUrl || !hasVideo) return [];

      return [
        {
          label: 'MP4 indir',
          onClick: async () => {
            await startMp4Download({ tweetUrl, tweetTitle });
          }
        }
      ];
    });

    return () => {
      cleanup();
    };
  }
};

async function startMp4Download({ tweetUrl, tweetTitle }) {
  try {
    const response = await safeSendMessage({
      type: 'download-twitter-mp4',
      tweetUrl,
      tweetTitle: tweetTitle || 'twitter-video'
    });

    if (!response?.success) {
      console.error('MP4 download failed:', response?.error);
    }
  } catch (error) {
    console.error('Error sending MP4 download message:', error);
  }
}
