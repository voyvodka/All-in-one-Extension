import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const manifest = JSON.parse(readFileSync(join(rootDir, 'extension/manifest.json'), 'utf8'));
const version = manifest.version;
const rawSuffix = process.env.AIO_PACKAGE_SUFFIX || '';
const suffix = rawSuffix ? `-${rawSuffix.replace(/[^a-z0-9._-]+/gi, '-')}` : '';
const layout = process.env.AIO_PACKAGE_LAYOUT || 'nested';
const artifactDir = join(rootDir, 'artifacts');
const artifactName = layout === 'flat'
  ? `all-in-one-toolkit-unpacked-v${version}${suffix}.zip`
  : `all-in-one-toolkit-v${version}${suffix}.zip`;
const artifactPath = join(artifactDir, artifactName);

mkdirSync(artifactDir, { recursive: true });
rmSync(artifactPath, { force: true });

const stagingRoot = mkdtempSync(join(tmpdir(), 'aio-extension-'));

if (!['nested', 'flat'].includes(layout)) {
  throw new Error(`Unsupported AIO_PACKAGE_LAYOUT: ${layout}`);
}

if (layout === 'flat') {
  const sourceDir = join(rootDir, 'extension');
  for (const entry of readdirSync(sourceDir)) {
    cpSync(join(sourceDir, entry), join(stagingRoot, entry), {
      recursive: true,
      force: true,
      filter: (sourcePath) => !sourcePath.endsWith('.DS_Store')
    });
  }

  writeFileSync(join(stagingRoot, 'INSTALL.txt'), [
    'All-in-One Toolkit - Unpacked Installation',
    '',
    '1. Extract this zip to a permanent folder.',
    '2. Open chrome://extensions',
    '3. Enable Developer mode.',
    '4. Click Load unpacked.',
    '5. Select the extracted folder that contains manifest.json.'
  ].join('\n'));
} else {
  const stagingExtensionDir = join(stagingRoot, 'extension');
  cpSync(join(rootDir, 'extension'), stagingExtensionDir, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !sourcePath.endsWith('.DS_Store')
  });
}

const zipTargets = layout === 'flat' ? ['.'] : ['extension'];
const zipResult = spawnSync('zip', ['-rq', artifactPath, ...zipTargets], {
  cwd: stagingRoot,
  encoding: 'utf8'
});

rmSync(stagingRoot, { recursive: true, force: true });

if (zipResult.status !== 0) {
  throw new Error(zipResult.stderr || zipResult.stdout || 'zip command failed');
}

if (!existsSync(artifactPath)) {
  throw new Error(`Package output was not created: ${artifactPath}`);
}

console.log(`Created ${artifactName}`);
