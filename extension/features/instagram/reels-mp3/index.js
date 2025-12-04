import {
  isInstagram,
  getReelUrl,
  getReelTitle,
  findInstagramActionBar,
  createActionBarDownloadButton,
  INSTAGRAM_DOWNLOAD_MENU_ATTR
} from '../shared.js';

const MENU_ATTR = INSTAGRAM_DOWNLOAD_MENU_ATTR;

export default {
  id: 'instagram-reels-mp3',
  label: 'Instagram Reels MP3',
  description: 'Instagram reels paylaşım paneline MP3 indir kısayolu ekler.',
  matches: isInstagram,
  apply: () => () => {}
};
