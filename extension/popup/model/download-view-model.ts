import type { DownloadJob, DownloadStatus } from '../../shared/storage.js';
import type { I18nKey } from '../../shared/i18n.js';

export type { DownloadJob };

export interface StatusInfo {
  icon: string;
  label: string;
  tone: 'info' | 'success' | 'error' | 'warning';
}

export interface PillInfo {
  className: string;
  label: string;
}

export interface DownloadViewModel {
  displayError: string;
  displayName: string;
  pill: PillInfo;
  progress: number;
  progressLabel: string;
  statusInfo: StatusInfo;
  statusLabel: string;
  statusSummary: string;
  dateText: string;
  sourceLabel: string;
  expanded: boolean;
}

type TranslateFn = (key: I18nKey) => string;

function getDisplayError(job: DownloadJob, t: TranslateFn): string {
  if (!job?.error) return '';
  if (/USER_CANCELED/i.test(job.error)) return t('statusUserCancelled');
  if (/unsupported\s+url/i.test(job.error)) return t('errorUnsupportedUrl');
  return job.error;
}

function getSourceLabel(sourceUrl: string | undefined, t: TranslateFn): string {
  if (!sourceUrl) return t('downloadFallback');

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return t('downloadFallback');
  }
}

function getFallbackFromUrl(sourceUrl: string | undefined): string {
  if (!sourceUrl) return '';

  try {
    const parts = new URL(sourceUrl).pathname.split('/').filter(Boolean);
    return parts.pop() ?? '';
  } catch {
    return '';
  }
}

function getPill(job: DownloadJob): PillInfo {
  if (job.type?.includes('mp4')) return { className: 'mp4', label: 'MP4' };
  if (job.type?.includes('mp3')) return { className: 'mp3', label: 'MP3' };
  if (job.type?.includes('zip')) return { className: 'zip', label: 'ZIP' };
  if (job.type?.includes('image')) return { className: 'img', label: 'IMG' };

  const extMatch = (job.fileName ?? '').match(/\.([a-z0-9]{2,5})$/i);
  const ext = extMatch?.[1]?.toUpperCase();
  if (ext) return { className: ext.toLowerCase(), label: ext };
  return { className: 'file', label: 'FILE' };
}

function getProgress(job: DownloadJob): number {
  const progressValue = typeof job.progress === 'number' ? job.progress : 0;
  const normalizedProgress =
    progressValue > 100 ? Math.round((progressValue / 1000) * 100) : progressValue;
  if (job?.status === 'completed' && normalizedProgress === 0) {
    return 100;
  }
  return Math.min(100, Math.max(0, normalizedProgress));
}

export function sortJobsByDate(list: DownloadJob[], sortAscending: boolean): DownloadJob[] {
  const safe = Array.isArray(list) ? [...list] : [];
  return safe.sort((a, b) => {
    const aTime = a?.updatedAt ?? a?.createdAt ?? 0;
    const bTime = b?.updatedAt ?? b?.createdAt ?? 0;
    return sortAscending ? aTime - bTime : bTime - aTime;
  });
}

const STATUS_MAP: Record<DownloadStatus, Omit<StatusInfo, 'label'> & { labelKey: I18nKey }> = {
  preparing: { icon: '⏳', labelKey: 'statusPreparing', tone: 'info' },
  downloading: { icon: '⬇️', labelKey: 'statusDownloading', tone: 'info' },
  completed: { icon: '✅', labelKey: 'statusCompleted', tone: 'success' },
  failed: { icon: '⚠️', labelKey: 'statusFailed', tone: 'error' },
  cancelled: { icon: '⚠️', labelKey: 'statusCancelled', tone: 'warning' },
};

export interface CreateDownloadViewModelParams {
  expandedJobId: string | null;
  localeCode: string;
  t: TranslateFn;
}

export function createDownloadViewModel(
  job: DownloadJob,
  { expandedJobId, localeCode, t }: CreateDownloadViewModelParams,
): DownloadViewModel {
  const displayError = getDisplayError(job, t);
  const displayName =
    job.fileName ?? job.title ?? getFallbackFromUrl(job.sourceUrl) ?? t('downloadFallback');
  const pill = getPill(job);
  const progress = getProgress(job);

  const statusDef = STATUS_MAP[job.status as DownloadStatus] ?? STATUS_MAP['preparing'];
  const statusInfo: StatusInfo = {
    icon: statusDef.icon,
    label: t(statusDef.labelKey),
    tone: statusDef.tone,
  };

  const statusLabel = `${statusInfo.label}${progress > 0 && progress < 100 ? ` (${progress}%)` : ''}`;
  const statusSummary =
    progress > 0 && progress < 100 ? `${statusInfo.label} · ${progress}%` : statusInfo.label;

  const updatedAt = job.updatedAt ?? job.createdAt;
  const dateText = updatedAt
    ? new Date(updatedAt).toLocaleString(localeCode.startsWith('tr') ? 'tr-TR' : undefined)
    : '';
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
    expanded: expandedJobId === job.id,
  };
}
