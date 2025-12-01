const MP_ICON_PATHS = `
  <circle cx="12" cy="12" r="10" fill="__COLOR__"></circle>
  <path d="M12 6v7.5m0 0-3-3m3 3 3-3M7 17h10" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
`;

const iconMarkup = (color) => MP_ICON_PATHS.replace(/__COLOR__/g, color);

export const isYoutube = (url) => {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'youtu.be' ||
      hostname.endsWith('youtube.com') ||
      hostname.endsWith('youtube-nocookie.com')
    );
  } catch {
    return false;
  }
};

function setCustomIcon(node, color) {
  const paths = iconMarkup(color); // MP_ICON_PATHS.replace...

  // 1) Daha önce bizim eklediğimiz ikon varsa sadece path'leri güncelle
  let svg = node.querySelector('.aio-mp3-icon svg');
  if (svg) {
    svg.innerHTML = paths;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.height = '100%';
    return;
  }

  // 2) Youtube template’inden gelen yt-icon’u tamamen değiştir
  const ytIcon = node.querySelector('yt-icon');
  if (ytIcon) {
    const wrapper = document.createElement('span');
    // Stil bozulmasın diye class’ları taşı + bizim flag class’ımız
    wrapper.className =
      (ytIcon.className || '') +
      ' yt-icon-shape ytSpecIconShapeHost aio-mp3-icon';

    wrapper.innerHTML = `
      <svg viewBox="0 0 24 24"
        height="100%"
        aria-hidden="true"
        focusable="false">
        ${paths}
      </svg>
    `;

    ytIcon.replaceWith(wrapper);
    return;
  }

  // 3) Hiç ikon yoksa (edge case), butonun başına ekle
  const button = node.querySelector('button');
  if (button) {
    const wrapper = document.createElement('span');
    wrapper.className = 'yt-icon-shape ytSpecIconShapeHost aio-mp3-icon';
    wrapper.innerHTML = `
      <svg viewBox="0 0 24 24"
        height="100%"
        aria-hidden="true"
        focusable="false">
        ${paths}
      </svg>
    `;
    button.insertBefore(wrapper, button.firstChild);
  }
}

function buildFallbackTarget(label, color) {
  const wrapper = document.createElement('yt-share-target-renderer');
  wrapper.className = 'style-scope yt-third-party-share-target-section-renderer';
  wrapper.setAttribute('role', 'button');

  const button = document.createElement('button');
  button.className = 'style-scope yt-share-target-renderer';
  button.id = 'target';

  // yt-icon yerine direkt kendi wrapper + svg
  const iconWrapper = document.createElement('span');
  iconWrapper.className =
    'yt-icon-shape style-scope yt-icon ytSpecIconShapeHost aio-mp3-icon';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.style.height = '100%';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = iconMarkup(color);

  iconWrapper.appendChild(svg);

  const title = document.createElement('div');
  title.id = 'title';
  title.className = 'style-scope yt-share-target-renderer';
  title.textContent = label;
  title.setAttribute('style-target', 'title');

  button.appendChild(iconWrapper);
  button.appendChild(title);
  wrapper.appendChild(button);

  return wrapper;
}

export function createYoutubeShareTarget(container, { attr, label, color, onClick }) {
  const template = container.querySelector('yt-share-target-renderer');
  const node = template ? template.cloneNode(true) : buildFallbackTarget(label, color);
  if (!node) return null;

  node.setAttribute(attr, 'true');

  const button = node.querySelector('button') || node.querySelector('#target');
  if (!button) return null;

  button.id = 'target';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.onclick = onClick;

  const titleEl = node.querySelector('#title');
  if (titleEl) {
    titleEl.textContent = label;
    titleEl.setAttribute('style-target', 'title');
  }

  setCustomIcon(node, color);

  return node;
}
