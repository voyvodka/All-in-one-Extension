import { getYoutubeIdFromUrl, inferExtFromUrl } from './utils.js';
import { getSettings, getDownloadsState } from '../shared/storage.js';
import { clearHistory, getJobIdByDownloadId, loadDownloadMap, updateJob } from './downloads/store.js';
import { startYoutubeDownload } from '../features/youtube-download/background/index.js';
import { startInstagramDownload, startInstagramImagesZip } from '../features/instagram-download/background/index.js';
import { startInstagramImageDownload } from '../features/ig-image-download/background/index.js';
import { startTwitterDownload, startTwitterImageDownload, startTwitterImagesZip } from '../features/twitter-download/background/index.js';
import { MESSAGE_TYPES } from '../shared/contracts/message-types.js';

loadDownloadMap().catch((err) => console.error('Failed to load download map', err));

chrome.downloads.onChanged.addListener(async (delta) => {
  const jobId = getJobIdByDownloadId(delta.id);
  if (!jobId) return;

  await updateJob(jobId, (job) => {
    if (delta.bytesReceived?.current != null && delta.totalBytes?.current) {
      const total = delta.totalBytes.current || job.totalBytes || 0;
      const received = delta.bytesReceived.current;
      if (total > 0) {
        job.totalBytes = total;
        job.progress = Math.min(100, Math.round((received / total) * 100));
      }
    }

    if (delta.state?.current === 'complete') {
      job.status = 'completed';
      job.progress = 100;
    } else if (delta.state?.current === 'interrupted') {
      job.status = 'failed';
      job.error = delta.error?.current || 'Download interrupted';
    } else {
      if (job.status === 'preparing') {
        job.status = 'downloading';
      }
    }
  });
});

function maybeOpenPopup(message) {
  if (!message?.openPopup || !chrome.action?.openPopup) return;

  try {
    chrome.action.openPopup(() => {
      if (chrome.runtime.lastError) {
        console.warn('openPopup failed:', chrome.runtime.lastError.message);
      }
    });
  } catch (err) {
    console.warn('openPopup threw:', err);
  }
}

async function handleRetryDownload(jobId) {
  const state = await getDownloadsState();
  const previous = state.history.find((job) => job.id === jobId);
  if (!previous) {
    return { success: false, error: 'Kayıt bulunamadı' };
  }

  if (previous.type === MESSAGE_TYPES.YT_AUDIO_DOWNLOAD || previous.type === MESSAGE_TYPES.YT_VIDEO_DOWNLOAD) {
    const videoId = getYoutubeIdFromUrl(previous.sourceUrl);
    if (!videoId) {
      return { success: false, error: 'Video ID bulunamadı' };
    }

    return startYoutubeDownload(previous.type, videoId, previous.title || previous.fileName);
  }

  if (previous.type === MESSAGE_TYPES.IG_AUDIO_DOWNLOAD) {
    return startInstagramDownload(MESSAGE_TYPES.IG_AUDIO_DOWNLOAD, previous.sourceUrl, previous.title || previous.fileName);
  }

  if (previous.type === MESSAGE_TYPES.IG_VIDEO_DOWNLOAD) {
    return startInstagramDownload(MESSAGE_TYPES.IG_VIDEO_DOWNLOAD, previous.sourceUrl, previous.title || previous.fileName, {
      directMedia: previous.mediaUrl
        ? {
          url: previous.mediaUrl,
          type: 'video',
          ext: inferExtFromUrl(previous.mediaUrl, 'mp4')
        }
        : null
    });
  }

  if (previous.type === MESSAGE_TYPES.IG_IMAGE_DOWNLOAD) {
    const mediaUrl = previous.mediaUrl || previous.sourceUrl;
    if (!mediaUrl) {
      return { success: false, error: 'Kaynak bulunamadı' };
    }

    return startInstagramImageDownload({
      reelUrl: previous.sourceUrl || mediaUrl,
      reelTitle: previous.title || previous.fileName,
      mediaUrl
    });
  }

  if (previous.type === MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD) {
    if (!previous.sourceUrl) {
      return { success: false, error: 'Kaynak bulunamadı' };
    }

    return { success: false, error: 'ZIP yeniden indirilemiyor (URL listesi eksik)' };
  }

  if (previous.type === MESSAGE_TYPES.X_AUDIO_DOWNLOAD) {
    return startTwitterDownload(MESSAGE_TYPES.X_AUDIO_DOWNLOAD, previous.sourceUrl, previous.title || previous.fileName);
  }

  if (previous.type === MESSAGE_TYPES.X_VIDEO_DOWNLOAD) {
    return startTwitterDownload(MESSAGE_TYPES.X_VIDEO_DOWNLOAD, previous.sourceUrl, previous.title || previous.fileName);
  }

  return { success: false, error: 'Bu tür için yeniden indirme desteklenmiyor' };
}

const messageHandlers = {
  [MESSAGE_TYPES.GET_SETTINGS]: async () => getSettings(),
  [MESSAGE_TYPES.GET_DOWNLOADS]: async () => getDownloadsState(),
  [MESSAGE_TYPES.YT_AUDIO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startYoutubeDownload(MESSAGE_TYPES.YT_AUDIO_DOWNLOAD, message.videoId, message.videoTitle);
  },
  [MESSAGE_TYPES.YT_VIDEO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startYoutubeDownload(MESSAGE_TYPES.YT_VIDEO_DOWNLOAD, message.videoId, message.videoTitle);
  },
  [MESSAGE_TYPES.IG_AUDIO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startInstagramDownload(MESSAGE_TYPES.IG_AUDIO_DOWNLOAD, message.reelUrl, message.reelTitle, {
      directMedia: message.directMedia
    });
  },
  [MESSAGE_TYPES.IG_VIDEO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startInstagramDownload(MESSAGE_TYPES.IG_VIDEO_DOWNLOAD, message.reelUrl, message.reelTitle, {
      directMedia: message.directMedia
    });
  },
  [MESSAGE_TYPES.IG_IMAGE_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startInstagramImageDownload({
      reelUrl: message.reelUrl,
      reelTitle: message.reelTitle,
      mediaUrl: message.directMedia?.url || message.imageUrl || ''
    });
  },
  [MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startInstagramImagesZip({
      reelUrl: message.reelUrl,
      reelTitle: message.reelTitle,
      imageUrls: message.imageUrls
    });
  },
  [MESSAGE_TYPES.X_AUDIO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startTwitterDownload(MESSAGE_TYPES.X_AUDIO_DOWNLOAD, message.tweetUrl, message.tweetTitle);
  },
  [MESSAGE_TYPES.X_VIDEO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startTwitterDownload(MESSAGE_TYPES.X_VIDEO_DOWNLOAD, message.tweetUrl, message.tweetTitle);
  },
  [MESSAGE_TYPES.X_IMAGE_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startTwitterImageDownload({
      tweetUrl: message.tweetUrl,
      tweetTitle: message.tweetTitle,
      imageUrl: message.imageUrl
    });
  },
  [MESSAGE_TYPES.X_IMAGE_ZIP_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    return startTwitterImagesZip({
      tweetUrl: message.tweetUrl,
      tweetTitle: message.tweetTitle,
      imageUrls: message.imageUrls
    });
  },
  [MESSAGE_TYPES.CANCEL_DOWNLOAD]: async (message) => {
    const { jobId, downloadId } = message;
    if (downloadId) {
      chrome.downloads.cancel(downloadId);
    }

    await updateJob(jobId, (job) => {
      job.status = 'cancelled';
    });
    return { success: true };
  },
  [MESSAGE_TYPES.CLEAR_DOWNLOAD_HISTORY]: async () => {
    await clearHistory();
    return { success: true };
  },
  [MESSAGE_TYPES.RETRY_DOWNLOAD]: async (message) => handleRetryDownload(message.jobId)
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message?.type];
  if (!handler) return undefined;

  Promise.resolve(handler(message, sender))
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error('Background message handler failed:', message?.type, error);
      sendResponse({ success: false, error: error?.message || 'Unknown error' });
    });

  return true;
});
