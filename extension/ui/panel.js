const PANEL_ID = 'aio-control-panel';

export function createPanel({ features, initialSettings, onToggle, onGlobalToggle }) {
  if (document.getElementById(PANEL_ID)) {
    return {
      update: () => {}
    };
  }

  const container = document.createElement('div');
  container.id = PANEL_ID;
  const shadow = container.attachShadow({ mode: 'open' });

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = chrome.runtime.getURL('ui/panel.css');
  shadow.appendChild(style);

  const wrapper = document.createElement('div');
  wrapper.className = 'panel';

  const header = document.createElement('header');
  header.innerHTML = `<span class="title">All-in-One</span><button class="toggle" data-collapsed="true" aria-expanded="false">◻</button>`;

  const globalToggle = document.createElement('label');
  globalToggle.className = 'switch';
  globalToggle.innerHTML = `
    <input type="checkbox" />
    <span>Aktif</span>
  `;

  const globalCheckbox = globalToggle.querySelector('input');
  globalCheckbox.checked = initialSettings.enabled;
  globalCheckbox.addEventListener('change', () => {
    onGlobalToggle(globalCheckbox.checked);
  });

  const list = document.createElement('ul');
  list.className = 'feature-list';
  for (const feature of features) {
    const item = document.createElement('li');
    item.dataset.id = feature.id;
    item.innerHTML = `
      <div>
        <div class="label">${feature.label}</div>
        <div class="hint">${feature.description}</div>
      </div>
      <label class="switch">
        <input type="checkbox" />
        <span></span>
      </label>
    `;
    const checkbox = item.querySelector('input');
    checkbox.addEventListener('change', () => {
      onToggle(feature.id, checkbox.checked);
    });
    list.appendChild(item);
  }

  wrapper.appendChild(header);
  wrapper.appendChild(globalToggle);
  wrapper.appendChild(list);
  shadow.appendChild(wrapper);

  // document.documentElement.appendChild(container);

  header.querySelector('button')?.addEventListener('click', (ev) => {
    const collapsed = ev.currentTarget.getAttribute('data-collapsed') === 'true';
    ev.currentTarget.setAttribute('data-collapsed', String(!collapsed));
    ev.currentTarget.setAttribute('aria-expanded', String(collapsed));
    wrapper.classList.toggle('collapsed', !collapsed);
  });

  return {
    update(settings) {
      globalCheckbox.checked = settings.enabled;
      for (const item of list.querySelectorAll('li')) {
        const id = item.dataset.id;
        const checkbox = item.querySelector('input');
        checkbox.checked = settings.features[id] ?? true;
        checkbox.disabled = !settings.enabled;
      }
      wrapper.classList.toggle('disabled', !settings.enabled);
    }
  };
}
