import { buildTimestampFile, inferExtFromUrl } from '../../../background/utils.js';
import { buildZip, uint8ToBase64 } from '../../../background/downloads/zip.js';
import { createJob, addJob, updateJob, registerDownloadId } from '../../../background/downloads/store.js';
import { getMp3DownloadUrl, getMp4DownloadUrl } from '../../../background/providers/loaderTo.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';
import type { ProgressEvent } from '../../../background/providers/loaderTo.js';

export interface DownloadResult {
  success: boolean;
  error?: string;
}

export interface DirectMedia {
  url?: string;
  type?: string;
  ext?: string;
}

export interface InstagramDownloadOptions {
  directMedia?: DirectMedia | null;
}

export async function startInstagramDownload(
  kind: string,
  reelUrl: string,
  reelTitle: string,
  options: InstagramDownloadOptions = {}
): Promise<DownloadResult> {
  let reelId = '';
  try {
    reelId = new URL(reelUrl).pathname.split('/').filter(Boolean).pop() ?? '';
  } catch {
    reelId = '';
  }
  const isMp4 = kind === MESSAGE_TYPES.IG_VIDEO_DOWNLOAD;
  const directMedia = options?.directMedia ?? null;
  const mediaUrl = directMedia?.url ?? null;
  const jobType = directMedia?.type === 'image' ? MESSAGE_TYPES.IG_IMAGE_DOWNLOAD : kind;
  const defaultExt = directMedia?.type === 'image' ? 'jpg' : isMp4 ? 'mp4' : 'mp3';
  const ext = directMedia?.ext ?? inferExtFromUrl(mediaUrl, defaultExt);
  const baseTitle = reelTitle || reelId || 'instagram-reel';
  const ts = Date.now();
  const fileName = buildTimestampFile(jobType, ext, ts);
  const job = createJob({
    type: jobType,
    title: baseTitle,
    fileName,
    sourceUrl: reelUrl,
    mediaUrl
  });
  await addJob(job);

  const handleProgress = (progress: ProgressEvent) => {
    if (progress?.progress != null) {
      updateJob(job.id, (j) => {
        j.status = 'preparing';
        j.progress = Math.max(j.progress || 0, Math.min(99, Math.round(progress.progress)));
      });
    }
  };

  const startBrowserDownload = (downloadUrl: string): Promise<DownloadResult> =>
    new Promise((resolve) => {
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
            console.log('Download started with ID:', downloadId);
            registerDownloadId(downloadId, job.id);
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
        }
      );
    });

  try {
    const downloadUrl =
      mediaUrl ??
      (await (isMp4 ? getMp4DownloadUrl : getMp3DownloadUrl)(reelUrl, handleProgress));
    const result = await startBrowserDownload(downloadUrl);
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

export interface InstagramImagesZipParams {
  reelUrl: string;
  reelTitle: string;
  imageUrls: string[];
}

export async function startInstagramImagesZip({
  reelUrl,
  reelTitle,
  imageUrls
}: InstagramImagesZipParams): Promise<DownloadResult> {
  const uniqueUrls = Array.from(new Set((imageUrls ?? []).filter(Boolean)));
  if (!uniqueUrls.length) {
    return { success: false, error: 'Fotoğraf bulunamadı' };
  }

  const baseTitle = reelTitle || 'instagram-images';
  const ts = Date.now();
  const fileName = buildTimestampFile(MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD, 'zip', ts);
  const job = createJob({
    type: MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD,
    title: baseTitle,
    fileName,
    sourceUrl: reelUrl
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
      })
    );

    const zipBytes = buildZip(fetched);
    const dataUrl = `data:application/zip;base64,${uint8ToBase64(zipBytes)}`;

    const result = await new Promise<DownloadResult>((resolve) => {
      chrome.downloads.download(
        {
          url: dataUrl,
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
        }
      );
    });

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Error during bulk image zip:', error);
    updateJob(job.id, (j) => {
      j.status = 'failed';
      j.error = errMsg;
    });
    return { success: false, error: errMsg };
  }
}
