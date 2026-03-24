import { getDownloadsState, updateDownloads } from '../../shared/storage.js';
import type { DownloadJob } from '../../shared/storage.js';

export type { DownloadJob };

const downloadIdToJobId = new Map<number, string>();

export function registerDownloadId(downloadId: number, jobId: string): void {
  if (!downloadId || !jobId) return;
  downloadIdToJobId.set(downloadId, jobId);
}

export function unregisterDownloadId(downloadId: number): void {
  if (!downloadId) return;
  downloadIdToJobId.delete(downloadId);
}

export function getJobIdByDownloadId(downloadId: number): string | undefined {
  return downloadIdToJobId.get(downloadId);
}

export async function loadDownloadMap(): Promise<void> {
  const state = await getDownloadsState();
  state.active.forEach((job) => {
    if (job.downloadId != null) {
      downloadIdToJobId.set(job.downloadId, job.id);
    }
  });
}

export interface CreateJobParams {
  type: string;
  title: string;
  sourceUrl: string;
  fileName: string;
  mediaUrl?: string | null;
  retryImageUrls?: string[];
}

export function createJob({
  type,
  title,
  sourceUrl,
  fileName,
  mediaUrl,
  retryImageUrls
}: CreateJobParams): DownloadJob {
  return {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    title,
    fileName,
    sourceUrl,
    mediaUrl: mediaUrl ?? null,
    retryImageUrls: Array.isArray(retryImageUrls) ? [...retryImageUrls] : undefined,
    status: 'preparing',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export async function addJob(job: DownloadJob): Promise<DownloadJob> {
  await updateDownloads((state) => {
    state.active.push(job);
    return state;
  });
  return job;
}

export async function updateJob(
  jobId: string,
  updater: (job: DownloadJob) => void
): Promise<void> {
  await updateDownloads((state) => {
    const idx = state.active.findIndex((item) => item.id === jobId);
    if (idx === -1) return state;

    const next: DownloadJob = { ...state.active[idx]! };
    updater(next);
    next.updatedAt = Date.now();

    const finished = ['completed', 'failed', 'cancelled'].includes(next.status);
    if (finished) {
      state.active.splice(idx, 1);
      state.history.push(next);
      state.history = state.history.slice(-50);
      if (next.downloadId != null) downloadIdToJobId.delete(next.downloadId);
    } else {
      state.active[idx] = next;
      if (next.downloadId != null) downloadIdToJobId.set(next.downloadId, jobId);
    }
    return state;
  });
}

export async function clearHistory(): Promise<void> {
  await updateDownloads((state) => {
    state.history = [];
    return state;
  });
}
