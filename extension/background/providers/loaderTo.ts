import { wait } from '../utils.js';

const LOADER_BASE_URL = 'https://loader.to';
const LOADER_REQUEST_TIMEOUT_MS = 15000;
const MAX_CONSECUTIVE_POLL_FAILURES = 6;

interface LoaderResponse {
  id?: string;
  status?: string;
  text?: string;
  message?: string;
  progress?: number | string;
  download_url?: string;
}

export interface ProgressEvent {
  status: string;
  progress: number;
}

/**
 * Statuses reported by loader.to that indicate the job is still legitimately
 * progressing, even if the final download URL is not ready yet.
 */
const EXTENDED_WAIT_STATUSES = new Set([
  'initialisingcontext',
  'initialising',
  'processingcontext',
  'processing',
  'pending',
  'queued',
  'preparing',
]);

function allowsExtendedWait(status: string | undefined): boolean {
  return EXTENDED_WAIT_STATUSES.has((status ?? '').toLowerCase().trim());
}

async function fetchLoaderJson(url: string, context: string): Promise<LoaderResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOADER_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`${context} - Request timed out after ${LOADER_REQUEST_TIMEOUT_MS}ms`, {
        cause: err,
      });
    }
    throw new Error(`${context} - Network error: ${message}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${context} - ${response.status}: ${response.statusText}`);
  }

  try {
    return JSON.parse(text) as LoaderResponse;
  } catch {
    const snippet = text.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(`${context} - Unexpected response: ${snippet}`);
  }
}

function resolveLoaderError(
  data: LoaderResponse,
  fallback = 'Conversion failed: no file returned',
): string {
  const msg = (data?.text ?? data?.message ?? data?.status ?? fallback ?? '').trim();
  if (/unsupported\s+url/i.test(msg)) {
    return 'Unsupported URL / Desteklenmeyen bağlantı';
  }
  return msg || fallback;
}

/**
 * Polls loader.to for a conversion result. Shared between mp3 and mp4 flows.
 *
 * Polling strategy:
 *   - Initial wait: 3 s
 *   - Normal poll interval: 2 s, up to 60 attempts (~2 min)
 *   - If the server is stuck in an init status (e.g. InitialisingContext),
 *     we grant up to 30 extra attempts (~1 min more) with a slower 3 s interval.
 */
async function pollForDownloadUrl(
  jobId: string,
  onProgress?: (event: ProgressEvent) => void,
): Promise<string> {
  const maxNormalAttempts = 60;
  const maxInitBonusAttempts = 30;

  let lastStatus: string | undefined;
  let initBonusUsed = 0;
  let consecutivePollFailures = 0;

  await wait(3000);

  for (let attempt = 0; attempt < maxNormalAttempts + maxInitBonusAttempts; attempt++) {
    // Use a slower interval when still in init phase
    const inInitPhase = attempt >= maxNormalAttempts;
    await wait(inInitPhase ? 3000 : 2000);

    let progressData: LoaderResponse;
    try {
      const progressUrl = `${LOADER_BASE_URL}/ajax/progress.php?id=${jobId}`;
      progressData = await fetchLoaderJson(progressUrl, 'Failed to poll conversion');
    } catch (err) {
      // Transient network errors during polling — retry silently up to a point
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw err instanceof Error ? err : new Error(String(err));
      }
      continue;
    }

    consecutivePollFailures = 0;

    const prog = Number(progressData?.progress);
    if (!Number.isNaN(prog)) {
      onProgress?.({ status: 'preparing', progress: Math.min(prog, 100) });

      // loader.to returns 1000 when it is finished (success or no-file).
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

    if (progressData?.status === 'error') {
      throw new Error(progressData?.text ?? 'Conversion failed on server.');
    }

    lastStatus = progressData?.status ?? progressData?.text ?? lastStatus;

    // If we've exhausted normal attempts but server is still actively working, allow bonus
    if (attempt >= maxNormalAttempts - 1 && allowsExtendedWait(lastStatus)) {
      if (initBonusUsed < maxInitBonusAttempts) {
        initBonusUsed++;
        continue;
      }
    }

    // If we've used up normal attempts and status is no longer progressing, break
    if (attempt >= maxNormalAttempts - 1 && !allowsExtendedWait(lastStatus)) {
      break;
    }
  }

  throw new Error(
    `Timed out while waiting for download link. Last status: ${lastStatus ?? 'unknown'}`,
  );
}

export async function getMp3DownloadUrl(
  videoUrl: string,
  onProgress?: (event: ProgressEvent) => void,
): Promise<string> {
  const startUrl = `${LOADER_BASE_URL}/ajax/download.php?format=mp3&url=${encodeURIComponent(videoUrl)}`;
  const startData = await fetchLoaderJson(startUrl, 'Failed to start conversion');

  const jobId = startData?.id;
  if (!jobId) {
    throw new Error(resolveLoaderError(startData, 'API response missing conversion id.'));
  }

  if (startData.download_url) {
    onProgress?.({ status: 'preparing', progress: 100 });
    return startData.download_url;
  }

  const startProgress = Number(startData?.progress);
  if (!Number.isNaN(startProgress)) {
    onProgress?.({ status: 'preparing', progress: startProgress });
  }

  return pollForDownloadUrl(jobId, onProgress);
}

export async function getMp4DownloadUrl(
  videoUrl: string,
  onProgress?: (event: ProgressEvent) => void,
): Promise<string> {
  const startUrl = `${LOADER_BASE_URL}/ajax/download.php?format=1080&url=${encodeURIComponent(videoUrl)}`;
  const startData = await fetchLoaderJson(startUrl, 'Failed to start conversion');

  const jobId = startData?.id;
  if (!jobId) {
    throw new Error(resolveLoaderError(startData, 'API response missing conversion id.'));
  }

  if (startData.download_url) {
    onProgress?.({ status: 'preparing', progress: 100 });
    return startData.download_url;
  }

  const startProgress = Number(startData?.progress);
  if (!Number.isNaN(startProgress)) {
    onProgress?.({ status: 'preparing', progress: startProgress });
  }

  return pollForDownloadUrl(jobId, onProgress);
}
