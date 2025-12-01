const DEFAULT_SETTINGS = {
  enabled: true,
  features: {}
};

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
      features: changes.features?.newValue ?? undefined
    };
    callback(next);
  });
}
