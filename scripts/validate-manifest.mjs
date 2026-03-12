import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const manifestPath = join(rootDir, 'extension/manifest.json');
const featureRegistryPath = join(rootDir, 'extension/shared/contracts/feature-registry.js');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const featureRegistrySource = readFileSync(featureRegistryPath, 'utf8');

if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) {
  throw new Error(`Manifest version must use SemVer: ${manifest.version}`);
}

if (!manifest.homepage_url) {
  throw new Error('Manifest homepage_url is required.');
}

if (manifest.background?.service_worker !== 'background/index.js') {
  throw new Error('Manifest background service worker must point to background/index.js.');
}

if (!Array.isArray(manifest.content_scripts) || !manifest.content_scripts.length) {
  throw new Error('Manifest must define at least one content script.');
}

const resources = manifest.web_accessible_resources?.flatMap((entry) => entry.resources || []) || [];
const requiredResources = [
  'features/index.js',
  'shared/storage.js',
  'shared/i18n.js',
  'shared/contracts/feature-registry.js',
  'shared/contracts/message-types.js'
];

for (const resource of requiredResources) {
  if (!resources.includes(resource)) {
    throw new Error(`Manifest web_accessible_resources is missing: ${resource}`);
  }
}

const registryModulePaths = Array.from(featureRegistrySource.matchAll(/modulePath:\s*'([^']+)'/g), (match) => match[1]);
if (!registryModulePaths.length) {
  throw new Error('Feature registry must declare at least one modulePath.');
}

for (const modulePath of registryModulePaths) {
  if (!resources.includes(modulePath)) {
    throw new Error(`Manifest web_accessible_resources is missing feature module: ${modulePath}`);
  }

  if (!existsSync(join(rootDir, 'extension', modulePath))) {
    throw new Error(`Feature registry module does not exist on disk: ${modulePath}`);
  }
}

const requiredFiles = [
  'extension/content.js',
  'extension/background/index.js',
  'extension/popup/popup.html',
  'extension/shared/contracts/feature-registry.js',
  'extension/shared/contracts/message-types.js'
];

for (const relativePath of requiredFiles) {
  if (!existsSync(join(rootDir, relativePath))) {
    throw new Error(`Required runtime file is missing: ${relativePath}`);
  }
}

console.log(`Manifest validation passed for version ${manifest.version}.`);
