import { t } from '../../../shared/i18n.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';
import { isTwitter, registerTwitterMenuProvider, safeSendMessage } from '../../twitter/shared.js';

export default {
  id: 'x-audio-download',
  label: 'Twitter Audio Download',
  description: 'Adds an audio download option to the tweet action menu.',
  matches: isTwitter,
  apply: () => {
    const cleanup = registerTwitterMenuProvider(
      'twitter-audio',
      ({ tweetUrl, tweetTitle, hasVideo }: { tweetUrl: string; tweetTitle: string; hasVideo: boolean }) => {
        if (!tweetUrl || !hasVideo) return [];

        return [
          {
            label: t('downloadAudio'),
            onClick: async () => {
              await startMp3Download({ tweetUrl, tweetTitle });
            }
          }
        ];
      }
    );

    return () => {
      cleanup();
    };
  }
};

async function startMp3Download({
  tweetUrl,
  tweetTitle
}: {
  tweetUrl: string;
  tweetTitle: string;
}): Promise<void> {
  try {
    await safeSendMessage({
      type: MESSAGE_TYPES.X_AUDIO_DOWNLOAD,
      openPopup: true,
      tweetUrl,
      tweetTitle: tweetTitle || 'twitter-audio'
    });
  } catch (error) {
    console.error('Error sending audio download message:', error);
  }
}
