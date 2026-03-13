export const MESSAGE_TYPES = Object.freeze({
  GET_SETTINGS: 'get-settings',
  GET_DOWNLOADS: 'get-downloads',
  CANCEL_DOWNLOAD: 'cancel-download',
  CLEAR_DOWNLOAD_HISTORY: 'clear-download-history',
  RETRY_DOWNLOAD: 'retry-download',
  IG_ANALYZER_OPEN: 'ig-analyzer-open',
  IG_ANALYZER_START_SCAN: 'ig-analyzer-start-scan',
  IG_ANALYZER_GET_DURABLE_ACCOUNT: 'ig-analyzer-get-durable-account',
  IG_ANALYZER_RESOLVE_VIEWER: 'ig-analyzer-resolve-viewer',
  YT_AUDIO_DOWNLOAD: 'yt-audio-download',
  YT_VIDEO_DOWNLOAD: 'yt-video-download',
  IG_AUDIO_DOWNLOAD: 'ig-audio-download',
  IG_VIDEO_DOWNLOAD: 'ig-video-download',
  IG_IMAGE_DOWNLOAD: 'ig-image-download',
  IG_IMAGE_ZIP_DOWNLOAD: 'ig-image-zip-download',
  X_AUDIO_DOWNLOAD: 'x-audio-download',
  X_VIDEO_DOWNLOAD: 'x-video-download',
  X_IMAGE_DOWNLOAD: 'x-image-download',
  X_IMAGE_ZIP_DOWNLOAD: 'x-image-zip-download'
} as const);

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export type DownloadMessageType =
  | typeof MESSAGE_TYPES.YT_AUDIO_DOWNLOAD
  | typeof MESSAGE_TYPES.YT_VIDEO_DOWNLOAD
  | typeof MESSAGE_TYPES.IG_AUDIO_DOWNLOAD
  | typeof MESSAGE_TYPES.IG_VIDEO_DOWNLOAD
  | typeof MESSAGE_TYPES.IG_IMAGE_DOWNLOAD
  | typeof MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD
  | typeof MESSAGE_TYPES.X_AUDIO_DOWNLOAD
  | typeof MESSAGE_TYPES.X_VIDEO_DOWNLOAD
  | typeof MESSAGE_TYPES.X_IMAGE_DOWNLOAD
  | typeof MESSAGE_TYPES.X_IMAGE_ZIP_DOWNLOAD;

export const DOWNLOAD_MESSAGE_TYPES = new Set<DownloadMessageType>([
  MESSAGE_TYPES.YT_AUDIO_DOWNLOAD,
  MESSAGE_TYPES.YT_VIDEO_DOWNLOAD,
  MESSAGE_TYPES.IG_AUDIO_DOWNLOAD,
  MESSAGE_TYPES.IG_VIDEO_DOWNLOAD,
  MESSAGE_TYPES.IG_IMAGE_DOWNLOAD,
  MESSAGE_TYPES.IG_IMAGE_ZIP_DOWNLOAD,
  MESSAGE_TYPES.X_AUDIO_DOWNLOAD,
  MESSAGE_TYPES.X_VIDEO_DOWNLOAD,
  MESSAGE_TYPES.X_IMAGE_DOWNLOAD,
  MESSAGE_TYPES.X_IMAGE_ZIP_DOWNLOAD
]);
