/**
 * Copies static assets from extension/ to extension-dist/ after TypeScript compilation.
 *
 * Static assets include:
 *   - manifest.json
 *   - popup/popup.html, popup/popup.css
 *   - icons/
 *   - _locales/
 *   - PRIVACY_POLICY.md, terms.md
 *   - features/<platform>/shared.js  (fragile DOM files kept as plain JS)
 *   - features/youtube/shared.d.ts, features/instagram/shared.d.ts, etc. (excluded — only for TS)
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const srcDir = join(rootDir, 'extension');
const destDir = join(rootDir, process.env.AIO_DEST_DIR || 'extension-dist');
const isDevBrand = process.env.AIO_DEV_BRAND === '1';

mkdirSync(destDir, { recursive: true });

function copyFile(relPath) {
  const src = join(srcDir, relPath);
  const dest = join(destDir, relPath);
  if (!existsSync(src)) {
    console.warn(`[copy-static] Skipping missing: ${relPath}`);
    return;
  }
  // Ensure parent dir exists
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`[copy-static] Copied: ${relPath}`);
}

function copyDir(relPath, filter) {
  const src = join(srcDir, relPath);
  const dest = join(destDir, relPath);
  if (!existsSync(src)) {
    console.warn(`[copy-static] Skipping missing dir: ${relPath}`);
    return;
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: filter ?? ((p) => !p.endsWith('.DS_Store')),
  });
  console.log(`[copy-static] Copied dir: ${relPath}`);
}

function applyDevBranding() {
  if (!isDevBrand) return;

  const localeFiles = ['en', 'tr'].map((locale) =>
    join(destDir, '_locales', locale, 'messages.json'),
  );

  for (const localePath of localeFiles) {
    if (!existsSync(localePath)) continue;
    const messages = JSON.parse(readFileSync(localePath, 'utf8'));
    if (messages.extName?.message) {
      messages.extName.message = `${messages.extName.message} Dev`;
    }
    if (messages.extDescription?.message && !/\bdev\b/i.test(messages.extDescription.message)) {
      messages.extDescription.message = `${messages.extDescription.message} [Dev Build]`;
    }
    writeFileSync(localePath, `${JSON.stringify(messages, null, 2)}\n`);
  }

  const popupPath = join(destDir, 'popup', 'popup.html');
  if (existsSync(popupPath)) {
    const popupHtml = readFileSync(popupPath, 'utf8')
      .replace('All-in-One Toolkit</title>', 'All-in-One Toolkit Dev</title>')
      .replace('All-in-One Toolkit</h1>', 'All-in-One Toolkit Dev</h1>');
    writeFileSync(popupPath, popupHtml);
  }

  console.log('[copy-static] Applied dev branding');
}

// Root static files
copyFile('manifest.json');
copyFile('PRIVACY_POLICY.md');
copyFile('terms.md');

// Static directories
copyDir('icons');
copyDir('_locales');

// Popup static files (HTML + CSS only; popup.js comes from tsc)
copyFile('popup/popup.html');
copyFile('popup/popup.css');

// Fragile shared DOM files (plain JS, not compiled by tsc)
copyFile('features/youtube/shared.js');
copyFile('features/instagram/shared.js');
copyFile('features/twitter/shared.js');

applyDevBranding();

console.log('[copy-static] Done.');
