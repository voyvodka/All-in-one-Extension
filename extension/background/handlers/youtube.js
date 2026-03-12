import { buildTimestampFile } from '../utils.js';
import { createJob, addJob, updateJob } from '../downloads/store.js';
import { getMp3DownloadUrl, getMp4DownloadUrl } from '../providers/loaderTo.js';

export async function startYoutubeDownload(kind, videoId, videoTitle) {
  const isMp4 = kind === 'yt-video-download';
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const fileExt = isMp4 ? 'mp4' : 'mp3';
  const ts = Date.now();
  const fileName = buildTimestampFile(kind, fileExt, ts);
  const job = createJob({
    type: kind,
    title: videoTitle,
    fileName,
    sourceUrl: videoUrl
  });
  await addJob(job);

  try {
    const downloadUrl = await (isMp4 ? getMp4DownloadUrl : getMp3DownloadUrl)(videoUrl, (progress) => {
      if (progress?.progress != null) {
        updateJob(job.id, (j) => {
          j.status = 'preparing';
          j.progress = Math.max(j.progress || 0, Math.min(99, Math.round(progress.progress)));
        });
      }
    });

    const result = await new Promise((resolve) => {
      chrome.downloads.download({
        url: downloadUrl,
        filename: fileName,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          console.error('Download failed:', errMsg);
          updateJob(job.id, (j) => {
            j.status = 'failed';
            j.error = errMsg;
          });
          resolve({ success: false, error: errMsg });
        } else if (downloadId) {
          console.log('Download started with ID:', downloadId);
          updateJob(job.id, (j) => {
            j.status = 'downloading';
            j.downloadId = downloadId;
          });
          resolve({ success: true });
        } else {
          console.log('Download cancelled by user.');
          updateJob(job.id, (j) => {
            j.status = 'failed';
            j.error = 'USER_CANCELED';
          });
          resolve({ success: false, error: 'USER_CANCELED' });
        }
      });
    });

    return result;
  } catch (error) {
    console.error('Error during download:', error);
    updateJob(job.id, (j) => {
      j.status = 'failed';
      j.error = error.message;
    });
    return { success: false, error: error.message };
  }
}

