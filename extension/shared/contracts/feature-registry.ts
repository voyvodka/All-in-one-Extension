type Platform = 'youtube' | 'instagram' | 'twitter';
type Kind = 'audio-download' | 'video-download' | 'image-download' | 'account-analysis';
type Surface = 'content' | 'background';

export interface FeatureDescriptor {
  id: string;
  platform: Platform;
  kind: Kind;
  modulePath: string;
  settingsKey: string;
  surfaces: Surface[];
}

export const featureDescriptors: readonly FeatureDescriptor[] = Object.freeze([
  {
    id: 'yt-audio-download',
    platform: 'youtube',
    kind: 'audio-download',
    modulePath: 'features/yt-audio-download/content/index.js',
    settingsKey: 'yt-audio-download',
    surfaces: ['content', 'background'],
  },
  {
    id: 'yt-video-download',
    platform: 'youtube',
    kind: 'video-download',
    modulePath: 'features/yt-video-download/content/index.js',
    settingsKey: 'yt-video-download',
    surfaces: ['content', 'background'],
  },
  {
    id: 'ig-audio-download',
    platform: 'instagram',
    kind: 'audio-download',
    modulePath: 'features/ig-audio-download/content/index.js',
    settingsKey: 'ig-audio-download',
    surfaces: ['content', 'background'],
  },
  {
    id: 'ig-video-download',
    platform: 'instagram',
    kind: 'video-download',
    modulePath: 'features/ig-video-download/content/index.js',
    settingsKey: 'ig-video-download',
    surfaces: ['content', 'background'],
  },
  {
    id: 'ig-image-download',
    platform: 'instagram',
    kind: 'image-download',
    modulePath: 'features/ig-image-download/content/index.js',
    settingsKey: 'ig-image-download',
    surfaces: ['content', 'background'],
  },
  {
    id: 'ig-unfollowers',
    platform: 'instagram',
    kind: 'account-analysis',
    modulePath: 'features/ig-unfollowers/content/index.js',
    settingsKey: 'ig-unfollowers',
    surfaces: ['content'],
  },
  {
    id: 'x-audio-download',
    platform: 'twitter',
    kind: 'audio-download',
    modulePath: 'features/x-audio-download/content/index.js',
    settingsKey: 'x-audio-download',
    surfaces: ['content', 'background'],
  },
  {
    id: 'x-video-download',
    platform: 'twitter',
    kind: 'video-download',
    modulePath: 'features/x-video-download/content/index.js',
    settingsKey: 'x-video-download',
    surfaces: ['content', 'background'],
  },
  {
    id: 'x-image-download',
    platform: 'twitter',
    kind: 'image-download',
    modulePath: 'features/x-image-download/content/index.js',
    settingsKey: 'x-image-download',
    surfaces: ['content', 'background'],
  },
]);

export const contentFeatureDescriptors: readonly FeatureDescriptor[] = featureDescriptors.filter(
  (descriptor) => descriptor.surfaces.includes('content'),
);

export const featureModulePaths: string[] = contentFeatureDescriptors.map(
  (descriptor) => descriptor.modulePath,
);
