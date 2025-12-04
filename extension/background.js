// Import feature modules statically, as Service Workers do not support variable dynamic imports.
import youtubeMp3Download from './features/youtube/mp3-download/index.js';
import youtubeMp4Download from './features/youtube/mp4-download/index.js';
import instagramReelsMp3 from './features/instagram/reels-mp3/index.js';
import instagramReelsMp4 from './features/instagram/reels-mp4/index.js';
import twitterMp3Download from './features/twitter/mp3-download/index.js';
import twitterMp4Download from './features/twitter/mp4-download/index.js';
import { createInstagramImageDownloadHandler } from './features/instagram/image-download/index.js';

// Import shared utilities
import {
  getSettings,
  onSettingsChanged,
  upsertFeatureState,
  getDownloadsState,
  updateDownloads
} from './shared/storage.js';

// Statically define the list of features for the background script.
const features = [
  youtubeMp3Download,
  youtubeMp4Download,
  instagramReelsMp3,
  instagramReelsMp4,
  twitterMp3Download,
  twitterMp4Download,
];

const LOADER_BASE_URL = 'https://loader.to';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const downloadIdToJobId = new Map();
const startInstagramImageDownload = createInstagramImageDownloadHandler({
  buildTimestampFile,
  createJob,
  addJob,
  updateJob,
  inferExtFromUrl,
  registerDownloadId: (downloadId, jobId) => downloadIdToJobId.set(downloadId, jobId)
});

// CRC32 table for building zip archives without external deps
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let c = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

function dosDateTime(ts = Date.now()) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const mins = d.getMinutes();
  const secs = Math.floor(d.getSeconds() / 2);
  const dosTime = (hours << 11) | (mins << 5) | secs;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function buildZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const { dosTime, dosDate } = dosDateTime(entry.modTime || Date.now());
    const crc = crc32(data);
    const compSize = data.length;
    const uncompSize = data.length;
    const localHeader = new Uint8Array(30);
    const view = new DataView(localHeader.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0, true); // flags
    view.setUint16(8, 0, true); // compression (0 = store)
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, compSize, true);
    view.setUint32(22, uncompSize, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // extra length

    localParts.push(localHeader, nameBytes, data);
    const localHeaderSize = localHeader.length + nameBytes.length;

    const centralHeader = new Uint8Array(46);
    const cview = new DataView(centralHeader.buffer);
    cview.setUint32(0, 0x02014b50, true);
    cview.setUint16(4, 20, true); // version made by
    cview.setUint16(6, 20, true); // version needed
    cview.setUint16(8, 0, true); // flags
    cview.setUint16(10, 0, true); // compression
    cview.setUint16(12, dosTime, true);
    cview.setUint16(14, dosDate, true);
    cview.setUint32(16, crc, true);
    cview.setUint32(20, compSize, true);
    cview.setUint32(24, uncompSize, true);
    cview.setUint16(28, nameBytes.length, true);
    cview.setUint16(30, 0, true); // extra len
    cview.setUint16(32, 0, true); // comment len
    cview.setUint16(34, 0, true); // disk number
    cview.setUint16(36, 0, true); // internal attrs
    cview.setUint32(38, 0, true); // external attrs
    cview.setUint32(42, offset, true); // local header offset

    centralParts.push(centralHeader, nameBytes);
    offset += localHeaderSize + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;
  const eocd = new Uint8Array(22);
  const eview = new DataView(eocd.buffer);
  eview.setUint32(0, 0x06054b50, true);
  eview.setUint16(4, 0, true); // disk num
  eview.setUint16(6, 0, true); // start disk
  eview.setUint16(8, entries.length, true);
  eview.setUint16(10, entries.length, true);
  eview.setUint32(12, centralSize, true);
  eview.setUint32(16, centralOffset, true);
  eview.setUint16(20, 0, true); // comment len

  const totalSize = offset + centralSize + eocd.length;
  const zip = new Uint8Array(totalSize);
  let cursor = 0;
  localParts.forEach((part) => {
    zip.set(part, cursor);
    cursor += part.length;
  });
  centralParts.forEach((part) => {
    zip.set(part, cursor);
    cursor += part.length;
  });
  zip.set(eocd, cursor);
  return zip;
}

function getPlatformPrefix(kind) {
  if (!kind) return 'dl';
  if (kind.includes('youtube')) return 'yt';
  if (kind.includes('instagram')) return 'ig';
  if (kind.includes('twitter')) return 'x';
  return 'dl';
}

function buildTimestampBase(kind, ts = Date.now()) {
  const prefix = getPlatformPrefix(kind);
  return `${prefix}_${ts}`;
}

function buildTimestampFile(kind, ext, ts = Date.now(), suffix) {
  const base = buildTimestampBase(kind, ts);
  const cleanExt = (ext || '').replace(/[^a-z0-9]/gi, '') || 'bin';
  const cleanSuffix = suffix ? `_${String(suffix).replace(/[^a-z0-9_-]+/gi, '')}` : '';
  return `${base}${cleanSuffix}.${cleanExt}`;
}

function normalizeTwitterUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.hostname === 'x.com' || url.hostname.endsWith('.x.com')) {
      url.hostname = 'twitter.com';
    }
    if (url.protocol !== 'https:') {
      url.protocol = 'https:';
    }
    return url.toString();
  } catch {
    return urlString;
  }
}

function inferExtFromUrl(url, fallback) {
  if (!url) return fallback;
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})(?:$|\?)/i);
    if (match?.[1]) {
      const ext = match[1].toLowerCase();
      if (['mp4', 'm4v', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp', 'mp3'].includes(ext)) {
        return ext;
      }
    }
  } catch {
    // ignore invalid URLs
  }
  return fallback;
}

function getYoutubeIdFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const bySearch = url.searchParams.get('v');
    if (bySearch) return bySearch;
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null;
    if (url.pathname.startsWith('/watch')) return url.searchParams.get('v');
    return null;
  } catch {
    return null;
  }
}

function createJob({ type, title, sourceUrl, fileName, mediaUrl }) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title,
    fileName,
    sourceUrl,
    mediaUrl: mediaUrl || null,
    status: 'preparing',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

async function addJob(job) {
  await updateDownloads((state) => {
    state.active.push(job);
    return state;
  });
  return job;
}

async function updateJob(jobId, updater) {
  await updateDownloads((state) => {
    const idx = state.active.findIndex((item) => item.id === jobId);
    if (idx === -1) return state;

    const next = { ...state.active[idx] };
    updater(next);

    const finished = ['completed', 'failed', 'cancelled'].includes(next.status);
    if (finished) {
      state.active.splice(idx, 1);
      state.history.push(next);
      state.history = state.history.slice(-50);
      if (next.downloadId) downloadIdToJobId.delete(next.downloadId);
    } else {
      state.active[idx] = next;
      if (next.downloadId) downloadIdToJobId.set(next.downloadId, jobId);
    }
    return state;
  });
}

async function clearHistory() {
  await updateDownloads((state) => {
    state.history = [];
    return state;
  });
}

async function loadDownloadMap() {
  const state = await getDownloadsState();
  state.active.forEach((job) => {
    if (job.downloadId) {
      downloadIdToJobId.set(job.downloadId, job.id);
    }
  });
}

loadDownloadMap().catch((err) => console.error('Failed to load download map', err));

async function startYoutubeDownload(kind, videoId, videoTitle) {
  const isMp4 = kind === 'youtube-mp4';
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

async function startInstagramDownload(kind, reelUrl, reelTitle, options = {}) {
  let reelId = '';
  try {
    reelId = new URL(reelUrl).pathname.split('/').filter(Boolean).pop() || '';
  } catch (e) {
    reelId = '';
  }
  const isMp4 = kind === 'instagram-mp4';
  const directMedia = options?.directMedia || null;
  const mediaUrl = directMedia?.url || null;
  const jobType = directMedia?.type === 'image' ? 'instagram-image' : kind;
  const defaultExt = directMedia?.type === 'image' ? 'jpg' : isMp4 ? 'mp4' : 'mp3';
  const ext = directMedia?.ext || inferExtFromUrl(mediaUrl, defaultExt);
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

  const handleProgress = (progress) => {
    if (progress?.progress != null) {
      updateJob(job.id, (j) => {
        j.status = 'preparing';
        j.progress = Math.max(j.progress || 0, Math.min(99, Math.round(progress.progress)));
      });
    }
  };

  const startBrowserDownload = (downloadUrl) => new Promise((resolve) => {
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

  try {
    const downloadUrl = mediaUrl || await (isMp4 ? getMp4DownloadUrl : getMp3DownloadUrl)(reelUrl, handleProgress);
    const result = await startBrowserDownload(downloadUrl);
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

async function startInstagramImagesZip({ reelUrl, reelTitle, imageUrls }) {
  const uniqueUrls = Array.from(new Set((imageUrls || []).filter(Boolean)));
  if (!uniqueUrls.length) {
    return { success: false, error: 'Fotoğraf bulunamadı' };
  }

  const baseTitle = reelTitle || 'instagram-images';
  const ts = Date.now();
  const fileName = buildTimestampFile('instagram-images-zip', 'zip', ts);
  const job = createJob({
    type: 'instagram-images-zip',
    title: baseTitle,
    fileName,
    sourceUrl: reelUrl
  });
  await addJob(job);

  try {
    const encoder = new TextEncoder();
    const fetched = await Promise.all(uniqueUrls.map(async (url, idx) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Fotoğraf indirilemedi (${res.status})`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ext = inferExtFromUrl(url, 'jpg');
      const name = `${baseTitle}_${idx + 1}.${ext}`;
      return { name, data: buf };
    }));

    const zipBytes = buildZip(fetched);
    const dataUrl = `data:application/zip;base64,${uint8ToBase64(zipBytes)}`;

    const result = await new Promise((resolve) => {
      chrome.downloads.download({
        url: dataUrl,
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
          downloadIdToJobId.set(downloadId, job.id);
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
      });
    });

    return result;
  } catch (error) {
    console.error('Error during bulk image zip:', error);
    updateJob(job.id, (j) => {
      j.status = 'failed';
      j.error = error.message;
    });
    return { success: false, error: error.message };
  }
}

async function startTwitterDownload(kind, tweetUrl, tweetTitle) {
  const normalizedUrl = normalizeTwitterUrl(tweetUrl);
  const effectiveUrl = normalizedUrl || tweetUrl;
  let tweetId = '';
  try {
    tweetId = new URL(effectiveUrl).pathname.split('/').filter(Boolean).pop() || '';
  } catch (e) {
    tweetId = '';
  }
  const isMp4 = kind === 'twitter-mp4';
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

async function getMp3DownloadUrl(videoUrl, onProgress) {
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

async function getMp4DownloadUrl(videoUrl, onProgress) {
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

// --- Logic can now be synchronous at the top level ---

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  registerContextMenus();
});

chrome.downloads.onChanged.addListener(async (delta) => {
  const jobId = downloadIdToJobId.get(delta.id);
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.menuItemId) return;
  const featureId = String(info.menuItemId).replace('feature-', '');
  const feature = features.find((item) => item.id === featureId);
  if (!feature) return;

  await upsertFeatureState(featureId, (prev) => !prev);
  chrome.tabs.sendMessage(tab.id, {
    type: 'feature-toggled',
    featureId
  });
});

// Keep context menus aligned with feature list
onSettingsChanged(registerContextMenus);

let registerContextMenusPromise = null;
async function registerContextMenus() {
  if (!chrome.contextMenus) return;
  if (registerContextMenusPromise) return registerContextMenusPromise; // avoid overlapping remove/create

  registerContextMenusPromise = (async () => {
    const settings = await getSettings();
    await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));

    for (const feature of features) {
      try {
        chrome.contextMenus.create({
          id: `feature-${feature.id}`,
          title: feature.label,
          contexts: ['all'],
          type: 'checkbox',
          checked: settings.features[feature.id] ?? true
        });
      } catch (error) {
        console.warn('Context menu create failed', feature.id, error);
      }
    }
  })().finally(() => {
    registerContextMenusPromise = null;
  });

  return registerContextMenusPromise;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'get-settings') {
    getSettings().then(sendResponse);
    return true; // keep channel open
  }

  if (message?.type === 'download-mp3') {
    startYoutubeDownload('youtube-mp3', message.videoId, message.videoTitle).then(sendResponse);
    return true; // keep channel open for async response
  }

  if (message?.type === 'download-mp4') {
    startYoutubeDownload('youtube-mp4', message.videoId, message.videoTitle).then(sendResponse);
    return true; // keep channel open for async response
  }

  if (message?.type === 'download-instagram-mp3') {
    startInstagramDownload('instagram-mp3', message.reelUrl, message.reelTitle, {
      directMedia: message.directMedia
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'download-instagram-mp4') {
    startInstagramDownload('instagram-mp4', message.reelUrl, message.reelTitle, {
      directMedia: message.directMedia
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'download-instagram-image') {
    startInstagramImageDownload({
      reelUrl: message.reelUrl,
      reelTitle: message.reelTitle,
      mediaUrl: message.directMedia?.url || message.imageUrl || ''
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'download-instagram-images-zip') {
    startInstagramImagesZip({
      reelUrl: message.reelUrl,
      reelTitle: message.reelTitle,
      imageUrls: message.imageUrls
    }).then(sendResponse);
    return true;
  }

  if (message?.type === 'download-twitter-mp3') {
    startTwitterDownload('twitter-mp3', message.tweetUrl, message.tweetTitle).then(sendResponse);
    return true;
  }

  if (message?.type === 'download-twitter-mp4') {
    startTwitterDownload('twitter-mp4', message.tweetUrl, message.tweetTitle).then(sendResponse);
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

      if (previous.type === 'youtube-mp3' || previous.type === 'youtube-mp4') {
        const videoId = getYoutubeIdFromUrl(previous.sourceUrl);
        if (!videoId) {
          sendResponse({ success: false, error: 'Video ID bulunamadı' });
          return;
        }
        const res = await startYoutubeDownload(previous.type, videoId, previous.title || previous.fileName);
        sendResponse(res);
        return;
      }

      if (previous.type === 'instagram-mp3') {
        const res = await startInstagramDownload('instagram-mp3', previous.sourceUrl, previous.title || previous.fileName);
        sendResponse(res);
        return;
      }

      if (previous.type === 'instagram-mp4') {
        const res = await startInstagramDownload('instagram-mp4', previous.sourceUrl, previous.title || previous.fileName, {
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

      if (previous.type === 'instagram-image') {
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

      if (previous.type === 'instagram-images-zip') {
        if (!previous.sourceUrl) {
          sendResponse({ success: false, error: 'Kaynak bulunamadı' });
          return;
        }
        // Cannot retry without the original URL list; inform user.
        sendResponse({ success: false, error: 'ZIP yeniden indirilemiyor (URL listesi eksik)' });
        return;
      }

      if (previous.type === 'twitter-mp3') {
        const res = await startTwitterDownload('twitter-mp3', previous.sourceUrl, previous.title || previous.fileName);
        sendResponse(res);
        return;
      }

      if (previous.type === 'twitter-mp4') {
        const res = await startTwitterDownload('twitter-mp4', previous.sourceUrl, previous.title || previous.fileName);
        sendResponse(res);
        return;
      }

      sendResponse({ success: false, error: 'Bu tür için yeniden indirme desteklenmiyor' });
    })();
    return true;
  }
  return undefined;
});
