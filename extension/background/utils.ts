export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getPlatformPrefix(kind?: string): string {
  if (!kind) return 'dl';
  if (kind.startsWith('yt-')) return 'yt';
  if (kind.startsWith('ig-')) return 'ig';
  if (kind.startsWith('x-')) return 'x';
  if (kind.includes('youtube')) return 'yt';
  if (kind.includes('instagram')) return 'ig';
  if (kind.includes('twitter')) return 'x';
  return 'dl';
}

function buildTimestampBase(kind?: string, ts: number = Date.now()): string {
  const prefix = getPlatformPrefix(kind);
  return `${prefix}_${ts}`;
}

export function buildTimestampFile(
  kind: string,
  ext: string,
  ts: number = Date.now(),
  suffix?: string,
): string {
  const base = buildTimestampBase(kind, ts);
  const cleanExt = (ext || '').replace(/[^a-z0-9]/gi, '') || 'bin';
  const cleanSuffix = suffix ? `_${String(suffix).replace(/[^a-z0-9_-]+/gi, '')}` : '';
  return `${base}${cleanSuffix}.${cleanExt}`;
}

export function normalizeTwitterUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    if (url.hostname === 'x.com' || url.hostname.endsWith('.x.com')) {
      url.hostname = 'twitter.com';
    }
    if (url.protocol !== 'https:') {
      url.protocol = 'https:';
    }
    return url.toString();
  } catch {
    return urlString;
  }
}

export function inferExtFromUrl(url: string | null | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})(?:$|\?)/i);
    if (match?.[1]) {
      const ext = match[1].toLowerCase();
      if (['mp4', 'm4v', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp', 'mp3'].includes(ext)) {
        return ext;
      }
    }
  } catch {
    // ignore invalid URLs
  }
  return fallback;
}

export function getYoutubeIdFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const bySearch = url.searchParams.get('v');
    if (bySearch) return bySearch;
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] ?? null;
    if (url.pathname.startsWith('/watch')) return url.searchParams.get('v');
    return null;
  } catch {
    return null;
  }
}
