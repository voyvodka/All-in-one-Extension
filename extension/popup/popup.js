import { featureModulePaths } from '../features/index.js';
import {
  getSettings,
  setEnabled,
  upsertFeatureState,
  getDownloadsState,
  onDownloadsChanged
} from '../shared/storage.js';

const featureModules = await Promise.all(
  featureModulePaths.map(path => import(`../${path}`))
);
const features = featureModules.map(module => module.default);

const listEl = document.getElementById('feature-list');
const globalToggle = document.getElementById('global-toggle');
const downloadActiveEl = document.getElementById('download-active');
const downloadHistoryEl = document.getElementById('download-history');
const refreshDownloadsBtn = document.getElementById('refresh-downloads');
const clearHistoryBtn = document.getElementById('clear-history');
const tabs = Array.from(document.querySelectorAll('.tab'));
const tabViews = Array.from(document.querySelectorAll('.tab-view'));
const TAB_KEY = 'aioPopupActiveTab';
const defaultTab = 'features';

const subTabs = Array.from(document.querySelectorAll('.subtab'));
const subTabViews = Array.from(document.querySelectorAll('.download-group'));
const SUBTAB_KEY = 'aioPopupDownloadsTab';
const defaultSubTab = 'active';

let expandedJobId = null;

let current = await getSettings();
let downloads = await getDownloadsState();
renderFeatures(current);
renderDownloads(downloads);

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

refreshDownloadsBtn.addEventListener('click', async () => {
  downloads = await getDownloadsState();
  renderDownloads(downloads);
});

clearHistoryBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'clear-download-history' });
});

globalToggle.addEventListener('change', async () => {
  current.enabled = globalToggle.checked;
  await setEnabled(current.enabled);
  renderFeatures(current);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) current.enabled = changes.enabled.newValue;
  if (changes.features) current.features = changes.features.newValue;
  renderFeatures(current);
});

onDownloadsChanged((next) => {
  downloads = next;
  renderDownloads(downloads);
});

function renderFeatures(settings) {
  globalToggle.checked = settings.enabled;
  listEl.innerHTML = '';

  for (const feature of features) {
    const card = document.createElement('article');
    card.className = 'feature-card';
    card.title = feature.description;
    card.innerHTML = `
      <div>
        <h3>${feature.label}</h3>
      </div>
      <label class="switch">
        <input type="checkbox" data-id="${feature.id}" />
        <span></span>
      </label>
    `;
    const input = card.querySelector('input');
    input.checked = settings.features[feature.id] ?? true;
    input.disabled = !settings.enabled;
    input.addEventListener('change', async (ev) => {
      await upsertFeatureState(ev.target.dataset.id, ev.target.checked);
    });
    listEl.appendChild(card);
  }
}

function renderDownloads(state) {
  const allIds = new Set([...state.active, ...state.history].map((item) => item.id));
  if (expandedJobId && !allIds.has(expandedJobId)) {
    expandedJobId = null;
  }

  renderDownloadList(downloadActiveEl, state.active, true);
  renderDownloadList(downloadHistoryEl, state.history, false);
}

function renderDownloadList(rootEl, items, allowCancel) {
  rootEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'download-meta';
    empty.textContent = 'Kayıt yok.';
    rootEl.appendChild(empty);
    return;
  }

  items.forEach((job) => {
    const card = document.createElement('div');
    card.className = 'download-card';
    card.dataset.expanded = expandedJobId === job.id ? 'true' : 'false';

    const displayError = job.error && /USER_CANCELED/i.test(job.error) ? 'İndirme kabul edilmedi' : job.error;
    const fallbackFromUrl = (() => {
      if (!job.sourceUrl) return '';
      try {
        const parts = new URL(job.sourceUrl).pathname.split('/').filter(Boolean);
        return parts.pop() || '';
      } catch {
        return '';
      }
    })();
    const displayName = job.fileName || job.title || fallbackFromUrl || 'İndirme';
    const statusMap = {
      preparing: { icon: '⏳', label: 'Hazırlanıyor' },
      downloading: { icon: '⬇️', label: 'İndiriliyor' },
      completed: { icon: '✅', label: 'Tamamlandı' },
      failed: { icon: '⚠️', label: displayError ? `Hata: ${displayError}` : 'Hata' },
      cancelled: { icon: '⚠️', label: 'İptal edildi' }
    };
    const statusInfo = statusMap[job.status] || statusMap.preparing;
    const progressValue = typeof job.progress === 'number' ? job.progress : 0;
    const normalizedProgress = progressValue > 100 ? Math.round((progressValue / 1000) * 100) : progressValue;
    const progress = Math.min(100, Math.max(0, normalizedProgress));
    const statusLabel = `${statusInfo.label}${progress > 0 && progress < 100 ? ` (${progress}%)` : ''}`;
    const updatedAt = job.updatedAt || job.createdAt;
    const dateText = updatedAt ? new Date(updatedAt).toLocaleString('tr-TR') : '';

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
      <button class="chevron" aria-label="Detayları aç/kapat">▾</button>
    `;

    const inlineActions = header.querySelector('.download-actions-inline');
    if (allowCancel && (job.status === 'preparing' || job.status === 'downloading')) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'link-btn';
      cancelBtn.textContent = 'İptal';
      cancelBtn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await chrome.runtime.sendMessage({ type: 'cancel-download', jobId: job.id, downloadId: job.downloadId });
      });
      inlineActions.appendChild(cancelBtn);
    } else if (!allowCancel) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'link-btn';
      retryBtn.textContent = 'İndir';
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
      <p class="download-meta small">Tarih: ${dateText || '-'}</p>
      <p class="download-meta small">Tür: ${job.type || '-'}</p>
      <p class="download-meta small">Dosya adı: ${job.fileName || '-'}</p>
      <p class="download-meta small">Kaynak: ${job.sourceUrl || '-'}</p>
      <p class="download-meta small">Durum: ${job.status || '-'}</p>
      ${displayError ? `<p class="download-meta small error">Hata: ${displayError}</p>` : ''}
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
