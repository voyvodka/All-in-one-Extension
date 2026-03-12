import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');

const requiredFiles = [
  'README.md',
  'CHANGELOG.md',
  'docs/ARCHITECTURE.md',
  'docs/RELEASE.md',
  'docs/POPUP_REDESIGN.md',
  'extension/PRIVACY_POLICY.md',
  'extension/terms.md'
];

for (const relativePath of requiredFiles) {
  const absolutePath = join(rootDir, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
}

const privacyPolicy = readFileSync(join(rootDir, 'extension/PRIVACY_POLICY.md'), 'utf8').trim();
const terms = readFileSync(join(rootDir, 'extension/terms.md'), 'utf8').trim();
if (privacyPolicy === terms) {
  throw new Error('Terms document must not duplicate the privacy policy.');
}

const blockedFileNames = new Set(['.DS_Store']);
const ignoredDirs = new Set(['.git', 'node_modules', 'artifacts', 'example']);
const blockedPathPatterns = [
  /(^|\/)\.env(\..+)?$/,
  /(^|\/)credentials(\..+)?\.json$/i,
  /(^|\/)service-account(\..+)?\.json$/i,
  /\.pem$/i,
  /\.p12$/i
];

function walk(dirPath) {
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    if (ignoredDirs.has(entry)) continue;

    const absolutePath = join(dirPath, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      walk(absolutePath);
      continue;
    }

    if (blockedFileNames.has(entry)) {
      throw new Error(`Blocked file detected: ${absolutePath.replace(`${rootDir}/`, '')}`);
    }

    const relativePath = absolutePath.replace(`${rootDir}/`, '');
    if (blockedPathPatterns.some((pattern) => pattern.test(relativePath))) {
      throw new Error(`Potential secret file detected: ${relativePath}`);
    }
  }
}

walk(rootDir);
console.log('Repository checks passed.');
