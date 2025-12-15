// Import feature modules statically, as Service Workers do not support variable dynamic imports.
import youtubeMp3Download from '../features/youtube/audio/index.js';
import youtubeMp4Download from '../features/youtube/video/index.js';
import instagramReelsMp3 from '../features/instagram/audio/index.js';
import instagramReelsMp4 from '../features/instagram/video/index.js';
import instagramReelsImage from '../features/instagram/image/index.js';
import twitterMp3Download from '../features/twitter/audio/index.js';
import twitterMp4Download from '../features/twitter/video/index.js';

export const features = [
  youtubeMp3Download,
  youtubeMp4Download,
  instagramReelsMp3,
  instagramReelsMp4,
  instagramReelsImage,
  twitterMp3Download,
  twitterMp4Download,
];

