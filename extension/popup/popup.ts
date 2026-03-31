import {
  getSettings,
  getDownloadsState,
  getInstagramAnalyzerState,
  onDownloadsChanged,
  onInstagramAnalyzerChanged,
  setLanguage,
  setTheme,
} from '../shared/storage.js';
import type {
  DownloadJob,
  DownloadsState,
  InstagramAnalyzerState,
  ThemeChoice,
} from '../shared/storage.js';
import { MESSAGE_TYPES } from '../shared/contracts/message-types.js';
import { t, getLocale, setLocale, resolveLocale } from '../shared/i18n.js';
import type { Locale } from '../shared/storage.js';
import { createDownloadViewModel, sortJobsByDate } from './model/download-view-model.js';
import type { StatusInfo } from './model/download-view-model.js';
import { createInstagramAnalyzerViewModel } from './model/instagram-analyzer-view-model.js';
import { resolveTheme, syncSystemThemeListener } from './model/theme-model.js';
import type { ResolvedTheme } from './model/theme-model.js';

/* ── DOM refs ────────────────────────────────────────────────────── */
const bugBtn = document.getElementById('bug-btn') as HTMLButtonElement | null;
const languageSelect = document.getElementById('language-select') as HTMLSelectElement | null;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement | null;
const instagramAnalyzerEl = document.getElementById('instagram-analyzer');
const downloadActiveEl = document.getElementById('download-active');
const downloadHistoryEl = document.getElementById('download-history');
const sortDownloadsBtn = document.getElementById('sort-downloads') as HTMLButtonElement | null;
const clearHistoryBtn = document.getElementById('clear-history') as HTMLButtonElement | null;
const activeCountEl = document.getElementById('active-count');
const historyCountEl = document.getElementById('history-count');
const footerVersionEl = document.getElementById('footer-version');
const footerUpdateEl = document.getElementById('footer-update');
const appBodyEl = document.querySelector<HTMLElement>('.app-body');

const subTabs = Array.from(document.querySelectorAll<HTMLElement>('.subtab'));
const subTabViews = Array.from(document.querySelectorAll<HTMLElement>('.download-group'));
const subTabLabelEls: Record<string, HTMLElement | null> = {
  active: document.querySelector<HTMLElement>('[data-subtab-label="active"]'),
  history: document.querySelector<HTMLElement>('[data-subtab-label="history"]'),
};

/* ── Constants ───────────────────────────────────────────────────── */
const SUBTAB_KEY = 'aioPopupDownloadsTab';
const defaultSubTab = 'active';
const SORT_KEY = 'aioPopupSortAsc';
const BUG_REPORT_URL = 'https://github.com/voyvodka/All-in-one-Extension/issues/new/choose';
const GITHUB_RELEASES_API =
  'https://api.github.com/repos/voyvodka/All-in-one-Extension/releases/latest';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MIN_UPDATE_LOADING_MS = 700;
const UPDATE_CACHE_KEY = 'aioUpdateCheck';
const INSTALL_PATH_KEY = 'aioInstallPath';
const WIZARD_STEP_KEY = 'aioUpdateWizardStep';
const IS_DEV_BUILD = (() => {
  try {
    return /\bdev\b/i.test(chrome.runtime.getManifest().name || '');
  } catch {
    return false;
  }
})();
const prefersDark: MediaQueryList | null = window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

/* ── State ───────────────────────────────────────────────────────── */
let systemThemeHandler: (() => void) | null = null;
let expandedJobId: string | null = null;
let isInitializing = true;
let initError: Error | null = null;
let footerState: 'loading' | 'latest' | 'error' | 'update' = 'latest';
let footerLatestTag: string | undefined;
let footerDownloadUrl: string | undefined;
let currentSubTab = defaultSubTab;
let analyzerOpenError: string | null = null;
let current: { language: Locale; theme: ThemeChoice } = {
  language: resolveLocale(),
  theme: 'system',
};
let downloads: DownloadsState = { active: [], history: [] };
let instagramAnalyzer: InstagramAnalyzerState = { currentViewerId: null, accounts: {} };

const savedSortAsc = (() => {
  try {
    const r = localStorage.getItem(SORT_KEY);
    return r === null ? null : r === 'true';
  } catch {
    return null;
  }
})();
let sortAscending = savedSortAsc ?? false;

/* ── Init ────────────────────────────────────────────────────────── */
setLocale(current.language);
applyStaticTranslations();
applyTheme(current.theme);
syncControlValues();
renderInstagramAnalyzer(instagramAnalyzer);
renderDownloads(downloads);
sortDownloadsBtn?.classList.toggle('rotated', sortAscending);

void initializePopup();

const savedSubTab = (() => {
  try {
    return localStorage.getItem(SUBTAB_KEY);
  } catch {
    return null;
  }
})();
selectSubTab(savedSubTab ?? defaultSubTab, false);

// Render footer immediately then check updates
renderFooter('latest');
void checkForUpdates();

/* ── Event listeners ─────────────────────────────────────────────── */
subTabs.forEach((tab) => {
  tab.addEventListener('click', () => selectSubTab(tab.dataset['subtab'] ?? defaultSubTab, true));
});

languageSelect?.addEventListener('change', async () => {
  const value = languageSelect.value as Locale;
  current.language = value;
  setLocale(value);
  await setLanguage(value);
  applyStaticTranslations();
  renderDownloads(downloads);
});

themeSelect?.addEventListener('change', async () => {
  const value = themeSelect.value as ThemeChoice;
  current.theme = value;
  await setTheme(value);
  applyTheme(value);
});

sortDownloadsBtn?.addEventListener('click', () => {
  sortAscending = !sortAscending;
  try {
    localStorage.setItem(SORT_KEY, String(sortAscending));
  } catch {
    /* noop */
  }
  sortDownloadsBtn?.classList.toggle('rotated', sortAscending);
  renderDownloads(downloads);
});

clearHistoryBtn?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.CLEAR_DOWNLOAD_HISTORY });
});

bugBtn?.addEventListener('click', () => {
  try {
    chrome.tabs?.create?.({ url: BUG_REPORT_URL });
  } catch {
    window.open(BUG_REPORT_URL, '_blank', 'noopener,noreferrer');
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes['language']) {
    current.language = changes['language'].newValue as Locale;
    setLocale(current.language);
    syncControlValues();
    applyStaticTranslations();
    renderDownloads(downloads);
  }
  if (changes['theme']) {
    current.theme = changes['theme'].newValue as ThemeChoice;
    syncControlValues();
    applyTheme(current.theme);
  }
});

onDownloadsChanged((next) => {
  const previous = downloads;
  downloads = next;
  maybeShowActiveDownloads(previous, next);
  renderDownloads(downloads);
});
onInstagramAnalyzerChanged((next) => {
  instagramAnalyzer = next;
  renderInstagramAnalyzer(instagramAnalyzer);
});

/* ── Popup init ──────────────────────────────────────────────────── */
async function initializePopup(): Promise<void> {
  try {
    const settings = await getSettings();
    const resolvedLanguage = (settings.language ?? resolveLocale()) as Locale;
    if (!settings.language) await setLanguage(resolvedLanguage);
    current = { language: resolvedLanguage, theme: (settings.theme ?? 'system') as ThemeChoice };
    setLocale(current.language);
    [downloads, instagramAnalyzer] = await Promise.all([
      getDownloadsState(),
      getInstagramAnalyzerState(),
    ]);
    maybeShowActiveDownloads(null, downloads);
    initError = null;
  } catch (error) {
    console.error('Popup initialization failed', error);
    initError = error instanceof Error ? error : new Error(String(error));
  } finally {
    isInitializing = false;
    syncControlValues();
    applyStaticTranslations();
    applyTheme(current.theme);
    renderInstagramAnalyzer(instagramAnalyzer);
    renderDownloads(downloads);
    sortDownloadsBtn?.classList.toggle('rotated', sortAscending);
  }
}

function retryInitialize(): void {
  isInitializing = true;
  initError = null;
  renderInstagramAnalyzer(instagramAnalyzer);
  renderDownloads(downloads);
  void initializePopup();
}

function syncControlValues(): void {
  if (languageSelect && languageSelect.value !== current.language) {
    languageSelect.value = current.language;
  }
  if (themeSelect && themeSelect.value !== current.theme) {
    themeSelect.value = current.theme;
  }
}

/* ── Sub-tab switching ───────────────────────────────────────────── */
function selectSubTab(name: string, persist = false): void {
  const tabName = ['active', 'history'].includes(name) ? name : defaultSubTab;
  currentSubTab = tabName;
  subTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset['subtab'] === tabName));
  subTabViews.forEach((view) =>
    view.classList.toggle('active', view.dataset['subtab'] === tabName),
  );
  if (persist) {
    try {
      localStorage.setItem(SUBTAB_KEY, tabName);
    } catch {
      /* noop */
    }
  }
}

function maybeShowActiveDownloads(previous: DownloadsState | null, next: DownloadsState): void {
  const nextActive = next?.active ?? [];
  if (!nextActive.length) return;

  const prevActiveIds = new Set((previous?.active ?? []).map((job) => job.id));
  const hasNewActiveJob = previous === null || nextActive.some((job) => !prevActiveIds.has(job.id));
  if (!hasNewActiveJob) return;
  if (currentSubTab === 'active') return;

  selectSubTab('active', true);
}

/* ── Render downloads ────────────────────────────────────────────── */
function renderDownloads(state: DownloadsState): void {
  const sortedActive = sortJobsByDate(state.active ?? [], sortAscending);
  const sortedHistory = sortJobsByDate(state.history ?? [], sortAscending);
  const allIds = new Set([...sortedActive, ...sortedHistory].map((i) => i.id));
  if (expandedJobId && !allIds.has(expandedJobId)) expandedJobId = null;

  updateSubTabSummary(sortedActive.length, sortedHistory.length);
  updateToolbarState(sortedActive.length, sortedHistory.length);
  renderDownloadList(downloadActiveEl, sortedActive, { allowCancel: true, kind: 'active' });
  renderDownloadList(downloadHistoryEl, sortedHistory, { allowCancel: false, kind: 'history' });
}

function renderInstagramAnalyzer(state: InstagramAnalyzerState): void {
  if (!instagramAnalyzerEl) return;
  instagramAnalyzerEl.innerHTML = '';

  if (initError) {
    instagramAnalyzerEl.appendChild(
      createStateCard({
        variant: 'error',
        icon: '!',
        title: t('popupLoadErrorTitle'),
        body: t('popupLoadErrorBody'),
        actionLabel: t('tryAgain'),
        onAction: retryInitialize,
      }),
    );
    return;
  }

  if (isInitializing) {
    instagramAnalyzerEl.appendChild(createSkeletonCard());
    return;
  }

  const vm = createInstagramAnalyzerViewModel({
    state,
    localeCode: getLocale(),
    t,
  });
  const card = el('section', 'analyzer-card');
  if (vm.selectedViewerId) {
    card.dataset['viewerId'] = vm.selectedViewerId;
  }

  const header = el('div', 'analyzer-header');
  const titleGroup = el('div', 'analyzer-title-group');
  titleGroup.appendChild(el('p', 'analyzer-title', t('analyzerTitle')));
  titleGroup.appendChild(el('p', 'analyzer-account', `${vm.accountLabel}: ${vm.accountValue}`));

  const badge = el('span', `analyzer-badge is-${vm.badge.tone}`, vm.badge.label);
  header.appendChild(titleGroup);
  header.appendChild(badge);

  const body = el('p', 'analyzer-copy', vm.body);
  const meta = el('div', 'analyzer-meta');
  meta.appendChild(el('span', '', vm.lastScanLabel));

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(meta);

  if (analyzerOpenError) {
    const errorEl = el('p', 'analyzer-copy');
    errorEl.textContent = analyzerOpenError;
    errorEl.style.color = 'var(--c-danger, #ff6b6b)';
    card.appendChild(errorEl);
  }

  if (vm.metrics.length) {
    const metrics = el('div', 'analyzer-metrics');
    vm.metrics.forEach((metric) => {
      const metricCard = el('div', 'analyzer-metric');
      metricCard.appendChild(el('span', 'analyzer-metric-label', metric.label));
      metricCard.appendChild(el('span', 'analyzer-metric-value', metric.value));
      metrics.appendChild(metricCard);
    });
    card.appendChild(metrics);
  }

  const actions = el('div', 'analyzer-actions');
  const openBtn = el('button', 'analyzer-action', t('analyzerOpenInstagram')) as HTMLButtonElement;
  openBtn.type = 'button';
  openBtn.title = t('analyzerOpenInstagramTitle');
  openBtn.setAttribute('aria-label', t('analyzerOpenInstagramTitle'));
  openBtn.addEventListener('click', async () => {
    analyzerOpenError = null;
    renderInstagramAnalyzer(instagramAnalyzer);
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.IG_ANALYZER_OPEN,
        fallbackUrl: vm.openUrl,
      });
      if (response?.success) {
        analyzerOpenError = null;
        window.close();
        return;
      }
      analyzerOpenError =
        typeof response?.error === 'string' ? response.error : t('analyzerErrorBody');
      renderInstagramAnalyzer(instagramAnalyzer);
      return;
    } catch (error) {
      console.warn('AIO: failed to open Instagram analyzer', error);
      analyzerOpenError = error instanceof Error ? error.message : t('analyzerErrorBody');
      renderInstagramAnalyzer(instagramAnalyzer);
      return;
    }
  });
  actions.appendChild(openBtn);
  card.appendChild(actions);

  instagramAnalyzerEl.appendChild(card);
}

interface RenderListOptions {
  allowCancel: boolean;
  kind: 'active' | 'history';
}

function renderDownloadList(
  rootEl: HTMLElement | null,
  items: DownloadJob[],
  { allowCancel, kind }: RenderListOptions,
): void {
  if (!rootEl) return;
  rootEl.innerHTML = '';

  if (initError) {
    rootEl.appendChild(
      createStateCard({
        variant: 'error',
        icon: '!',
        title: t('popupLoadErrorTitle'),
        body: t('popupLoadErrorBody'),
        actionLabel: t('tryAgain'),
        onAction: retryInitialize,
      }),
    );
    return;
  }

  if (isInitializing) {
    rootEl.appendChild(createSkeletonCard());
    return;
  }

  if (!items.length) {
    const emptyTitleKey = kind === 'active' ? 'emptyActiveTitle' : 'emptyHistoryTitle';
    const emptyBodyKey = kind === 'active' ? 'emptyActiveBody' : 'emptyHistoryBody';
    rootEl.appendChild(
      createStateCard({
        variant: 'empty',
        icon: kind === 'active' ? '↓' : '⏱',
        title: t(emptyTitleKey),
        body: t(emptyBodyKey),
      }),
    );
    return;
  }

  items.forEach((job) => rootEl.appendChild(createDownloadCard(job, allowCancel)));
}

/* ── Download card — dense single-row layout ─────────────────────── */
function createDownloadCard(job: DownloadJob, allowCancel: boolean): HTMLElement {
  const vm = createDownloadViewModel(job, { expandedJobId, localeCode: getLocale(), t });
  const card = el('article', 'download-card');
  card.dataset['expanded'] = vm.expanded ? 'true' : 'false';
  card.dataset['status'] = job.status ?? 'preparing';

  // ── Row: [status-dot] [title + progress] [pill] [action?] [chevron]
  const row = el('div', 'download-row');
  row.tabIndex = 0;

  // Status dot
  const dot = el('span', `status-dot ${vm.statusInfo.tone}`);
  dot.title = vm.statusInfo.label;

  // Center block: title + inline progress
  const center = el('div', 'row-center');
  const title = el('span', 'row-title', vm.displayName);
  title.title = vm.displayName;
  center.appendChild(title);

  // Inline progress for active downloads
  if (job.status === 'downloading' || job.status === 'preparing') {
    const prog = el('div', 'row-progress');
    const bar = document.createElement('span');
    bar.style.width = `${vm.progress}%`;
    prog.appendChild(bar);
    center.appendChild(prog);
  } else if (job.status === 'failed' && vm.displayError) {
    const errSpan = el('span', 'row-error', vm.displayError);
    center.appendChild(errSpan);
  }

  // Pill (MP4/MP3/IMG etc)
  const pill = el('span', `pill ${vm.pill.className}`, vm.pill.label);

  // Action button
  const actions = el('div', 'row-actions');
  if (allowCancel && (job.status === 'preparing' || job.status === 'downloading')) {
    actions.appendChild(
      createActionButton({
        label: t('cancel'),
        onClick: async () => {
          await chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.CANCEL_DOWNLOAD,
            jobId: job.id,
            downloadId: job.downloadId,
          });
        },
      }),
    );
  } else if (!allowCancel && canRetryJob(job)) {
    actions.appendChild(
      createActionButton({
        label: t('retry'),
        onClick: async () => {
          await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.RETRY_DOWNLOAD, jobId: job.id });
        },
      }),
    );
  }

  // Chevron
  const chevron = el('button', 'chevron', '▾') as HTMLButtonElement;
  chevron.type = 'button';
  chevron.setAttribute('aria-label', t('toggleDetails'));
  chevron.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExpandedJob(job.id);
  });

  row.appendChild(dot);
  row.appendChild(center);
  row.appendChild(pill);
  row.appendChild(actions);
  row.appendChild(chevron);

  row.addEventListener('click', () => toggleExpandedJob(job.id));
  row.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggleExpandedJob(job.id);
  });

  // ── Expanded details
  const details = el('div', 'download-details');

  // Progress bar in details
  details.appendChild(createProgressBlock(vm.statusInfo, vm.progress, vm.progressLabel));

  const grid = el('div', 'detail-grid');
  grid.appendChild(createDetailItem(t('dateLabel'), vm.dateText || '-'));
  grid.appendChild(createDetailItem(t('typeLabel'), job.type || '-'));
  grid.appendChild(createDetailItem(t('statusLabel'), job.status || '-', { wide: true }));
  grid.appendChild(createDetailItem(t('fileNameLabel'), job.fileName || '-', { wide: true }));
  grid.appendChild(createDetailItem(t('sourceLabel'), job.sourceUrl || '-', { wide: true }));
  if (vm.displayError) {
    grid.appendChild(
      createDetailItem(t('errorLabel'), vm.displayError, { wide: true, error: true }),
    );
  }
  details.appendChild(grid);

  card.appendChild(row);
  card.appendChild(details);
  return card;
}

/* ── Helper builders ─────────────────────────────────────────────── */
function createProgressBlock(
  statusInfo: StatusInfo,
  progress: number,
  progressLabel: string,
): HTMLElement {
  const block = el('div', 'progress-block');
  const meta = el('div', 'progress-meta');
  meta.appendChild(el('span', '', statusInfo.label));
  meta.appendChild(el('span', '', progressLabel));
  const prog = el('div', 'progress');
  const bar = document.createElement('span');
  bar.style.width = `${progress}%`;
  prog.appendChild(bar);
  block.appendChild(meta);
  block.appendChild(prog);
  return block;
}

interface DetailItemOptions {
  wide?: boolean;
  error?: boolean;
}
function createDetailItem(
  label: string,
  value: string,
  { wide = false, error = false }: DetailItemOptions = {},
): HTMLElement {
  const item = el('div', `detail-item${wide ? ' is-wide' : ''}`);
  item.appendChild(el('span', 'detail-k', label));
  item.appendChild(el('span', `detail-v${error ? ' is-error' : ''}`, value));
  return item;
}

interface ActionButtonParams {
  label: string;
  onClick: () => Promise<void>;
}
function createActionButton({ label, onClick }: ActionButtonParams): HTMLButtonElement {
  const button = el('button', 'link-btn', label) as HTMLButtonElement;
  button.type = 'button';
  button.addEventListener('click', async (e) => {
    e.stopPropagation();
    await onClick();
  });
  return button;
}

interface StateCardParams {
  variant: string;
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}
function createStateCard({
  variant,
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: StateCardParams): HTMLElement {
  const card = el('section', `state-card is-${variant}`);
  card.appendChild(el('span', 'state-icon', icon));
  card.appendChild(el('p', 'state-title', title));
  card.appendChild(el('p', 'state-copy', body));
  if (actionLabel && typeof onAction === 'function') {
    const btn = el('button', 'state-action', actionLabel) as HTMLButtonElement;
    btn.type = 'button';
    btn.addEventListener('click', onAction);
    card.appendChild(btn);
  }
  return card;
}

function createSkeletonCard(): HTMLElement {
  const card = el('div', 'skeleton-card');
  const top = el('div', 'skeleton-top');
  top.appendChild(el('div', 'skeleton-icon'));
  const stack = el('div', 'skeleton-stack');
  stack.appendChild(el('div', 'skeleton-line short'));
  stack.appendChild(el('div', 'skeleton-line long'));
  top.appendChild(stack);
  top.appendChild(el('div', 'skeleton-pill'));
  card.appendChild(top);
  return card;
}

function canRetryJob(job: DownloadJob): boolean {
  const retryable: string[] = [
    MESSAGE_TYPES.YT_AUDIO_DOWNLOAD,
    MESSAGE_TYPES.YT_VIDEO_DOWNLOAD,
    MESSAGE_TYPES.IG_AUDIO_DOWNLOAD,
    MESSAGE_TYPES.IG_VIDEO_DOWNLOAD,
    MESSAGE_TYPES.IG_IMAGE_DOWNLOAD,
    MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD,
    MESSAGE_TYPES.X_AUDIO_DOWNLOAD,
    MESSAGE_TYPES.X_VIDEO_DOWNLOAD,
    MESSAGE_TYPES.X_IMAGE_DOWNLOAD,
    MESSAGE_TYPES.X_IMAGE_ZIP_DOWNLOAD,
  ];
  return retryable.includes(job?.type);
}

function el(tagName: string, className: string, textContent?: string): HTMLElement {
  const e = document.createElement(tagName);
  if (className) e.className = className;
  if (typeof textContent === 'string') e.textContent = textContent;
  return e;
}

function toggleExpandedJob(jobId: string): void {
  expandedJobId = expandedJobId === jobId ? null : jobId;
  renderDownloads(downloads);
}

/* ── Sub-tab summary + toolbar ───────────────────────────────────── */
function updateSubTabSummary(activeCount: number, historyCount: number): void {
  if (activeCountEl) activeCountEl.textContent = String(activeCount);
  if (historyCountEl) historyCountEl.textContent = String(historyCount);
  const activeLabel = t('subtabActive');
  const historyLabel = t('subtabHistory');
  const activeTab = subTabs.find((tab) => tab.dataset['subtab'] === 'active');
  const historyTab = subTabs.find((tab) => tab.dataset['subtab'] === 'history');
  if (activeTab) activeTab.setAttribute('aria-label', `${activeLabel}: ${activeCount}`);
  if (historyTab) historyTab.setAttribute('aria-label', `${historyLabel}: ${historyCount}`);
}

function updateToolbarState(activeCount: number, historyCount: number): void {
  const totalCount = activeCount + historyCount;
  if (clearHistoryBtn) {
    clearHistoryBtn.disabled = isInitializing || Boolean(initError) || historyCount === 0;
  }
  if (sortDownloadsBtn) {
    sortDownloadsBtn.disabled = isInitializing || Boolean(initError) || totalCount < 2;
  }
}

/* ── Static translations ─────────────────────────────────────────── */
function applyStaticTranslations(): void {
  document.documentElement.lang = getLocale();
  if (bugBtn) {
    bugBtn.title = t('bugTitle');
    bugBtn.setAttribute('aria-label', t('bugTitle'));
  }

  const activeLabelEl = subTabLabelEls['active'];
  const historyLabelEl = subTabLabelEls['history'];
  if (activeLabelEl) activeLabelEl.textContent = t('subtabActive');
  if (historyLabelEl) historyLabelEl.textContent = t('subtabHistory');

  if (clearHistoryBtn) {
    clearHistoryBtn.title = t('clearHistory');
    clearHistoryBtn.setAttribute('aria-label', t('clearHistory'));
  }
  if (sortDownloadsBtn) {
    sortDownloadsBtn.title = t('sort');
    sortDownloadsBtn.setAttribute('aria-label', t('sort'));
  }

  if (languageSelect) {
    languageSelect.title = t('language');
    languageSelect.setAttribute('aria-label', t('language'));
  }
  if (themeSelect) {
    themeSelect.title = t('theme');
    themeSelect.setAttribute('aria-label', t('theme'));
  }

  // Footer version
  if (footerVersionEl) {
    footerVersionEl.textContent = t('footerVersion').replace('{version}', getCurrentVersion());
  }

  renderInstagramAnalyzer(instagramAnalyzer);
  renderFooter(footerState, footerLatestTag, footerDownloadUrl);
}

/* ── Theme ───────────────────────────────────────────────────────── */
function applyTheme(themeValue: ThemeChoice | string): void {
  const chosen = (themeValue || current.theme || 'system') as ThemeChoice;
  const effective: ResolvedTheme = resolveTheme(chosen, prefersDark);
  document.body.dataset['theme'] = effective;
  document.documentElement.style.colorScheme = effective;
  systemThemeHandler = syncSystemThemeListener({
    chosenTheme: chosen,
    mediaQueryList: prefersDark,
    currentHandler: systemThemeHandler,
    onSystemChange: (nextTheme: ResolvedTheme) => {
      document.body.dataset['theme'] = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
    },
  });
}

/* ── Footer: version + update checker ────────────────────────────── */
interface UpdateCacheEntry {
  checkedAt: number;
  latestTag: string | null;
  downloadUrl: string | null;
  error: boolean;
}

function getCurrentVersion(): string {
  try {
    return chrome.runtime.getManifest().version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

function getCachedUpdateCheck(): UpdateCacheEntry | null {
  try {
    const raw = localStorage.getItem(UPDATE_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as UpdateCacheEntry;
    return typeof entry.checkedAt === 'number' ? entry : null;
  } catch {
    return null;
  }
}

function setCachedUpdateCheck(entry: UpdateCacheEntry): void {
  try {
    localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* noop */
  }
}

type WizardStep = 1 | 2 | 3;

function getInstallPath(): string | null {
  try {
    return localStorage.getItem(INSTALL_PATH_KEY);
  } catch {
    return null;
  }
}

function setInstallPath(path: string): void {
  try {
    localStorage.setItem(INSTALL_PATH_KEY, path);
  } catch {
    /* noop */
  }
}

function getWizardStep(): WizardStep {
  try {
    const raw = localStorage.getItem(WIZARD_STEP_KEY);
    const n = raw ? Number(raw) : 1;
    return (n >= 1 && n <= 3 ? n : 1) as WizardStep;
  } catch {
    return 1;
  }
}

function setWizardStep(step: WizardStep): void {
  try {
    localStorage.setItem(WIZARD_STEP_KEY, String(step));
  } catch {
    /* noop */
  }
}

function clearWizardStep(): void {
  try {
    localStorage.removeItem(WIZARD_STEP_KEY);
  } catch {
    /* noop */
  }
}

function createCheckNowButton(): HTMLButtonElement {
  const checkBtn = el('button', 'update-link', t('updateCheckNow')) as HTMLButtonElement;
  checkBtn.type = 'button';
  checkBtn.title = t('updateCheckNowTitle');
  checkBtn.setAttribute('aria-label', t('updateCheckNowTitle'));
  checkBtn.addEventListener('click', () => {
    void checkForUpdates({ force: true });
  });
  return checkBtn;
}

function createReloadButton(): HTMLButtonElement {
  const reloadBtn = el('button', 'update-link', t('updateReload')) as HTMLButtonElement;
  reloadBtn.type = 'button';
  reloadBtn.title = t('updateReloadTitle');
  reloadBtn.setAttribute('aria-label', t('updateReloadTitle'));
  reloadBtn.addEventListener('click', () => {
    try {
      chrome.runtime.reload();
    } catch (err) {
      console.warn('AIO: reload failed', err);
    }
  });
  return reloadBtn;
}

function renderFooter(
  state: 'loading' | 'latest' | 'error' | 'update',
  latestTag?: string,
  downloadUrl?: string,
): void {
  footerState = state;
  footerLatestTag = latestTag;
  footerDownloadUrl = downloadUrl;

  const version = getCurrentVersion();
  if (footerVersionEl)
    footerVersionEl.textContent = t('footerVersion').replace('{version}', version);
  if (!footerUpdateEl) return;
  footerUpdateEl.innerHTML = '';

  if (state === 'loading') {
    footerUpdateEl.appendChild(el('span', 'footer-status', t('updateChecking')));
    appendDevReloadButton(footerUpdateEl);
    return;
  }
  if (state === 'error') {
    footerUpdateEl.appendChild(el('span', 'footer-error', t('updateError')));
    footerUpdateEl.appendChild(createCheckNowButton());
    appendDevReloadButton(footerUpdateEl);
    return;
  }
  if (state === 'latest') {
    footerUpdateEl.appendChild(createCheckNowButton());
    appendDevReloadButton(footerUpdateEl);
    return;
  }

  if (state === 'update' && latestTag) {
    footerUpdateEl.appendChild(
      el(
        'span',
        'update-badge',
        t('updateAvailable').replace('{version}', latestTag.replace(/^v/, '')),
      ),
    );

    showUpdateWizard(latestTag, downloadUrl);
  }
}

function appendDevReloadButton(root: HTMLElement): void {
  if (!IS_DEV_BUILD) {
    return;
  }

  const container = el('div', 'footer-update-secondary');
  container.appendChild(createReloadButton());
  root.appendChild(container);
}

/* ── Update wizard (renders inside app-body) ─────────────────────── */
let savedBodyContent: DocumentFragment | null = null;

let editingInstallPath = false;

function showUpdateWizard(latestTag: string, downloadUrl?: string): void {
  if (!appBodyEl) return;

  // Save current body content
  if (!savedBodyContent) {
    savedBodyContent = document.createDocumentFragment();
    while (appBodyEl.firstChild) {
      savedBodyContent.appendChild(appBodyEl.firstChild);
    }
  } else {
    appBodyEl.innerHTML = '';
  }

  const wizard = el('div', 'update-wizard');

  // Version header
  const header = el('div', 'wizard-header');
  header.appendChild(
    el(
      'h2',
      'wizard-title',
      t('updateAvailable').replace('{version}', latestTag.replace(/^v/, '')),
    ),
  );
  wizard.appendChild(header);

  // Step indicators
  const currentStep = getWizardStep();
  const stepsRow = el('div', 'wizard-steps');
  const stepLabels = [t('updateWizardStep1'), t('updateWizardStep2'), t('updateWizardStep3')];
  for (let i = 1; i <= 3; i++) {
    const cls = [
      'wizard-step-dot',
      i === currentStep ? 'active' : '',
      i < currentStep ? 'done' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const dot = el('span', cls, String(i));
    dot.title = stepLabels[i - 1] ?? '';
    stepsRow.appendChild(dot);
    if (i < 3) {
      const connector = el('span', `wizard-connector${i < currentStep ? ' done' : ''}`);
      stepsRow.appendChild(connector);
    }
  }
  wizard.appendChild(stepsRow);

  // Step label
  wizard.appendChild(el('p', 'wizard-step-label', stepLabels[currentStep - 1] ?? ''));

  // Step content card
  const card = el('div', 'wizard-card');

  if (currentStep === 1) {
    card.appendChild(el('p', 'wizard-card-desc', t('updateWizardStep1Desc')));
    if (downloadUrl) {
      const dlBtn = el('button', 'wizard-btn wizard-btn-primary', t('updateDownload'));
      (dlBtn as HTMLButtonElement).type = 'button';
      const capturedTag = latestTag;
      const capturedUrl = downloadUrl;
      dlBtn.addEventListener('click', () => {
        try {
          chrome.downloads?.download?.({ url: capturedUrl, saveAs: true });
        } catch {
          window.open(capturedUrl, '_blank', 'noopener,noreferrer');
        }
        setWizardStep(2);
        showUpdateWizard(capturedTag, capturedUrl);
        renderFooter('update', capturedTag, capturedUrl);
      });
      card.appendChild(dlBtn);
    }
  } else if (currentStep === 2) {
    card.appendChild(el('p', 'wizard-card-desc', t('updateWizardStep2Desc')));

    const savedPath = getInstallPath();
    if (savedPath && !editingInstallPath) {
      // Saved path: show it with copy + change actions
      const pathBlock = el('div', 'wizard-path-block');
      pathBlock.appendChild(el('span', 'wizard-path-label', t('installPathLabel')));
      pathBlock.appendChild(el('code', 'wizard-path', savedPath));

      const pathActions = el('div', 'wizard-path-actions');
      const copyBtn = el('button', 'wizard-btn-inline', t('installPathCopy')) as HTMLButtonElement;
      copyBtn.type = 'button';
      copyBtn.addEventListener('click', () => {
        void navigator.clipboard.writeText(savedPath).then(() => {
          copyBtn.textContent = t('installPathCopied');
          window.setTimeout(() => {
            copyBtn.textContent = t('installPathCopy');
          }, 1500);
        });
      });
      const changeBtn = el(
        'button',
        'wizard-btn-inline',
        t('installPathChange'),
      ) as HTMLButtonElement;
      changeBtn.type = 'button';
      changeBtn.addEventListener('click', () => {
        editingInstallPath = true;
        showUpdateWizard(latestTag, downloadUrl);
      });
      pathActions.appendChild(copyBtn);
      pathActions.appendChild(changeBtn);
      pathBlock.appendChild(pathActions);
      card.appendChild(pathBlock);
    } else {
      // No saved path or editing: show input pre-filled with current value
      let extId = '';
      try {
        extId = chrome.runtime.id || '';
      } catch {
        /* noop */
      }
      if (extId) {
        card.appendChild(el('p', 'wizard-ext-id', t('installPathExtId').replace('{id}', extId)));
      }

      const hintRow = el('p', 'wizard-card-hint');
      const hintParts = t('installPathHint').split('{link}');
      hintRow.appendChild(document.createTextNode(hintParts[0] ?? ''));
      const extLink = el('button', 'wizard-btn-inline', 'chrome://extensions') as HTMLButtonElement;
      extLink.type = 'button';
      extLink.addEventListener('click', () => {
        try {
          chrome.tabs?.create?.({ url: 'chrome://extensions' });
        } catch {
          /* noop */
        }
      });
      hintRow.appendChild(extLink);
      if (hintParts[1]) hintRow.appendChild(document.createTextNode(hintParts[1]));
      card.appendChild(hintRow);

      const pathRow = el('div', 'wizard-path-row');
      const pathInput = el('input', 'wizard-path-input') as HTMLInputElement;
      pathInput.type = 'text';
      pathInput.placeholder = t('installPathPlaceholder');
      if (savedPath) pathInput.value = savedPath;
      const saveBtn = el(
        'button',
        'wizard-btn wizard-btn-secondary',
        t('installPathSave'),
      ) as HTMLButtonElement;
      saveBtn.type = 'button';
      saveBtn.addEventListener('click', () => {
        if (pathInput.value.trim()) {
          setInstallPath(pathInput.value.trim());
          editingInstallPath = false;
          showUpdateWizard(latestTag, downloadUrl);
        }
      });
      pathRow.appendChild(pathInput);
      pathRow.appendChild(saveBtn);
      card.appendChild(pathRow);
    }

    const nextBtn = el(
      'button',
      'wizard-btn wizard-btn-primary',
      t('updateWizardNext'),
    ) as HTMLButtonElement;
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', () => {
      setWizardStep(3);
      showUpdateWizard(latestTag, downloadUrl);
      renderFooter('update', latestTag, downloadUrl);
    });
    card.appendChild(nextBtn);
  } else if (currentStep === 3) {
    card.appendChild(el('p', 'wizard-card-desc', t('updateWizardStep3Desc')));
    const reloadBtn = el(
      'button',
      'wizard-btn wizard-btn-primary',
      t('updateReload'),
    ) as HTMLButtonElement;
    reloadBtn.type = 'button';
    reloadBtn.addEventListener('click', () => {
      try {
        chrome.runtime.reload();
      } catch (err) {
        console.warn('AIO: reload failed', err);
      }
    });
    card.appendChild(reloadBtn);
  }

  // Dismiss link — inside card, at the bottom
  const dismissBtn = el('button', 'wizard-dismiss', t('updateWizardDismiss')) as HTMLButtonElement;
  dismissBtn.type = 'button';
  dismissBtn.addEventListener('click', () => {
    clearWizardStep();
    hideUpdateWizard();
    renderFooter('latest');
  });
  card.appendChild(dismissBtn);

  wizard.appendChild(card);
  appBodyEl.appendChild(wizard);
}

function hideUpdateWizard(): void {
  if (!appBodyEl || !savedBodyContent) return;
  appBodyEl.innerHTML = '';
  appBodyEl.appendChild(savedBodyContent);
  savedBodyContent = null;
}

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}
interface GitHubRelease {
  tag_name: string;
  assets: GitHubReleaseAsset[];
}

async function fetchLatestRelease(): Promise<{ tag: string; downloadUrl: string | null }> {
  const response = await fetch(GITHUB_RELEASES_API, {
    headers: { Accept: 'application/vnd.github.v3+json' },
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}`);
  const data = (await response.json()) as GitHubRelease;
  const tag = data.tag_name || '';
  const asset = data.assets?.find((a) => a.name.includes('unpacked') && a.name.endsWith('.zip'));
  return { tag, downloadUrl: asset?.browser_download_url ?? null };
}

async function checkForUpdates({ force = false }: { force?: boolean } = {}): Promise<void> {
  const version = getCurrentVersion();
  const startedAt = Date.now();
  renderFooter('loading');

  const waitForMinimumLoading = async () => {
    const elapsed = Date.now() - startedAt;
    const remaining = MIN_UPDATE_LOADING_MS - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remaining));
    }
  };

  const cached = getCachedUpdateCheck();
  const now = Date.now();
  if (!force && cached && now - cached.checkedAt < UPDATE_CHECK_INTERVAL_MS && !cached.error) {
    await waitForMinimumLoading();
    if (cached.latestTag && compareVersions(cached.latestTag, version) > 0) {
      renderFooter('update', cached.latestTag, cached.downloadUrl ?? undefined);
    } else {
      renderFooter('latest');
    }
    return;
  }

  try {
    const { tag, downloadUrl } = await fetchLatestRelease();
    await waitForMinimumLoading();
    setCachedUpdateCheck({ checkedAt: now, latestTag: tag, downloadUrl, error: false });
    if (tag && compareVersions(tag, version) > 0) {
      renderFooter('update', tag, downloadUrl ?? undefined);
    } else {
      renderFooter('latest');
    }
  } catch (err) {
    console.warn('AIO: update check failed', err);
    await waitForMinimumLoading();
    setCachedUpdateCheck({ checkedAt: now, latestTag: null, downloadUrl: null, error: true });
    renderFooter('error');
  }
}
