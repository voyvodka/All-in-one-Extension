import {
  buildTimestampFile,
  normalizeTwitterUrl,
  inferExtFromUrl,
} from '../../../background/utils.js';
import { buildZip, uint8ToBase64 } from '../../../background/downloads/zip.js';
import {
  createJob,
  addJob,
  updateJob,
  registerDownloadId,
} from '../../../background/downloads/store.js';
import { getMp3DownloadUrl, getMp4DownloadUrl } from '../../../background/providers/loaderTo.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';
import type { ProgressEvent } from '../../../background/providers/loaderTo.js';

export interface DownloadResult {
  success: boolean;
  error?: string;
}

export async function startTwitterDownload(
  kind: string,
  tweetUrl: string,
  tweetTitle: string,
): Promise<DownloadResult> {
  const normalizedUrl = normalizeTwitterUrl(tweetUrl);
  const effectiveUrl = normalizedUrl || tweetUrl;
  let tweetId: string;
  try {
    tweetId = new URL(effectiveUrl).pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    tweetId = '';
  }
  const isMp4 = kind === MESSAGE_TYPES.X_VIDEO_DOWNLOAD;
  const ext = isMp4 ? 'mp4' : 'mp3';
  const baseTitle = tweetTitle || tweetId || 'twitter-video';
  const ts = Date.now();
  const fileName = buildTimestampFile(kind, ext, ts);
  const job = createJob({
    type: kind,
    title: baseTitle,
    fileName,
    sourceUrl: effectiveUrl,
  });
  await addJob(job);

  try {
    const downloadUrl = await (isMp4 ? getMp4DownloadUrl : getMp3DownloadUrl)(
      effectiveUrl,
      (progress: ProgressEvent) => {
        if (progress?.progress != null) {
          updateJob(job.id, (j) => {
            j.status = 'preparing';
            j.progress = Math.max(j.progress || 0, Math.min(99, Math.round(progress.progress)));
          });
        }
      },
    );

    const result = await new Promise<DownloadResult>((resolve) => {
      chrome.downloads.download(
        {
          url: downloadUrl,
          filename: fileName,
          saveAs: true,
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
        },
      );
    });

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error during download:', error);
    await updateJob(job.id, (j) => {
      j.status = 'failed';
      j.error = errMsg;
    });
    return { success: false, error: errMsg };
  }
}

export interface TwitterImageDownloadParams {
  tweetUrl: string;
  tweetTitle: string;
  imageUrl: string;
}

export async function startTwitterImageDownload({
  tweetUrl,
  tweetTitle,
  imageUrl,
}: TwitterImageDownloadParams): Promise<DownloadResult> {
  const normalizedUrl = normalizeTwitterUrl(tweetUrl ?? '');
  const effectiveTweetUrl = normalizedUrl || tweetUrl || imageUrl || '';
  const ext = inferExtFromUrl(imageUrl, 'jpg');
  const ts = Date.now();

  const baseTitle = tweetTitle || 'twitter-image';
  const fileName = buildTimestampFile(MESSAGE_TYPES.X_IMAGE_DOWNLOAD, ext, ts);

  const job = createJob({
    type: MESSAGE_TYPES.X_IMAGE_DOWNLOAD,
    title: baseTitle,
    fileName,
    sourceUrl: effectiveTweetUrl,
    mediaUrl: imageUrl,
  });
  await addJob(job);

  return await new Promise<DownloadResult>((resolve) => {
    chrome.downloads.download(
      {
        url: imageUrl,
        filename: fileName,
        saveAs: true,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message ?? '';
          console.error('Twitter image download failed:', errMsg);
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
            j.progress = 100;
          });
          resolve({ success: true });
        } else {
          updateJob(job.id, (j) => {
            j.status = 'failed';
            j.error = 'USER_CANCELED';
          });
          resolve({ success: false, error: 'USER_CANCELED' });
        }
      },
    );
  });
}

export interface TwitterImagesZipParams {
  tweetUrl: string;
  tweetTitle: string;
  imageUrls: string[];
}

export async function startTwitterImagesZip({
  tweetUrl,
  tweetTitle,
  imageUrls,
}: TwitterImagesZipParams): Promise<DownloadResult> {
  const uniqueUrls = Array.from(new Set((imageUrls ?? []).filter(Boolean)));
  if (!uniqueUrls.length) {
    return { success: false, error: 'Fotoğraf bulunamadı' };
  }

  const baseTitle = tweetTitle || 'twitter-images';
  const ts = Date.now();
  const fileName = buildTimestampFile(MESSAGE_TYPES.X_IMAGE_ZIP_DOWNLOAD, 'zip', ts);

  const job = createJob({
    type: MESSAGE_TYPES.X_IMAGE_ZIP_DOWNLOAD,
    title: baseTitle,
    fileName,
    sourceUrl: tweetUrl,
    retryImageUrls: uniqueUrls,
  });
  await addJob(job);

  try {
    const fetched = await Promise.all(
      uniqueUrls.map(async (url, idx) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fotoğraf indirilemedi (${res.status})`);
        const buf = new Uint8Array(await res.arrayBuffer());
        const ext = inferExtFromUrl(url, 'jpg');
        const name = `IMG_${ts + idx}.${ext}`;
        return { name, data: buf };
      }),
    );

    const zipBytes = buildZip(fetched);
    const dataUrl = `data:application/zip;base64,${uint8ToBase64(zipBytes)}`;

    const result = await new Promise<DownloadResult>((resolve) => {
      chrome.downloads.download(
        {
          url: dataUrl,
          filename: fileName,
          saveAs: true,
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message ?? '';
            console.error('Twitter zip download failed:', errMsg);
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
              j.progress = 100;
            });
            resolve({ success: true });
          } else {
            updateJob(job.id, (j) => {
              j.status = 'failed';
              j.error = 'USER_CANCELED';
            });
            resolve({ success: false, error: 'USER_CANCELED' });
          }
        },
      );
    });

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error during twitter bulk image zip:', error);
    updateJob(job.id, (j) => {
      j.status = 'failed';
      j.error = errMsg;
    });
    return { success: false, error: errMsg };
  }
}
