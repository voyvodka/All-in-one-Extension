export type ThemeChoice = 'system' | 'light' | 'dark';
export type Locale = 'tr' | 'en';

export interface Settings {
  enabled: boolean;
  features: Record<string, boolean>;
  language: Locale | null;
  theme: ThemeChoice;
}

export type DownloadStatus = 'preparing' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface DownloadJob {
  id: string;
  type: string;
  title: string;
  fileName: string;
  sourceUrl: string;
  mediaUrl: string | null;
  status: DownloadStatus;
  progress: number;
  createdAt: number;
  updatedAt: number;
  downloadId?: number;
  totalBytes?: number;
  error?: string;
}

export interface DownloadsState {
  active: DownloadJob[];
  history: DownloadJob[];
}

export type SettingsChange = Partial<Settings>;
export type JobUpdater = (job: DownloadJob) => void;
export type DownloadsUpdater = (state: DownloadsState) => DownloadsState | void;

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  features: {},
  language: null,
  theme: 'system'
};

const DEFAULT_DOWNLOADS: DownloadsState = {
  active: [],
  history: []
};

const DOWNLOAD_HISTORY_LIMIT = 50;

export async function getSettings(): Promise<Settings> {
  const result = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>, resolve);
  });
  return { ...DEFAULT_SETTINGS, ...result } as Settings;
}

export async function setSettings(settings: Partial<Settings>): Promise<Partial<Settings>> {
  await new Promise<void>((resolve) => chrome.storage.local.set(settings as Record<string, unknown>, resolve));
  return settings;
}

export async function setEnabled(enabled: boolean): Promise<boolean> {
  await new Promise<void>((resolve) => chrome.storage.local.set({ enabled }, resolve));
  return enabled;
}

export async function setLanguage(language: Locale | null | undefined): Promise<Locale | null> {
  const normalized = language || null;
  await new Promise<void>((resolve) => chrome.storage.local.set({ language: normalized }, resolve));
  return normalized;
}

export async function setTheme(theme: string): Promise<ThemeChoice> {
  const normalized: ThemeChoice = theme === 'dark' || theme === 'light' ? theme : 'system';
  await new Promise<void>((resolve) => chrome.storage.local.set({ theme: normalized }, resolve));
  return normalized;
}

export async function upsertFeatureState(
  featureId: string,
  nextState: boolean | ((current: boolean) => boolean)
): Promise<Partial<Settings>> {
  const current = await getSettings();
  const currentValue = Boolean(current.features?.[featureId]);
  const resolved = typeof nextState === 'function' ? nextState(currentValue) : nextState;
  const updated: Settings = {
    ...current,
    features: {
      ...current.features,
      [featureId]: Boolean(resolved)
    }
  };
  await setSettings(updated);
  return updated;
}

export function onSettingsChanged(callback: (change: SettingsChange) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const next: SettingsChange = {
      enabled: (changes['enabled']?.newValue as boolean | undefined) ?? undefined,
      features: (changes['features']?.newValue as Record<string, boolean> | undefined) ?? undefined,
      language: (changes['language']?.newValue as Locale | null | undefined) ?? undefined,
      theme: (changes['theme']?.newValue as ThemeChoice | undefined) ?? undefined
    };
    callback(next);
  });
}

export async function getDownloadsState(): Promise<DownloadsState> {
  const result = await new Promise<{ downloads?: DownloadsState }>((resolve) => {
    chrome.storage.local.get({ downloads: DEFAULT_DOWNLOADS }, resolve as (items: Record<string, unknown>) => void);
  });
  const downloads = result.downloads ?? DEFAULT_DOWNLOADS;
  return {
    active: Array.isArray(downloads.active) ? downloads.active : [],
    history: Array.isArray(downloads.history) ? downloads.history : []
  };
}

export async function setDownloadsState(next: DownloadsState): Promise<DownloadsState> {
  const normalized: DownloadsState = {
    active: Array.isArray(next.active) ? next.active : [],
    history: Array.isArray(next.history) ? next.history : []
  };
  normalized.history = normalized.history.slice(-DOWNLOAD_HISTORY_LIMIT);
  await new Promise<void>((resolve) => chrome.storage.local.set({ downloads: normalized }, resolve));
  return normalized;
}

export async function updateDownloads(updater: DownloadsUpdater): Promise<DownloadsState> {
  const current = await getDownloadsState();
  const clone: DownloadsState = JSON.parse(JSON.stringify(current));
  const next = updater(clone) ?? clone;
  next.active.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  next.history.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return setDownloadsState(next);
}

export function onDownloadsChanged(callback: (state: DownloadsState) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['downloads']) return;
    const next = (changes['downloads'].newValue as DownloadsState | undefined) ?? DEFAULT_DOWNLOADS;
    callback({
      active: Array.isArray(next.active) ? next.active : [],
      history: Array.isArray(next.history) ? next.history : []
    });
  });
}
