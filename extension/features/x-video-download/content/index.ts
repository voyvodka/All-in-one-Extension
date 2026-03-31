import { t } from '../../../shared/i18n.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';
import { isTwitter, registerTwitterMenuProvider, safeSendMessage } from '../../twitter/shared.js';

export default {
  id: 'x-video-download',
  label: 'Twitter Video Download',
  description: 'Adds a video download option to the tweet action menu.',
  matches: isTwitter,
  apply: () => {
    const cleanup = registerTwitterMenuProvider(
      'twitter-video',
      ({
        tweetUrl,
        tweetTitle,
        hasVideo,
      }: {
        tweetUrl: string;
        tweetTitle: string;
        hasVideo: boolean;
      }) => {
        if (!tweetUrl || !hasVideo) return [];

        return [
          {
            label: t('downloadVideo'),
            onClick: async () => {
              await startMp4Download({ tweetUrl, tweetTitle });
            },
          },
        ];
      },
    );

    return () => {
      cleanup();
    };
  },
};

async function startMp4Download({
  tweetUrl,
  tweetTitle,
}: {
  tweetUrl: string;
  tweetTitle: string;
}): Promise<void> {
  try {
    await safeSendMessage({
      type: MESSAGE_TYPES.X_VIDEO_DOWNLOAD,
      openPopup: true,
      tweetUrl,
      tweetTitle: tweetTitle || 'twitter-video',
    });
  } catch (error) {
    console.error('Error sending Video download message:', error);
  }
}
