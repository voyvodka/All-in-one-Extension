import { createInterface } from 'node:readline';
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
const firstVersion = changelog.indexOf('\n## ');
if (firstVersion === -1) {
  writeFileSync(changelogPath, `${changelog.trimEnd()}\n\n${newSection}\n`, 'utf8');
} else {
  const before = changelog.slice(0, firstVersion);
  const rest = changelog.slice(firstVersion);
  writeFileSync(changelogPath, `${before}\n\n${newSection}${rest}`, 'utf8');
}
console.log(`\u2713 CHANGELOG.md: added section for ${newVersion}`);

/* ── Show summary and confirm ───────────────────────────────────── */
console.log('');
console.log(`  Version : ${current} \u2192 ${newVersion}`);
console.log(`  Commits : ${commits.length}`);
console.log('');
console.log('This will: commit all changes, create tag, and push to origin.');
console.log('Review CHANGELOG.md now if needed. Press Enter to continue, Ctrl+C to abort.');

const rl = createInterface({ input: process.stdin, output: process.stdout });
await new Promise((resolve) => rl.question('', resolve));
rl.close();

/* ── Commit + tag + push ────────────────────────────────────────── */
const run = (cmd) => {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
};

run('yarn format');
run('yarn verify');
run('git add -A');
run(`git commit -m "chore: release v${newVersion}"`);
run(`git tag v${newVersion}`);
run('git push origin main --tags');

/* ── Extract release notes from CHANGELOG.md ────────────────────── */
const updatedChangelog = readFileSync(changelogPath, 'utf8');
const sectionStart = updatedChangelog.indexOf(`## ${newVersion}`);
if (sectionStart !== -1) {
  const contentStart = updatedChangelog.indexOf('\n', sectionStart) + 1;
  const nextSection = updatedChangelog.indexOf('\n## ', contentStart);
  const notes = (
    nextSection === -1
      ? updatedChangelog.slice(contentStart)
      : updatedChangelog.slice(contentStart, nextSection)
  ).trim();

  if (notes) {
    console.log('  $ gh release edit ...');
    try {
      execSync(`gh release edit v${newVersion} --notes ${JSON.stringify(notes)}`, {
        cwd: rootDir,
        stdio: 'inherit',
      });
      console.log(`\u2713 Release notes added to v${newVersion}`);
    } catch {
      console.warn('  (release notes could not be added — update manually on GitHub)');
    }
  }
}

console.log('');
console.log(`\u2713 v${newVersion} released and pushed.`);
