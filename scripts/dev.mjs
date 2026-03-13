/**
 * Development runner — starts tsc --watch and watch-static.mjs in parallel.
 * No external dependencies required.
 *
 * Usage: node scripts/dev.mjs
 *   or:  yarn dev
 *
 * Both processes share the same stdout/stderr (inherited).
 * Ctrl+C kills both.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const destDir = process.env.AIO_DEST_DIR || 'extension-dist';
const isDevBrand = process.env.AIO_DEV_BRAND === '1';

/** @param {import('node:child_process').ChildProcess} proc */
function attachExitHandler(proc, name) {
  proc.on('exit', (code, signal) => {
    if (signal) {
      // Killed by signal (e.g. Ctrl+C propagation) — normal shutdown
      return;
    }
    if (code !== 0) {
      console.error(`[dev] "${name}" exited with code ${code}`);
      process.exit(code ?? 1);
    }
  });
}

// ── tsc --watch ──────────────────────────────────────────────────────────────
// Resolve tsc directly from node_modules so SIGINT/SIGTERM propagates correctly
// without a yarn/shell wrapper in between.
const tscBin = resolve(rootDir, 'node_modules', '.bin', 'tsc');

const tsc = spawn(
  tscBin,
  ['--project', 'tsconfig.json', '--outDir', destDir, '--watch', '--preserveWatchOutput'],
  {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
  }
);
attachExitHandler(tsc, 'tsc --watch');

// ── watch-static ─────────────────────────────────────────────────────────────
const watcher = spawn(
  'node',
  [resolve(scriptDir, 'watch-static.mjs')],
  {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      AIO_DEST_DIR: destDir,
      AIO_DEV_BRAND: isDevBrand ? '1' : '0'
    }
  }
);
attachExitHandler(watcher, 'watch-static');

// ── Ctrl+C → kill both ───────────────────────────────────────────────────────
function shutdown() {
  tsc.kill('SIGTERM');
  watcher.kill('SIGTERM');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[dev] Started tsc --watch + watch-static -> ${destDir}${isDevBrand ? ' (dev brand)' : ''}. Press Ctrl+C to stop.\n`);
