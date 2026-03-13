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

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const srcDir = join(rootDir, 'extension');
const destDir = join(rootDir, process.env.AIO_DEST_DIR || 'extension-dist');
const isDevBrand = process.env.AIO_DEV_BRAND === '1';

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

  applyDevBranding();
}

function copyDir(relDir) {
  const src = join(srcDir, relDir);
  const dest = join(destDir, relDir);
  try {
    if (!existsSync(src)) return;
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, {
      recursive: true,
      force: true,
      filter: (p) => !p.endsWith('.DS_Store')
    });
    console.log(`[watch-static] copied dir: ${relDir}`);
  } catch (err) {
    console.error(`[watch-static] failed to copy dir ${relDir}:`, err.message);
  }

  applyDevBranding();
}

function applyDevBranding() {
  if (!isDevBrand) return;

  const localeFiles = ['en', 'tr'].map((locale) => join(destDir, '_locales', locale, 'messages.json'));

  for (const localePath of localeFiles) {
    if (!existsSync(localePath)) continue;
    const messages = JSON.parse(readFileSync(localePath, 'utf8'));
    if (messages.extName?.message) {
      messages.extName.message = messages.extName.message.replace(/\s+Dev$/, '');
      messages.extName.message = `${messages.extName.message} Dev`;
    }
    if (messages.extDescription?.message) {
      messages.extDescription.message = messages.extDescription.message.replace(/\s+\[Dev Build\]$/, '');
      messages.extDescription.message = `${messages.extDescription.message} [Dev Build]`;
    }
    writeFileSync(localePath, `${JSON.stringify(messages, null, 2)}\n`);
  }

  const popupPath = join(destDir, 'popup', 'popup.html');
  if (existsSync(popupPath)) {
    let popupHtml = readFileSync(popupPath, 'utf8');
    popupHtml = popupHtml.replace('All-in-One Toolkit Dev</title>', 'All-in-One Toolkit</title>');
    popupHtml = popupHtml.replace('All-in-One Toolkit Dev</h1>', 'All-in-One Toolkit</h1>');
    popupHtml = popupHtml.replace('All-in-One Toolkit</title>', 'All-in-One Toolkit Dev</title>');
    popupHtml = popupHtml.replace('All-in-One Toolkit</h1>', 'All-in-One Toolkit Dev</h1>');
    writeFileSync(popupPath, popupHtml);
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
  copy(relPath);
}

for (const relDir of watchedDirs) {
  copyDir(relDir);
}

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
