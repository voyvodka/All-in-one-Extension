import { getLocale, resolveLocale, setLocale, t } from '../../../shared/i18n.js';
import {
  createInstagramAnalyzerAccountState,
  getInstagramAnalyzerState,
  getSettings,
  updateInstagramAnalyzer,
} from '../../../shared/storage.js';
import { toggleDashboard } from './dashboard.js';
import type {
  InstagramAnalyzerAccountState,
  InstagramAnalyzerDurableAccount,
  InstagramAnalyzerResultItem,
  InstagramAnalyzerScanHistoryEntry,
  InstagramAnalyzerSnapshotUser,
  InstagramAnalyzerState,
  Settings,
  ThemeChoice,
} from '../../../shared/storage.js';
import { MESSAGE_TYPES } from '../../../shared/contracts/message-types.js';

const FEATURE_ID = 'ig-unfollowers';
const HOST_ID = 'aio-instagram-analyzer-host';
const VIEWER_SYNC_MS = 10000;
const IG_APP_ID = '936619743392459';

type DrawerTheme = 'light' | 'dark';
type PrimaryView = 'results' | 'history';
type ResultTab = 'non-whitelisted' | 'whitelisted';
type HistoryDiffTab = 'followed' | 'unfollowed' | 'followersGained' | 'followersLost';

const RESULT_PAGE_SIZE = 40;
const HISTORY_PAGE_SIZE = 8;
const HISTORY_DIFF_PAGE_SIZE = 30;

interface UiElements {
  root: HTMLElement;
  launcher: HTMLButtonElement;
  dashboardBtn: HTMLButtonElement;
  panel: HTMLElement;
}

function isInstagram(url: string): boolean {
  try {
    return new URL(url).hostname.includes('instagram.com');
  } catch {
    return false;
  }
}

function getCookieValue(name: string): string {
  const cookies = document.cookie ? document.cookie.split('; ') : [];
  const prefix = `${name}=`;
  const cookie = cookies.find((entry) => entry.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : '';
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getPathUsername(): string {
  const match = location.pathname.match(/^\/([^/?#]+)\/?$/);
  if (!match) return '';
  const candidate = match[1] ?? '';
  const blocked = new Set([
    'accounts',
    'explore',
    'reels',
    'direct',
    'stories',
    'notifications',
    'create',
    'developer',
    'about',
    'legal',
  ]);
  return blocked.has(candidate) ? '' : candidate;
}

function detectViewerUsername(): string {
  const pathUsername = getPathUsername();
  if (!pathUsername) {
    return '';
  }

  const ownProfileMarkers = ['edit profile', 'share profile', 'profili duzenle', 'profili paylas'];
  const texts = Array.from(document.querySelectorAll('button, a, div[role="button"]'))
    .map((element) => normalizeText(element.textContent?.trim() ?? ''))
    .filter(Boolean);

  return texts.some((text) => ownProfileMarkers.some((marker) => text.includes(marker)))
    ? pathUsername
    : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isContextInvalidatedError(error: unknown): boolean {
  return /context invalidated/i.test(
    String((error as { message?: string } | null)?.message ?? error ?? ''),
  );
}

async function sendAnalyzerMessage(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (!chrome?.runtime?.id) {
    return { success: false, error: 'Uzanti yeniden yuklendi. Sayfayi yenileyip tekrar dene.' };
  }

  return await new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response as { success: boolean; error?: string } | null);
      });
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        resolve({
          success: false,
          error: 'Uzanti yeniden yuklendi. Sayfayi yenileyip tekrar dene.',
        });
        return;
      }

      resolve({
        success: false,
        error: String(
          (error as { message?: string } | null)?.message ?? error ?? 'Mesaj gonderilemedi',
        ),
      });
    }
  });
}

async function unfollowInstagramUser(targetId: string, csrfToken: string): Promise<void> {
  if (!targetId) {
    throw new Error('Hedef kullanici bilgisi eksik');
  }
  if (!csrfToken) {
    throw new Error('Instagram oturumu dogrulanamadi');
  }

  const response = await fetch(
    `https://www.instagram.com/web/friendships/${encodeURIComponent(targetId)}/unfollow/`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-csrftoken': csrfToken,
        'x-ig-app-id': IG_APP_ID,
        'x-requested-with': 'XMLHttpRequest',
      },
      body: '',
    },
  );

  const rawText = await response.text();
  let data: Record<string, unknown> | null = null;
  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      (typeof data?.['message'] === 'string' && data['message']) ||
      (typeof data?.['status'] === 'string' && data['status']) ||
      rawText.slice(0, 160).replace(/\s+/g, ' ') ||
      response.statusText;
    throw new Error(
      message || `Instagram takibi birakma istegi basarisiz oldu (${response.status})`,
    );
  }
}

function parseRgb(color: string): [number, number, number] | null {
  const normalized = color.trim();
  const rgbMatch = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }

  const hex = normalized.replace('#', '');
  if (/^[a-f0-9]{3}$/i.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (/^[a-f0-9]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

function getLuminance(color: string): number | null {
  const rgb = parseRgb(color);
  if (!rgb) {
    return null;
  }

  const [red, green, blue] = rgb.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  }) as [number, number, number];

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function inferSiteTheme(): DrawerTheme | null {
  const rootStyle = window.getComputedStyle(document.documentElement);
  const rootScheme = rootStyle.colorScheme || '';
  if (rootScheme.includes('dark')) {
    return 'dark';
  }
  if (rootScheme.includes('light')) {
    return 'light';
  }

  const backgroundCandidates = [
    window.getComputedStyle(document.body).backgroundColor,
    rootStyle.backgroundColor,
  ];

  for (const backgroundColor of backgroundCandidates) {
    if (
      !backgroundColor ||
      backgroundColor === 'rgba(0, 0, 0, 0)' ||
      backgroundColor === 'transparent'
    ) {
      continue;
    }
    const luminance = getLuminance(backgroundColor);
    if (typeof luminance === 'number') {
      return luminance < 0.35 ? 'dark' : 'light';
    }
  }

  return null;
}

function resolveDrawerTheme(themeChoice: ThemeChoice): DrawerTheme {
  if (themeChoice === 'dark' || themeChoice === 'light') {
    return themeChoice;
  }

  const siteTheme = inferSiteTheme();
  if (siteTheme) {
    return siteTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function formatRelativeTime(timestamp: number): string {
  const locale = getLocale();
  const formatter = new Intl.RelativeTimeFormat(locale === 'tr' ? 'tr' : 'en', { numeric: 'auto' });
  const now = Date.now();
  const diffMs = timestamp - now;
  const absMs = Math.abs(diffMs);

  if (absMs < 60 * 1000) {
    return formatter.format(Math.round(diffMs / 1000), 'second');
  }
  if (absMs < 60 * 60 * 1000) {
    return formatter.format(Math.round(diffMs / (60 * 1000)), 'minute');
  }
  if (absMs < 24 * 60 * 60 * 1000) {
    return formatter.format(Math.round(diffMs / (60 * 60 * 1000)), 'hour');
  }
  return formatter.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), 'day');
}

function truncateCursor(cursor: string | null): string {
  if (!cursor) {
    return t('analyzerCursorDone');
  }
  return cursor.length > 16 ? `${cursor.slice(0, 16)}...` : cursor;
}

function resolveActiveAccount(
  state: InstagramAnalyzerState,
  viewerId: string | null,
): InstagramAnalyzerAccountState | null {
  if (viewerId && state.accounts[viewerId]) {
    return state.accounts[viewerId] ?? null;
  }
  if (state.currentViewerId && state.accounts[state.currentViewerId]) {
    return state.accounts[state.currentViewerId] ?? null;
  }
  return null;
}

function mergeDurableAccountData(
  account: InstagramAnalyzerAccountState,
  durableAccount: InstagramAnalyzerDurableAccount | null,
): InstagramAnalyzerAccountState {
  if (!durableAccount) {
    return account;
  }

  if (durableAccount.username && !account.summary.username) {
    account.summary.username = durableAccount.username;
  }

  account.results = durableAccount.results;
  account.history = durableAccount.history;
  account.followingSnapshot = durableAccount.followingSnapshot;
  account.followersSnapshot = durableAccount.followersSnapshot;
  return account;
}

function getDisplayAccount(
  account: InstagramAnalyzerAccountState | null,
  viewerId: string | null,
  username: string,
): string {
  const resolvedUsername = username || account?.summary.username || account?.job?.username || '';
  if (resolvedUsername) {
    return `@${resolvedUsername}`;
  }
  void viewerId;
  return t('analyzerUnknownAccount');
}

function getStatusLabel(account: InstagramAnalyzerAccountState | null): string {
  if (account?.job?.status === 'running' || account?.summary.status === 'running') {
    return t('analyzerStatusRunning');
  }
  if (account?.job?.status === 'error' || account?.summary.status === 'error') {
    return t('analyzerStatusError');
  }
  if (account?.summary.lastScannedAt) {
    const age = Date.now() - account.summary.lastScannedAt;
    if (age > 7 * 24 * 60 * 60 * 1000) {
      return t('analyzerFreshnessStale');
    }
    if (age > 3 * 24 * 60 * 60 * 1000) {
      return t('analyzerFreshnessAging');
    }
    return t('analyzerFreshnessFresh');
  }
  return t('analyzerStatusIdle');
}

function getStatusTone(
  account: InstagramAnalyzerAccountState | null,
): 'neutral' | 'info' | 'success' | 'warning' | 'error' {
  if (account?.job?.status === 'running' || account?.summary.status === 'running') {
    return 'info';
  }
  if (account?.job?.status === 'error' || account?.summary.status === 'error') {
    return 'error';
  }
  if (!account?.summary.lastScannedAt) {
    return 'neutral';
  }
  const age = Date.now() - account.summary.lastScannedAt;
  return age > 3 * 24 * 60 * 60 * 1000 ? 'warning' : 'success';
}

function matchesSearch(item: InstagramAnalyzerResultItem, query: string): boolean {
  if (!query) {
    return true;
  }
  const normalizedQuery = normalizeText(query);
  return (
    normalizeText(item.username).includes(normalizedQuery) ||
    normalizeText(item.fullName).includes(normalizedQuery)
  );
}

function sortResults(results: InstagramAnalyzerResultItem[]): InstagramAnalyzerResultItem[] {
  return [...results].sort((left, right) => left.username.localeCompare(right.username));
}

function sortSnapshotUsers(
  items: InstagramAnalyzerSnapshotUser[],
): InstagramAnalyzerSnapshotUser[] {
  return [...items].sort((left, right) => left.username.localeCompare(right.username));
}

function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);
  const start = (normalizedPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: normalizedPage,
    totalPages,
  };
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(getLocale() === 'tr' ? 'tr-TR' : 'en-US');
}

function getKnownUserMap(account: InstagramAnalyzerAccountState | null): Map<string, string> {
  const userMap = new Map<string, string>();
  if (!account) {
    return userMap;
  }

  account.results.forEach((item) => {
    userMap.set(item.id, item.username);
  });
  account.followingSnapshot.forEach((item) => {
    userMap.set(item.id, item.username);
  });
  account.followersSnapshot.forEach((item) => {
    userMap.set(item.id, item.username);
  });
  account.history.forEach((entry) => {
    entry.diffs.followed.forEach((item) => userMap.set(item.id, item.username));
    entry.diffs.unfollowed.forEach((item) => userMap.set(item.id, item.username));
    entry.diffs.followersGained.forEach((item) => userMap.set(item.id, item.username));
    entry.diffs.followersLost.forEach((item) => userMap.set(item.id, item.username));
  });

  return userMap;
}

function getHistoryEntries(
  account: InstagramAnalyzerAccountState | null,
): InstagramAnalyzerScanHistoryEntry[] {
  return account?.history ?? [];
}

function getHistoryDiffItems(
  entry: InstagramAnalyzerScanHistoryEntry | null,
  tab: HistoryDiffTab,
): InstagramAnalyzerSnapshotUser[] {
  if (!entry) {
    return [];
  }
  const source = entry.diffs[tab] ?? [];
  return sortSnapshotUsers(source);
}

function getVisibleResults(
  account: InstagramAnalyzerAccountState | null,
  activeTab: ResultTab,
  searchQuery: string,
): InstagramAnalyzerResultItem[] {
  if (!account) {
    return [];
  }

  const whitelistSet = new Set(account.whitelist);
  const base = sortResults(account.results);
  return base.filter((item) => {
    const isWhitelisted = whitelistSet.has(item.id);
    if (activeTab === 'whitelisted' && !isWhitelisted) {
      return false;
    }
    if (activeTab === 'non-whitelisted' && isWhitelisted) {
      return false;
    }
    return matchesSearch(item, searchQuery);
  });
}

function getDrawerBody(
  account: InstagramAnalyzerAccountState | null,
  viewerId: string | null,
  username: string,
  localActionError: string | null,
): string {
  if (localActionError) {
    return localActionError;
  }
  if (!viewerId) {
    return t('analyzerDrawerSignedOut');
  }
  if (account?.job?.status === 'running' || account?.summary.status === 'running') {
    return t('analyzerRunningProgress')
      .replace(
        '{count}',
        String(account?.job?.processedCount ?? account?.summary.followingCount ?? 0),
      )
      .replace('{matches}', String(account?.summary.nonFollowerCount ?? 0));
  }
  if (account?.summary.status === 'error') {
    return account.summary.lastError || t('analyzerErrorBody');
  }
  if (account?.summary.lastScannedAt) {
    return t('analyzerCompletedBody');
  }
  if (!username && !account?.summary.username) {
    return t('analyzerDrawerViewerUnknown');
  }
  return t('analyzerDrawerHint');
}

function getScanActionConfig(
  account: InstagramAnalyzerAccountState | null,
  viewerId: string | null,
  isPending: boolean,
): {
  disabled: boolean;
  label: string;
  title: string;
} {
  if (!viewerId) {
    return {
      disabled: true,
      label: t('analyzerScanStart'),
      title: t('analyzerDrawerSignedOut'),
    };
  }
  if (isPending || account?.job?.status === 'running' || account?.summary.status === 'running') {
    return {
      disabled: true,
      label: t('analyzerScanRunning'),
      title: t('analyzerScanRunningTitle'),
    };
  }
  if (account?.summary.lastScannedAt) {
    return {
      disabled: false,
      label: t('analyzerScanRescan'),
      title: t('analyzerScanStartTitle'),
    };
  }
  return {
    disabled: false,
    label: t('analyzerScanStart'),
    title: t('analyzerScanStartTitle'),
  };
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function downloadJson(fileName: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function createUi(shadowRoot: ShadowRoot): UiElements {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <style>
      .root {
        --bg: rgba(255, 255, 255, 0.96);
        --surface: #ffffff;
        --surface-2: #f8fafc;
        --surface-3: #eef2f7;
        --border: rgba(148, 163, 184, 0.28);
        --border-strong: rgba(100, 116, 139, 0.38);
        --text: #0f172a;
        --text-2: #475569;
        --text-3: #64748b;
        --accent: #2563eb;
        --accent-muted: #dbeafe;
        --success: #15803d;
        --success-muted: #dcfce7;
        --warning: #b45309;
        --warning-muted: #fef3c7;
        --error: #be123c;
        --error-muted: #ffe4e6;
        --shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
        --offset-top: max(16px, calc(env(safe-area-inset-top, 0px) + 12px));
        pointer-events: none;
      }

      .root[data-theme='dark'] {
        --bg: rgba(15, 23, 42, 0.94);
        --surface: #0f172a;
        --surface-2: #111c31;
        --surface-3: #172237;
        --border: rgba(148, 163, 184, 0.18);
        --border-strong: rgba(148, 163, 184, 0.28);
        --text: #e5eefb;
        --text-2: #bfd0e8;
        --text-3: #8ca0bb;
        --accent: #7cb2ff;
        --accent-muted: #152744;
        --success: #63d18c;
        --success-muted: #163122;
        --warning: #f4b75a;
        --warning-muted: #37270d;
        --error: #ff8ba7;
        --error-muted: #3c1623;
        --shadow: 0 30px 70px rgba(2, 6, 23, 0.42);
      }

      .launcher,
      .panel,
      .launcher-group {
        pointer-events: auto;
      }

      .launcher-group {
        position: fixed;
        top: var(--offset-top);
        right: 16px;
        z-index: 2147483646;
        display: flex;
        gap: 6px;
        align-items: center;
      }

      .launcher,
      .dashboard-btn {
        height: 38px;
        padding: 0 14px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: linear-gradient(135deg, var(--surface) 0%, var(--surface-3) 100%);
        color: var(--text);
        font: 700 12px/1.1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 14px 32px rgba(15, 23, 42, 0.18);
        cursor: pointer;
      }

      .launcher {
        min-width: 64px;
      }

      .dashboard-btn {
        min-width: 90px;
      }

      .panel {
        position: fixed;
        top: calc(var(--offset-top) + 48px);
        right: 16px;
        bottom: 16px;
        z-index: 2147483645;
        width: min(340px, calc(100vw - 32px));
        display: none;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: var(--bg);
        color: var(--text);
        font: 400 12px/1.45 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
        overflow: hidden;
      }

      .panel[data-open='true'] {
        display: flex;
      }

      .panel-body {
        min-height: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 10px;
        overflow: hidden;
      }

      .view-tabs,
      .page-controls,
      .history-item-top,
      .history-item-meta,
      .history-detail-header,
      .history-diff-tabs,
      .row-actions {
        display: flex;
        align-items: center;
      }

      .view-tabs,
      .page-controls,
      .history-diff-tabs,
      .row-actions {
        gap: 6px;
        flex-wrap: wrap;
      }

      .view-tab {
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text-2);
        font: inherit;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
      }

      .view-tab[data-active='true'] {
        background: var(--accent-muted);
        color: var(--accent);
        border-color: transparent;
      }

      .page-controls {
        justify-content: flex-end;
      }

      .page-btn,
      .ghost-btn,
      .open-profile {
        height: 28px;
        padding: 0 9px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text);
        font: inherit;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
      }

      .page-btn[disabled],
      .ghost-btn[disabled],
      .open-profile[disabled] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .page-indicator {
        color: var(--text-3);
        font-size: 10px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .history-list,
      .history-detail {
        min-height: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .history-scroll,
      .history-diff-list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: grid;
        gap: 6px;
        padding-right: 2px;
        align-content: start;
      }

      .history-scroll.is-empty,
      .history-diff-list.is-empty,
      .result-list.is-empty {
        overflow: hidden;
      }

      .history-item {
        display: grid;
        gap: 6px;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--surface);
      }

      .history-item-top,
      .history-item-meta,
      .history-detail-header {
        justify-content: space-between;
      }

      .history-item-title,
      .history-detail-title {
        color: var(--text);
        font-size: 11px;
        font-weight: 700;
      }

      .history-item-time,
      .history-note,
      .history-diff-label {
        color: var(--text-3);
        font-size: 10px;
      }

      .history-pill {
        padding: 2px 6px;
        border-radius: 999px;
        background: var(--surface-3);
        color: var(--text-3);
        font-size: 8px;
        font-weight: 700;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }

      .history-summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .history-dashboard-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .history-summary-item {
        padding: 8px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
      }

      .history-dashboard-card {
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%);
      }

      .history-dashboard-label {
        display: block;
        color: var(--text-3);
        font-size: 8px;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .history-dashboard-value {
        display: block;
        margin-top: 5px;
        color: var(--text);
        font-size: 15px;
        font-weight: 700;
      }

      .history-diff-tab {
        height: 28px;
        padding: 0 8px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text-2);
        font: inherit;
        font-size: 9px;
        font-weight: 700;
        cursor: pointer;
      }

      .history-diff-tab[data-active='true'] {
        background: var(--accent-muted);
        color: var(--accent);
        border-color: transparent;
      }

      .row,
      .toolbar,
      .tabs,
      .result-main {
        display: flex;
        align-items: center;
      }

      .row,
      .toolbar {
        justify-content: space-between;
        gap: 8px;
      }

      .toolbar,
      .tabs {
        flex-wrap: wrap;
      }

      .title {
        font-size: 13px;
        font-weight: 700;
      }

      .close,
      .tab,
      .action,
      .wl-toggle,
      .unfollow-toggle {
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
      }

      .close {
        width: 28px;
        height: 28px;
        border-radius: 999px;
      }

      .meta,
      .stats,
      .result-copy,
      .result-list,
      .progress-grid {
        display: grid;
      }

      .meta,
      .result-copy {
        gap: 4px;
      }

      .account,
      .copy,
      .empty,
      .result-name {
        color: var(--text-2);
      }

      .account,
      .copy,
      .result-name,
      .result-handle {
        font-size: 11px;
      }

      .badge,
      .mini-badge,
      .stat-k,
      .progress-k {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .badge {
        width: fit-content;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--surface-3);
        color: var(--text-2);
        font-size: 9px;
        font-weight: 700;
      }

      .badge[data-tone='info'] {
        background: var(--accent-muted);
        color: var(--accent);
      }

      .badge[data-tone='success'] {
        background: var(--success-muted);
        color: var(--success);
      }

      .badge[data-tone='warning'] {
        background: var(--warning-muted);
        color: var(--warning);
      }

      .badge[data-tone='error'] {
        background: var(--error-muted);
        color: var(--error);
      }

      .stats,
      .progress-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      .stat,
      .progress-item {
        min-width: 0;
        padding: 8px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
      }

      .stat-k,
      .progress-k {
        display: block;
        color: var(--text-3);
        font-size: 8px;
      }

      .stat-v,
      .progress-v {
        display: block;
        margin-top: 4px;
        color: var(--text);
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .toolbar {
        gap: 6px;
      }

      .search {
        flex: 1;
        min-width: 0;
        height: 30px;
        padding: 0 10px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text);
        font: inherit;
      }

      .search::placeholder {
        color: var(--text-3);
      }

      .tabs {
        gap: 6px;
      }

      .tab {
        height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        font: inherit;
        font-size: 10px;
        font-weight: 700;
      }

      .tab[data-active='true'] {
        background: var(--accent-muted);
        color: var(--accent);
        border-color: transparent;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .action {
        height: 30px;
        padding: 0 11px;
        border-radius: 999px;
        font: inherit;
        font-size: 10px;
        font-weight: 700;
      }

      .action.primary {
        background: var(--accent-muted);
        color: var(--accent);
        border-color: transparent;
      }

      .action[disabled],
      .wl-toggle[disabled],
      .unfollow-toggle[disabled] {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .result-list {
        flex: 1;
        gap: 6px;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding-right: 2px;
      }

      .history-scroll,
      .history-diff-list {
        display: flex;
        flex-direction: column;
      }

      .result-item {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        padding: 8px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
      }

      .avatar,
      .avatar-img {
        width: 38px;
        height: 38px;
        border-radius: 50%;
      }

      .avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--surface-3);
        color: var(--text-2);
        font-size: 12px;
        font-weight: 700;
        overflow: hidden;
      }

      .avatar-img {
        object-fit: cover;
      }

      .result-copy {
        min-width: 0;
      }

      .result-main {
        gap: 6px;
        min-width: 0;
      }

      .result-handle {
        color: var(--text);
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .profile-link {
        color: var(--text);
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }

      .profile-link:hover {
        text-decoration: underline;
      }

      .result-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .mini-badge {
        padding: 2px 6px;
        border-radius: 999px;
        background: var(--surface-3);
        color: var(--text-3);
        font-size: 8px;
        font-weight: 700;
      }

      .wl-toggle,
      .unfollow-toggle {
        height: 28px;
        min-width: 34px;
        padding: 0 8px;
        border-radius: 999px;
        font: inherit;
        font-size: 10px;
        font-weight: 700;
      }

      .unfollow-toggle {
        min-width: 54px;
      }

      .open-profile {
        min-width: 56px;
      }

      .wl-toggle[data-active='true'] {
        background: var(--success-muted);
        color: var(--success);
        border-color: transparent;
      }

      .unfollow-toggle {
        background: var(--error-muted);
        color: var(--error);
        border-color: transparent;
      }

      .empty {
        min-height: 140px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px 12px;
        border: 1px dashed var(--border-strong);
        border-radius: 12px;
        text-align: center;
      }

      .empty-fill {
        flex: 1;
        min-height: 0;
      }

      .launcher:focus-visible,
      .close:focus-visible,
      .search:focus-visible,
      .view-tab:focus-visible,
      .tab:focus-visible,
      .action:focus-visible,
      .page-btn:focus-visible,
      .ghost-btn:focus-visible,
      .open-profile:focus-visible,
      .history-diff-tab:focus-visible,
      .wl-toggle:focus-visible,
      .unfollow-toggle:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      @media (max-width: 560px) {
        .panel {
          width: calc(100vw - 24px);
          right: 12px;
          bottom: 12px;
          top: calc(var(--offset-top) + 44px);
        }

        .launcher {
          right: 12px;
        }
      }
    </style>
    <div class="root" data-theme="light">
      <div class="launcher-group">
        <button class="launcher" type="button"></button>
        <button class="dashboard-btn" type="button"></button>
      </div>
      <aside class="panel" data-open="false"></aside>
    </div>
  `;

  shadowRoot.appendChild(wrapper);

  return {
    root: shadowRoot.querySelector('.root') as HTMLElement,
    launcher: shadowRoot.querySelector('.launcher') as HTMLButtonElement,
    dashboardBtn: shadowRoot.querySelector('.dashboard-btn') as HTMLButtonElement,
    panel: shadowRoot.querySelector('.panel') as HTMLElement,
  };
}

export default {
  id: FEATURE_ID,
  label: 'Instagram Analyzer',
  description: 'Adds a compact analyzer launcher inside Instagram.',
  matches: isInstagram,
  apply: () => {
    let analyzerState: InstagramAnalyzerState = { currentViewerId: null, accounts: {} };
    let activeViewerId: string | null = null;
    let activeUsername = '';
    let durableViewerId: string | null = null;
    let durableLastScannedAt: number | null = null;
    let lastViewerResolveId = '';
    let lastViewerResolveAt = 0;
    let isDrawerOpen = false;
    let isScanRequestPending = false;
    let activeView: PrimaryView = 'results';
    let searchQuery = '';
    let activeTab: ResultTab = 'non-whitelisted';
    let resultsPage = 1;
    let historyPage = 1;
    let selectedHistoryScanId: string | null = null;
    let selectedHistoryDiffTab: HistoryDiffTab = 'followed';
    let historyDiffPage = 1;
    let localActionError: string | null = null;
    let currentTheme: ThemeChoice = 'system';
    let isDisposed = false;
    const pendingUnfollowIds = new Set<string>();
    let intervalId = 0;
    let shouldRestoreSearchFocus = false;
    let searchSelectionStart = 0;
    let searchSelectionEnd = 0;
    let resultListScrollTop = 0;
    let historyListScrollTop = 0;
    let historyDetailScrollTop = 0;

    const existingHost = document.getElementById(HOST_ID);
    if (existingHost) {
      existingHost.remove();
    }

    const host = document.createElement('div');
    host.id = HOST_ID;
    (document.body || document.documentElement).appendChild(host);

    const shadowRoot = host.attachShadow({ mode: 'open' });
    const { root, launcher, dashboardBtn, panel } = createUi(shadowRoot);

    let lastPathname = location.pathname;
    let navPollId = 0;

    const pollNavigation = (): void => {
      const current = location.pathname;
      if (current !== lastPathname) {
        lastPathname = current;
        updateHostVisibility();
      }
    };

    const cleanup = (): void => {
      if (isDisposed) {
        return;
      }
      isDisposed = true;
      window.clearInterval(intervalId);
      window.clearInterval(navPollId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      chrome.storage.onChanged.removeListener(handleStorageChange);
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      host.remove();
    };

    const captureUiState = (): void => {
      const activeElement =
        shadowRoot.activeElement instanceof HTMLElement ? shadowRoot.activeElement : null;
      const searchInput = panel.querySelector('.search') as HTMLInputElement | null;
      shouldRestoreSearchFocus = activeElement === searchInput;
      searchSelectionStart = searchInput?.selectionStart ?? 0;
      searchSelectionEnd = searchInput?.selectionEnd ?? 0;
      resultListScrollTop =
        (panel.querySelector('.result-list') as HTMLElement | null)?.scrollTop ?? 0;
      historyListScrollTop =
        (panel.querySelector('.history-scroll') as HTMLElement | null)?.scrollTop ?? 0;
      historyDetailScrollTop =
        (panel.querySelector('.history-diff-list') as HTMLElement | null)?.scrollTop ?? 0;
    };

    const restoreUiState = (): void => {
      const nextResultList = panel.querySelector('.result-list') as HTMLElement | null;
      const nextHistoryList = panel.querySelector('.history-scroll') as HTMLElement | null;
      const nextHistoryDetailList = panel.querySelector('.history-diff-list') as HTMLElement | null;
      if (nextResultList) {
        nextResultList.scrollTop = resultListScrollTop;
      }
      if (nextHistoryList) {
        nextHistoryList.scrollTop = historyListScrollTop;
      }
      if (nextHistoryDetailList) {
        nextHistoryDetailList.scrollTop = historyDetailScrollTop;
      }

      if (shouldRestoreSearchFocus) {
        const searchInput = panel.querySelector('.search') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          const end = Math.min(
            searchInput.value.length,
            searchSelectionEnd || searchInput.value.length,
          );
          const start = Math.min(searchInput.value.length, searchSelectionStart || end);
          searchInput.setSelectionRange(start, end);
        }
      }
    };

    const handlePotentialInvalidation = (error: unknown): void => {
      if (isContextInvalidatedError(error)) {
        cleanup();
      }
    };

    const applySettings = (settings: Settings): void => {
      setLocale(settings.language ?? resolveLocale());
      currentTheme = settings.theme;
      root.dataset['theme'] = resolveDrawerTheme(settings.theme);
      render();
    };

    const refreshSettings = async (): Promise<void> => {
      try {
        applySettings(await getSettings());
      } catch (error) {
        handlePotentialInvalidation(error);
      }
    };

    const refreshState = async (): Promise<void> => {
      try {
        analyzerState = await getInstagramAnalyzerState();
        await hydrateDurableAccount(activeViewerId ?? analyzerState.currentViewerId, true);
        render();
      } catch (error) {
        handlePotentialInvalidation(error);
      }
    };

    const hydrateDurableAccount = async (viewerId: string | null, force = false): Promise<void> => {
      if (!viewerId) {
        return;
      }

      const account = analyzerState.accounts[viewerId];
      const nextLastScannedAt = account?.summary.lastScannedAt ?? null;
      if (!force && durableViewerId === viewerId && durableLastScannedAt === nextLastScannedAt) {
        return;
      }

      const response = await sendAnalyzerMessage({
        type: MESSAGE_TYPES.IG_ANALYZER_GET_DURABLE_ACCOUNT,
        viewerId,
      });

      if (!response || response['success'] !== true) {
        return;
      }

      const durableAccount =
        (response['account'] as InstagramAnalyzerDurableAccount | undefined) ?? null;
      if (!durableAccount) {
        return;
      }

      const targetAccount =
        analyzerState.accounts[viewerId] ??
        createInstagramAnalyzerAccountState(viewerId, durableAccount.username);
      analyzerState.accounts[viewerId] = mergeDurableAccountData(targetAccount, durableAccount);
      durableViewerId = viewerId;
      durableLastScannedAt = nextLastScannedAt;
    };

    const resolveViewerUsername = async (viewerId: string, csrfToken: string): Promise<string> => {
      const now = Date.now();
      if (lastViewerResolveId === viewerId && now - lastViewerResolveAt < 30000) {
        return '';
      }

      lastViewerResolveId = viewerId;
      lastViewerResolveAt = now;

      const response = await sendAnalyzerMessage({
        type: MESSAGE_TYPES.IG_ANALYZER_RESOLVE_VIEWER,
        viewerId,
        csrfToken,
      });
      return typeof response?.['username'] === 'string' ? response['username'] : '';
    };

    const syncViewer = async (): Promise<void> => {
      if (isDisposed) {
        return;
      }

      try {
        const nextViewerId = getCookieValue('ds_user_id') || null;
        const storageUsername = nextViewerId
          ? analyzerState.accounts[nextViewerId]?.summary.username || ''
          : '';
        const domUsername = nextViewerId ? detectViewerUsername() : '';
        const resolvedUsername =
          nextViewerId && !domUsername && !storageUsername
            ? await resolveViewerUsername(nextViewerId, getCookieValue('csrftoken'))
            : '';
        const nextUsername = domUsername || storageUsername || resolvedUsername;
        const hasChanged = nextViewerId !== activeViewerId || nextUsername !== activeUsername;
        const needsAccountSeed = Boolean(nextViewerId && !analyzerState.accounts[nextViewerId]);

        activeViewerId = nextViewerId;
        activeUsername = nextUsername;

        if (!hasChanged && !needsAccountSeed) {
          return;
        }

        analyzerState = await updateInstagramAnalyzer((state) => {
          state.currentViewerId = nextViewerId;
          if (!nextViewerId) {
            return state;
          }

          const account =
            state.accounts[nextViewerId] ??
            createInstagramAnalyzerAccountState(nextViewerId, nextUsername);
          if (nextUsername) {
            account.summary.username = nextUsername;
            if (account.job) {
              account.job.username = nextUsername;
            }
          }
          state.accounts[nextViewerId] = account;
          return state;
        });
        durableViewerId = null;
        durableLastScannedAt = null;
        await hydrateDurableAccount(nextViewerId, true);
        render();
      } catch (error) {
        handlePotentialInvalidation(error);
      }
    };

    const toggleWhitelist = async (resultId: string): Promise<void> => {
      if (!activeViewerId) {
        return;
      }

      const viewerId = activeViewerId;
      const currentAccount = analyzerState.accounts[viewerId];
      const knownResults = currentAccount?.results ?? [];
      const knownHistory = currentAccount?.history ?? [];
      const knownFollowingSnapshot = currentAccount?.followingSnapshot ?? [];
      const knownFollowersSnapshot = currentAccount?.followersSnapshot ?? [];

      try {
        analyzerState = await updateInstagramAnalyzer((state) => {
          const account =
            state.accounts[viewerId] ??
            createInstagramAnalyzerAccountState(viewerId, activeUsername);
          const whitelist = new Set(account.whitelist);
          if (whitelist.has(resultId)) {
            whitelist.delete(resultId);
          } else {
            whitelist.add(resultId);
          }
          account.whitelist = Array.from(whitelist).sort();
          account.summary.whitelistedCount = knownResults.filter((item) =>
            whitelist.has(item.id),
          ).length;
          state.accounts[viewerId] = account;
          return state;
        });
        localActionError = null;
        const hydratedAccount = analyzerState.accounts[viewerId];
        if (hydratedAccount) {
          hydratedAccount.results = knownResults;
          hydratedAccount.history = knownHistory;
          hydratedAccount.followingSnapshot = knownFollowingSnapshot;
          hydratedAccount.followersSnapshot = knownFollowersSnapshot;
          hydratedAccount.summary.whitelistedCount = knownResults.filter((item) =>
            hydratedAccount.whitelist.includes(item.id),
          ).length;
        }
        render();
      } catch (error) {
        handlePotentialInvalidation(error);
      }
    };

    const unfollowResult = async (resultId: string): Promise<void> => {
      if (!activeViewerId || pendingUnfollowIds.has(resultId)) {
        return;
      }

      const viewerId = activeViewerId;
      const currentAccount = analyzerState.accounts[viewerId];
      const knownResults = currentAccount?.results ?? [];
      const knownHistory = currentAccount?.history ?? [];
      const knownFollowingSnapshot = currentAccount?.followingSnapshot ?? [];
      const knownFollowersSnapshot = currentAccount?.followersSnapshot ?? [];
      const targetUser =
        knownResults.find((item) => item.id === resultId) ??
        knownFollowingSnapshot.find((item) => item.id === resultId) ??
        knownFollowersSnapshot.find((item) => item.id === resultId) ??
        null;
      const username = targetUser?.username ?? resultId;

      if (!window.confirm(t('analyzerUnfollowConfirm').replace('{username}', username))) {
        return;
      }

      pendingUnfollowIds.add(resultId);
      localActionError = null;
      render();

      try {
        await unfollowInstagramUser(resultId, getCookieValue('csrftoken'));
        const durableResponse = await sendAnalyzerMessage({
          type: MESSAGE_TYPES.IG_ANALYZER_REMOVE_RESULT,
          viewerId,
          targetId: resultId,
          username: activeUsername || currentAccount?.summary.username || '',
        });
        if (durableResponse?.['success'] !== true) {
          throw new Error(
            typeof durableResponse?.['error'] === 'string'
              ? durableResponse['error']
              : t('analyzerErrorBody'),
          );
        }

        analyzerState = await updateInstagramAnalyzer((state) => {
          const account =
            state.accounts[viewerId] ??
            createInstagramAnalyzerAccountState(viewerId, activeUsername);
          account.results = account.results.filter((item) => item.id !== resultId);
          account.followingSnapshot = account.followingSnapshot.filter(
            (item) => item.id !== resultId,
          );
          account.whitelist = account.whitelist.filter((id) => id !== resultId);
          account.summary.nonFollowerCount = account.results.length;
          account.summary.followingCount = account.followingSnapshot.length;
          account.summary.whitelistedCount = account.results.filter((item) =>
            account.whitelist.includes(item.id),
          ).length;
          state.accounts[viewerId] = account;
          return state;
        });

        const hydratedAccount = analyzerState.accounts[viewerId];
        if (hydratedAccount) {
          hydratedAccount.results = knownResults.filter((item) => item.id !== resultId);
          hydratedAccount.history = knownHistory;
          hydratedAccount.followingSnapshot = knownFollowingSnapshot.filter(
            (item) => item.id !== resultId,
          );
          hydratedAccount.followersSnapshot = knownFollowersSnapshot;
          hydratedAccount.whitelist = hydratedAccount.whitelist.filter((id) => id !== resultId);
          hydratedAccount.summary.nonFollowerCount = hydratedAccount.results.length;
          hydratedAccount.summary.followingCount = hydratedAccount.followingSnapshot.length;
          hydratedAccount.summary.whitelistedCount = hydratedAccount.results.filter((item) =>
            hydratedAccount.whitelist.includes(item.id),
          ).length;
        }

        if (
          activeTab === 'whitelisted' &&
          !(analyzerState.accounts[viewerId]?.whitelist.length ?? 0)
        ) {
          activeTab = 'non-whitelisted';
        }
      } catch (error) {
        localActionError = String(
          (error as { message?: string } | null)?.message ?? t('analyzerErrorBody'),
        );
        handlePotentialInvalidation(error);
      } finally {
        pendingUnfollowIds.delete(resultId);
        render();
      }
    };

    const startScan = async (): Promise<void> => {
      if (!activeViewerId || isScanRequestPending || isDisposed) {
        return;
      }

      const account = resolveActiveAccount(analyzerState, activeViewerId);
      if (account?.job?.status === 'running' || account?.summary.status === 'running') {
        return;
      }

      isScanRequestPending = true;
      localActionError = null;
      render();

      const response = await sendAnalyzerMessage({
        type: MESSAGE_TYPES.IG_ANALYZER_START_SCAN,
        viewerId: activeViewerId,
        username: activeUsername || account?.summary.username || '',
        csrfToken: getCookieValue('csrftoken'),
      });

      isScanRequestPending = false;
      if (!response?.success) {
        localActionError =
          typeof response?.['error'] === 'string' ? response['error'] : t('analyzerErrorBody');
      } else if (typeof response?.['error'] === 'string' && response['error']) {
        localActionError = response['error'];
      }
      await refreshState();
    };

    const copyVisibleResults = async (): Promise<void> => {
      const account = resolveActiveAccount(analyzerState, activeViewerId);
      const visibleResults = getVisibleResults(account, activeTab, searchQuery);
      if (!visibleResults.length) {
        return;
      }

      try {
        await copyToClipboard(visibleResults.map((item) => `@${item.username}`).join('\n'));
      } catch (error) {
        localActionError = String(
          (error as { message?: string } | null)?.message ?? t('analyzerErrorBody'),
        );
        render();
      }
    };

    const exportVisibleResults = (): void => {
      const account = resolveActiveAccount(analyzerState, activeViewerId);
      const visibleResults = getVisibleResults(account, activeTab, searchQuery);
      if (!visibleResults.length) {
        return;
      }

      const accountLabel = (
        activeUsername ||
        account?.summary.username ||
        activeViewerId ||
        'instagram'
      ).replace(/[^a-z0-9_-]/gi, '-');
      const dateLabel = new Date().toISOString().slice(0, 10);
      downloadJson(`instagram-analyzer-${accountLabel}-${dateLabel}.json`, {
        viewerId: activeViewerId,
        username: activeUsername || account?.summary.username || '',
        exportedAt: Date.now(),
        filter: activeTab,
        searchQuery,
        results: visibleResults,
      });
    };

    const exportWhitelist = (): void => {
      const account = resolveActiveAccount(analyzerState, activeViewerId);
      if (!account?.whitelist.length) {
        return;
      }

      const knownUsers = getKnownUserMap(account);
      const whitelist = account.whitelist.map((id) => ({
        id,
        username: knownUsers.get(id) ?? '',
      }));
      const accountLabel = (
        activeUsername ||
        account.summary.username ||
        activeViewerId ||
        'instagram'
      ).replace(/[^a-z0-9_-]/gi, '-');
      downloadJson(`instagram-whitelist-${accountLabel}.json`, whitelist);
    };

    const clearWhitelist = async (): Promise<void> => {
      if (!activeViewerId) {
        return;
      }

      if (!window.confirm(t('analyzerWhitelistClearConfirm'))) {
        return;
      }

      const viewerId = activeViewerId;
      const currentAccount = analyzerState.accounts[viewerId];
      const knownResults = currentAccount?.results ?? [];
      const knownHistory = currentAccount?.history ?? [];
      const knownFollowingSnapshot = currentAccount?.followingSnapshot ?? [];
      const knownFollowersSnapshot = currentAccount?.followersSnapshot ?? [];
      try {
        analyzerState = await updateInstagramAnalyzer((state) => {
          const account =
            state.accounts[viewerId] ??
            createInstagramAnalyzerAccountState(viewerId, activeUsername);
          account.whitelist = [];
          account.summary.whitelistedCount = 0;
          state.accounts[viewerId] = account;
          return state;
        });
        const hydratedAccount = analyzerState.accounts[viewerId];
        if (hydratedAccount) {
          hydratedAccount.results = knownResults;
          hydratedAccount.history = knownHistory;
          hydratedAccount.followingSnapshot = knownFollowingSnapshot;
          hydratedAccount.followersSnapshot = knownFollowersSnapshot;
          hydratedAccount.summary.whitelistedCount = 0;
        }
        render();
      } catch (error) {
        handlePotentialInvalidation(error);
      }
    };

    const importWhitelist = async (): Promise<void> => {
      if (!activeViewerId) {
        return;
      }

      const viewerId = activeViewerId;
      const currentAccount = analyzerState.accounts[viewerId];
      const knownResults = currentAccount?.results ?? [];
      const knownHistory = currentAccount?.history ?? [];
      const knownFollowingSnapshot = currentAccount?.followingSnapshot ?? [];
      const knownFollowersSnapshot = currentAccount?.followersSnapshot ?? [];
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener(
        'change',
        async () => {
          const file = input.files?.[0];
          input.remove();
          if (!file) {
            return;
          }

          try {
            const raw = await file.text();
            const parsed = JSON.parse(raw) as unknown;
            const importedIds = Array.isArray(parsed)
              ? parsed.flatMap((item) => {
                  if (typeof item === 'string') {
                    return item;
                  }
                  if (
                    item &&
                    typeof item === 'object' &&
                    typeof (item as { id?: unknown }).id === 'string'
                  ) {
                    return (item as { id: string }).id;
                  }
                  return [] as string[];
                })
              : [];

            analyzerState = await updateInstagramAnalyzer((state) => {
              const account =
                state.accounts[viewerId] ??
                createInstagramAnalyzerAccountState(viewerId, activeUsername);
              const whitelist = new Set(account.whitelist);
              importedIds.forEach((id) => whitelist.add(id));
              account.whitelist = Array.from(whitelist).sort();
              account.summary.whitelistedCount = knownResults.filter((item) =>
                whitelist.has(item.id),
              ).length;
              state.accounts[viewerId] = account;
              return state;
            });
            const hydratedAccount = analyzerState.accounts[viewerId];
            if (hydratedAccount) {
              hydratedAccount.results = knownResults;
              hydratedAccount.history = knownHistory;
              hydratedAccount.followingSnapshot = knownFollowingSnapshot;
              hydratedAccount.followersSnapshot = knownFollowersSnapshot;
              hydratedAccount.summary.whitelistedCount = knownResults.filter((item) =>
                hydratedAccount.whitelist.includes(item.id),
              ).length;
            }
            render();
          } catch (error) {
            localActionError = String(
              (error as { message?: string } | null)?.message ?? t('analyzerErrorBody'),
            );
            render();
          }
        },
        { once: true },
      );

      input.click();
    };

    const isStoryPage = (): boolean => /^\/stories\//i.test(location.pathname);

    const updateHostVisibility = (): void => {
      host.style.display = isStoryPage() ? 'none' : '';
    };

    const render = (): void => {
      if (isDisposed) {
        return;
      }
      updateHostVisibility();

      const account = resolveActiveAccount(analyzerState, activeViewerId);
      const visibleResults = getVisibleResults(account, activeTab, searchQuery);
      const pagedResults = paginate(visibleResults, resultsPage, RESULT_PAGE_SIZE);
      resultsPage = pagedResults.page;
      const historyEntries = getHistoryEntries(account);
      const pagedHistory = paginate(historyEntries, historyPage, HISTORY_PAGE_SIZE);
      historyPage = pagedHistory.page;
      const selectedHistoryEntry =
        historyEntries.find((entry) => entry.scanId === selectedHistoryScanId) ?? null;
      const historyDiffItems = getHistoryDiffItems(selectedHistoryEntry, selectedHistoryDiffTab);
      const pagedHistoryDiff = paginate(historyDiffItems, historyDiffPage, HISTORY_DIFF_PAGE_SIZE);
      historyDiffPage = pagedHistoryDiff.page;
      const resultsViewLabel = `${t('analyzerViewResults')} (${visibleResults.length})`;
      const historyViewLabel = `${t('analyzerViewHistory')} (${historyEntries.length})`;
      const displayAccount = getDisplayAccount(account, activeViewerId, activeUsername);
      const lastScan = account?.summary.lastScannedAt
        ? t('analyzerLastScan').replace('{time}', formatRelativeTime(account.summary.lastScannedAt))
        : t('analyzerLastScanNever');
      const statusLabel = getStatusLabel(account);
      const statusTone = getStatusTone(account);
      const scanAction = getScanActionConfig(account, activeViewerId, isScanRequestPending);
      const body = getDrawerBody(account, activeViewerId, activeUsername, localActionError);
      const lastError = account?.job?.lastError || account?.summary.lastError || '-';
      const cursorLabel =
        account?.job?.status === 'running'
          ? truncateCursor(account.job?.nextCursor ?? null)
          : account?.summary.lastScannedAt
            ? t('analyzerCursorDone')
            : '-';
      const whitelistSet = new Set(account?.whitelist ?? []);
      const isWhitelistTab = activeTab === 'whitelisted';
      const isHistoryDetailEmpty =
        !selectedHistoryEntry ||
        (!selectedHistoryEntry.diffs.followersAvailable &&
          (selectedHistoryDiffTab === 'followersGained' ||
            selectedHistoryDiffTab === 'followersLost')) ||
        !pagedHistoryDiff.items.length;
      const renderResultItems = (): string => {
        if (!pagedResults.items.length) {
          return `<div class="empty">${t('analyzerResultsEmpty')}</div>`;
        }

        return pagedResults.items
          .map((item) => {
            const hasAvatar = Boolean(item.profilePictureUrl);
            const displayName = item.fullName || `@${item.username}`;
            const isUnfollowPending = pendingUnfollowIds.has(item.id);
            const badges = [
              item.isPrivate ? `<span class="mini-badge">${t('analyzerPrivateBadge')}</span>` : '',
              item.isVerified
                ? `<span class="mini-badge">${t('analyzerVerifiedBadge')}</span>`
                : '',
            ]
              .filter(Boolean)
              .join('');

            return `
            <div class="result-item">
              <div class="avatar">
                ${
                  hasAvatar
                    ? `<img class="avatar-img" alt="${escapeHtml(item.username)}" src="${escapeHtml(item.profilePictureUrl)}" data-fallback="${escapeHtml(item.username.slice(0, 1).toUpperCase())}" />`
                    : escapeHtml(item.username.slice(0, 1).toUpperCase())
                }
              </div>
              <div class="result-copy">
                <div class="result-main">
                  <a class="profile-link result-handle" href="https://www.instagram.com/${encodeURIComponent(item.username)}/" target="_blank" rel="noopener noreferrer">@${escapeHtml(item.username)}</a>
                  <span class="badges">${badges}</span>
                </div>
                <div class="result-name">${escapeHtml(displayName)}</div>
              </div>
              <div class="row-actions">
                <button class="unfollow-toggle" type="button" data-action="unfollow" data-id="${escapeHtml(item.id)}" title="${escapeHtml(t('analyzerUnfollowTitle'))}" ${isUnfollowPending ? 'disabled' : ''}>${t('analyzerUnfollow')}</button>
                <button class="wl-toggle" type="button" data-action="toggle-whitelist" data-id="${escapeHtml(item.id)}" data-active="${String(whitelistSet.has(item.id))}" title="${escapeHtml(whitelistSet.has(item.id) ? t('analyzerWhitelistRemove') : t('analyzerWhitelistAdd'))}">${t('analyzerWhitelistShort')}</button>
              </div>
            </div>
          `;
          })
          .join('');
      };

      const renderPageControls = (page: number, totalPages: number, action: string): string => {
        return `
          <div class="page-controls">
            <button class="page-btn" type="button" data-page-action="${action}" data-direction="prev" ${page <= 1 ? 'disabled' : ''}>←</button>
            <span class="page-indicator">${page}/${totalPages}</span>
            <button class="page-btn" type="button" data-page-action="${action}" data-direction="next" ${page >= totalPages ? 'disabled' : ''}>→</button>
          </div>
        `;
      };

      const renderHistoryList = (): string => {
        if (!pagedHistory.items.length) {
          return `<div class="empty empty-fill">${t('analyzerHistoryEmpty')}</div>`;
        }

        return pagedHistory.items
          .map((entry) => {
            return `
            <div class="history-item">
              <div class="history-item-top">
                <div class="history-item-title">${escapeHtml(formatDateTime(entry.scannedAt))}</div>
                <button class="ghost-btn" type="button" data-action="view-history" data-scan-id="${escapeHtml(entry.scanId)}">${t('analyzerDetail')}</button>
              </div>
              <div class="history-item-meta">
                <span class="history-pill" title="${escapeHtml(t('analyzerHistoryTooltipNonFollowers'))}">${t('analyzerHistoryPillNonFollowers')} ${entry.nonFollowerCount}</span>
                <span class="history-pill" title="${escapeHtml(t('analyzerHistoryTooltipFollowed'))}">${t('analyzerHistoryPillFollowed')} ${entry.diffs.followed.length}</span>
                <span class="history-pill" title="${escapeHtml(t('analyzerHistoryTooltipUnfollowed'))}">${t('analyzerHistoryPillUnfollowed')} ${entry.diffs.unfollowed.length}</span>
                <span class="history-pill" title="${escapeHtml(t('analyzerHistoryTooltipFollowersGained'))}">${t('analyzerHistoryPillFollowersGained')} ${entry.diffs.followersGained.length}</span>
                <span class="history-pill" title="${escapeHtml(t('analyzerHistoryTooltipFollowersLost'))}">${t('analyzerHistoryPillFollowersLost')} ${entry.diffs.followersLost.length}</span>
              </div>
            </div>
          `;
          })
          .join('');
      };

      const renderHistoryDetailList = (): string => {
        if (!selectedHistoryEntry) {
          return `<div class="empty empty-fill">${t('analyzerResultsEmpty')}</div>`;
        }

        if (
          !selectedHistoryEntry.diffs.followersAvailable &&
          (selectedHistoryDiffTab === 'followersGained' ||
            selectedHistoryDiffTab === 'followersLost')
        ) {
          return `<div class="empty empty-fill">${t('analyzerFollowersUnavailable')}</div>`;
        }

        if (!pagedHistoryDiff.items.length) {
          return `<div class="empty empty-fill">${t('analyzerResultsEmpty')}</div>`;
        }

        return pagedHistoryDiff.items
          .map((item) => {
            return `
            <div class="result-item">
              <div class="avatar">${escapeHtml(item.username.slice(0, 1).toUpperCase())}</div>
              <div class="result-copy">
                <div class="result-main">
                  <a class="profile-link result-handle" href="https://www.instagram.com/${encodeURIComponent(item.username)}/" target="_blank" rel="noopener noreferrer">@${escapeHtml(item.username)}</a>
                </div>
                <div class="result-name">${escapeHtml(item.id)}</div>
              </div>
              <div class="row-actions"></div>
            </div>
          `;
          })
          .join('');
      };

      const resultsView = `
        <div class="panel-body">
          <div class="toolbar">
            <input class="search" type="search" value="${escapeHtml(searchQuery)}" placeholder="${escapeHtml(t('analyzerSearchPlaceholder'))}" />
            ${renderPageControls(pagedResults.page, pagedResults.totalPages, 'results')}
          </div>
          <div class="tabs">
            <button class="tab" type="button" data-tab="non-whitelisted" data-active="${String(activeTab === 'non-whitelisted')}">${t('analyzerTabNonWhitelisted')}</button>
            <button class="tab" type="button" data-tab="whitelisted" data-active="${String(activeTab === 'whitelisted')}">${t('analyzerTabWhitelisted')}</button>
          </div>
          <div class="actions">
            ${
              isWhitelistTab
                ? `<button class="action import-whitelist-action" type="button" ${activeViewerId ? '' : 'disabled'}>${t('analyzerWhitelistImport')}</button>
                 <button class="action export-whitelist-action" type="button" ${account?.whitelist.length ? '' : 'disabled'}>${t('analyzerWhitelistExport')}</button>
                 <button class="action clear-whitelist-action" type="button" ${account?.whitelist.length ? '' : 'disabled'}>${t('analyzerWhitelistClear')}</button>`
                : `<button class="action primary scan-action" type="button" ${scanAction.disabled ? 'disabled' : ''} title="${escapeHtml(scanAction.title)}">${escapeHtml(scanAction.label)}</button>
                 <button class="action copy-action" type="button" ${visibleResults.length ? '' : 'disabled'} title="${escapeHtml(t('analyzerCopyVisibleTitle'))}">${t('analyzerCopyVisible')}</button>
                 <button class="action export-action" type="button" ${visibleResults.length ? '' : 'disabled'} title="${escapeHtml(t('analyzerExportJsonTitle'))}">${t('analyzerExportJson')}</button>`
            }
          </div>
          <div class="result-list${pagedResults.items.length ? '' : ' is-empty'}">${renderResultItems()}</div>
        </div>
      `;

      const historyView = selectedHistoryEntry
        ? `
        <div class="panel-body">
          <div class="history-detail-header">
            <button class="ghost-btn history-back" type="button">← ${t('analyzerBack')}</button>
            <div class="history-detail-title">${escapeHtml(formatDateTime(selectedHistoryEntry.scannedAt))}</div>
          </div>
          <div class="history-dashboard-grid">
            <div class="history-dashboard-card"><span class="history-dashboard-label">${t('analyzerFollowingCountLabel')}</span><span class="history-dashboard-value">${selectedHistoryEntry.followingCount}</span></div>
            <div class="history-dashboard-card"><span class="history-dashboard-label">${t('analyzerFollowerCountLabel')}</span><span class="history-dashboard-value">${selectedHistoryEntry.diffs.followersAvailable ? selectedHistoryEntry.followerCount : '-'}</span></div>
            <div class="history-dashboard-card"><span class="history-dashboard-label">${t('analyzerNonFollowerCountLabel')}</span><span class="history-dashboard-value">${selectedHistoryEntry.nonFollowerCount}</span></div>
            <div class="history-dashboard-card"><span class="history-dashboard-label">${t('analyzerPagesLabel')}</span><span class="history-dashboard-value">${selectedHistoryEntry.pagesCompleted}</span></div>
            <div class="history-dashboard-card"><span class="history-dashboard-label">${t('analyzerDiffFollowed')}</span><span class="history-dashboard-value">${selectedHistoryEntry.diffs.followed.length}</span></div>
            <div class="history-dashboard-card"><span class="history-dashboard-label">${t('analyzerDiffUnfollowed')}</span><span class="history-dashboard-value">${selectedHistoryEntry.diffs.unfollowed.length}</span></div>
          </div>
          <div class="history-diff-tabs">
            <button class="history-diff-tab" type="button" data-diff-tab="followed" data-active="${String(selectedHistoryDiffTab === 'followed')}">${t('analyzerDiffFollowed')}</button>
            <button class="history-diff-tab" type="button" data-diff-tab="unfollowed" data-active="${String(selectedHistoryDiffTab === 'unfollowed')}">${t('analyzerDiffUnfollowed')}</button>
            <button class="history-diff-tab" type="button" data-diff-tab="followersGained" data-active="${String(selectedHistoryDiffTab === 'followersGained')}">${t('analyzerDiffFollowersGained')}</button>
            <button class="history-diff-tab" type="button" data-diff-tab="followersLost" data-active="${String(selectedHistoryDiffTab === 'followersLost')}">${t('analyzerDiffFollowersLost')}</button>
          </div>
          ${renderPageControls(pagedHistoryDiff.page, pagedHistoryDiff.totalPages, 'history-diff')}
          <div class="history-diff-list${isHistoryDetailEmpty ? ' is-empty' : ''}">${renderHistoryDetailList()}</div>
        </div>
      `
        : `
        <div class="panel-body">
          ${renderPageControls(pagedHistory.page, pagedHistory.totalPages, 'history')}
          <div class="history-scroll${pagedHistory.items.length ? '' : ' is-empty'}">${renderHistoryList()}</div>
        </div>
      `;

      launcher.textContent = t('analyzerDrawerOpen');
      launcher.setAttribute('aria-expanded', String(isDrawerOpen));
      launcher.setAttribute('title', t('analyzerOpenInstagramTitle'));
      dashboardBtn.textContent = t('dashboardOpenDashboard');
      dashboardBtn.setAttribute('title', t('dashboardOpenDashboardTitle'));

      captureUiState();
      panel.setAttribute('data-open', String(isDrawerOpen));
      panel.innerHTML = `
        <div class="row">
          <div class="title">${t('analyzerTitle')}</div>
          <button class="close" type="button" aria-label="${t('analyzerDrawerClose')}">x</button>
        </div>
        <div class="meta">
          <div class="account">${t('analyzerAccountLabel')}: ${escapeHtml(displayAccount)}</div>
          <div class="badge" data-tone="${statusTone}">${escapeHtml(statusLabel)}</div>
          <div class="copy">${escapeHtml(body)}</div>
          <div class="copy">${escapeHtml(lastScan)}</div>
        </div>
        <div class="stats">
          <div class="stat">
            <span class="stat-k">${t('analyzerNonFollowerCountLabel')}</span>
            <span class="stat-v">${account?.summary.nonFollowerCount ?? 0}</span>
          </div>
          <div class="stat">
            <span class="stat-k">${t('analyzerWhitelistedCountLabel')}</span>
            <span class="stat-v">${account?.summary.whitelistedCount ?? 0}</span>
          </div>
        </div>
        <div class="progress-grid">
          <div class="progress-item">
            <span class="progress-k">${t('analyzerPagesLabel')}</span>
            <span class="progress-v">${account?.job?.pagesCompleted ?? 0}</span>
          </div>
          <div class="progress-item">
            <span class="progress-k">${t('analyzerProcessedLabel')}</span>
            <span class="progress-v">${account?.job?.processedCount ?? account?.summary.followingCount ?? 0}</span>
          </div>
          <div class="progress-item">
            <span class="progress-k">${t('analyzerCursorLabel')}</span>
            <span class="progress-v">${escapeHtml(cursorLabel)}</span>
          </div>
          <div class="progress-item">
            <span class="progress-k">${t('analyzerLastErrorLabel')}</span>
            <span class="progress-v">${escapeHtml(lastError)}</span>
          </div>
        </div>
        <div class="view-tabs">
          <button class="view-tab" type="button" data-view="results" data-active="${String(activeView === 'results')}">${escapeHtml(resultsViewLabel)}</button>
          <button class="view-tab" type="button" data-view="history" data-active="${String(activeView === 'history')}">${escapeHtml(historyViewLabel)}</button>
        </div>
        ${activeView === 'results' ? resultsView : historyView}
      `;

      const closeButton = panel.querySelector('.close') as HTMLButtonElement | null;
      closeButton?.addEventListener('click', () => {
        isDrawerOpen = false;
        render();
      });

      const searchInput = panel.querySelector('.search') as HTMLInputElement | null;
      searchInput?.addEventListener('input', () => {
        searchQuery = searchInput.value.trim();
        resultsPage = 1;
        render();
      });
      const stopSearchEvent = (event: Event): void => {
        event.stopPropagation();
        if ('stopImmediatePropagation' in event) {
          event.stopImmediatePropagation();
        }
      };
      searchInput?.addEventListener('keydown', stopSearchEvent, true);
      searchInput?.addEventListener('keypress', stopSearchEvent, true);
      searchInput?.addEventListener('keyup', stopSearchEvent, true);

      const scanButton = panel.querySelector('.scan-action') as HTMLButtonElement | null;
      scanButton?.addEventListener('click', () => {
        void startScan();
      });

      const copyButton = panel.querySelector('.copy-action') as HTMLButtonElement | null;
      copyButton?.addEventListener('click', () => {
        void copyVisibleResults();
      });

      const exportButton = panel.querySelector('.export-action') as HTMLButtonElement | null;
      exportButton?.addEventListener('click', () => {
        exportVisibleResults();
      });

      const importWhitelistButton = panel.querySelector(
        '.import-whitelist-action',
      ) as HTMLButtonElement | null;
      importWhitelistButton?.addEventListener('click', () => {
        void importWhitelist();
      });

      const exportWhitelistButton = panel.querySelector(
        '.export-whitelist-action',
      ) as HTMLButtonElement | null;
      exportWhitelistButton?.addEventListener('click', () => {
        exportWhitelist();
      });

      const clearWhitelistButton = panel.querySelector(
        '.clear-whitelist-action',
      ) as HTMLButtonElement | null;
      clearWhitelistButton?.addEventListener('click', () => {
        void clearWhitelist();
      });

      panel.querySelectorAll<HTMLButtonElement>('.view-tab').forEach((button) => {
        button.addEventListener('click', () => {
          activeView = (button.dataset['view'] as PrimaryView) || 'results';
          render();
        });
      });

      panel.querySelectorAll<HTMLButtonElement>('.tab').forEach((button) => {
        button.addEventListener('click', () => {
          activeTab = (button.dataset['tab'] as ResultTab) || 'non-whitelisted';
          resultsPage = 1;
          render();
        });
      });

      panel.querySelectorAll<HTMLButtonElement>('[data-page-action]').forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.dataset['pageAction'];
          const direction = button.dataset['direction'];
          const delta = direction === 'next' ? 1 : -1;
          if (action === 'results') {
            resultsPage += delta;
          } else if (action === 'history') {
            historyPage += delta;
          } else if (action === 'history-diff') {
            historyDiffPage += delta;
          }
          render();
        });
      });

      panel
        .querySelectorAll<HTMLButtonElement>('[data-action="view-history"]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            selectedHistoryScanId = button.dataset['scanId'] ?? null;
            selectedHistoryDiffTab = 'followed';
            historyDiffPage = 1;
            render();
          });
        });

      const historyBackButton = panel.querySelector('.history-back') as HTMLButtonElement | null;
      historyBackButton?.addEventListener('click', () => {
        selectedHistoryScanId = null;
        render();
      });

      panel.querySelectorAll<HTMLButtonElement>('.history-diff-tab').forEach((button) => {
        button.addEventListener('click', () => {
          selectedHistoryDiffTab = (button.dataset['diffTab'] as HistoryDiffTab) || 'followed';
          historyDiffPage = 1;
          render();
        });
      });

      panel
        .querySelectorAll<HTMLButtonElement>('[data-action="toggle-whitelist"]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            const resultId = button.dataset['id'];
            if (resultId) {
              void toggleWhitelist(resultId);
            }
          });
        });

      panel.querySelectorAll<HTMLButtonElement>('[data-action="unfollow"]').forEach((button) => {
        button.addEventListener('click', () => {
          const resultId = button.dataset['id'];
          if (resultId) {
            void unfollowResult(resultId);
          }
        });
      });

      restoreUiState();
    };

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ): void => {
      if (area !== 'local') {
        return;
      }
      if (changes['instagramAnalyzer']) {
        void refreshState();
      }
      if (changes['language'] || changes['theme']) {
        void refreshSettings();
      }
    };

    const handleRuntimeMessage = (
      message: { type?: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ): boolean | undefined => {
      if (message?.type !== MESSAGE_TYPES.IG_ANALYZER_OPEN) {
        return undefined;
      }

      isDrawerOpen = true;
      render();
      sendResponse({ success: true });
      return false;
    };

    const handleFocus = (): void => {
      void syncViewer();
      void refreshSettings();
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void syncViewer();
        void refreshSettings();
      }
    };

    dashboardBtn.addEventListener('click', () => {
      toggleDashboard({
        activeViewerId,
        activeUsername,
        analyzerState,
        themeChoice: currentTheme,
        onScan: () => {
          void startScan();
        },
        onToggleWhitelist: (id) => {
          void toggleWhitelist(id);
        },
        onUnfollow: (id) => {
          void unfollowResult(id);
        },
        isUnfollowPending: (id) => pendingUnfollowIds.has(id),
      });
    });

    launcher.addEventListener('click', () => {
      isDrawerOpen = !isDrawerOpen;
      render();
    });

    root.addEventListener(
      'error',
      (e) => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement)) return;
        const fallback = img.dataset['fallback'];
        if (!fallback) return;
        const parent = img.parentNode;
        img.remove();
        if (parent) parent.textContent = fallback;
      },
      true,
    );

    chrome.storage.onChanged.addListener(handleStorageChange);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    navPollId = window.setInterval(pollNavigation, 800);

    intervalId = window.setInterval(() => {
      void syncViewer();
    }, VIEWER_SYNC_MS);

    render();
    void refreshSettings();
    void refreshState();
    void syncViewer();

    return cleanup;
  },
};
