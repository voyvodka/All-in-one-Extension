// Import feature modules statically, as Service Workers do not support variable dynamic imports.
import youtubeMp3Download from './features/youtube-mp3-download/index.js';
import youtubeMp4Download from './features/youtube-mp4-download/index.js';
import instagramReelsMp3 from './features/instagram-reels-mp3/index.js';

// Import shared utilities
import { getSettings, onSettingsChanged, upsertFeatureState } from './shared/storage.js';

// Statically define the list of features for the background script.
const features = [
  youtubeMp3Download,
  youtubeMp4Download,
  instagramReelsMp3,
];

const LOADER_BASE_URL = 'https://loader.to';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeTitle(title, maxLen = 30, identifier) {
  const base = (title || 'download')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '');

  let suffix = '';
  if (identifier) {
    const cleanId = String(identifier).replace(/[^a-zA-Z0-9_-]+/g, '');
    if (cleanId) suffix = `_${cleanId.slice(0, 8)}`;
  }

  const combined = (base + suffix).slice(0, maxLen);
  return combined || 'download';
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

async function getMp3DownloadUrl(videoUrl) {
  const startUrl = `${LOADER_BASE_URL}/ajax/download.php?format=mp3&url=${encodeURIComponent(videoUrl)}`;
  const startData = await fetchLoaderJson(startUrl, 'Failed to start conversion');

  const jobId = startData?.id;
  if (!jobId) {
    throw new Error(startData?.text || 'API response missing conversion id.');
  }

  if (startData.download_url) {
    return startData.download_url;
  }

  // Loader.to can take a while; poll for up to ~2 minutes
  const maxAttempts = 60;
  let lastStatus = startData?.status || startData?.text;
  await wait(2500);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await wait(2000);
    const progressUrl = `${LOADER_BASE_URL}/ajax/progress.php?id=${jobId}`;
    const progressData = await fetchLoaderJson(progressUrl, 'Failed to poll conversion');

    if (progressData?.download_url) {
      return progressData.download_url;
    }

    if (progressData?.status === 'error') {
      throw new Error(progressData?.text || 'Conversion failed on server.');
    }

    lastStatus = progressData?.status || progressData?.text || lastStatus;
  }

  throw new Error(`Timed out while waiting for download link. Last status: ${lastStatus || 'unknown'}`);
}

async function getMp4DownloadUrl(videoUrl) {
  const startUrl = `${LOADER_BASE_URL}/ajax/download.php?format=1080&url=${encodeURIComponent(videoUrl)}`;
  const startData = await fetchLoaderJson(startUrl, 'Failed to start conversion');

  const jobId = startData?.id;
  if (!jobId) {
    throw new Error(startData?.text || 'API response missing conversion id.');
  }

  if (startData.download_url) {
    return startData.download_url;
  }

  // Loader.to can take a while; poll for up to ~2 minutes
  const maxAttempts = 60;
  let lastStatus = startData?.status || startData?.text;
  await wait(2500);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await wait(2000);
    const progressUrl = `${LOADER_BASE_URL}/ajax/progress.php?id=${jobId}`;
    const progressData = await fetchLoaderJson(progressUrl, 'Failed to poll conversion');

    if (progressData?.download_url) {
      return progressData.download_url;
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

async function registerContextMenus() {
  if (!chrome.contextMenus) return;
  
  const settings = await getSettings();
  chrome.contextMenus.removeAll(() => {
    for (const feature of features) {
      chrome.contextMenus.create({
        id: `feature-${feature.id}`,
        title: feature.label,
        contexts: ['all'],
        type: 'checkbox',
        checked: settings.features[feature.id] ?? true
      });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'get-settings') {
    getSettings().then(sendResponse);
    return true; // keep channel open
  }

  if (message?.type === 'download-mp3') {
    (async () => {
      try {
        const { videoId, videoTitle } = message;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const downloadUrl = await getMp3DownloadUrl(videoUrl);
        const sanitizedTitle = sanitizeTitle(videoTitle, 30, videoId);

        chrome.downloads.download({
          url: downloadUrl,
          filename: `${sanitizedTitle}.mp3`,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else if (downloadId) {
            console.log('Download started with ID:', downloadId);
            sendResponse({ success: true });
          } else {
            // Download was cancelled by the user
            console.log('Download cancelled by user.');
            sendResponse({ success: false, error: 'Download cancelled by user.' });
          }
        });
      } catch (error) {
        console.error('Error during MP3 download:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // keep channel open for async response
  }

  if (message?.type === 'download-mp4') {
    (async () => {
      try {
        const { videoId, videoTitle } = message;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const downloadUrl = await getMp4DownloadUrl(videoUrl);
        const sanitizedTitle = sanitizeTitle(videoTitle, 30, videoId);

        chrome.downloads.download({
          url: downloadUrl,
          filename: `${sanitizedTitle}.mp4`,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else if (downloadId) {
            console.log('Download started with ID:', downloadId);
            sendResponse({ success: true });
          } else {
            // Download was cancelled by the user
            console.log('Download cancelled by user.');
            sendResponse({ success: false, error: 'Download cancelled by user.' });
          }
        });
      } catch (error) {
        console.error('Error during MP4 download:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // keep channel open for async response
  }

  if (message?.type === 'download-instagram-mp3') {
    (async () => {
      try {
        const { reelUrl, reelTitle } = message;
        const downloadUrl = await getMp3DownloadUrl(reelUrl);
        let reelId = '';
        try {
          reelId = new URL(reelUrl).pathname.split('/').filter(Boolean).pop() || '';
        } catch (e) {
          reelId = '';
        }
        const sanitizedTitle = sanitizeTitle(reelTitle || 'instagram-reel', 30, reelId);

        chrome.downloads.download({
          url: downloadUrl,
          filename: `${sanitizedTitle}.mp3`,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError.message);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else if (downloadId) {
            console.log('Download started with ID:', downloadId);
            sendResponse({ success: true });
          } else {
            console.log('Download cancelled by user.');
            sendResponse({ success: false, error: 'Download cancelled by user.' });
          }
        });
      } catch (error) {
        console.error('Error during MP3 download:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  return undefined;
});
