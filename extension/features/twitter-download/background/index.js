import { buildTimestampFile, normalizeTwitterUrl, inferExtFromUrl } from '../../../background/utils.js';
import { buildZip, uint8ToBase64 } from '../../../background/downloads/zip.js';
import { createJob, addJob, updateJob, registerDownloadId } from '../../../background/downloads/store.js';
import { getMp3DownloadUrl, getMp4DownloadUrl } from '../../../background/providers/loaderTo.js';

export async function startTwitterDownload(kind, tweetUrl, tweetTitle) {
  const normalizedUrl = normalizeTwitterUrl(tweetUrl);
  const effectiveUrl = normalizedUrl || tweetUrl;
  let tweetId = '';
  try {
    tweetId = new URL(effectiveUrl).pathname.split('/').filter(Boolean).pop() || '';
  } catch (e) {
    tweetId = '';
  }
  const isMp4 = kind === 'x-video-download';
  const ext = isMp4 ? 'mp4' : 'mp3';
  const baseTitle = tweetTitle || tweetId || 'twitter-video';
  const ts = Date.now();
  const fileName = buildTimestampFile(kind, ext, ts);
  const job = createJob({
    type: kind,
    title: baseTitle,
    fileName,
    sourceUrl: effectiveUrl
  });
  await addJob(job);

  try {
    const downloadUrl = await (isMp4 ? getMp4DownloadUrl : getMp3DownloadUrl)(effectiveUrl, (progress) => {
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

export async function startTwitterImageDownload({ tweetUrl, tweetTitle, imageUrl }) {
  const normalizedUrl = normalizeTwitterUrl(tweetUrl || '');
  const effectiveTweetUrl = normalizedUrl || tweetUrl || imageUrl || '';
  const ext = inferExtFromUrl(imageUrl, 'jpg');
  const ts = Date.now();

  const baseTitle = tweetTitle || 'twitter-image';
  const fileName = buildTimestampFile('x-image-download', ext, ts);

  const job = createJob({
    type: 'x-image-download',
    title: baseTitle,
    fileName,
    sourceUrl: effectiveTweetUrl,
    mediaUrl: imageUrl
  });
  await addJob(job);

  return await new Promise((resolve) => {
    chrome.downloads.download(
      {
        url: imageUrl,
        filename: fileName,
        saveAs: true
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
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
      }
    );
  });
}

export async function startTwitterImagesZip({ tweetUrl, tweetTitle, imageUrls }) {
  const uniqueUrls = Array.from(new Set((imageUrls || []).filter(Boolean)));
  if (!uniqueUrls.length) {
    return { success: false, error: 'Fotoğraf bulunamadı' };
  }

  const baseTitle = tweetTitle || 'twitter-images';
  const ts = Date.now();
  const fileName = buildTimestampFile('x-image-zip-download', 'zip', ts);

  const job = createJob({
    type: 'x-image-zip-download',
    title: baseTitle,
    fileName,
    sourceUrl: tweetUrl
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

    const result = await new Promise((resolve) => {
      chrome.downloads.download(
        {
          url: dataUrl,
          filename: fileName,
          saveAs: true
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            const errMsg = chrome.runtime.lastError.message || '';
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
        }
      );
    });

    return result;
  } catch (error) {
    console.error('Error during twitter bulk image zip:', error);
    updateJob(job.id, (j) => {
      j.status = 'failed';
      j.error = error.message;
    });
    return { success: false, error: error.message };
  }
}
