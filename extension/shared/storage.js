const DEFAULT_SETTINGS = {
  enabled: true,
  features: {},
  language: null, // null => use browser language
  theme: 'system'
};

const DEFAULT_DOWNLOADS = {
  active: [],
  history: []
};

const DOWNLOAD_HISTORY_LIMIT = 50;

export async function getSettings() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, resolve);
  });
  return { ...DEFAULT_SETTINGS, ...result };
}

export async function setSettings(settings) {
  await new Promise((resolve) => chrome.storage.local.set(settings, resolve));
  return settings;
}

export async function setEnabled(enabled) {
  await new Promise((resolve) => chrome.storage.local.set({ enabled }, resolve));
  return enabled;
}

export async function setLanguage(language) {
  await new Promise((resolve) => chrome.storage.local.set({ language: language || null }, resolve));
  return language || null;
}

export async function setTheme(theme) {
  const normalized = theme === 'dark' || theme === 'light' ? theme : 'system';
  await new Promise((resolve) => chrome.storage.local.set({ theme: normalized }, resolve));
  return normalized;
}

export async function upsertFeatureState(featureId, nextState) {
  const current = await getSettings();
  const currentValue = Boolean(current.features?.[featureId]);
  const resolved = typeof nextState === 'function' ? nextState(currentValue) : nextState;
  const updated = {
    ...current,
    features: {
      ...current.features,
      [featureId]: Boolean(resolved)
    }
  };
  await setSettings(updated);
  return updated;
}

export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const next = {
      enabled: changes.enabled?.newValue ?? undefined,
      features: changes.features?.newValue ?? undefined,
      language: changes.language?.newValue ?? undefined,
      theme: changes.theme?.newValue ?? undefined
    };
    callback(next);
  });
}

export async function getDownloadsState() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get({ downloads: DEFAULT_DOWNLOADS }, resolve);
  });
  const downloads = result.downloads || DEFAULT_DOWNLOADS;
  return {
    active: Array.isArray(downloads.active) ? downloads.active : [],
    history: Array.isArray(downloads.history) ? downloads.history : []
  };
}

export async function setDownloadsState(next) {
  const normalized = {
    active: Array.isArray(next.active) ? next.active : [],
    history: Array.isArray(next.history) ? next.history : []
  };
  normalized.history = normalized.history.slice(-DOWNLOAD_HISTORY_LIMIT);
  await new Promise((resolve) => chrome.storage.local.set({ downloads: normalized }, resolve));
  return normalized;
}

export async function updateDownloads(updater) {
  const current = await getDownloadsState();
  const clone = JSON.parse(JSON.stringify(current));
  const next = updater(clone) || clone;
  next.active.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  next.history.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return setDownloadsState(next);
}

export function onDownloadsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.downloads) return;
    const next = changes.downloads.newValue || DEFAULT_DOWNLOADS;
    callback({
      active: Array.isArray(next.active) ? next.active : [],
      history: Array.isArray(next.history) ? next.history : []
    });
  });
}
