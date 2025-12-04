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
    let ui;
    let onboardingUi;
    let i18n;

    try {
      const featureManifestModule = await import(chrome.runtime.getURL('features/index.js'));
      const featureModules = await Promise.all(
        featureManifestModule.featureModulePaths.map(path => import(chrome.runtime.getURL(path)))
      );
      features = featureModules.map(module => module.default);

      [storage, ui, onboardingUi, i18n] = await Promise.all([
        import(chrome.runtime.getURL('shared/storage.js')),
        import(chrome.runtime.getURL('ui/panel.js')),
        import(chrome.runtime.getURL('ui/onboarding.js')),
        import(chrome.runtime.getURL('shared/i18n.js'))
      ]);
      console.debug('All-in-One: imports loaded', { features, storage, ui });
    } catch (err) {
      console.error('All-in-One: import failed', err);
      return;
    }

    const { getSettings, onSettingsChanged, setEnabled, upsertFeatureState, setSettings } = storage;
    const { createPanel } = ui;
    const { openOnboarding } = onboardingUi;
    const { translateFeature, setLocale, t, resolveLocale } = i18n;

    const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function resolveTheme(theme) {
      if (theme === 'dark' || theme === 'light') return theme;
      return prefersDark?.matches ? 'dark' : 'light';
    }

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
    const localizedMatchedFeatures = localizedFeatures.filter((feature) => matchedFeatures.find((m) => m.id === feature.id));

    const panel = createPanel({
      features: localizedMatchedFeatures,
      initialSettings: currentSettings,
      onToggle: async (featureId, nextState) => {
        await upsertFeatureState(featureId, nextState);
        currentSettings = await getSettings();
        applyFeatures();
      },
      onGlobalToggle: async (nextState) => {
        await setEnabled(nextState);
        currentSettings = await getSettings();
        applyFeatures();
      }
    });

    if (!currentSettings.onboardingCompleted) {
      await runOnboarding(localizedFeatures);
    }

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
      panel.update(currentSettings);
    }

    function applyFeatures() {
      panel.update(currentSettings);

      if (!currentSettings.enabled) {
        cleanupAll();
        return;
        }

        for (const feature of matchedFeatures) {
          const shouldEnable = currentSettings.features[feature.id] ?? true;
          const isActive = activeCleanups.has(feature.id);

        if (shouldEnable && !isActive) {
          try {
            const cleanup = feature.apply({ features, settings: currentSettings }) || (() => { });
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

    async function runOnboarding(allFeatures) {
      return new Promise((resolve) => {
        const featureStates = allFeatures.map((feature) => ({
          id: feature.id,
          label: translateFeature(feature).label,
          description: translateFeature(feature).description,
          enabled: currentSettings.features[feature.id] ?? true
        }));

        const buildTexts = () => ({
          title: t('onboardingTitle'),
          description: t('onboardingDescription'),
          languageLabel: t('onboardingLanguage'),
          langTr: t('languageTr'),
          langEn: t('languageEn'),
          continue: t('onboardingContinue')
        });
        let texts = buildTexts();
        const initialTheme = resolveTheme(currentSettings.theme);

        const onboarding = openOnboarding({
          features: featureStates,
          settings: currentSettings,
          texts,
          theme: initialTheme,
          onSubmit: async ({ language, features: nextFeatures }) => {
            const next = {
              ...currentSettings,
              language: language || resolveLocale(),
              features: { ...currentSettings.features, ...nextFeatures },
              onboardingCompleted: true
            };
            await setSettings(next);
            setLocale(next.language);
            currentSettings = await getSettings();
            destroy();
            resolve();
          },
          onCancel: () => {
            destroy();
            resolve();
          }
        });
        let { destroy, setTheme } = onboarding;

        // live translate onboarding when language select changes
        const host = document.querySelector('#aio-onboarding-host');
        const shadow = host?.shadowRoot;
        const langSelect = shadow?.querySelector('#aio-onboarding-lang');
        const featureList = shadow?.querySelector('#aio-onboarding-features');

        const updateFeatureLabels = () => {
          if (!featureList) return;
          featureList.querySelectorAll('.feature-card').forEach((card) => {
            const id = card.dataset.id;
            const base = allFeatures.find((f) => f.id === id);
            if (!base) return;
            const localized = translateFeature(base);
            const h3 = card.querySelector('h3');
            const p = card.querySelector('p');
            if (h3) h3.textContent = localized.label;
            if (p) p.textContent = localized.description || '';
          });
        };

        updateFeatureLabels();
        if (langSelect) {
          langSelect.addEventListener('change', () => {
            setLocale(langSelect.value);
            texts = buildTexts();
            shadow.querySelector('h2').textContent = texts.title;
            shadow.querySelector('p.desc').textContent = texts.description;
            shadow.querySelector('label[for="aio-onboarding-lang"]').textContent = texts.languageLabel;
            const opts = shadow.querySelectorAll('#aio-onboarding-lang option');
            if (opts[0]) opts[0].textContent = texts.langTr;
            if (opts[1]) opts[1].textContent = texts.langEn;
            const cta = shadow.querySelector('#aio-onboarding-continue');
            if (cta) cta.textContent = texts.continue;
            updateFeatureLabels();
          });
        }

        let systemThemeHandler = null;
        const chosenTheme = currentSettings.theme || 'system';
        if (prefersDark && (chosenTheme === 'system' || !chosenTheme)) {
          systemThemeHandler = () => {
            setTheme(resolveTheme('system'));
          };
          prefersDark.addEventListener?.('change', systemThemeHandler);
        }

        const originalDestroy = destroy;
        destroy = () => {
          if (systemThemeHandler && prefersDark) {
            prefersDark.removeEventListener?.('change', systemThemeHandler);
          }
          originalDestroy();
        };
      });
    }
  })();
}
