import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const sourceDir = process.env.AIO_SOURCE_DIR || 'extension';
const manifest = JSON.parse(readFileSync(join(rootDir, 'extension/manifest.json'), 'utf8'));
const version = manifest.version;
const rawSuffix = process.env.AIO_PACKAGE_SUFFIX || '';
const suffix = rawSuffix ? `-${rawSuffix.replace(/[^a-z0-9._-]+/gi, '-')}` : '';
const layout = process.env.AIO_PACKAGE_LAYOUT || 'nested';
const unpackedFolderName = process.env.AIO_UNPACKED_FOLDER_NAME || 'All-in-One Toolkit';
const artifactDir = join(rootDir, 'artifacts');
const artifactName =
  layout === 'flat'
    ? `all-in-one-toolkit-unpacked-v${version}${suffix}.zip`
    : `all-in-one-toolkit-v${version}${suffix}.zip`;
const artifactPath = join(artifactDir, artifactName);

mkdirSync(artifactDir, { recursive: true });
rmSync(artifactPath, { force: true });

const stagingRoot = mkdtempSync(join(tmpdir(), 'aio-extension-'));

if (!['nested', 'flat'].includes(layout)) {
  throw new Error(`Unsupported AIO_PACKAGE_LAYOUT: ${layout}`);
}

const resolvedSourceDir = join(rootDir, sourceDir);

if (layout === 'flat') {
  const stagingExtensionDir = join(stagingRoot, unpackedFolderName);
  mkdirSync(stagingExtensionDir, { recursive: true });

  for (const entry of readdirSync(resolvedSourceDir)) {
    cpSync(join(resolvedSourceDir, entry), join(stagingExtensionDir, entry), {
      recursive: true,
      force: true,
      filter: (sourcePath) => !sourcePath.endsWith('.DS_Store') && !sourcePath.endsWith('.ts'),
    });
  }

  writeFileSync(
    join(stagingExtensionDir, 'INSTALL.txt'),
    [
      'All-in-One Toolkit - Unpacked Installation',
      '',
      '1. Extract this zip to a permanent folder.',
      '2. Open chrome://extensions',
      '3. Enable Developer mode.',
      '4. Click Load unpacked.',
      '5. Select the "All-in-One Toolkit" folder that contains manifest.json.',
      '',
      'Update:',
      '- Download the newest unpacked zip.',
      '- Extract it over the same "All-in-One Toolkit" folder.',
      '- Open chrome://extensions and click Reload.',
    ].join('\n'),
  );
} else {
  const stagingExtensionDir = join(stagingRoot, 'extension');
  cpSync(resolvedSourceDir, stagingExtensionDir, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !sourcePath.endsWith('.DS_Store') && !sourcePath.endsWith('.ts'),
  });
}

const zipTargets = layout === 'flat' ? [unpackedFolderName] : ['extension'];
const zipResult = spawnSync('zip', ['-rq', artifactPath, ...zipTargets], {
  cwd: stagingRoot,
  encoding: 'utf8',
});

rmSync(stagingRoot, { recursive: true, force: true });

if (zipResult.status !== 0) {
  throw new Error(zipResult.stderr || zipResult.stdout || 'zip command failed');
}

if (!existsSync(artifactPath)) {
  throw new Error(`Package output was not created: ${artifactPath}`);
}

console.log(`Created ${artifactName}`);
