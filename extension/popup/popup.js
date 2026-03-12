import { getSettings, getDownloadsState, onDownloadsChanged, setLanguage, setTheme } from '../shared/storage.js';
import { MESSAGE_TYPES } from '../shared/contracts/message-types.js';
import { t, getLocale, setLocale, resolveLocale } from '../shared/i18n.js';
import { createDownloadViewModel, sortJobsByDate } from './model/download-view-model.js';
import { resolveTheme, syncSystemThemeListener } from './model/theme-model.js';

const bugBtn = document.getElementById('bug-btn');
const popupSubtitleEl = document.getElementById('popup-subtitle');
const languageLabel = document.getElementById('language-label');
const themeLabel = document.getElementById('theme-label');
const languageSelect = document.getElementById('language-select');
const themeSelect = document.getElementById('theme-select');
const downloadActiveEl = document.getElementById('download-active');
const downloadHistoryEl = document.getElementById('download-history');
const sortDownloadsBtn = document.getElementById('sort-downloads');
const clearHistoryBtn = document.getElementById('clear-history');
const activeCountEl = document.getElementById('active-count');
const historyCountEl = document.getElementById('history-count');

const subTabs = Array.from(document.querySelectorAll('.subtab'));
const subTabViews = Array.from(document.querySelectorAll('.download-group'));
const subTabLabelEls = {
  active: document.querySelector('[data-subtab-label="active"]'),
  history: document.querySelector('[data-subtab-label="history"]')
};

const SUBTAB_KEY = 'aioPopupDownloadsTab';
const defaultSubTab = 'active';
const SORT_KEY = 'aioPopupSortAsc';
const BUG_REPORT_URL = 'https://github.com/voyvodka/All-in-one-Extension/issues/new/choose';
const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

let systemThemeHandler = null;
let expandedJobId = null;
let isInitializing = true;
let initError = null;
let current = {
  language: resolveLocale(),
  theme: 'system'
};
let downloads = {
  active: [],
  history: []
};

const savedSortAsc = (() => {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    return raw === null ? null : raw === 'true';
  } catch {
    return null;
  }
})();

let sortAscending = savedSortAsc ?? false;

setLocale(current.language);
applyStaticTranslations();
hydrateLanguageSelect(current.language);
hydrateThemeSelect(current.theme);
applyTheme(current.theme);
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

selectSubTab(savedSubTab || defaultSubTab, false);

subTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    selectSubTab(tab.dataset.subtab, true);
  });
});

languageSelect?.addEventListener('change', async () => {
  const value = languageSelect.value;
  current.language = value;
  setLocale(value);
  await setLanguage(value);
  applyStaticTranslations();
  renderDownloads(downloads);
});

themeSelect?.addEventListener('change', async () => {
  const value = themeSelect.value;
  current.theme = value;
  await setTheme(value);
  applyTheme(value);
});

sortDownloadsBtn?.addEventListener('click', () => {
  sortAscending = !sortAscending;
  try {
    localStorage.setItem(SORT_KEY, String(sortAscending));
  } catch (err) {
    console.warn('Sort persist failed', err);
  }
  sortDownloadsBtn.classList.toggle('rotated', sortAscending);
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

  if (changes.language) {
    current.language = changes.language.newValue;
    setLocale(current.language);
    hydrateLanguageSelect(current.language);
    applyStaticTranslations();
    renderDownloads(downloads);
  }

  if (changes.theme) {
    current.theme = changes.theme.newValue;
    hydrateThemeSelect(current.theme);
    applyTheme(current.theme);
  }
});

onDownloadsChanged((next) => {
  downloads = next;
  renderDownloads(downloads);
});

async function initializePopup() {
  try {
    const settings = await getSettings();
    const resolvedLanguage = settings.language || resolveLocale();
    if (!settings.language) {
      await setLanguage(resolvedLanguage);
    }

    current = {
      ...settings,
      language: resolvedLanguage,
      theme: settings.theme || 'system'
    };

    setLocale(current.language);
    downloads = await getDownloadsState();
    initError = null;
  } catch (error) {
    console.error('Popup initialization failed', error);
    initError = error;
  } finally {
    isInitializing = false;
    applyStaticTranslations();
    hydrateLanguageSelect(current.language);
    hydrateThemeSelect(current.theme);
    applyTheme(current.theme);
    renderDownloads(downloads);
    sortDownloadsBtn?.classList.toggle('rotated', sortAscending);
  }
}

function retryInitialize() {
  isInitializing = true;
  initError = null;
  renderDownloads(downloads);
  void initializePopup();
}

function selectSubTab(name, persist = false) {
  const tabName = ['active', 'history'].includes(name) ? name : defaultSubTab;
  subTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.subtab === tabName));
  subTabViews.forEach((view) => view.classList.toggle('active', view.dataset.subtab === tabName));

  if (persist) {
    try {
      localStorage.setItem(SUBTAB_KEY, tabName);
    } catch (err) {
      console.warn('SubTab persist failed', err);
    }
  }
}

function renderDownloads(state) {
  const sortedActive = sortJobsByDate(state.active || [], sortAscending);
  const sortedHistory = sortJobsByDate(state.history || [], sortAscending);

  const allIds = new Set([...sortedActive, ...sortedHistory].map((item) => item.id));
  if (expandedJobId && !allIds.has(expandedJobId)) {
    expandedJobId = null;
  }

  updateSubTabSummary(sortedActive.length, sortedHistory.length);
  updateToolbarState(sortedActive.length, sortedHistory.length);

  renderDownloadList(downloadActiveEl, sortedActive, {
    allowCancel: true,
    kind: 'active'
  });

  renderDownloadList(downloadHistoryEl, sortedHistory, {
    allowCancel: false,
    kind: 'history'
  });
}

function renderDownloadList(rootEl, items, { allowCancel, kind }) {
  if (!rootEl) return;
  rootEl.innerHTML = '';

  if (initError) {
    rootEl.appendChild(createStateCard({
      variant: 'error',
      icon: '⚠️',
      title: t('popupLoadErrorTitle'),
      body: t('popupLoadErrorBody'),
      actionLabel: t('tryAgain'),
      onAction: retryInitialize
    }));
    return;
  }

  if (isInitializing) {
    rootEl.appendChild(createSkeletonCard());
    rootEl.appendChild(createSkeletonCard());
    rootEl.appendChild(createStateCard({
      variant: 'loading',
      icon: '⏳',
      title: t('loadingTitle'),
      body: t('loadingBody')
    }));
    return;
  }

  if (!items.length) {
    const emptyTitleKey = kind === 'active' ? 'emptyActiveTitle' : 'emptyHistoryTitle';
    const emptyBodyKey = kind === 'active' ? 'emptyActiveBody' : 'emptyHistoryBody';
    rootEl.appendChild(createStateCard({
      variant: 'empty',
      icon: kind === 'active' ? '⬇️' : '🕘',
      title: t(emptyTitleKey),
      body: t(emptyBodyKey)
    }));
    return;
  }

  items.forEach((job) => {
    rootEl.appendChild(createDownloadCard(job, allowCancel));
  });
}

function createDownloadCard(job, allowCancel) {
  const viewModel = createDownloadViewModel(job, {
    expandedJobId,
    localeCode: getLocale(),
    t
  });

  const card = createElement('article', 'download-card');
  card.dataset.expanded = viewModel.expanded ? 'true' : 'false';
  card.dataset.status = job.status || 'preparing';

  const header = createElement('div', 'download-row');
  header.title = job.title || job.fileName || '';
  header.setAttribute('role', 'button');
  header.tabIndex = 0;

  const main = createElement('div', 'download-main');
  const statusBadge = createElement('div', `status-badge ${viewModel.statusInfo.tone}`);
  statusBadge.appendChild(createElement('span', 'status-icon', viewModel.statusInfo.icon));

  const copy = createElement('div', 'download-copy');
  copy.appendChild(createElement('p', 'download-overline', viewModel.sourceLabel));

  const titleEl = createElement('p', 'download-title', viewModel.displayName);
  titleEl.title = viewModel.displayName;
  copy.appendChild(titleEl);
  copy.appendChild(createElement('p', 'download-meta', viewModel.statusSummary));

  main.appendChild(statusBadge);
  main.appendChild(copy);

  const side = createElement('div', 'download-side');
  side.appendChild(createElement('span', `pill ${viewModel.pill.className}`, viewModel.pill.label));

  const inlineActions = createElement('div', 'download-actions-inline');
  if (allowCancel && (job.status === 'preparing' || job.status === 'downloading')) {
    inlineActions.appendChild(createActionButton({
      label: t('cancel'),
      onClick: async () => {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.CANCEL_DOWNLOAD,
          jobId: job.id,
          downloadId: job.downloadId
        });
      }
    }));
  } else if (!allowCancel && canRetryJob(job)) {
    inlineActions.appendChild(createActionButton({
      label: t('retry'),
      onClick: async () => {
        await chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.RETRY_DOWNLOAD,
          jobId: job.id
        });
      }
    }));
  }

  const chevron = createElement('button', 'chevron', '▾');
  chevron.type = 'button';
  chevron.setAttribute('aria-label', t('toggleDetails'));
  chevron.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleExpandedJob(job.id);
  });
  inlineActions.appendChild(chevron);

  side.appendChild(inlineActions);
  header.appendChild(main);
  header.appendChild(side);
  header.addEventListener('click', () => {
    toggleExpandedJob(job.id);
  });
  header.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleExpandedJob(job.id);
  });

  const details = createElement('div', 'download-details');
  details.appendChild(createProgressBlock(viewModel));

  const detailGrid = createElement('div', 'detail-grid');
  detailGrid.appendChild(createDetailItem(t('dateLabel'), viewModel.dateText || '-'));
  detailGrid.appendChild(createDetailItem(t('typeLabel'), job.type || '-'));
  detailGrid.appendChild(createDetailItem(t('statusLabel'), job.status || '-', { wide: true }));
  detailGrid.appendChild(createDetailItem(t('fileNameLabel'), job.fileName || '-', { wide: true }));
  detailGrid.appendChild(createDetailItem(t('sourceLabel'), job.sourceUrl || '-', { wide: true }));

  if (viewModel.displayError) {
    detailGrid.appendChild(createDetailItem(t('errorLabel'), viewModel.displayError, {
      wide: true,
      error: true
    }));
  }

  details.appendChild(detailGrid);
  card.appendChild(header);
  card.appendChild(details);
  return card;
}

function createProgressBlock(viewModel) {
  const block = createElement('div', 'progress-block');
  const meta = createElement('div', 'progress-meta');
  meta.appendChild(createElement('span', '', viewModel.statusInfo.label));
  meta.appendChild(createElement('span', '', viewModel.progressLabel));

  const progress = createElement('div', 'progress');
  const bar = document.createElement('span');
  bar.style.width = `${viewModel.progress}%`;
  progress.appendChild(bar);

  block.appendChild(meta);
  block.appendChild(progress);
  return block;
}

function createDetailItem(label, value, { wide = false, error = false } = {}) {
  const item = createElement('div', `detail-item${wide ? ' is-wide' : ''}`);
  item.appendChild(createElement('span', 'detail-k', label));
  item.appendChild(createElement('span', `detail-v${error ? ' is-error' : ''}`, value));
  return item;
}

function createActionButton({ label, onClick }) {
  const button = createElement('button', 'link-btn', label);
  button.type = 'button';
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    await onClick();
  });
  return button;
}

function createStateCard({ variant, icon, title, body, actionLabel, onAction }) {
  const card = createElement('section', `state-card is-${variant}`);
  card.appendChild(createElement('span', 'state-icon', icon));
  card.appendChild(createElement('p', 'state-title', title));
  card.appendChild(createElement('p', 'state-copy', body));

  if (actionLabel && typeof onAction === 'function') {
    const actionButton = createElement('button', 'state-action', actionLabel);
    actionButton.type = 'button';
    actionButton.addEventListener('click', onAction);
    card.appendChild(actionButton);
  }

  return card;
}

function createSkeletonCard() {
  const card = createElement('div', 'skeleton-card');
  const top = createElement('div', 'skeleton-top');
  top.appendChild(createElement('div', 'skeleton-icon'));

  const stack = createElement('div', 'skeleton-stack');
  stack.appendChild(createElement('div', 'skeleton-line short'));
  stack.appendChild(createElement('div', 'skeleton-line long'));
  top.appendChild(stack);
  top.appendChild(createElement('div', 'skeleton-pill'));

  const bottom = createElement('div', 'skeleton-bottom');
  bottom.appendChild(createElement('div', 'skeleton-bar'));

  card.appendChild(top);
  card.appendChild(bottom);
  return card;
}

function canRetryJob(job) {
  return [
    MESSAGE_TYPES.YT_AUDIO_DOWNLOAD,
    MESSAGE_TYPES.YT_VIDEO_DOWNLOAD,
    MESSAGE_TYPES.IG_AUDIO_DOWNLOAD,
    MESSAGE_TYPES.IG_VIDEO_DOWNLOAD,
    MESSAGE_TYPES.IG_IMAGE_DOWNLOAD,
    MESSAGE_TYPES.X_AUDIO_DOWNLOAD,
    MESSAGE_TYPES.X_VIDEO_DOWNLOAD
  ].includes(job?.type);
}

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (typeof textContent === 'string') element.textContent = textContent;
  return element;
}

function toggleExpandedJob(jobId) {
  expandedJobId = expandedJobId === jobId ? null : jobId;
  renderDownloads(downloads);
}

function updateSubTabSummary(activeCount, historyCount) {
  if (activeCountEl) activeCountEl.textContent = String(activeCount);
  if (historyCountEl) historyCountEl.textContent = String(historyCount);

  const activeLabel = t('subtabActive');
  const historyLabel = t('subtabHistory');
  const activeTab = subTabs.find((tab) => tab.dataset.subtab === 'active');
  const historyTab = subTabs.find((tab) => tab.dataset.subtab === 'history');

  if (activeTab) activeTab.setAttribute('aria-label', `${activeLabel}: ${activeCount}`);
  if (historyTab) historyTab.setAttribute('aria-label', `${historyLabel}: ${historyCount}`);
}

function updateToolbarState(activeCount, historyCount) {
  const totalCount = activeCount + historyCount;
  if (clearHistoryBtn) {
    clearHistoryBtn.disabled = isInitializing || Boolean(initError) || historyCount === 0;
  }
  if (sortDownloadsBtn) {
    sortDownloadsBtn.disabled = isInitializing || Boolean(initError) || totalCount < 2;
  }
}

function applyStaticTranslations() {
  document.documentElement.lang = getLocale();

  if (popupSubtitleEl) popupSubtitleEl.textContent = t('popupSubtitle');
  if (languageLabel) languageLabel.textContent = t('language');
  if (themeLabel) themeLabel.textContent = t('theme');
  if (bugBtn) bugBtn.title = t('bugTitle');

  if (subTabLabelEls.active) subTabLabelEls.active.textContent = t('subtabActive');
  if (subTabLabelEls.history) subTabLabelEls.history.textContent = t('subtabHistory');

  if (clearHistoryBtn) {
    clearHistoryBtn.title = t('clearHistory');
    clearHistoryBtn.setAttribute('aria-label', t('clearHistory'));
  }

  if (sortDownloadsBtn) {
    sortDownloadsBtn.title = t('sort');
    sortDownloadsBtn.setAttribute('aria-label', t('sort'));
  }

  hydrateLanguageSelect(current.language);
  hydrateThemeSelect(current.theme);
}

function hydrateLanguageSelect(langValue) {
  if (!languageSelect) return;
  const effective = resolveLocale(langValue || current.language);
  languageSelect.value = effective;

  const optionTr = languageSelect.querySelector('option[value="tr"]');
  const optionEn = languageSelect.querySelector('option[value="en"]');
  if (optionTr) optionTr.textContent = t('languageTr');
  if (optionEn) optionEn.textContent = t('languageEn');
  languageSelect.title = t('language');
}

function hydrateThemeSelect(themeValue) {
  if (!themeSelect) return;
  const effective = themeValue || current.theme || 'system';
  themeSelect.value = effective;

  const optionSystem = themeSelect.querySelector('option[value="system"]');
  const optionLight = themeSelect.querySelector('option[value="light"]');
  const optionDark = themeSelect.querySelector('option[value="dark"]');
  if (optionSystem) optionSystem.textContent = t('themeSystem');
  if (optionLight) optionLight.textContent = t('themeLight');
  if (optionDark) optionDark.textContent = t('themeDark');
  themeSelect.title = t('theme');
}

function applyTheme(themeValue) {
  const chosen = themeValue || current.theme || 'system';
  const effective = resolveTheme(chosen, prefersDark);
  document.body.dataset.theme = effective;
  document.documentElement.style.colorScheme = effective;
  systemThemeHandler = syncSystemThemeListener({
    chosenTheme: chosen,
    mediaQueryList: prefersDark,
    currentHandler: systemThemeHandler,
    onSystemChange: (nextTheme) => {
      document.body.dataset.theme = nextTheme;
      document.documentElement.style.colorScheme = nextTheme;
    }
  });
}
