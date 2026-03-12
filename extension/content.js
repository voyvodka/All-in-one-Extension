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
    let featureDescriptors = [];
    let storage;
    let i18n;

    try {
      const featureManifestModule = await import(chrome.runtime.getURL('features/index.js'));
      featureDescriptors = featureManifestModule.contentFeatureDescriptors || featureManifestModule.featureDescriptors || [];
      const featureModules = await Promise.all(
        featureDescriptors.map((descriptor) => import(chrome.runtime.getURL(descriptor.modulePath)))
      );
      features = featureModules.map((module, index) => ({
        ...module.default,
        descriptor: featureDescriptors[index] || null
      }));

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
    const { setLocale, resolveLocale } = i18n;

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

    function isFeatureEnabled(feature, settings) {
      if (settings?.enabled === false) return false;
      const explicitState = settings?.features?.[feature.id];
      return explicitState !== false;
    }

    const matchedFeatures = getMatchedFeatures(location.href);
    console.debug('All-in-One: matched features', matchedFeatures.map((f) => f.id));
    const activeCleanups = new Map();

    let currentSettings = await getSettings();
    setLocale(currentSettings.language || resolveLocale());
    console.debug('All-in-One: initial settings', currentSettings);

    applyFeatures();

    onSettingsChanged(() => {
      refreshSettings().then(applyFeatures);
    });

    async function refreshSettings() {
      currentSettings = await getSettings();
    }

    function applyFeatures() {
      for (const feature of matchedFeatures) {
        const shouldRun = isFeatureEnabled(feature, currentSettings);
        const isActive = activeCleanups.has(feature.id);

        if (shouldRun && !isActive) {
          try {
            const cleanup = feature.apply({
              features,
              settings: currentSettings,
              descriptor: feature.descriptor
            }) || (() => { });
            activeCleanups.set(feature.id, cleanup);
            console.debug('All-in-One: feature started', feature.id);
          } catch (err) {
            console.error('Failed to start feature', feature.id, err);
          }
        } else if (!shouldRun && isActive) {
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
