/**
 * Watches static assets in extension/ and copies them to extension-dist/ on change.
 * Runs alongside `tsc --watch` during development.
 *
 * Watched paths:
 *   - extension/manifest.json
 *   - extension/popup/popup.html
 *   - extension/popup/popup.css
 *   - extension/features/youtube/shared.js
 *   - extension/features/instagram/shared.js
 *   - extension/features/twitter/shared.js
 *   - extension/icons/  (recursive)
 *   - extension/_locales/ (recursive)
 */

import { copyFileSync, mkdirSync, watch } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const srcDir = join(rootDir, 'extension');
const destDir = join(rootDir, 'extension-dist');

function copy(relPath) {
  const src = join(srcDir, relPath);
  const dest = join(destDir, relPath);
  try {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    console.log(`[watch-static] copied: ${relPath}`);
  } catch (err) {
    console.error(`[watch-static] failed to copy ${relPath}:`, err.message);
  }
}

// Individual files to watch
const watchedFiles = [
  'manifest.json',
  'popup/popup.html',
  'popup/popup.css',
  'features/youtube/shared.js',
  'features/instagram/shared.js',
  'features/twitter/shared.js',
];

// Directories to watch recursively
const watchedDirs = [
  'icons',
  '_locales',
];

// Watch individual files
for (const relPath of watchedFiles) {
  const absPath = join(srcDir, relPath);
  watch(absPath, () => copy(relPath));
}

// Watch directories recursively
for (const relDir of watchedDirs) {
  const absDir = join(srcDir, relDir);
  watch(absDir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const relPath = join(relDir, filename);
    copy(relPath);
  });
}

console.log('[watch-static] Watching static assets...');
console.log('[watch-static] Files:', watchedFiles.join(', '));
console.log('[watch-static] Dirs:', watchedDirs.join(', '));
console.log('[watch-static] Press Ctrl+C to stop.\n');
