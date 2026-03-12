import { t } from '../../../shared/i18n.js';
import { createJob, addJob, updateJob, registerDownloadId } from '../../../background/downloads/store.js';
import { buildTimestampFile, inferExtFromUrl } from '../../../background/utils.js';

export async function startInstagramImageDownload({ reelUrl, reelTitle, mediaUrl }) {
  if (!mediaUrl) {
    return { success: false, error: t('instagramPhotoUrlMissing') };
  }

  const baseTitle = reelTitle || 'instagram-image';
  const ext = inferExtFromUrl(mediaUrl, 'jpg');
  const ts = Date.now();
  const fileName = buildTimestampFile('ig-image-download', ext, ts);
  const job = createJob({
    type: 'ig-image-download',
    title: baseTitle,
    fileName,
    sourceUrl: reelUrl,
    mediaUrl
  });
  await addJob(job);

  return await new Promise((resolve) => {
    chrome.downloads.download(
      {
        url: mediaUrl,
        filename: fileName,
        saveAs: true
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          console.error('Download failed:', errMsg);
          updateJob(job.id, (nextJob) => {
            nextJob.status = 'failed';
            nextJob.error = errMsg;
          });
          resolve({ success: false, error: errMsg });
        } else if (downloadId) {
          registerDownloadId(downloadId, job.id);
          updateJob(job.id, (nextJob) => {
            nextJob.status = 'downloading';
            nextJob.downloadId = downloadId;
          });
          resolve({ success: true });
        } else {
          updateJob(job.id, (nextJob) => {
            nextJob.status = 'failed';
            nextJob.error = 'USER_CANCELED';
          });
          resolve({ success: false, error: 'USER_CANCELED' });
        }
      }
    );
  });
}
