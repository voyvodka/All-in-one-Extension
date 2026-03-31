import {
  createInstagramAnalyzerAccountState,
  updateInstagramAnalyzer,
} from '../../shared/storage.js';
import type {
  InstagramAnalyzerAccountState,
  InstagramAnalyzerDurableAccount,
  InstagramAnalyzerJob,
  InstagramAnalyzerResultItem,
  InstagramAnalyzerScanHistoryEntry,
  InstagramAnalyzerSnapshotUser,
  InstagramAnalyzerState,
} from '../../shared/storage.js';
import { getDurableAnalyzerAccount, putDurableAnalyzerAccount } from './db.js';

const QUERY_HASH = '3dec7e2c57367ef3da3d987d89f9dbc8';
const FOLLOWERS_QUERY_HASH = 'c76146de99bb02f6415203be841dd25a';
const PAGE_SIZE = 24;
const PAGE_DELAY_MS = 650;
const IG_APP_ID = '936619743392459';
const SCAN_HISTORY_LIMIT = 6;

const runningViewerIds = new Set<string>();

interface InstagramAnalyzerStartParams {
  viewerId: string;
  username: string;
  csrfToken: string;
}

interface InstagramAnalyzerResult {
  success: boolean;
  error?: string;
}

interface InstagramGraphNode {
  follows_viewer?: boolean;
  id?: string;
  username?: string;
  full_name?: string;
  is_private?: boolean;
  is_verified?: boolean;
  profile_pic_url?: string;
}

interface InstagramGraphEdge {
  node?: InstagramGraphNode | null;
}

interface InstagramPageInfo {
  end_cursor?: string | null;
  has_next_page?: boolean;
}

interface InstagramEdgeFollow {
  count?: number;
  edges?: InstagramGraphEdge[];
  page_info?: InstagramPageInfo;
}

interface InstagramGraphResponse {
  data?: {
    user?: {
      edge_follow?: InstagramEdgeFollow;
      edge_followed_by?: InstagramEdgeFollow;
    };
  };
}

interface InstagramRestUser {
  pk?: string | number;
  username?: string;
}

interface InstagramRestFollowersResponse {
  users?: InstagramRestUser[];
  next_max_id?: string | null;
}

interface InstagramScanPage {
  edges: InstagramGraphEdge[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

interface FollowersSnapshotResult {
  available: boolean;
  error?: string;
  snapshot: InstagramAnalyzerSnapshotUser[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function buildJob(
  viewerId: string,
  username: string,
  jobId: string,
  now: number,
): InstagramAnalyzerJob {
  return {
    jobId,
    viewerId,
    username,
    status: 'running',
    startedAt: now,
    updatedAt: now,
    pagesCompleted: 0,
    processedCount: 0,
    nextCursor: null,
  };
}

function ensureAccount(
  state: InstagramAnalyzerState,
  viewerId: string,
  username: string,
): InstagramAnalyzerAccountState {
  const existing =
    state.accounts[viewerId] ?? createInstagramAnalyzerAccountState(viewerId, username);
  if (username) {
    existing.summary.username = username;
    if (existing.job) {
      existing.job.username = username;
    }
  }
  state.accounts[viewerId] = existing;
  state.currentViewerId = viewerId;
  return existing;
}

function countWhitelisted(results: InstagramAnalyzerResultItem[], whitelist: string[]): number {
  const whitelistSet = new Set(whitelist);
  return results.reduce((count, item) => count + (whitelistSet.has(item.id) ? 1 : 0), 0);
}

function sortSnapshotUsers(
  items: InstagramAnalyzerSnapshotUser[],
): InstagramAnalyzerSnapshotUser[] {
  return [...items].sort((left, right) => left.username.localeCompare(right.username));
}

function mergeSnapshotUsers(
  existing: InstagramAnalyzerSnapshotUser[],
  incoming: InstagramAnalyzerSnapshotUser[],
): InstagramAnalyzerSnapshotUser[] {
  const itemMap = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    itemMap.set(item.id, item);
  });
  return sortSnapshotUsers(Array.from(itemMap.values()));
}

function extractSnapshotUsers(edges: InstagramGraphEdge[]): InstagramAnalyzerSnapshotUser[] {
  return sortSnapshotUsers(
    edges
      .map((edge) => edge.node ?? null)
      .filter((node): node is InstagramGraphNode => Boolean(node?.id && node?.username))
      .map((node) => ({
        id: node.id as string,
        username: node.username as string,
      })),
  );
}

function diffSnapshotUsers(
  nextItems: InstagramAnalyzerSnapshotUser[],
  previousItems: InstagramAnalyzerSnapshotUser[],
): InstagramAnalyzerSnapshotUser[] {
  const previousIds = new Set(previousItems.map((item) => item.id));
  return nextItems.filter((item) => !previousIds.has(item.id));
}

function buildHistoryEntry({
  scanId,
  scannedAt,
  followingSnapshot,
  followersSnapshot,
  previousFollowingSnapshot,
  previousFollowersSnapshot,
  followersAvailable,
  nonFollowerCount,
  pagesCompleted,
  whitelistedCount,
}: {
  scanId: string;
  scannedAt: number;
  followingSnapshot: InstagramAnalyzerSnapshotUser[];
  followersSnapshot: InstagramAnalyzerSnapshotUser[];
  previousFollowingSnapshot: InstagramAnalyzerSnapshotUser[];
  previousFollowersSnapshot: InstagramAnalyzerSnapshotUser[];
  followersAvailable: boolean;
  nonFollowerCount: number;
  pagesCompleted: number;
  whitelistedCount: number;
}): InstagramAnalyzerScanHistoryEntry {
  return {
    scanId,
    scannedAt,
    followingCount: followingSnapshot.length,
    followerCount: followersAvailable ? followersSnapshot.length : 0,
    nonFollowerCount,
    whitelistedCount,
    pagesCompleted,
    diffs: {
      followed: diffSnapshotUsers(followingSnapshot, previousFollowingSnapshot),
      unfollowed: diffSnapshotUsers(previousFollowingSnapshot, followingSnapshot),
      followersGained: followersAvailable
        ? diffSnapshotUsers(followersSnapshot, previousFollowersSnapshot)
        : [],
      followersLost: followersAvailable
        ? diffSnapshotUsers(previousFollowersSnapshot, followersSnapshot)
        : [],
      followersAvailable,
    },
  };
}

function createEmptyDurableAccount(
  viewerId: string,
  username: string,
): InstagramAnalyzerDurableAccount {
  return {
    viewerId,
    username,
    updatedAt: 0,
    results: [],
    history: [],
    followingSnapshot: [],
    followersSnapshot: [],
  };
}

function normalizeDurableAccount(
  account: InstagramAnalyzerDurableAccount | null,
  viewerId: string,
  username: string,
): InstagramAnalyzerDurableAccount {
  if (!account) {
    return createEmptyDurableAccount(viewerId, username);
  }

  return {
    ...account,
    viewerId,
    username: username || account.username || '',
  };
}

async function setRunningState(viewerId: string, username: string, jobId: string): Promise<void> {
  const now = Date.now();
  await updateInstagramAnalyzer((state) => {
    const account = ensureAccount(state, viewerId, username);
    account.summary.status = 'running';
    account.summary.followingCount = 0;
    account.summary.nonFollowerCount = 0;
    account.summary.whitelistedCount = countWhitelisted(account.results, account.whitelist);
    delete account.summary.lastError;
    account.job = buildJob(viewerId, username || account.summary.username, jobId, now);
    return state;
  });
}

async function setProgressState(
  viewerId: string,
  username: string,
  jobId: string,
  processedCount: number,
  nonFollowerCount: number,
  pagesCompleted: number,
  nextCursor: string | null,
): Promise<void> {
  const now = Date.now();
  await updateInstagramAnalyzer((state) => {
    const account = ensureAccount(state, viewerId, username);
    account.summary.status = 'running';
    account.summary.followingCount = processedCount;
    account.summary.nonFollowerCount = nonFollowerCount;
    account.summary.whitelistedCount = countWhitelisted(account.results, account.whitelist);
    delete account.summary.lastError;
    account.job = {
      ...(account.job ?? buildJob(viewerId, username || account.summary.username, jobId, now)),
      jobId,
      viewerId,
      username: username || account.summary.username,
      status: 'running',
      updatedAt: now,
      pagesCompleted,
      processedCount,
      nextCursor,
    };
    return state;
  });
}

async function setCompletedState(
  viewerId: string,
  username: string,
  jobId: string,
  processedCount: number,
  results: InstagramAnalyzerResultItem[],
  followingSnapshot: InstagramAnalyzerSnapshotUser[],
  followersSnapshot: InstagramAnalyzerSnapshotUser[],
  followersAvailable: boolean,
  durableAccountBefore: InstagramAnalyzerDurableAccount,
  pagesCompleted: number,
): Promise<void> {
  const now = Date.now();
  let durableAccountToPersist: InstagramAnalyzerDurableAccount | null = null;

  await updateInstagramAnalyzer((state) => {
    const account = ensureAccount(state, viewerId, username);
    const whitelistedCount = countWhitelisted(results, account.whitelist);
    const resolvedUsername =
      username || account.summary.username || durableAccountBefore.username || '';
    const historyEntry = buildHistoryEntry({
      scanId: jobId,
      scannedAt: now,
      followingSnapshot,
      followersSnapshot,
      previousFollowingSnapshot: durableAccountBefore.followingSnapshot,
      previousFollowersSnapshot: durableAccountBefore.followersSnapshot,
      followersAvailable,
      nonFollowerCount: results.length,
      pagesCompleted,
      whitelistedCount,
    });
    const nextHistory = [historyEntry, ...durableAccountBefore.history]
      .sort((left, right) => right.scannedAt - left.scannedAt)
      .slice(0, SCAN_HISTORY_LIMIT);

    durableAccountToPersist = {
      viewerId,
      username: resolvedUsername,
      updatedAt: now,
      results,
      history: nextHistory,
      followingSnapshot,
      followersSnapshot: followersAvailable
        ? followersSnapshot
        : durableAccountBefore.followersSnapshot,
    };

    account.summary.status = 'completed';
    account.summary.lastScannedAt = now;
    account.summary.username = resolvedUsername;
    account.summary.followingCount = processedCount;
    account.summary.nonFollowerCount = results.length;
    account.summary.whitelistedCount = whitelistedCount;
    delete account.summary.lastError;
    account.results = [];
    account.followingSnapshot = [];
    account.followersSnapshot = [];
    account.history = [];
    account.job = {
      ...(account.job ?? buildJob(viewerId, username || account.summary.username, jobId, now)),
      jobId,
      viewerId,
      username: username || account.summary.username,
      status: 'completed',
      updatedAt: now,
      pagesCompleted,
      processedCount,
      nextCursor: null,
    };
    return state;
  });

  if (durableAccountToPersist) {
    await putDurableAnalyzerAccount(durableAccountToPersist);
  }
}

async function setErrorState(
  viewerId: string,
  username: string,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const now = Date.now();
  await updateInstagramAnalyzer((state) => {
    const account = ensureAccount(state, viewerId, username);
    account.summary.status = 'error';
    account.summary.whitelistedCount = account.whitelist.length;
    account.summary.lastError = errorMessage;
    account.job = {
      ...(account.job ?? buildJob(viewerId, username || account.summary.username, jobId, now)),
      jobId,
      viewerId,
      username: username || account.summary.username,
      status: 'error',
      updatedAt: now,
      lastError: errorMessage,
    };
    return state;
  });
}

function normalizeAnalyzerError(error: unknown): string {
  const message = String(
    (error as { message?: string } | null)?.message ?? error ?? 'Unknown error',
  );
  if (/401|403|login|session|auth/i.test(message)) {
    return 'Instagram oturumu dogrulanamadi. Hesabin acik oldugundan emin olup tekrar dene.';
  }
  if (/network|fetch/i.test(message)) {
    return 'Instagram verileri alinamadi. Ag veya oturum nedeniyle tarama basarisiz oldu.';
  }
  return message;
}

function extractNonFollowerResults(edges: InstagramGraphEdge[]): InstagramAnalyzerResultItem[] {
  return edges
    .map((edge) => edge.node ?? null)
    .filter((node): node is InstagramGraphNode => Boolean(node?.id && node?.username))
    .filter((node) => node.follows_viewer === false)
    .map((node) => ({
      id: node.id as string,
      username: node.username as string,
      fullName: node.full_name ?? '',
      isPrivate: node.is_private === true,
      isVerified: node.is_verified === true,
      profilePictureUrl: node.profile_pic_url ?? '',
    }));
}

function mergeResults(
  existing: InstagramAnalyzerResultItem[],
  incoming: InstagramAnalyzerResultItem[],
): InstagramAnalyzerResultItem[] {
  const resultMap = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    resultMap.set(item.id, item);
  });

  return Array.from(resultMap.values()).sort((left, right) => {
    return left.username.localeCompare(right.username);
  });
}

async function fetchScanPage(
  viewerId: string,
  cursor: string | null,
  csrfToken: string,
  queryHash = QUERY_HASH,
  connectionKey: 'edge_follow' | 'edge_followed_by' = 'edge_follow',
): Promise<InstagramScanPage> {
  const url = new URL('https://www.instagram.com/graphql/query/');
  const variables: Record<string, string> = {
    id: viewerId,
    include_reel: 'true',
    fetch_mutual: 'false',
    first: String(PAGE_SIZE),
  };
  if (cursor) {
    variables['after'] = cursor;
  }

  url.searchParams.set('query_hash', queryHash);
  url.searchParams.set('variables', JSON.stringify(variables));

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
    mode: 'cors',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'x-csrftoken': csrfToken,
      'x-ig-app-id': IG_APP_ID,
    },
  });

  if (!response.ok) {
    throw new Error(`Instagram scan failed: ${response.status}`);
  }

  const data = (await response.json()) as InstagramGraphResponse;
  const edgeFollow =
    connectionKey === 'edge_followed_by'
      ? data?.data?.user?.edge_followed_by
      : data?.data?.user?.edge_follow;
  if (!edgeFollow || !Array.isArray(edgeFollow.edges)) {
    throw new Error(`Instagram ${connectionKey} payload is missing`);
  }

  return {
    edges: edgeFollow.edges,
    hasNextPage: Boolean(edgeFollow.page_info?.has_next_page),
    nextCursor:
      typeof edgeFollow.page_info?.end_cursor === 'string' ? edgeFollow.page_info.end_cursor : null,
  };
}

async function fetchFollowersSnapshot(
  viewerId: string,
  csrfToken: string,
): Promise<FollowersSnapshotResult> {
  try {
    let cursor: string | null = null;
    let hasNextPage = true;
    let snapshot: InstagramAnalyzerSnapshotUser[] = [];

    while (hasNextPage) {
      const page = await fetchScanPage(
        viewerId,
        cursor,
        csrfToken,
        FOLLOWERS_QUERY_HASH,
        'edge_followed_by',
      );
      snapshot = mergeSnapshotUsers(snapshot, extractSnapshotUsers(page.edges));
      cursor = page.nextCursor;
      hasNextPage = page.hasNextPage && Boolean(cursor);
      if (hasNextPage) {
        await sleep(PAGE_DELAY_MS);
      }
    }

    return {
      available: true,
      snapshot,
    };
  } catch (error) {
    try {
      let cursor: string | null = null;
      let hasNextPage = true;
      let snapshot: InstagramAnalyzerSnapshotUser[] = [];

      while (hasNextPage) {
        const url = new URL(
          `https://www.instagram.com/api/v1/friendships/${encodeURIComponent(viewerId)}/followers/`,
        );
        url.searchParams.set('count', String(PAGE_SIZE));
        url.searchParams.set('search_surface', 'follow_list_page');
        if (cursor) {
          url.searchParams.set('max_id', cursor);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
          mode: 'cors',
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'x-csrftoken': csrfToken,
            'x-ig-app-id': IG_APP_ID,
            'x-requested-with': 'XMLHttpRequest',
          },
        });

        if (!response.ok) {
          throw new Error(`Instagram followers fallback failed: ${response.status}`, {
            cause: error,
          });
        }

        const data = (await response.json()) as InstagramRestFollowersResponse;
        const users = Array.isArray(data.users) ? data.users : [];
        snapshot = mergeSnapshotUsers(
          snapshot,
          users
            .filter((user): user is InstagramRestUser => Boolean(user?.pk && user?.username))
            .map((user) => ({
              id: String(user.pk),
              username: String(user.username),
            })),
        );

        cursor = typeof data.next_max_id === 'string' ? data.next_max_id : null;
        hasNextPage = Boolean(cursor);
        if (hasNextPage) {
          await sleep(PAGE_DELAY_MS);
        }
      }

      return {
        available: true,
        snapshot,
      };
    } catch (fallbackError) {
      return {
        available: false,
        error: normalizeAnalyzerError(fallbackError ?? error),
        snapshot: [],
      };
    }
  }
}

async function fetchViewerUsernameById(viewerId: string, csrfToken: string): Promise<string> {
  if (!viewerId || !csrfToken) {
    return '';
  }

  try {
    const response = await fetch(
      `https://www.instagram.com/api/v1/users/${encodeURIComponent(viewerId)}/info/`,
      {
        method: 'GET',
        credentials: 'include',
        mode: 'cors',
        cache: 'no-store',
        headers: {
          accept: 'application/json',
          'x-csrftoken': csrfToken,
          'x-ig-app-id': IG_APP_ID,
          'x-requested-with': 'XMLHttpRequest',
        },
      },
    );

    if (!response.ok) {
      return '';
    }

    const data = (await response.json()) as { user?: { username?: string } };
    return typeof data.user?.username === 'string' ? data.user.username : '';
  } catch {
    return '';
  }
}

export async function resolveInstagramViewerUsername(
  viewerId: string,
  csrfToken: string,
): Promise<string> {
  return fetchViewerUsernameById(viewerId, csrfToken);
}

export async function getInstagramAnalyzerDurableAccount(
  viewerId: string,
): Promise<InstagramAnalyzerDurableAccount> {
  return normalizeDurableAccount(await getDurableAnalyzerAccount(viewerId), viewerId, '');
}

export async function removeInstagramAnalyzerResult(
  viewerId: string,
  targetId: string,
  username: string,
): Promise<InstagramAnalyzerDurableAccount> {
  const durableAccount = normalizeDurableAccount(
    await getDurableAnalyzerAccount(viewerId),
    viewerId,
    username,
  );
  const nextAccount: InstagramAnalyzerDurableAccount = {
    ...durableAccount,
    username: username || durableAccount.username,
    updatedAt: Date.now(),
    results: durableAccount.results.filter((item) => item.id !== targetId),
    followingSnapshot: durableAccount.followingSnapshot.filter((item) => item.id !== targetId),
  };
  await putDurableAnalyzerAccount(nextAccount);
  return nextAccount;
}

export async function startInstagramAnalyzerScan({
  viewerId,
  username,
  csrfToken,
}: InstagramAnalyzerStartParams): Promise<InstagramAnalyzerResult> {
  if (runningViewerIds.has(viewerId)) {
    return { success: false, error: 'Bu hesap icin zaten devam eden bir tarama var.' };
  }

  runningViewerIds.add(viewerId);
  const jobId = `ig-analyzer-${viewerId}-${Date.now()}`;

  try {
    if (!csrfToken) {
      const errorMessage = 'Instagram oturumu dogrulanamadi. Sayfayi yenileyip tekrar dene.';
      await setErrorState(viewerId, username, jobId, errorMessage);
      return { success: false, error: errorMessage };
    }

    await setRunningState(viewerId, username, jobId);
    const durableAccountBefore = normalizeDurableAccount(
      await getDurableAnalyzerAccount(viewerId),
      viewerId,
      username,
    );

    let cursor: string | null = null;
    let hasNextPage = true;
    let processedCount = 0;
    let pagesCompleted = 0;
    let results: InstagramAnalyzerResultItem[] = [];
    let followingSnapshot: InstagramAnalyzerSnapshotUser[] = [];

    while (hasNextPage) {
      const page = await fetchScanPage(viewerId, cursor, csrfToken);
      processedCount += page.edges.length;
      results = mergeResults(results, extractNonFollowerResults(page.edges));
      followingSnapshot = mergeSnapshotUsers(followingSnapshot, extractSnapshotUsers(page.edges));
      pagesCompleted += 1;
      cursor = page.nextCursor;
      hasNextPage = page.hasNextPage && Boolean(cursor);

      await setProgressState(
        viewerId,
        username,
        jobId,
        processedCount,
        results.length,
        pagesCompleted,
        cursor,
      );

      if (hasNextPage) {
        await sleep(PAGE_DELAY_MS);
      }
    }

    const followersSnapshotResult = await fetchFollowersSnapshot(viewerId, csrfToken);
    const followersError = followersSnapshotResult.available
      ? ''
      : followersSnapshotResult.error || '';

    await setCompletedState(
      viewerId,
      username,
      jobId,
      processedCount,
      results,
      followingSnapshot,
      followersSnapshotResult.snapshot,
      followersSnapshotResult.available,
      durableAccountBefore,
      pagesCompleted,
    );
    return followersError ? { success: true, error: followersError } : { success: true };
  } catch (error) {
    const normalizedError = normalizeAnalyzerError(error);
    await setErrorState(viewerId, username, jobId, normalizedError);
    return { success: false, error: normalizedError };
  } finally {
    runningViewerIds.delete(viewerId);
  }
}
