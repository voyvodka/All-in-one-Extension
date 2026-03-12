import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');

// Manifest lives in source; also check dist if available
const manifestPath = join(rootDir, 'extension/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Feature registry: prefer compiled .js in dist, fallback to source .ts regex
const featureRegistryDistPath = join(rootDir, 'extension-dist/shared/contracts/feature-registry.js');
const featureRegistrySrcPath = join(rootDir, 'extension/shared/contracts/feature-registry.ts');
const featureRegistryFallbackPath = join(rootDir, 'extension/shared/contracts/feature-registry.js');

let featureRegistrySource = '';
if (existsSync(featureRegistryDistPath)) {
  featureRegistrySource = readFileSync(featureRegistryDistPath, 'utf8');
} else if (existsSync(featureRegistrySrcPath)) {
  featureRegistrySource = readFileSync(featureRegistrySrcPath, 'utf8');
} else if (existsSync(featureRegistryFallbackPath)) {
  featureRegistrySource = readFileSync(featureRegistryFallbackPath, 'utf8');
} else {
  throw new Error('Cannot find feature-registry source/dist for validation.');
}

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

const registryModulePaths = Array.from(
  featureRegistrySource.matchAll(/modulePath:\s*['"]([^'"]+)['"]/g),
  (match) => match[1]
);

if (!registryModulePaths.length) {
  throw new Error('Feature registry must declare at least one modulePath.');
}

// Check paths against manifest and dist (compiled) files
const distDir = join(rootDir, 'extension-dist');
const srcDir = join(rootDir, 'extension');
const distAvailable = existsSync(distDir);

for (const modulePath of registryModulePaths) {
  if (!resources.includes(modulePath)) {
    throw new Error(`Manifest web_accessible_resources is missing feature module: ${modulePath}`);
  }

  // Check disk: prefer dist, fallback to src
  const distPath = join(distDir, modulePath);
  const srcPath = join(srcDir, modulePath);
  const srcTsPath = srcPath.replace(/\.js$/, '.ts');

  if (distAvailable) {
    if (!existsSync(distPath)) {
      throw new Error(`Feature module not found in extension-dist: ${modulePath} — did you run yarn build?`);
    }
  } else {
    if (!existsSync(srcPath) && !existsSync(srcTsPath)) {
      throw new Error(`Feature registry module does not exist on disk: ${modulePath}`);
    }
  }
}

// Runtime file checks against dist (if built) or src
const requiredFiles = [
  'content.js',
  'background/index.js',
  'popup/popup.html',
  'shared/contracts/feature-registry.js',
  'shared/contracts/message-types.js'
];

for (const relPath of requiredFiles) {
  const distPath = join(distDir, relPath);
  const srcPath = join(srcDir, relPath);
  const srcTsPath = srcPath.replace(/\.js$/, '.ts');

  const exists =
    (distAvailable && existsSync(distPath)) ||
    existsSync(srcPath) ||
    existsSync(srcTsPath);

  if (!exists) {
    throw new Error(`Required runtime file is missing: ${relPath}`);
  }
}

console.log(`Manifest validation passed for version ${manifest.version}.`);
