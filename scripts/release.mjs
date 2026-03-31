import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const manifestPath = join(rootDir, 'extension/manifest.json');
const changelogPath = join(rootDir, 'CHANGELOG.md');

/* ── Argument parsing ───────────────────────────────────────────── */
const bump = process.argv[2];
if (!bump || !['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage: yarn release <patch|minor|major>');
  process.exit(1);
}

/* ── Read current version ───────────────────────────────────────── */
const manifestRaw = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
const current = manifest.version;
const [major, minor, patch] = current.split('.').map(Number);

/* ── Compute new version ────────────────────────────────────────── */
let newVersion;
if (bump === 'major') {
  newVersion = `${major + 1}.0.0`;
} else if (bump === 'minor') {
  newVersion = `${major}.${minor + 1}.0`;
} else {
  newVersion = `${major}.${minor}.${patch + 1}`;
}

/* ── Update manifest.json ───────────────────────────────────────── */
const updatedManifest = manifestRaw.replace(/"version":\s*"[^"]*"/, `"version": "${newVersion}"`);
writeFileSync(manifestPath, updatedManifest, 'utf8');
console.log(`\u2713 manifest.json: ${current} \u2192 ${newVersion}`);

/* ── Gather commits since last tag ──────────────────────────────── */
let lastTag = '';
try {
  lastTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
} catch {
  /* no tags yet — use full history */
}

let commits = [];
try {
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';
  const log = execSync(`git log ${range} --oneline --no-merges`, { encoding: 'utf8' }).trim();
  if (log) {
    commits = log.split('\n').map((line) => {
      const spaceIdx = line.indexOf(' ');
      return spaceIdx > 0 ? line.slice(spaceIdx + 1) : line;
    });
  }
} catch {
  /* git log failed — proceed with empty list */
}

/* ── Group commits by conventional commit type ──────────────────── */
const groups = { Features: [], Fixes: [], Other: [] };
const prefixMap = {
  feat: 'Features',
  fix: 'Fixes',
  perf: 'Features',
};

for (const msg of commits) {
  const match = msg.match(/^(\w+)(?:\(.*?\))?:\s*(.+)/);
  if (match) {
    const type = match[1].toLowerCase();
    const text = match[2].trim();
    const group = prefixMap[type] || 'Other';
    groups[group].push(text);
  } else {
    groups['Other'].push(msg);
  }
}

/* ── Build changelog section ────────────────────────────────────── */
const lines = [`## ${newVersion}`, ''];
for (const [heading, items] of Object.entries(groups)) {
  if (items.length === 0) continue;
  lines.push(`### ${heading}`, '');
  for (const item of items) {
    lines.push(`- ${item}`);
  }
  lines.push('');
}

const newSection = lines.join('\n');

/* ── Prepend to CHANGELOG.md ────────────────────────────────────── */
const changelog = readFileSync(changelogPath, 'utf8');
const headerEnd = changelog.indexOf('\n\n');
if (headerEnd === -1) {
  writeFileSync(changelogPath, `${changelog.trimEnd()}\n\n${newSection}\n`, 'utf8');
} else {
  const header = changelog.slice(0, headerEnd);
  const rest = changelog.slice(headerEnd);
  writeFileSync(changelogPath, `${header}\n\n${newSection}${rest}`, 'utf8');
}
console.log(`\u2713 CHANGELOG.md: added section for ${newVersion}`);

/* ── Summary ────────────────────────────────────────────────────── */
console.log('');
console.log(`  New version: ${newVersion}`);
console.log(`  Commits:     ${commits.length}`);
console.log('');
console.log('Next steps:');
console.log('  1. Review and edit CHANGELOG.md');
console.log(`  2. git add -A && git commit -m "chore: release v${newVersion}"`);
console.log(`  3. git tag v${newVersion}`);
console.log(`  4. git push origin main --tags`);
