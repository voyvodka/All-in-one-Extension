import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const manifest = JSON.parse(readFileSync(join(rootDir, 'extension/manifest.json'), 'utf8'));
const changelog = readFileSync(join(rootDir, 'CHANGELOG.md'), 'utf8');
const expectedTag = `v${manifest.version}`;
const currentTag = process.env.GITHUB_REF_NAME || '';

if (currentTag && currentTag !== expectedTag) {
  throw new Error(`Release tag ${currentTag} does not match manifest version ${expectedTag}.`);
}

if (!changelog.includes(`## ${manifest.version}`)) {
  throw new Error(`CHANGELOG.md must include a section for version ${manifest.version}.`);
}

console.log(`Release verification passed for ${expectedTag}.`);
