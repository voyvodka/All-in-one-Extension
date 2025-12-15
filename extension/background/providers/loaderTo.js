import { wait } from '../utils.js';

const LOADER_BASE_URL = 'https://loader.to';

async function fetchLoaderJson(url, context) {
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${context} - ${response.status}: ${response.statusText}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const snippet = text.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`${context} - Unexpected response: ${snippet}`);
  }
}

function resolveLoaderError(data, fallback = 'Conversion failed: no file returned') {
  const msg = (data?.text || data?.message || data?.status || fallback || '').trim();
  if (/unsupported\s+url/i.test(msg)) {
    return 'Unsupported URL / Desteklenmeyen bağlantı';
  }
  return msg || fallback;
}

export async function getMp3DownloadUrl(videoUrl, onProgress) {
  const startUrl = `${LOADER_BASE_URL}/ajax/download.php?format=mp3&url=${encodeURIComponent(videoUrl)}`;
  const startData = await fetchLoaderJson(startUrl, 'Failed to start conversion');

  const jobId = startData?.id;
  if (!jobId) {
    throw new Error(startData?.text || 'API response missing conversion id.');
  }

  if (startData.download_url) {
    onProgress?.({ status: 'preparing', progress: 100 });
    return startData.download_url;
  }

  // Loader.to can take a while; poll for up to ~2 minutes
  const maxAttempts = 60;
  let lastStatus = startData?.status || startData?.text;
  const startProgress = Number(startData?.progress);
  if (!Number.isNaN(startProgress)) {
    onProgress?.({ status: 'preparing', progress: startProgress });
  }
  await wait(2500);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await wait(2000);
    const progressUrl = `${LOADER_BASE_URL}/ajax/progress.php?id=${jobId}`;
    const progressData = await fetchLoaderJson(progressUrl, 'Failed to poll conversion');
    const prog = Number(progressData?.progress);
    if (!Number.isNaN(prog)) {
      onProgress?.({ status: 'preparing', progress: prog });

      // loader.to returns 1000 when it is finished (success or no-file). Stop polling at that point.
      if (prog >= 1000) {
        if (progressData?.download_url) {
          onProgress?.({ status: 'preparing', progress: 100 });
          return progressData.download_url;
        }
        throw new Error(resolveLoaderError(progressData, 'Conversion stopped by server'));
      }
    }

    if (progressData?.download_url) {
      onProgress?.({ status: 'preparing', progress: 100 });
      return progressData.download_url;
    }

    if (prog > 100) {
      onProgress?.({ status: 'preparing', progress: 100 });
    }

    if (progressData?.status === 'error') {
      throw new Error(progressData?.text || 'Conversion failed on server.');
    }

    lastStatus = progressData?.status || progressData?.text || lastStatus;
  }

  throw new Error(`Timed out while waiting for download link. Last status: ${lastStatus || 'unknown'}`);
}

export async function getMp4DownloadUrl(videoUrl, onProgress) {
  const startUrl = `${LOADER_BASE_URL}/ajax/download.php?format=1080&url=${encodeURIComponent(videoUrl)}`;
  const startData = await fetchLoaderJson(startUrl, 'Failed to start conversion');

  const jobId = startData?.id;
  if (!jobId) {
    throw new Error(startData?.text || 'API response missing conversion id.');
  }

  if (startData.download_url) {
    onProgress?.({ status: 'preparing', progress: 100 });
    return startData.download_url;
  }

  // Loader.to can take a while; poll for up to ~2 minutes
  const maxAttempts = 60;
  let lastStatus = startData?.status || startData?.text;
  const startProgress = Number(startData?.progress);
  if (!Number.isNaN(startProgress)) {
    onProgress?.({ status: 'preparing', progress: startProgress });
  }
  await wait(2500);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await wait(2000);
    const progressUrl = `${LOADER_BASE_URL}/ajax/progress.php?id=${jobId}`;
    const progressData = await fetchLoaderJson(progressUrl, 'Failed to poll conversion');
    const prog = Number(progressData?.progress);
    if (!Number.isNaN(prog)) {
      onProgress?.({ status: 'preparing', progress: prog });

      // loader.to returns 1000 when it is finished (success or no-file). Stop polling at that point.
      if (prog >= 1000) {
        if (progressData?.download_url) {
          onProgress?.({ status: 'preparing', progress: 100 });
          return progressData.download_url;
        }
        throw new Error(resolveLoaderError(progressData, 'Conversion stopped by server'));
      }
    }

    if (progressData?.download_url) {
      onProgress?.({ status: 'preparing', progress: 100 });
      return progressData.download_url;
    }

    if (prog > 100) {
      onProgress?.({ status: 'preparing', progress: 100 });
    }

    if (progressData?.status === 'error') {
      throw new Error(progressData?.text || 'Conversion failed on server.');
    }

    lastStatus = progressData?.status || progressData?.text || lastStatus;
  }

  throw new Error(`Timed out while waiting for download link. Last status: ${lastStatus || 'unknown'}`);
}

