function getDisplayError(job, t) {
  if (!job?.error) return '';
  if (/USER_CANCELED/i.test(job.error)) return t('statusUserCancelled');
  if (/unsupported\s+url/i.test(job.error)) return t('errorUnsupportedUrl');
  return job.error;
}

function getSourceLabel(sourceUrl, t) {
  if (!sourceUrl) return t('downloadFallback');

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return t('downloadFallback');
  }
}

function getFallbackFromUrl(sourceUrl) {
  if (!sourceUrl) return '';

  try {
    const parts = new URL(sourceUrl).pathname.split('/').filter(Boolean);
    return parts.pop() || '';
  } catch {
    return '';
  }
}

function getPill(job) {
  if (job.type?.includes('mp4')) return { className: 'mp4', label: 'MP4' };
  if (job.type?.includes('mp3')) return { className: 'mp3', label: 'MP3' };
   if (job.type?.includes('zip')) return { className: 'zip', label: 'ZIP' };
  if (job.type?.includes('image')) return { className: 'img', label: 'IMG' };

  const extMatch = (job.fileName || '').match(/\.([a-z0-9]{2,5})$/i);
  const ext = extMatch?.[1]?.toUpperCase();
  if (ext) return { className: ext.toLowerCase(), label: ext };
  return { className: 'file', label: 'FILE' };
}

function getProgress(job) {
  const progressValue = typeof job.progress === 'number' ? job.progress : 0;
  const normalizedProgress = progressValue > 100 ? Math.round((progressValue / 1000) * 100) : progressValue;
  if (job?.status === 'completed' && normalizedProgress === 0) {
    return 100;
  }
  return Math.min(100, Math.max(0, normalizedProgress));
}

export function sortJobsByDate(list, sortAscending) {
  const safe = Array.isArray(list) ? [...list] : [];
  return safe.sort((a, b) => {
    const aTime = a?.updatedAt || a?.createdAt || 0;
    const bTime = b?.updatedAt || b?.createdAt || 0;
    return sortAscending ? aTime - bTime : bTime - aTime;
  });
}

export function createDownloadViewModel(job, { expandedJobId, localeCode, t }) {
  const displayError = getDisplayError(job, t);
  const displayName = job.fileName || job.title || getFallbackFromUrl(job.sourceUrl) || t('downloadFallback');
  const pill = getPill(job);
  const progress = getProgress(job);
  const statusMap = {
    preparing: { icon: '⏳', label: t('statusPreparing'), tone: 'info' },
    downloading: { icon: '⬇️', label: t('statusDownloading'), tone: 'info' },
    completed: { icon: '✅', label: t('statusCompleted'), tone: 'success' },
    failed: { icon: '⚠️', label: t('statusFailed'), tone: 'error' },
    cancelled: { icon: '⚠️', label: t('statusCancelled'), tone: 'warning' }
  };
  const statusInfo = statusMap[job.status] || statusMap.preparing;
  const statusLabel = `${statusInfo.label}${progress > 0 && progress < 100 ? ` (${progress}%)` : ''}`;
  const statusSummary = progress > 0 && progress < 100 ? `${statusInfo.label} · ${progress}%` : statusInfo.label;
  const updatedAt = job.updatedAt || job.createdAt;
  const dateText = updatedAt ? new Date(updatedAt).toLocaleString(localeCode.startsWith('tr') ? 'tr-TR' : undefined) : '';
  const sourceLabel = getSourceLabel(job.sourceUrl, t);

  return {
    displayError,
    displayName,
    pill,
    progress,
    progressLabel: `${progress}%`,
    statusInfo,
    statusLabel,
    statusSummary,
    dateText,
    sourceLabel,
    expanded: expandedJobId === job.id
  };
}
