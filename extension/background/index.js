import { getYoutubeIdFromUrl, inferExtFromUrl } from './utils.js';
import { getSettings, getDownloadsState } from '../shared/storage.js';
import { clearHistory, getJobIdByDownloadId, loadDownloadMap, updateJob } from './downloads/store.js';
import { startYoutubeDownload } from './handlers/youtube.js';
import { startInstagramDownload, startInstagramImageDownload, startInstagramImagesZip } from './handlers/instagram.js';
import { startTwitterDownload, startTwitterImageDownload, startTwitterImagesZip } from './handlers/twitter.js';

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'get-settings') {
    getSettings().then(sendResponse);
    return true; // keep channel open
  }

  const maybeOpenPopup = () => {
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
  };

  if (message?.type === 'yt-audio-download') {
    maybeOpenPopup();
    startYoutubeDownload('yt-audio-download', message.videoId, message.videoTitle).then(sendResponse);
    return true;
  }

  if (message?.type === 'yt-video-download') {
    maybeOpenPopup();
    startYoutubeDownload('yt-video-download', message.videoId, message.videoTitle).then(sendResponse);
    return true;
  }

  if (message?.type === 'ig-audio-download') {
    maybeOpenPopup();
    startInstagramDownload('ig-audio-download', message.reelUrl, message.reelTitle, {
      directMedia: message.directMedia
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'ig-video-download') {
    maybeOpenPopup();
    startInstagramDownload('ig-video-download', message.reelUrl, message.reelTitle, {
      directMedia: message.directMedia
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'ig-image-download') {
    maybeOpenPopup();
    startInstagramImageDownload({
      reelUrl: message.reelUrl,
      reelTitle: message.reelTitle,
      mediaUrl: message.directMedia?.url || message.imageUrl || ''
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'ig-image-zip-download') {
    maybeOpenPopup();
    startInstagramImagesZip({
      reelUrl: message.reelUrl,
      reelTitle: message.reelTitle,
      imageUrls: message.imageUrls
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'x-audio-download') {
    maybeOpenPopup();
    startTwitterDownload('x-audio-download', message.tweetUrl, message.tweetTitle).then(sendResponse);
    return true;
  }

  if (message?.type === 'x-video-download') {
    maybeOpenPopup();
    startTwitterDownload('x-video-download', message.tweetUrl, message.tweetTitle).then(sendResponse);
    return true;
  }

  if (message?.type === 'x-image-download') {
    startTwitterImageDownload({
      tweetUrl: message.tweetUrl,
      tweetTitle: message.tweetTitle,
      imageUrl: message.imageUrl
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'x-image-zip-download') {
    startTwitterImagesZip({
      tweetUrl: message.tweetUrl,
      tweetTitle: message.tweetTitle,
      imageUrls: message.imageUrls
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'get-downloads') {
    getDownloadsState().then(sendResponse);
    return true;
  }

  if (message?.type === 'cancel-download') {
    const { jobId, downloadId } = message;
    if (downloadId) {
      chrome.downloads.cancel(downloadId);
    }
    updateJob(jobId, (job) => {
      job.status = 'cancelled';
    }).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message?.type === 'clear-download-history') {
    clearHistory().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message?.type === 'retry-download') {
    (async () => {
      const { jobId } = message;
      const state = await getDownloadsState();
      const previous = state.history.find((job) => job.id === jobId);
      if (!previous) {
        sendResponse({ success: false, error: 'Kayıt bulunamadı' });
        return;
      }

      if (previous.type === 'yt-audio-download' || previous.type === 'yt-video-download') {
        const videoId = getYoutubeIdFromUrl(previous.sourceUrl);
        if (!videoId) {
          sendResponse({ success: false, error: 'Video ID bulunamadı' });
          return;
        }
        const res = await startYoutubeDownload(previous.type, videoId, previous.title || previous.fileName);
        sendResponse(res);
        return;
      }

      if (previous.type === 'ig-audio-download') {
        const res = await startInstagramDownload('ig-audio-download', previous.sourceUrl, previous.title || previous.fileName);
        sendResponse(res);
        return;
      }

      if (previous.type === 'ig-video-download') {
        const res = await startInstagramDownload('ig-video-download', previous.sourceUrl, previous.title || previous.fileName, {
          directMedia: previous.mediaUrl
            ? {
              url: previous.mediaUrl,
              type: 'video',
              ext: inferExtFromUrl(previous.mediaUrl, 'mp4')
            }
            : null
        });
        sendResponse(res);
        return;
      }

      if (previous.type === 'ig-image-download') {
        const mediaUrl = previous.mediaUrl || previous.sourceUrl;
        if (!mediaUrl) {
          sendResponse({ success: false, error: 'Kaynak bulunamadı' });
          return;
        }
        const res = await startInstagramImageDownload({
          reelUrl: previous.sourceUrl || mediaUrl,
          reelTitle: previous.title || previous.fileName,
          mediaUrl
        });
        sendResponse(res);
        return;
      }

      if (previous.type === 'ig-image-zip-download') {
        if (!previous.sourceUrl) {
          sendResponse({ success: false, error: 'Kaynak bulunamadı' });
          return;
        }
        // Cannot retry without the original URL list; inform user.
        sendResponse({ success: false, error: 'ZIP yeniden indirilemiyor (URL listesi eksik)' });
        return;
      }

      if (previous.type === 'x-audio-download') {
        const res = await startTwitterDownload('x-audio-download', previous.sourceUrl, previous.title || previous.fileName);
        sendResponse(res);
        return;
      }

      if (previous.type === 'x-video-download') {
        const res = await startTwitterDownload('x-video-download', previous.sourceUrl, previous.title || previous.fileName);
        sendResponse(res);
        return;
      }

      sendResponse({ success: false, error: 'Bu tür için yeniden indirme desteklenmiyor' });
    })();
    return true;
  }

  return undefined;
});
