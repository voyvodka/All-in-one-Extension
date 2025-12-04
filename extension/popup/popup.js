import { featureModulePaths } from '../features/index.js';
import { getSettings, upsertFeatureState, getDownloadsState, onDownloadsChanged, setLanguage, setTheme } from '../shared/storage.js';
import { t, getLocale, setLocale, resolveLocale, translateFeature } from '../shared/i18n.js';

const featureModules = await Promise.all(
  featureModulePaths.map(path => import(`../${path}`))
);
const features = featureModules.map(module => module.default);

const listEl = document.getElementById('feature-list');
const bugBtn = document.getElementById('bug-btn');
const donateBtn = document.getElementById('donate-btn');
const languageSelect = document.getElementById('language-select');
const themeSelect = document.getElementById('theme-select');
const downloadActiveEl = document.getElementById('download-active');
const downloadHistoryEl = document.getElementById('download-history');
const sortDownloadsBtn = document.getElementById('sort-downloads');
const clearHistoryBtn = document.getElementById('clear-history');
const tabs = Array.from(document.querySelectorAll('.tab'));
const tabViews = Array.from(document.querySelectorAll('.tab-view'));
const TAB_KEY = 'aioPopupActiveTab';
const defaultTab = 'features';

const subTabs = Array.from(document.querySelectorAll('.subtab'));
const subTabViews = Array.from(document.querySelectorAll('.download-group'));
const SUBTAB_KEY = 'aioPopupDownloadsTab';
const defaultSubTab = 'active';
const SORT_KEY = 'aioPopupSortAsc';
const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let systemThemeHandler = null;

let expandedJobId = null;
const savedSortAsc = (() => {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    return raw === null ? null : raw === 'true';
  } catch {
    return null;
  }
})();
let sortAscending = savedSortAsc ?? false;

let current = await getSettings();
if (!current.enabled) {
  current.enabled = true;
  await chrome.storage.local.set({ enabled: true });
}
if (!current.language) {
  const resolved = resolveLocale();
  current.language = resolved;
  await setLanguage(resolved);
}
if (!current.theme) {
  current.theme = 'system';
}
setLocale(current.language);
let downloads = await getDownloadsState();
applyStaticTranslations();
hydrateLanguageSelect(current.language);
hydrateThemeSelect(current.theme);
applyTheme(current.theme);
renderFeatures(current);
renderDownloads(downloads);
if (sortDownloadsBtn) {
  sortDownloadsBtn.classList.toggle('rotated', sortAscending);
}

function selectTab(tabName, persist = false) {
  const name = tabName || defaultTab;
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  tabViews.forEach((view) => view.classList.toggle('active', view.dataset.tab === name));
  if (persist) {
    try {
      localStorage.setItem(TAB_KEY, name);
    } catch (err) {
      console.warn('Tab persist failed', err);
    }
  }
}

const savedTab = (() => {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
})();

selectTab(savedTab || defaultTab, false);

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    selectTab(tab.dataset.tab, true);
  });
});

function selectSubTab(name, persist = false) {
  const tabName = name || defaultSubTab;
  subTabs.forEach((t) => t.classList.toggle('active', t.dataset.subtab === tabName));
  subTabViews.forEach((view) => view.classList.toggle('active', view.dataset.subtab === tabName));
  if (persist) {
    try {
      localStorage.setItem(SUBTAB_KEY, tabName);
    } catch (err) {
      console.warn('SubTab persist failed', err);
    }
  }
}

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

clearHistoryBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'clear-download-history' });
});

// placeholders for future actions
bugBtn?.addEventListener('click', () => { });
donateBtn?.addEventListener('click', () => { });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.features) current.features = changes.features.newValue;
  if (changes.language) {
    current.language = changes.language.newValue;
    setLocale(current.language);
    hydrateLanguageSelect(current.language);
    applyStaticTranslations();
  }
  if (changes.theme) {
    current.theme = changes.theme.newValue;
    hydrateThemeSelect(current.theme);
    applyTheme(current.theme);
  }
  renderFeatures(current);
});

onDownloadsChanged((next) => {
  downloads = next;
  renderDownloads(downloads);
});

function renderFeatures(settings) {
  listEl.innerHTML = '';

  for (const feature of features) {
    const localized = translateFeature(feature);
    const card = document.createElement('article');
    card.className = 'feature-card';
    card.title = localized.description;
    card.innerHTML = `
      <div>
        <h3>${localized.label}</h3>
      </div>
      <label class="switch">
        <input type="checkbox" data-id="${feature.id}" />
        <span></span>
      </label>
    `;
    const input = card.querySelector('input');
    input.checked = settings.features[feature.id] ?? true;
    input.addEventListener('change', async (ev) => {
      await upsertFeatureState(ev.target.dataset.id, ev.target.checked);
    });
    listEl.appendChild(card);
  }
}

function renderDownloads(state) {
  const sortedActive = sortByDate(state.active || []);
  const sortedHistory = sortByDate(state.history || []);

  const allIds = new Set([...state.active, ...state.history].map((item) => item.id));
  if (expandedJobId && !allIds.has(expandedJobId)) {
    expandedJobId = null;
  }

  renderDownloadList(downloadActiveEl, sortedActive, true);
  renderDownloadList(downloadHistoryEl, sortedHistory, false);
}

function sortByDate(list) {
  const safe = Array.isArray(list) ? [...list] : [];
  return safe.sort((a, b) => {
    const aTime = a?.updatedAt || a?.createdAt || 0;
    const bTime = b?.updatedAt || b?.createdAt || 0;
    return sortAscending ? aTime - bTime : bTime - aTime;
  });
}

function renderDownloadList(rootEl, items, allowCancel) {
  rootEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'download-meta';
    empty.textContent = t('noRecords');
    rootEl.appendChild(empty);
    return;
  }

  items.forEach((job) => {
    const card = document.createElement('div');
    card.className = 'download-card';
    card.dataset.expanded = expandedJobId === job.id ? 'true' : 'false';

    const displayError = job.error && /USER_CANCELED/i.test(job.error) ? t('statusUserCancelled') : job.error;
    const normalizedError = (() => {
      if (!displayError) return '';
      if (/unsupported\s+url/i.test(displayError)) return t('errorUnsupportedUrl');
      return displayError;
    })();
    const fallbackFromUrl = (() => {
      if (!job.sourceUrl) return '';
      try {
        const parts = new URL(job.sourceUrl).pathname.split('/').filter(Boolean);
        return parts.pop() || '';
      } catch {
        return '';
      }
    })();
    const displayName = job.fileName || job.title || fallbackFromUrl || t('downloadFallback');
    const statusMap = {
      preparing: { icon: '⏳', label: t('statusPreparing') },
      downloading: { icon: '⬇️', label: t('statusDownloading') },
      completed: { icon: '✅', label: t('statusCompleted') },
      failed: { icon: '⚠️', label: normalizedError ? `${t('errorLabel')}: ${normalizedError}` : t('statusFailed') },
      cancelled: { icon: '⚠️', label: t('statusCancelled') }
    };
    const statusInfo = statusMap[job.status] || statusMap.preparing;
    const progressValue = typeof job.progress === 'number' ? job.progress : 0;
    const normalizedProgress = progressValue > 100 ? Math.round((progressValue / 1000) * 100) : progressValue;
    const progress = Math.min(100, Math.max(0, normalizedProgress));
    const statusLabel = `${statusInfo.label}${progress > 0 && progress < 100 ? ` (${progress}%)` : ''}`;
    const updatedAt = job.updatedAt || job.createdAt;
    const localeCode = getLocale();
    const dateText = updatedAt ? new Date(updatedAt).toLocaleString(localeCode.startsWith('tr') ? 'tr-TR' : undefined) : '';

    const header = document.createElement('div');
    header.className = 'download-row';
    header.title = job.title || job.fileName || '';
    header.innerHTML = `
      <div class="download-main">
        <span class="status-icon">${statusInfo.icon}</span>
        <div class="download-texts">
        <p class="download-title" title="${displayName}">${displayName}</p>
        <span class="pill ${job.type?.includes('mp4') ? 'mp4' : 'mp3'}">${job.type?.includes('mp4') ? 'MP4' : 'MP3'}</span>
      </div>
      </div>
      <div class="download-actions-inline"></div>
      <button class="chevron" aria-label="${t('toggleDetails')}">▾</button>
    `;

    const inlineActions = header.querySelector('.download-actions-inline');
    if (allowCancel && (job.status === 'preparing' || job.status === 'downloading')) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'link-btn';
      cancelBtn.textContent = t('cancel');
      cancelBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await chrome.runtime.sendMessage({ type: 'cancel-download', jobId: job.id, downloadId: job.downloadId });
      });
      inlineActions.appendChild(cancelBtn);
    } else if (!allowCancel) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'link-btn';
      retryBtn.textContent = t('retry');
      retryBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await chrome.runtime.sendMessage({ type: 'retry-download', jobId: job.id });
      });
      inlineActions.appendChild(retryBtn);
    }

    const details = document.createElement('div');
    details.className = 'download-details';
    details.innerHTML = `
      <p class="download-meta">${statusLabel}</p>
      <div class="progress"><span style="width:${progress}%"></span></div>
      <p class="download-meta small">${t('dateLabel')}: ${dateText || '-'}</p>
      <p class="download-meta small">${t('typeLabel')}: ${job.type || '-'}</p>
      <p class="download-meta small">${t('fileNameLabel')}: ${job.fileName || '-'}</p>
      <p class="download-meta small">${t('sourceLabel')}: ${job.sourceUrl || '-'}</p>
      <p class="download-meta small">${t('statusLabel')}: ${job.status || '-'}</p>
      ${displayError ? `<p class="download-meta small error">${t('errorLabel')}: ${displayError}</p>` : ''}
    `;

    const toggle = () => {
      const expanded = card.dataset.expanded === 'true';
      expandedJobId = expanded ? null : job.id;
      renderDownloads(downloads);
    };

    header.addEventListener('click', toggle);
    card.appendChild(header);
    card.appendChild(details);
    rootEl.appendChild(card);
  });
}

function applyStaticTranslations() {
  const featuresTab = tabs.find((tab) => tab.dataset.tab === 'features');
  const downloadsTab = tabs.find((tab) => tab.dataset.tab === 'downloads');
  const activeSubTab = subTabs.find((tab) => tab.dataset.subtab === 'active');
  const historySubTab = subTabs.find((tab) => tab.dataset.subtab === 'history');

  if (featuresTab) featuresTab.textContent = t('tabFeatures');
  if (downloadsTab) downloadsTab.textContent = t('tabDownloads');
  if (activeSubTab) activeSubTab.textContent = t('subtabActive');
  if (historySubTab) historySubTab.textContent = t('subtabHistory');

  if (clearHistoryBtn) clearHistoryBtn.title = t('clearHistory');
  if (bugBtn) bugBtn.title = t('bugTitle');
  if (donateBtn) donateBtn.title = t('donateTitle');
  if (sortDownloadsBtn) sortDownloadsBtn.title = t('sort');
  if (themeSelect) themeSelect.title = t('theme');

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
  const optionSystem = themeSelect.querySelector('option[value=\"system\"]');
  const optionLight = themeSelect.querySelector('option[value=\"light\"]');
  const optionDark = themeSelect.querySelector('option[value=\"dark\"]');
  if (optionSystem) optionSystem.textContent = t('themeSystem');
  if (optionLight) optionLight.textContent = t('themeLight');
  if (optionDark) optionDark.textContent = t('themeDark');
  themeSelect.title = t('theme');
}

function resolveTheme(theme) {
  if (theme === 'light' || theme === 'dark') return theme;
  return prefersDark?.matches ? 'dark' : 'light';
}

function applyTheme(themeValue) {
  const chosen = themeValue || current.theme || 'system';
  const effective = resolveTheme(chosen);
  document.body.dataset.theme = effective;
  if (prefersDark) {
    if (systemThemeHandler) {
      prefersDark.removeEventListener?.('change', systemThemeHandler);
    }
    if (chosen === 'system') {
      systemThemeHandler = () => {
        document.body.dataset.theme = resolveTheme('system');
      };
      prefersDark.addEventListener?.('change', systemThemeHandler);
    } else {
      systemThemeHandler = null;
    }
  }
}
