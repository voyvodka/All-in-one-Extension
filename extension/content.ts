// Content scripts run as classic scripts in Chrome — no top-level import/export allowed.
// Using inline `import()` types so tsc doesn't treat this file as a module and emit `export {}`.
type Settings = import('./shared/storage.js').Settings;
type FeatureDescriptor = import('./shared/contracts/feature-registry.js').FeatureDescriptor;

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

    interface FeatureModule {
      id: string;
      label?: string;
      description?: string;
      matches: (url: string) => boolean;
      apply: (context: {
        features: FeatureModule[];
        settings: Settings;
        descriptor: FeatureDescriptor | null;
      }) => (() => void) | void;
    }

    interface BoundFeature extends FeatureModule {
      descriptor: FeatureDescriptor | null;
    }

    let features: BoundFeature[] = [];
    let featureDescriptors: FeatureDescriptor[] = [];
    let storage: typeof import('./shared/storage.js') | undefined;
    let i18n: typeof import('./shared/i18n.js') | undefined;

    try {
      const featureManifestModule = await import(chrome.runtime.getURL('features/index.js') as string);
      featureDescriptors =
        (featureManifestModule as { contentFeatureDescriptors?: FeatureDescriptor[]; featureDescriptors?: FeatureDescriptor[] })
          .contentFeatureDescriptors ??
        (featureManifestModule as { featureDescriptors?: FeatureDescriptor[] }).featureDescriptors ??
        [];

      const featureModules = await Promise.all(
        featureDescriptors.map((descriptor) =>
          import(chrome.runtime.getURL(descriptor.modulePath) as string)
        )
      );

      features = featureModules.map((module, index) => ({
        ...(module as { default: FeatureModule }).default,
        descriptor: featureDescriptors[index] ?? null
      }));

      [storage, i18n] = await Promise.all([
        import(chrome.runtime.getURL('shared/storage.js') as string),
        import(chrome.runtime.getURL('shared/i18n.js') as string)
      ]);
      console.debug('All-in-One: imports loaded', { features, storage });
    } catch (err) {
      console.error('All-in-One: import failed', err);
      return;
    }

    const { getSettings, onSettingsChanged } = storage!;
    const { setLocale, resolveLocale } = i18n!;

    function getMatchedFeatures(url: string): BoundFeature[] {
      return features.filter((feature) => {
        try {
          return feature.matches(url);
        } catch (err) {
          console.warn('Match failed for feature', feature.id, err);
          return false;
        }
      });
    }

    function isFeatureEnabled(feature: BoundFeature, settings: Settings): boolean {
      if (settings?.enabled === false) return false;
      const explicitState = settings?.features?.[feature.id];
      return explicitState !== false;
    }

    const matchedFeatures = getMatchedFeatures(location.href);
    console.debug(
      'All-in-One: matched features',
      matchedFeatures.map((f) => f.id)
    );
    const activeCleanups = new Map<string, () => void>();

    let currentSettings = await getSettings();
    setLocale(currentSettings.language ?? resolveLocale());
    console.debug('All-in-One: initial settings', currentSettings);

    applyFeatures();

    onSettingsChanged(() => {
      refreshSettings().then(applyFeatures);
    });

    async function refreshSettings(): Promise<void> {
      currentSettings = await getSettings();
    }

    function applyFeatures(): void {
      for (const feature of matchedFeatures) {
        const shouldRun = isFeatureEnabled(feature, currentSettings);
        const isActive = activeCleanups.has(feature.id);

        if (shouldRun && !isActive) {
          try {
            const cleanup =
              feature.apply({
                features,
                settings: currentSettings,
                descriptor: feature.descriptor
              }) ?? (() => { /* noop */ });
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

    function cleanupFeature(featureId: string): void {
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
  })();
}
