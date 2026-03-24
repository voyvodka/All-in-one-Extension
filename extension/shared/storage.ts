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
  retryImageUrls?: string[];
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

export type InstagramAnalyzerStatus = 'idle' | 'running' | 'completed' | 'error';
export type InstagramAnalyzerJobStatus = 'running' | 'completed' | 'error' | 'cancelled';

export interface InstagramAnalyzerAccountSummary {
  viewerId: string;
  username: string;
  lastScannedAt: number | null;
  status: InstagramAnalyzerStatus;
  followingCount: number;
  nonFollowerCount: number;
  whitelistedCount: number;
  lastError?: string;
}

export interface InstagramAnalyzerJob {
  jobId: string;
  viewerId: string;
  username: string;
  status: InstagramAnalyzerJobStatus;
  startedAt: number;
  updatedAt: number;
  pagesCompleted: number;
  processedCount: number;
  nextCursor: string | null;
  lastError?: string;
}

export interface InstagramAnalyzerResultItem {
  id: string;
  username: string;
  fullName: string;
  isPrivate: boolean;
  isVerified: boolean;
  profilePictureUrl: string;
}

export interface InstagramAnalyzerSnapshotUser {
  id: string;
  username: string;
}

export interface InstagramAnalyzerScanDiff {
  followed: InstagramAnalyzerSnapshotUser[];
  unfollowed: InstagramAnalyzerSnapshotUser[];
  followersGained: InstagramAnalyzerSnapshotUser[];
  followersLost: InstagramAnalyzerSnapshotUser[];
  followersAvailable: boolean;
}

export interface InstagramAnalyzerScanHistoryEntry {
  scanId: string;
  scannedAt: number;
  followingCount: number;
  followerCount: number;
  nonFollowerCount: number;
  whitelistedCount: number;
  pagesCompleted: number;
  diffs: InstagramAnalyzerScanDiff;
}

export interface InstagramAnalyzerAccountState {
  summary: InstagramAnalyzerAccountSummary;
  job: InstagramAnalyzerJob | null;
  whitelist: string[];
  results: InstagramAnalyzerResultItem[];
  history: InstagramAnalyzerScanHistoryEntry[];
  followingSnapshot: InstagramAnalyzerSnapshotUser[];
  followersSnapshot: InstagramAnalyzerSnapshotUser[];
}

export interface InstagramAnalyzerDurableAccount {
  viewerId: string;
  username: string;
  updatedAt: number;
  results: InstagramAnalyzerResultItem[];
  history: InstagramAnalyzerScanHistoryEntry[];
  followingSnapshot: InstagramAnalyzerSnapshotUser[];
  followersSnapshot: InstagramAnalyzerSnapshotUser[];
}

export interface InstagramAnalyzerState {
  currentViewerId: string | null;
  accounts: Record<string, InstagramAnalyzerAccountState>;
}

export type SettingsChange = Partial<Settings>;
export type JobUpdater = (job: DownloadJob) => void;
export type DownloadsUpdater = (state: DownloadsState) => DownloadsState | void;
export type InstagramAnalyzerUpdater = (state: InstagramAnalyzerState) => InstagramAnalyzerState | void;

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

const DEFAULT_INSTAGRAM_ANALYZER_STATE: InstagramAnalyzerState = {
  currentViewerId: null,
  accounts: {}
};

const DOWNLOAD_HISTORY_LIMIT = 50;
let downloadsUpdateQueue: Promise<DownloadsState> = Promise.resolve(DEFAULT_DOWNLOADS);

function hasRuntimeContext(): boolean {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeInstagramAnalyzerResultItem(value: unknown): InstagramAnalyzerResultItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value['id']);
  const username = asString(value['username']);
  if (!id || !username) {
    return null;
  }

  return {
    id,
    username,
    fullName: asString(value['fullName']),
    isPrivate: asBoolean(value['isPrivate']),
    isVerified: asBoolean(value['isVerified']),
    profilePictureUrl: asString(value['profilePictureUrl'])
  };
}

function normalizeInstagramAnalyzerResults(value: unknown): InstagramAnalyzerResultItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeInstagramAnalyzerResultItem(item))
    .filter((item): item is InstagramAnalyzerResultItem => Boolean(item));
}

function normalizeInstagramAnalyzerSnapshotUser(value: unknown): InstagramAnalyzerSnapshotUser | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value['id']);
  const username = asString(value['username']);
  if (!id || !username) {
    return null;
  }

  return { id, username };
}

function normalizeInstagramAnalyzerSnapshotUsers(value: unknown): InstagramAnalyzerSnapshotUser[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeInstagramAnalyzerSnapshotUser(item))
    .filter((item): item is InstagramAnalyzerSnapshotUser => Boolean(item));
}

function normalizeInstagramAnalyzerScanDiff(value: unknown): InstagramAnalyzerScanDiff {
  const raw = isRecord(value) ? value : {};
  return {
    followed: normalizeInstagramAnalyzerSnapshotUsers(raw['followed']),
    unfollowed: normalizeInstagramAnalyzerSnapshotUsers(raw['unfollowed']),
    followersGained: normalizeInstagramAnalyzerSnapshotUsers(raw['followersGained']),
    followersLost: normalizeInstagramAnalyzerSnapshotUsers(raw['followersLost']),
    followersAvailable: asBoolean(raw['followersAvailable'])
  };
}

function normalizeInstagramAnalyzerScanHistoryEntry(value: unknown): InstagramAnalyzerScanHistoryEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const scanId = asString(value['scanId']);
  if (!scanId) {
    return null;
  }

  return {
    scanId,
    scannedAt: Math.max(0, asNumber(value['scannedAt'])),
    followingCount: Math.max(0, asNumber(value['followingCount'])),
    followerCount: Math.max(0, asNumber(value['followerCount'])),
    nonFollowerCount: Math.max(0, asNumber(value['nonFollowerCount'])),
    whitelistedCount: Math.max(0, asNumber(value['whitelistedCount'])),
    pagesCompleted: Math.max(0, asNumber(value['pagesCompleted'])),
    diffs: normalizeInstagramAnalyzerScanDiff(value['diffs'])
  };
}

function normalizeInstagramAnalyzerHistory(value: unknown): InstagramAnalyzerScanHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeInstagramAnalyzerScanHistoryEntry(item))
    .filter((item): item is InstagramAnalyzerScanHistoryEntry => Boolean(item));
}

function normalizeInstagramAnalyzerStatus(value: unknown): InstagramAnalyzerStatus {
  return value === 'running' || value === 'completed' || value === 'error' ? value : 'idle';
}

function normalizeInstagramAnalyzerJobStatus(value: unknown): InstagramAnalyzerJobStatus {
  return value === 'completed' || value === 'error' || value === 'cancelled' ? value : 'running';
}

function createDefaultInstagramAnalyzerSummary(
  viewerId: string,
  username = ''
): InstagramAnalyzerAccountSummary {
  return {
    viewerId,
    username,
    lastScannedAt: null,
    status: 'idle',
    followingCount: 0,
    nonFollowerCount: 0,
    whitelistedCount: 0
  };
}

function normalizeInstagramAnalyzerSummary(
  value: unknown,
  viewerId: string
): InstagramAnalyzerAccountSummary {
  const raw = isRecord(value) ? value : {};
  const normalizedViewerId = asString(raw['viewerId'], viewerId) || viewerId;
  const username = asString(raw['username']);
  const summary: InstagramAnalyzerAccountSummary = {
    viewerId: normalizedViewerId,
    username,
    lastScannedAt: asNullableNumber(raw['lastScannedAt']),
    status: normalizeInstagramAnalyzerStatus(raw['status']),
    followingCount: Math.max(0, asNumber(raw['followingCount'])),
    nonFollowerCount: Math.max(0, asNumber(raw['nonFollowerCount'])),
    whitelistedCount: Math.max(0, asNumber(raw['whitelistedCount']))
  };
  const lastError = asString(raw['lastError']);
  if (lastError) {
    summary.lastError = lastError;
  }
  return summary;
}

function normalizeInstagramAnalyzerJob(
  value: unknown,
  viewerId: string,
  username: string
): InstagramAnalyzerJob | null {
  if (!isRecord(value)) {
    return null;
  }

  const jobId = asString(value['jobId']);
  if (!jobId) {
    return null;
  }

  const job: InstagramAnalyzerJob = {
    jobId,
    viewerId: asString(value['viewerId'], viewerId) || viewerId,
    username: asString(value['username'], username),
    status: normalizeInstagramAnalyzerJobStatus(value['status']),
    startedAt: Math.max(0, asNumber(value['startedAt'])),
    updatedAt: Math.max(0, asNumber(value['updatedAt'])),
    pagesCompleted: Math.max(0, asNumber(value['pagesCompleted'])),
    processedCount: Math.max(0, asNumber(value['processedCount'])),
    nextCursor: typeof value['nextCursor'] === 'string' ? value['nextCursor'] : null
  };
  const lastError = asString(value['lastError']);
  if (lastError) {
    job.lastError = lastError;
  }
  return job;
}

function normalizeInstagramAnalyzerAccountState(
  value: unknown,
  viewerId: string
): InstagramAnalyzerAccountState {
  const raw = isRecord(value) ? value : {};
  const summary = normalizeInstagramAnalyzerSummary(raw['summary'], viewerId);
  return {
    summary,
    job: normalizeInstagramAnalyzerJob(raw['job'], viewerId, summary.username),
    whitelist: asStringArray(raw['whitelist']),
    results: normalizeInstagramAnalyzerResults(raw['results']),
    history: normalizeInstagramAnalyzerHistory(raw['history']),
    followingSnapshot: normalizeInstagramAnalyzerSnapshotUsers(raw['followingSnapshot']),
    followersSnapshot: normalizeInstagramAnalyzerSnapshotUsers(raw['followersSnapshot'])
  };
}

function normalizeInstagramAnalyzerState(value: unknown): InstagramAnalyzerState {
  const raw = isRecord(value) ? value : {};
  const accountsRecord = isRecord(raw['accounts']) ? raw['accounts'] : {};
  const accounts: Record<string, InstagramAnalyzerAccountState> = {};

  Object.entries(accountsRecord).forEach(([viewerId, accountValue]) => {
    if (!viewerId) {
      return;
    }
    accounts[viewerId] = normalizeInstagramAnalyzerAccountState(accountValue, viewerId);
  });

  const currentViewerId = asString(raw['currentViewerId']) || null;
  return {
    currentViewerId,
    accounts
  };
}

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
  const runUpdate = async (): Promise<DownloadsState> => {
    const current = await getDownloadsState();
    const clone: DownloadsState = JSON.parse(JSON.stringify(current));
    const next = updater(clone) ?? clone;
    next.active.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    next.history.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return setDownloadsState(next);
  };

  const nextRun = downloadsUpdateQueue
    .catch(() => DEFAULT_DOWNLOADS)
    .then(runUpdate);

  downloadsUpdateQueue = nextRun;
  return nextRun;
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

export async function getInstagramAnalyzerState(): Promise<InstagramAnalyzerState> {
  if (!hasRuntimeContext()) {
    return DEFAULT_INSTAGRAM_ANALYZER_STATE;
  }
  const result = await new Promise<{ instagramAnalyzer?: InstagramAnalyzerState }>((resolve) => {
    try {
      chrome.storage.local.get(
        { instagramAnalyzer: DEFAULT_INSTAGRAM_ANALYZER_STATE },
        resolve as (items: Record<string, unknown>) => void
      );
    } catch {
      resolve({ instagramAnalyzer: DEFAULT_INSTAGRAM_ANALYZER_STATE });
    }
  });
  return normalizeInstagramAnalyzerState(result.instagramAnalyzer ?? DEFAULT_INSTAGRAM_ANALYZER_STATE);
}

export async function setInstagramAnalyzerState(next: InstagramAnalyzerState): Promise<InstagramAnalyzerState> {
  const normalized = normalizeInstagramAnalyzerState(next);
  if (!hasRuntimeContext()) {
    return normalized;
  }
  await new Promise<void>((resolve) => {
    try {
      chrome.storage.local.set({ instagramAnalyzer: normalized }, resolve);
    } catch {
      resolve();
    }
  });
  return normalized;
}

export async function updateInstagramAnalyzer(updater: InstagramAnalyzerUpdater): Promise<InstagramAnalyzerState> {
  const current = await getInstagramAnalyzerState();
  const clone: InstagramAnalyzerState = JSON.parse(JSON.stringify(current));
  const next = updater(clone) ?? clone;
  return setInstagramAnalyzerState(next);
}

export function onInstagramAnalyzerChanged(callback: (state: InstagramAnalyzerState) => void): void {
  if (!hasRuntimeContext()) {
    return;
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes['instagramAnalyzer']) return;
    callback(normalizeInstagramAnalyzerState(changes['instagramAnalyzer'].newValue));
  });
}

export function createInstagramAnalyzerAccountState(viewerId: string, username = ''): InstagramAnalyzerAccountState {
  return {
    summary: createDefaultInstagramAnalyzerSummary(viewerId, username),
    job: null,
    whitelist: [],
    results: [],
    history: [],
    followingSnapshot: [],
    followersSnapshot: []
  };
}
