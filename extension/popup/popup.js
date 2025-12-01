import { featureModulePaths } from '../features/index.js';
import { getSettings, setEnabled, upsertFeatureState } from '../shared/storage.js';

const featureModules = await Promise.all(
  featureModulePaths.map(path => import(`../${path}`))
);
const features = featureModules.map(module => module.default);

const listEl = document.getElementById('feature-list');
const globalToggle = document.getElementById('global-toggle');

let current = await getSettings();
render(current);

globalToggle.addEventListener('change', async () => {
  current.enabled = globalToggle.checked;
  await setEnabled(current.enabled);
  render(current);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) current.enabled = changes.enabled.newValue;
  if (changes.features) current.features = changes.features.newValue;
  render(current);
});

function render(settings) {
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
