import { isTwitter, registerTwitterMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'twitter-mp3-download',
  label: 'Twitter MP3 Download',
  description: 'Tweet altındaki indirme menüsüne MP3 indir seçeneğini ekler.',
  matches: isTwitter,
  apply: () => {
    const cleanup = registerTwitterMenuProvider('twitter-audio', ({ tweetUrl, tweetTitle, hasVideo }) => {
      if (!tweetUrl || !hasVideo) return [];

      return [
        {
          label: 'MP3 indir',
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
      console.error('MP3 download failed:', response?.error);
    }
  } catch (error) {
    console.error('Error sending MP3 download message:', error);
  }
}
