import type { ThemeChoice } from '../../shared/storage.js';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(
  theme: ThemeChoice | string,
  prefersDarkMedia: MediaQueryList | null
): ResolvedTheme {
  if (theme === 'light' || theme === 'dark') return theme;
  return prefersDarkMedia?.matches ? 'dark' : 'light';
}

export interface SyncSystemThemeListenerParams {
  chosenTheme: ThemeChoice | string;
  mediaQueryList: MediaQueryList | null;
  currentHandler: (() => void) | null;
  onSystemChange: (theme: ResolvedTheme) => void;
}

export function syncSystemThemeListener({
  chosenTheme,
  mediaQueryList,
  currentHandler,
  onSystemChange
}: SyncSystemThemeListenerParams): (() => void) | null {
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
