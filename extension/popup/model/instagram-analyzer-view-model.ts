import type {
  InstagramAnalyzerAccountState,
  InstagramAnalyzerState,
  InstagramAnalyzerStatus,
} from '../../shared/storage.js';
import type { I18nKey } from '../../shared/i18n.js';

interface AnalyzerBadgeInfo {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'error';
}

interface AnalyzerMetricInfo {
  label: string;
  value: string;
}

interface InstagramAnalyzerViewModel {
  accountLabel: string;
  accountValue: string;
  badge: AnalyzerBadgeInfo;
  body: string;
  lastScanLabel: string;
  metrics: AnalyzerMetricInfo[];
  openUrl: string;
  selectedViewerId: string | null;
}

type TranslateFn = (key: I18nKey) => string;

interface AccountSelection {
  account: InstagramAnalyzerAccountState | null;
  viewerId: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRelativeTime(timestamp: number, localeCode: string, now: number): string {
  const diffMs = timestamp - now;
  const absMs = Math.abs(diffMs);
  const locale = localeCode.startsWith('tr') ? 'tr' : 'en';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (absMs < 60 * 1000) {
    return rtf.format(Math.round(diffMs / 1000), 'second');
  }
  if (absMs < 60 * 60 * 1000) {
    return rtf.format(Math.round(diffMs / (60 * 1000)), 'minute');
  }
  if (absMs < DAY_MS) {
    return rtf.format(Math.round(diffMs / (60 * 60 * 1000)), 'hour');
  }
  return rtf.format(Math.round(diffMs / DAY_MS), 'day');
}

function getAccountSortTime(account: InstagramAnalyzerAccountState): number {
  const summaryTime = account.summary.lastScannedAt ?? 0;
  const jobTime = account.job?.updatedAt ?? 0;
  return Math.max(summaryTime, jobTime);
}

function selectAccount(state: InstagramAnalyzerState): AccountSelection {
  if (state.currentViewerId) {
    const current = state.accounts[state.currentViewerId] ?? null;
    if (current) {
      return { account: current, viewerId: state.currentViewerId };
    }
  }

  const latestEntry = Object.entries(state.accounts).sort(
    ([, left], [, right]) => getAccountSortTime(right) - getAccountSortTime(left),
  )[0];

  if (!latestEntry) {
    return { account: null, viewerId: null };
  }

  return {
    viewerId: latestEntry[0],
    account: latestEntry[1],
  };
}

function getBadge(
  status: InstagramAnalyzerStatus,
  lastScannedAt: number | null,
  now: number,
  t: TranslateFn,
): AnalyzerBadgeInfo {
  if (status === 'running') {
    return { label: t('analyzerStatusRunning'), tone: 'info' };
  }
  if (status === 'error') {
    return { label: t('analyzerStatusError'), tone: 'error' };
  }
  if (!lastScannedAt) {
    return { label: t('analyzerStatusIdle'), tone: 'neutral' };
  }

  const age = now - lastScannedAt;
  if (age > 7 * DAY_MS) {
    return { label: t('analyzerFreshnessStale'), tone: 'warning' };
  }
  if (age > 3 * DAY_MS) {
    return { label: t('analyzerFreshnessAging'), tone: 'warning' };
  }

  return { label: t('analyzerFreshnessFresh'), tone: 'success' };
}

function getBody(
  status: InstagramAnalyzerStatus,
  lastError: string | undefined,
  t: TranslateFn,
): string {
  if (status === 'running') {
    return t('analyzerRunningBody');
  }
  if (status === 'error') {
    return lastError || t('analyzerErrorBody');
  }
  if (status === 'completed') {
    return t('analyzerCompletedBody');
  }
  return t('analyzerNoScanBody');
}

interface CreateInstagramAnalyzerViewModelParams {
  localeCode: string;
  now?: number;
  state: InstagramAnalyzerState;
  t: TranslateFn;
}

export function createInstagramAnalyzerViewModel({
  localeCode,
  now = Date.now(),
  state,
  t,
}: CreateInstagramAnalyzerViewModelParams): InstagramAnalyzerViewModel {
  const { account, viewerId } = selectAccount(state);
  if (!account || !viewerId) {
    return {
      accountLabel: t('analyzerAccountLabel'),
      accountValue: t('analyzerUnknownAccount'),
      badge: { label: t('analyzerStatusIdle'), tone: 'neutral' },
      body: t('analyzerNoAccountBody'),
      lastScanLabel: t('analyzerLastScanNever'),
      metrics: [],
      openUrl: 'https://www.instagram.com/',
      selectedViewerId: null,
    };
  }

  const { summary } = account;
  const effectiveStatus: InstagramAnalyzerStatus =
    account.job?.status === 'running'
      ? 'running'
      : summary.status === 'error' || account.job?.status === 'error'
        ? 'error'
        : summary.lastScannedAt
          ? 'completed'
          : 'idle';
  const username = summary.username || account.job?.username || '';
  const accountValue = username ? `@${username}` : t('analyzerUnknownAccount');
  const openUrl = username
    ? `https://www.instagram.com/${encodeURIComponent(username)}/`
    : 'https://www.instagram.com/';
  const lastScanLabel = summary.lastScannedAt
    ? t('analyzerLastScan').replace(
        '{time}',
        formatRelativeTime(summary.lastScannedAt, localeCode, now),
      )
    : t('analyzerLastScanNever');

  return {
    accountLabel: t('analyzerAccountLabel'),
    accountValue,
    badge: getBadge(effectiveStatus, summary.lastScannedAt, now, t),
    body: getBody(effectiveStatus, summary.lastError ?? account.job?.lastError, t),
    lastScanLabel,
    metrics: [
      {
        label: t('analyzerNonFollowerCountLabel'),
        value: String(summary.nonFollowerCount),
      },
      {
        label: t('analyzerFollowingCountLabel'),
        value: String(summary.followingCount),
      },
      {
        label: t('analyzerWhitelistedCountLabel'),
        value: String(summary.whitelistedCount),
      },
    ],
    openUrl,
    selectedViewerId: viewerId,
  };
}
