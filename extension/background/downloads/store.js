import { getDownloadsState, updateDownloads } from '../../shared/storage.js';

const downloadIdToJobId = new Map();

export function registerDownloadId(downloadId, jobId) {
  if (!downloadId || !jobId) return;
  downloadIdToJobId.set(downloadId, jobId);
}

export function unregisterDownloadId(downloadId) {
  if (!downloadId) return;
  downloadIdToJobId.delete(downloadId);
}

export function getJobIdByDownloadId(downloadId) {
  return downloadIdToJobId.get(downloadId);
}

export async function loadDownloadMap() {
  const state = await getDownloadsState();
  state.active.forEach((job) => {
    if (job.downloadId) {
      downloadIdToJobId.set(job.downloadId, job.id);
    }
  });
}

export function createJob({ type, title, sourceUrl, fileName, mediaUrl }) {
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

export async function addJob(job) {
  await updateDownloads((state) => {
    state.active.push(job);
    return state;
  });
  return job;
}

export async function updateJob(jobId, updater) {
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

export async function clearHistory() {
  await updateDownloads((state) => {
    state.history = [];
    return state;
  });
}

