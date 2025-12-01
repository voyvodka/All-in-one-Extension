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

let current = await getSettings();
let downloads = await getDownloadsState();
renderFeatures(current);
renderDownloads(downloads);

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    tabs.forEach((t) => t.classList.toggle('active', t === tab));
    tabViews.forEach((view) => view.classList.toggle('active', view.dataset.tab === tabName));
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
    card.innerHTML = `
      <div>
        <h3>${feature.label}</h3>
        <p>${feature.description}</p>
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

    const statusText = job.status === 'preparing'
      ? 'Hazırlanıyor'
      : job.status === 'downloading'
        ? 'İndiriliyor'
        : job.status === 'completed'
          ? 'Tamamlandı'
          : job.status === 'failed'
            ? `Hata: ${job.error || ''}`.trim()
            : 'İptal edildi';

    const progress = typeof job.progress === 'number' ? Math.min(100, Math.max(0, job.progress)) : 0;

    card.innerHTML = `
      <header>
        <p class="download-title" title="${job.title || job.fileName}">${job.fileName || job.title || 'İndirme'}</p>
        <span class="pill ${job.type?.includes('mp4') ? 'mp4' : 'mp3'}">${job.type?.includes('mp4') ? 'MP4' : 'MP3'}</span>
      </header>
      <p class="download-meta">${statusText}</p>
      <div class="progress"><span style="width:${progress}%"></span></div>
      <div class="card-actions"></div>
    `;

    const actions = card.querySelector('.card-actions');
    if (allowCancel && (job.status === 'preparing' || job.status === 'downloading')) {
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'İptal';
      cancelBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'cancel-download', jobId: job.id, downloadId: job.downloadId });
      });
      actions.appendChild(cancelBtn);
    } else if (!actions.innerHTML) {
      actions.remove();
    }

    rootEl.appendChild(card);
  });
}
