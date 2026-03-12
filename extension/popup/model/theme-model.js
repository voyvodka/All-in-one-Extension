export function resolveTheme(theme, prefersDarkMedia) {
  if (theme === 'light' || theme === 'dark') return theme;
  return prefersDarkMedia?.matches ? 'dark' : 'light';
}

export function syncSystemThemeListener({ chosenTheme, mediaQueryList, currentHandler, onSystemChange }) {
  if (!mediaQueryList) return null;

  if (currentHandler) {
    mediaQueryList.removeEventListener?.('change', currentHandler);
  }

  if (chosenTheme !== 'system') {
    return null;
  }

  const nextHandler = () => {
    onSystemChange(resolveTheme('system', mediaQueryList));
  };
  mediaQueryList.addEventListener?.('change', nextHandler);
  return nextHandler;
}
