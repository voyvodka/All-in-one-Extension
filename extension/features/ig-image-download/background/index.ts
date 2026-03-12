import { t } from '../../../shared/i18n.js';
import { createJob, addJob, updateJob, registerDownloadId } from '../../../background/downloads/store.js';
import { buildTimestampFile, inferExtFromUrl } from '../../../background/utils.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';

export interface DownloadResult {
  success: boolean;
  error?: string;
}

export interface InstagramImageDownloadParams {
  reelUrl: string;
  reelTitle: string;
  mediaUrl: string;
}

export async function startInstagramImageDownload({
  reelUrl,
  reelTitle,
  mediaUrl
}: InstagramImageDownloadParams): Promise<DownloadResult> {
  if (!mediaUrl) {
    return { success: false, error: t('instagramPhotoUrlMissing') };
  }

  const baseTitle = reelTitle || 'instagram-image';
  const ext = inferExtFromUrl(mediaUrl, 'jpg');
  const ts = Date.now();
  const fileName = buildTimestampFile(MESSAGE_TYPES.IG_IMAGE_DOWNLOAD, ext, ts);
  const job = createJob({
    type: MESSAGE_TYPES.IG_IMAGE_DOWNLOAD,
    title: baseTitle,
    fileName,
    sourceUrl: reelUrl,
    mediaUrl
  });
  await addJob(job);

  return await new Promise<DownloadResult>((resolve) => {
    chrome.downloads.download(
      {
        url: mediaUrl,
        filename: fileName,
        saveAs: true
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message ?? '';
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
