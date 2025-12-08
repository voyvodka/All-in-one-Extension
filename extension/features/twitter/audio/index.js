import { isTwitter, registerTwitterMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'twitter-mp3-download',
  label: 'Twitter Audio Download',
  description: 'Tweet altındaki indirme menüsüne Ses indir seçeneğini ekler.',
  matches: isTwitter,
  apply: () => {
    const cleanup = registerTwitterMenuProvider('twitter-audio', ({ tweetUrl, tweetTitle, hasVideo }) => {
      if (!tweetUrl || !hasVideo) return [];

      return [
        {
          label: 'Ses indir',
          onClick: async () => {
            await startMp3Download({ tweetUrl, tweetTitle });
          }
        }
      ];
    });

    return () => {
      cleanup();
    };
  }
};

async function startMp3Download({ tweetUrl, tweetTitle }) {
  try {
    const response = await safeSendMessage({
      type: 'download-twitter-mp3',
      tweetUrl,
      tweetTitle: tweetTitle || 'twitter-audio'
    });

    if (!response?.success) {
      console.error('Audio download failed:', response?.error);
    }
  } catch (error) {
    console.error('Error sending audio download message:', error);
  }
}
