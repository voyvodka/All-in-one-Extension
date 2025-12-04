const HOST_ID = 'aio-onboarding-host';

export function openOnboarding({ features, settings, texts, theme = 'light', onSubmit, onCancel }) {
  if (document.getElementById(HOST_ID)) {
    return { destroy: () => document.getElementById(HOST_ID)?.remove() };
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.dataset.theme = theme;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = chrome.runtime.getURL('ui/onboarding.css');
  shadow.appendChild(style);

  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const langValue = settings.language || '';
  modal.innerHTML = `
    <header>
      <div>
        <h2>${texts.title}</h2>
        <p class="desc">${texts.description}</p>
      </div>
    </header>

    <div class="lang-row">
      <label for="aio-onboarding-lang">${texts.languageLabel}</label>
      <select id="aio-onboarding-lang">
        <option value="tr">${texts.langTr}</option>
        <option value="en">${texts.langEn}</option>
      </select>
    </div>

    <div class="feature-list" id="aio-onboarding-features"></div>

    <div class="footer-row">
      <div class="actions">
        <button id="aio-onboarding-continue">${texts.continue}</button>
      </div>
    </div>
  `;

  const featureList = modal.querySelector('#aio-onboarding-features');
  const continueBtn = modal.querySelector('#aio-onboarding-continue');
  const langSelect = modal.querySelector('#aio-onboarding-lang');

  if (langValue) langSelect.value = langValue;

  features.forEach((feature) => {
    const card = document.createElement('div');
    card.className = 'feature-card';
    card.dataset.id = feature.id;
    card.innerHTML = `
      <div class="info">
        <h3>${feature.label}</h3>
        <p>${feature.description || ''}</p>
      </div>
      <label class="switch">
        <input type="checkbox" ${feature.enabled ? 'checked' : ''} />
        <span></span>
      </label>
    `;
    featureList.appendChild(card);
  });

  continueBtn.addEventListener('click', () => {
    const nextLanguage = langSelect.value;
    const nextFeatures = {};
    featureList.querySelectorAll('.feature-card').forEach((card) => {
      const id = card.dataset.id;
      const input = card.querySelector('input');
      nextFeatures[id] = input.checked;
    });

    onSubmit?.({ language: nextLanguage, features: nextFeatures });
  });

  backdrop.appendChild(modal);
  shadow.appendChild(backdrop);
  document.documentElement.appendChild(host);

  const destroy = () => host.remove();
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) {
      onCancel?.();
      destroy();
    }
  });

  return {
    destroy,
    setTheme(nextTheme) {
      host.dataset.theme = nextTheme;
    }
  };
}
