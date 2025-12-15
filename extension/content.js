// Skip chrome://, edge://, about:blank, etc.
const allowedProtocols = new Set(['http:', 'https:']);
if (!allowedProtocols.has(location.protocol)) {
  console.debug('All-in-One: content script skipped on protocol', location.protocol);
} else {
  (async function main() {
    console.debug('All-in-One: booting content script', {
      href: location.href,
      protocol: location.protocol
    });

    let features = [];
    let storage;
    let i18n;

    try {
      const featureManifestModule = await import(chrome.runtime.getURL('features/index.js'));
      const featureModules = await Promise.all(
        featureManifestModule.featureModulePaths.map(path => import(chrome.runtime.getURL(path)))
      );
      features = featureModules.map(module => module.default);

      [storage, i18n] = await Promise.all([
        import(chrome.runtime.getURL('shared/storage.js')),
        import(chrome.runtime.getURL('shared/i18n.js'))
      ]);
      console.debug('All-in-One: imports loaded', { features, storage });
    } catch (err) {
      console.error('All-in-One: import failed', err);
      return;
    }

    const { getSettings, onSettingsChanged } = storage;
    const { translateFeature, setLocale, t, resolveLocale } = i18n;

    function getMatchedFeatures(url) {
      return features.filter((feature) => {
        try {
          return feature.matches(url);
        } catch (err) {
          console.warn('Match failed for feature', feature.id, err);
          return false;
        }
      });
    }

    const matchedFeatures = getMatchedFeatures(location.href);
    console.debug('All-in-One: matched features', matchedFeatures.map((f) => f.id));
    const activeCleanups = new Map();

    let currentSettings = await getSettings();
    setLocale(currentSettings.language || resolveLocale());
    console.debug('All-in-One: initial settings', currentSettings);

    const localizedFeatures = features.map((feature) => {
      const localized = translateFeature(feature);
      return { ...feature, ...localized };
    });

    applyFeatures();

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'feature-toggled' && message.featureId) {
        console.debug('All-in-One: feature toggled via message', message.featureId);
        applyFeatures();
      }
    });

    onSettingsChanged(() => {
      refreshSettings().then(applyFeatures);
    });

    async function refreshSettings() {
      currentSettings = await getSettings();
    }

    function applyFeatures() {
      if (!currentSettings.enabled) {
        cleanupAll();
        return;
      }

      for (const feature of matchedFeatures) {
        const shouldEnable = currentSettings.features[feature.id] ?? true;
        const isActive = activeCleanups.has(feature.id);

        if (shouldEnable && !isActive) {
          try {
            const cleanup = feature.apply({ features: localizedFeatures, settings: currentSettings }) || (() => { });
            activeCleanups.set(feature.id, cleanup);
            console.debug('All-in-One: feature started', feature.id);
          } catch (err) {
            console.error('Failed to start feature', feature.id, err);
          }
        } else if (!shouldEnable && isActive) {
          cleanupFeature(feature.id);
        }
      }
    }

    function cleanupFeature(featureId) {
      const cleanup = activeCleanups.get(featureId);
      if (cleanup) {
        try {
          cleanup();
          console.debug('All-in-One: feature stopped', featureId);
        } catch (err) {
          console.warn('Cleanup failed for', featureId, err);
        }
      }
      activeCleanups.delete(featureId);
    }

    function cleanupAll() {
      for (const featureId of Array.from(activeCleanups.keys())) {
        cleanupFeature(featureId);
      }
    }

  })();
}
