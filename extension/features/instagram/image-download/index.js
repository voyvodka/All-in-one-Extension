export function createInstagramImageDownloadHandler({
  buildTimestampFile,
  createJob,
  addJob,
  updateJob,
  inferExtFromUrl,
  registerDownloadId
}) {
  return async function startInstagramImageDownload({ reelUrl, reelTitle, mediaUrl }) {
    if (!mediaUrl) {
      return { success: false, error: 'Fotoğraf URL bulunamadı' };
    }

    const baseTitle = reelTitle || 'instagram-image';
    const ext = inferExtFromUrl(mediaUrl, 'jpg');
    const ts = Date.now();
    const fileName = buildTimestampFile('instagram-image', ext, ts);
    const job = createJob({
      type: 'instagram-image',
      title: baseTitle,
      fileName,
      sourceUrl: reelUrl,
      mediaUrl
    });
    await addJob(job);

    const result = await new Promise((resolve) => {
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
            updateJob(job.id, (j) => {
              j.status = 'failed';
              j.error = errMsg;
            });
            resolve({ success: false, error: errMsg });
          } else if (downloadId) {
            console.log('Download started with ID:', downloadId);
            registerDownloadId?.(downloadId, job.id);
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

    return result;
  };
}
