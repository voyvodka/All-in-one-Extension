import { t } from '../../../shared/i18n.js';
import { isTwitter, registerTwitterMenuProvider, safeSendMessage } from '../shared.js';

export default {
  id: 'twitter-mp3-download',
  label: 'Twitter Audio Download',
  description: 'Adds an audio download option to the tweet action menu.',
  matches: isTwitter,
  apply: () => {
    const cleanup = registerTwitterMenuProvider('twitter-audio', ({ tweetUrl, tweetTitle, hasVideo }) => {
      if (!tweetUrl || !hasVideo) return [];

      return [
        {
          label: t('downloadAudio'),
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
