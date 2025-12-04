// Import feature modules statically, as Service Workers do not support variable dynamic imports.
import youtubeMp3Download from './features/youtube/mp3-download/index.js';
import youtubeMp4Download from './features/youtube/mp4-download/index.js';
import instagramReelsMp3 from './features/instagram/reels-mp3/index.js';
import instagramReelsMp4 from './features/instagram/reels-mp4/index.js';
import twitterMp3Download from './features/twitter/mp3-download/index.js';
import twitterMp4Download from './features/twitter/mp4-download/index.js';

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

function createJob({ type, title, sourceUrl, fileName }) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title,
    fileName,
    sourceUrl,
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

async function startInstagramDownload(kind, reelUrl, reelTitle) {
  let reelId = '';
  try {
    reelId = new URL(reelUrl).pathname.split('/').filter(Boolean).pop() || '';
  } catch (e) {
    reelId = '';
  }
  const isMp4 = kind === 'instagram-mp4';
  const ext = isMp4 ? 'mp4' : 'mp3';
  const baseTitle = reelTitle || reelId || 'instagram-reel';
  const ts = Date.now();
  const fileName = buildTimestampFile(kind, ext, ts);
  const job = createJob({
    type: kind,
    title: baseTitle,
    fileName,
    sourceUrl: reelUrl
  });
  await addJob(job);

  try {
    const downloadUrl = await (isMp4 ? getMp4DownloadUrl : getMp3DownloadUrl)(reelUrl, (progress) => {
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
    console.error('Error during MP3 download:', error);
    updateJob(job.id, (j) => {
      j.status = 'failed';
      j.error = error.message;
    });
    return { success: false, error: error.message };
  }
}

async function startTwitterDownload(kind, tweetUrl, tweetTitle) {
  let tweetId = '';
  try {
    tweetId = new URL(tweetUrl).pathname.split('/').filter(Boolean).pop() || '';
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
    sourceUrl: tweetUrl
  });
  await addJob(job);

  try {
    const downloadUrl = await (isMp4 ? getMp4DownloadUrl : getMp3DownloadUrl)(tweetUrl, (progress) => {
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
    startInstagramDownload('instagram-mp3', message.reelUrl, message.reelTitle).then(sendResponse);
    return true;
  }

  if (message?.type === 'download-instagram-mp4') {
    startInstagramDownload('instagram-mp4', message.reelUrl, message.reelTitle).then(sendResponse);
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
        const res = await startInstagramDownload('instagram-mp4', previous.sourceUrl, previous.title || previous.fileName);
        sendResponse(res);
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
