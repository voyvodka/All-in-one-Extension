import { getYoutubeIdFromUrl, inferExtFromUrl } from './utils.js';
import { getSettings, getDownloadsState } from '../shared/storage.js';
import { clearHistory, getJobIdByDownloadId, loadDownloadMap, updateJob } from './downloads/store.js';
import {
  getInstagramAnalyzerDurableAccount,
  removeInstagramAnalyzerResult,
  resolveInstagramViewerUsername,
  startInstagramAnalyzerScan
} from './instagram-analyzer/index.js';
import { startYoutubeDownload } from '../features/youtube-download/background/index.js';
import { startInstagramDownload, startInstagramImagesZip } from '../features/instagram-download/background/index.js';
import { startInstagramImageDownload } from '../features/ig-image-download/background/index.js';
import { startTwitterDownload, startTwitterImageDownload, startTwitterImagesZip } from '../features/twitter-download/background/index.js';
import { MESSAGE_TYPES } from '../shared/contracts/message-types.js';

loadDownloadMap().catch((err) => console.error('Failed to load download map', err));

chrome.downloads.onChanged.addListener(async (delta) => {
  const jobId = getJobIdByDownloadId(delta.id);
  if (!jobId) return;

  // @types/chrome uses a legacy DownloadDelta shape; cast to access extended fields
  const d = delta as unknown as {
    id: number;
    bytesReceived?: { current: number };
    totalBytes?: { current: number };
    state?: { current: string };
    error?: { current: string };
  };

  await updateJob(jobId, (job) => {
    if (d.bytesReceived?.current != null && d.totalBytes?.current) {
      const total = d.totalBytes.current || job.totalBytes || 0;
      const received = d.bytesReceived.current;
      if (total > 0) {
        job.totalBytes = total;
        job.progress = Math.min(100, Math.round((received / total) * 100));
      }
    }

    if (d.state?.current === 'complete') {
      job.status = 'completed';
      job.progress = 100;
    } else if (d.state?.current === 'interrupted') {
      job.status = 'failed';
      job.error = d.error?.current ?? 'Download interrupted';
    } else {
      if (job.status === 'preparing') {
        job.status = 'downloading';
      }
    }
  });
});

interface BaseMessage {
  type?: string;
  openPopup?: boolean;
  [key: string]: unknown;
}

function maybeOpenPopup(message: BaseMessage): void {
  if (!message?.openPopup || !chrome.action?.openPopup) return;

  try {
    chrome.action.openPopup(() => {
      if (chrome.runtime.lastError) {
        console.warn('openPopup failed:', chrome.runtime.lastError.message);
      }
    });
  } catch (err) {
    console.warn('openPopup threw:', err);
  }
}

interface DownloadResult {
  success: boolean;
  error?: string;
}

function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs);
    });
  });
}

function updateTab(tabId: number, updateProperties: chrome.tabs.UpdateProperties): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function focusWindow(windowId: number): Promise<chrome.windows.Window | undefined> {
  return new Promise((resolve, reject) => {
    chrome.windows.update(windowId, { focused: true }, (window) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(window);
    });
  });
}

function createTab(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

function sendTabMessage(tabId: number, message: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function waitForTabComplete(tabId: number, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      reject(new Error('Timed out while waiting for Instagram tab to load'));
    }, timeoutMs);

    const handleUpdated = (updatedTabId: number, changeInfo: { status?: string }): void => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
        return;
      }

      globalThis.clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(handleUpdated);
  });
}

async function openAnalyzerInTab(tabId: number, attempts = 8): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await sendTabMessage(tabId, { type: MESSAGE_TYPES.IG_ANALYZER_OPEN });
      return;
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 350));
    }
  }
}

function normalizeAnalyzerOpenError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/timed out/i.test(message)) {
    return 'Instagram sekmesi zamaninda hazir olmadi. Sayfayi yenileyip tekrar dene.';
  }
  if (/receiving end does not exist|context invalidated|message port closed/i.test(message)) {
    return 'Instagram sayfasi analyzer panelini hazirlayamadi. Sayfayi yenileyip tekrar dene.';
  }
  return 'Instagram Analyzer acilamadi. Instagram sekmesini yenileyip tekrar dene.';
}

async function handleRetryDownload(jobId: string): Promise<DownloadResult> {
  const state = await getDownloadsState();
  const previous = state.history.find((job) => job.id === jobId);
  if (!previous) {
    return { success: false, error: 'Kayıt bulunamadı' };
  }

  if (previous.type === MESSAGE_TYPES.YT_AUDIO_DOWNLOAD || previous.type === MESSAGE_TYPES.YT_VIDEO_DOWNLOAD) {
    const videoId = getYoutubeIdFromUrl(previous.sourceUrl);
    if (!videoId) {
      return { success: false, error: 'Video ID bulunamadı' };
    }

    return startYoutubeDownload(previous.type, videoId, previous.title || previous.fileName);
  }

  if (previous.type === MESSAGE_TYPES.IG_AUDIO_DOWNLOAD) {
    return startInstagramDownload(MESSAGE_TYPES.IG_AUDIO_DOWNLOAD, previous.sourceUrl, previous.title || previous.fileName);
  }

  if (previous.type === MESSAGE_TYPES.IG_VIDEO_DOWNLOAD) {
    return startInstagramDownload(MESSAGE_TYPES.IG_VIDEO_DOWNLOAD, previous.sourceUrl, previous.title || previous.fileName, {
      directMedia: previous.mediaUrl
        ? {
          url: previous.mediaUrl,
          type: 'video',
          ext: inferExtFromUrl(previous.mediaUrl, 'mp4')
        }
        : null
    });
  }

  if (previous.type === MESSAGE_TYPES.IG_IMAGE_DOWNLOAD) {
    const mediaUrl = previous.mediaUrl || previous.sourceUrl;
    if (!mediaUrl) {
      return { success: false, error: 'Kaynak bulunamadı' };
    }

    return startInstagramImageDownload({
      reelUrl: previous.sourceUrl || mediaUrl,
      reelTitle: previous.title || previous.fileName,
      mediaUrl
    });
  }

  if (previous.type === MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD) {
    if (!previous.sourceUrl || !previous.retryImageUrls?.length) {
      return { success: false, error: 'Kaynak bulunamadı' };
    }

    return startInstagramImagesZip({
      reelUrl: previous.sourceUrl,
      reelTitle: previous.title || previous.fileName,
      imageUrls: previous.retryImageUrls
    });
  }

  if (previous.type === MESSAGE_TYPES.X_AUDIO_DOWNLOAD) {
    return startTwitterDownload(MESSAGE_TYPES.X_AUDIO_DOWNLOAD, previous.sourceUrl, previous.title || previous.fileName);
  }

  if (previous.type === MESSAGE_TYPES.X_VIDEO_DOWNLOAD) {
    return startTwitterDownload(MESSAGE_TYPES.X_VIDEO_DOWNLOAD, previous.sourceUrl, previous.title || previous.fileName);
  }

  if (previous.type === MESSAGE_TYPES.X_IMAGE_DOWNLOAD) {
    const imageUrl = previous.mediaUrl || previous.sourceUrl;
    if (!previous.sourceUrl || !imageUrl) {
      return { success: false, error: 'Kaynak bulunamadı' };
    }

    return startTwitterImageDownload({
      tweetUrl: previous.sourceUrl,
      tweetTitle: previous.title || previous.fileName,
      imageUrl
    });
  }

  if (previous.type === MESSAGE_TYPES.X_IMAGE_ZIP_DOWNLOAD) {
    if (!previous.sourceUrl || !previous.retryImageUrls?.length) {
      return { success: false, error: 'Kaynak bulunamadı' };
    }

    return startTwitterImagesZip({
      tweetUrl: previous.sourceUrl,
      tweetTitle: previous.title || previous.fileName,
      imageUrls: previous.retryImageUrls
    });
  }

  return { success: false, error: 'Bu tür için yeniden indirme desteklenmiyor' };
}

async function handleOpenInstagramAnalyzer(fallbackUrl: string): Promise<DownloadResult> {
  const instagramTabs = await queryTabs({
    url: ['https://*.instagram.com/*']
  });
  const targetTab = instagramTabs.find((tab) => typeof tab.id === 'number');

  if (targetTab?.id != null) {
    if (typeof targetTab.windowId === 'number') {
      try {
        await focusWindow(targetTab.windowId);
      } catch (error) {
        console.warn('Failed to focus Instagram window', error);
      }
    }

    await updateTab(targetTab.id, { active: true });
    try {
      await openAnalyzerInTab(targetTab.id);
      return { success: true };
    } catch (error) {
      console.warn('Failed to open analyzer drawer in content script', error);
      return {
        success: false,
        error: normalizeAnalyzerOpenError(error)
      };
    }
  }

  const newTab = await createTab({ url: fallbackUrl || 'https://www.instagram.com/' });
  if (typeof newTab.id === 'number') {
    try {
      await waitForTabComplete(newTab.id);
      await openAnalyzerInTab(newTab.id);
      return { success: true };
    } catch (error) {
      console.warn('Failed to auto-open analyzer drawer in new tab', error);
      return {
        success: false,
        error: normalizeAnalyzerOpenError(error)
      };
    }
  }

  return { success: false, error: 'Instagram sekmesi acilamadi.' };
}

type MessageHandler = (message: BaseMessage) => Promise<unknown>;

/** Safely extract a string field from a message payload, falling back to empty string. */
function str(message: BaseMessage, key: string): string {
  const v = message?.[key];
  return typeof v === 'string' ? v : '';
}

/** Safely extract a string array from a message payload. */
function strArray(message: BaseMessage, key: string): string[] {
  const v = message?.[key];
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string') : [];
}

/** Safely extract an optional object from a message payload. */
function optObj(message: BaseMessage, key: string): Record<string, unknown> | null {
  const v = message?.[key];
  return v != null && typeof v === 'object' && !Array.isArray(v)
    ? v as Record<string, unknown>
    : null;
}

const messageHandlers: Record<string, MessageHandler> = {
  [MESSAGE_TYPES.GET_SETTINGS]: async () => getSettings(),
  [MESSAGE_TYPES.GET_DOWNLOADS]: async () => getDownloadsState(),
  [MESSAGE_TYPES.IG_ANALYZER_OPEN]: async (message) => handleOpenInstagramAnalyzer(str(message, 'fallbackUrl')),
  [MESSAGE_TYPES.IG_ANALYZER_GET_DURABLE_ACCOUNT]: async (message) => {
    const viewerId = str(message, 'viewerId');
    if (!viewerId) return { success: false, error: 'Viewer ID eksik.' };
    const account = await getInstagramAnalyzerDurableAccount(viewerId);
    return { success: true, account };
  },
  [MESSAGE_TYPES.IG_ANALYZER_REMOVE_RESULT]: async (message) => {
    const viewerId = str(message, 'viewerId');
    const targetId = str(message, 'targetId');
    if (!viewerId || !targetId) return { success: false, error: 'Viewer veya hedef hesap bilgisi eksik.' };
    const account = await removeInstagramAnalyzerResult(viewerId, targetId, str(message, 'username'));
    return { success: true, account };
  },
  [MESSAGE_TYPES.IG_ANALYZER_RESOLVE_VIEWER]: async (message) => {
    const viewerId = str(message, 'viewerId');
    if (!viewerId) return { success: false, error: 'Viewer ID eksik.' };
    const username = await resolveInstagramViewerUsername(viewerId, str(message, 'csrfToken'));
    return { success: true, username };
  },
  [MESSAGE_TYPES.IG_ANALYZER_START_SCAN]: async (message) => {
    const viewerId = str(message, 'viewerId');
    if (!viewerId) return { success: false, error: 'Viewer ID eksik.' };
    return startInstagramAnalyzerScan({
      viewerId,
      username: str(message, 'username'),
      csrfToken: str(message, 'csrfToken')
    });
  },
  [MESSAGE_TYPES.YT_AUDIO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const videoId = str(message, 'videoId');
    if (!videoId) return { success: false, error: 'Missing videoId' };
    return startYoutubeDownload(MESSAGE_TYPES.YT_AUDIO_DOWNLOAD, videoId, str(message, 'videoTitle'));
  },
  [MESSAGE_TYPES.YT_VIDEO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const videoId = str(message, 'videoId');
    if (!videoId) return { success: false, error: 'Missing videoId' };
    return startYoutubeDownload(MESSAGE_TYPES.YT_VIDEO_DOWNLOAD, videoId, str(message, 'videoTitle'));
  },
  [MESSAGE_TYPES.IG_AUDIO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const reelUrl = str(message, 'reelUrl');
    if (!reelUrl) return { success: false, error: 'Missing reelUrl' };
    return startInstagramDownload(MESSAGE_TYPES.IG_AUDIO_DOWNLOAD, reelUrl, str(message, 'reelTitle'), {
      directMedia: optObj(message, 'directMedia') as { url?: string; type?: string; ext?: string } | null
    });
  },
  [MESSAGE_TYPES.IG_VIDEO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const reelUrl = str(message, 'reelUrl');
    if (!reelUrl) return { success: false, error: 'Missing reelUrl' };
    return startInstagramDownload(MESSAGE_TYPES.IG_VIDEO_DOWNLOAD, reelUrl, str(message, 'reelTitle'), {
      directMedia: optObj(message, 'directMedia') as { url?: string; type?: string; ext?: string } | null
    });
  },
  [MESSAGE_TYPES.IG_IMAGE_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const reelUrl = str(message, 'reelUrl');
    if (!reelUrl) return { success: false, error: 'Missing reelUrl' };
    const directMedia = optObj(message, 'directMedia');
    const mediaUrl = (directMedia?.['url'] as string) ?? str(message, 'imageUrl');
    if (!mediaUrl) return { success: false, error: 'Missing image URL' };
    return startInstagramImageDownload({
      reelUrl,
      reelTitle: str(message, 'reelTitle'),
      mediaUrl
    });
  },
  [MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const reelUrl = str(message, 'reelUrl');
    const imageUrls = strArray(message, 'imageUrls');
    if (!reelUrl || !imageUrls.length) return { success: false, error: 'Missing reelUrl or imageUrls' };
    return startInstagramImagesZip({
      reelUrl,
      reelTitle: str(message, 'reelTitle'),
      imageUrls
    });
  },
  [MESSAGE_TYPES.X_AUDIO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const tweetUrl = str(message, 'tweetUrl');
    if (!tweetUrl) return { success: false, error: 'Missing tweetUrl' };
    return startTwitterDownload(MESSAGE_TYPES.X_AUDIO_DOWNLOAD, tweetUrl, str(message, 'tweetTitle'));
  },
  [MESSAGE_TYPES.X_VIDEO_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const tweetUrl = str(message, 'tweetUrl');
    if (!tweetUrl) return { success: false, error: 'Missing tweetUrl' };
    return startTwitterDownload(MESSAGE_TYPES.X_VIDEO_DOWNLOAD, tweetUrl, str(message, 'tweetTitle'));
  },
  [MESSAGE_TYPES.X_IMAGE_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const tweetUrl = str(message, 'tweetUrl');
    const imageUrl = str(message, 'imageUrl');
    if (!tweetUrl || !imageUrl) return { success: false, error: 'Missing tweetUrl or imageUrl' };
    return startTwitterImageDownload({
      tweetUrl,
      tweetTitle: str(message, 'tweetTitle'),
      imageUrl
    });
  },
  [MESSAGE_TYPES.X_IMAGE_ZIP_DOWNLOAD]: async (message) => {
    maybeOpenPopup(message);
    const tweetUrl = str(message, 'tweetUrl');
    const imageUrls = strArray(message, 'imageUrls');
    if (!tweetUrl || !imageUrls.length) return { success: false, error: 'Missing tweetUrl or imageUrls' };
    return startTwitterImagesZip({
      tweetUrl,
      tweetTitle: str(message, 'tweetTitle'),
      imageUrls
    });
  },
  [MESSAGE_TYPES.CANCEL_DOWNLOAD]: async (message) => {
    const jobId = str(message, 'jobId');
    if (!jobId) return { success: false, error: 'Missing jobId' };
    const downloadId = message['downloadId'];
    if (typeof downloadId === 'number' && downloadId > 0) {
      chrome.downloads.cancel(downloadId);
    }

    await updateJob(jobId, (job) => {
      job.status = 'cancelled';
    });
    return { success: true };
  },
  [MESSAGE_TYPES.CLEAR_DOWNLOAD_HISTORY]: async () => {
    await clearHistory();
    return { success: true };
  },
  [MESSAGE_TYPES.RETRY_DOWNLOAD]: async (message) => {
    const jobId = str(message, 'jobId');
    if (!jobId) return { success: false, error: 'Missing jobId' };
    return handleRetryDownload(jobId);
  }
};

chrome.runtime.onMessage.addListener(
  (
    message: BaseMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    const handler = messageHandlers[message?.['type'] as string];
    if (!handler) return undefined;

    Promise.resolve(handler(message))
      .then((result) => sendResponse(result))
      .catch((error: Error) => {
        console.error('Background message handler failed:', message?.['type'], error);
        sendResponse({ success: false, error: error?.message ?? 'Unknown error' });
      });

    return true;
  }
);
