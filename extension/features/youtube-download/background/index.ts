import { buildTimestampFile } from '../../../background/utils.js';
import { createJob, addJob, updateJob, registerDownloadId } from '../../../background/downloads/store.js';
import { getMp3DownloadUrl, getMp4DownloadUrl } from '../../../background/providers/loaderTo.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';
import type { ProgressEvent } from '../../../background/providers/loaderTo.js';

export interface DownloadResult {
  success: boolean;
  error?: string;
}

export async function startYoutubeDownload(
  kind: string,
  videoId: string,
  videoTitle: string
): Promise<DownloadResult> {
  const isMp4 = kind === MESSAGE_TYPES.YT_VIDEO_DOWNLOAD;
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
    const downloadUrl = await (isMp4 ? getMp4DownloadUrl : getMp3DownloadUrl)(
      videoUrl,
      (progress: ProgressEvent) => {
        if (progress?.progress != null) {
          updateJob(job.id, (j) => {
            j.status = 'preparing';
            j.progress = Math.max(j.progress || 0, Math.min(99, Math.round(progress.progress)));
          });
        }
      }
    );

    const result = await new Promise<DownloadResult>((resolve) => {
      chrome.downloads.download(
        {
          url: downloadUrl,
          filename: fileName,
          saveAs: true
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message ?? '';
            console.error('Download failed:', errMsg);
            updateJob(job.id, (j) => {
              j.status = 'failed';
              j.error = errMsg;
            });
            resolve({ success: false, error: errMsg });
          } else if (downloadId) {
            registerDownloadId(downloadId, job.id);
            updateJob(job.id, (j) => {
              j.status = 'downloading';
              j.downloadId = downloadId;
            });
            resolve({ success: true });
          } else {
            updateJob(job.id, (j) => {
              j.status = 'failed';
              j.error = 'USER_CANCELED';
            });
            resolve({ success: false, error: 'USER_CANCELED' });
          }
        }
      );
    });

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error during download:', error);
    updateJob(job.id, (j) => {
      j.status = 'failed';
      j.error = errMsg;
    });
    return { success: false, error: errMsg };
  }
}
