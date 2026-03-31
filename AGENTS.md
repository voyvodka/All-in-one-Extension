# AGENTS.md — All-in-One Extension

> Guidelines for AI coding agents operating in this repository.

## Project Overview

Chrome MV3 extension that adds download buttons to YouTube, Instagram, and Twitter/X.
Source is **TypeScript** (`strict: true`). A `tsc` compile step produces runtime JS in `extension-dist/`. Chrome loads `extension-dist/`, not `extension/`.

## Commands

```bash
yarn dev                 # Watch mode (tsc --watch + static file watcher)
yarn build               # One-shot compile TS + copy static assets → extension-dist/
yarn build:check         # Type-check only (no emit)
yarn verify              # build:check + lint + format:check + validate:manifest + check:repo
yarn lint                # ESLint check
yarn lint:fix            # ESLint auto-fix
yarn format              # Prettier format all files
yarn format:check        # Prettier check (CI gate)
yarn validate:manifest   # Validate manifest.json structure
yarn check:repo          # Repo hygiene (no .DS_Store, no secrets, etc.)
yarn package:extension   # Build + package .zip into artifacts/
yarn release:verify      # Verify version/tag/changelog alignment
```

TypeScript compiler (`tsc`) is the type-checker. There is no test runner. ESLint and Prettier are configured.
Syntax-check a compiled file manually: `node --check extension-dist/<file>`.

## Architecture

```
extension/                             # TypeScript source
├── manifest.json                      # MV3 manifest, version source of truth
├── content.ts                         # Content-script bootstrap (dynamic import per feature)
├── background/
│   ├── index.ts                       # Service-worker message router (contract-driven)
│   ├── downloads/                     # Job store, zip builder
│   ├── instagram-analyzer/            # Scan orchestration, IndexedDB durable storage
│   │   ├── index.ts                   # Scan job runner, message handlers
│   │   └── db.ts                      # IndexedDB persistence for large payloads
│   ├── providers/                     # External API adapters (loaderTo)
│   └── utils.ts
├── features/
│   ├── index.ts                       # Re-exports from central registry
│   ├── youtube/  instagram/  twitter/
│   │   ├── shared.js                  # DOM injection + MutationObserver (FRAGILE — see below)
│   │   └── shared.d.ts               # TypeScript declarations for the fragile .js
│   ├── yt-audio-download/content/index.ts
│   ├── yt-video-download/content/index.ts
│   ├── youtube-download/background/index.ts
│   ├── ig-audio-download/content/index.ts
│   ├── ig-video-download/content/index.ts
│   ├── ig-image-download/{content,background}/index.ts
│   ├── ig-unfollowers/content/
│   │   ├── index.ts                   # Compact analyzer drawer (launcher, scan, results, whitelist, history)
│   │   └── dashboard.ts              # Full-screen analytics dashboard (KPI, charts, compare, user list, hover cards)
│   ├── instagram-download/background/index.ts
│   ├── x-audio-download/content/index.ts
│   ├── x-video-download/content/index.ts
│   ├── x-image-download/content/index.ts
│   └── twitter-download/background/index.ts
├── popup/
│   ├── popup.html / popup.ts / popup.css
│   └── model/                         # View-model + theme-model (pure functions)
└── shared/
    ├── contracts/
    │   ├── message-types.ts           # MESSAGE_TYPES — single source of truth
    │   └── feature-registry.ts        # featureDescriptors — feature metadata
    ├── storage.ts                     # chrome.storage wrapper
    └── i18n.ts                        # Inline TR/EN dictionary

extension-dist/                        # Compiled output (gitignored) — Chrome loads this
scripts/                               # Node utility scripts (.mjs)
docs/                                  # ARCHITECTURE.md, RELEASE.md
```

### Build Pipeline

1. `tsc` compiles `extension/**/*.ts` → `extension-dist/**/*.js`
2. `scripts/copy-static.mjs` copies static assets (manifest, HTML, CSS, icons, locales, fragile `.js` files) to `extension-dist/`
3. Chrome loads `extension-dist/` via "Load unpacked"

### Fragile Files — Do NOT Modify Without Extreme Care

- `extension/features/instagram/shared.js` (~1162 lines) — menu injection, scope detection, media extraction
- `extension/features/twitter/shared.js` (~651 lines) — tweet action bar injection
- `extension/features/youtube/shared.js` (~232 lines) — share panel injection

These files stay as plain JavaScript with `.d.ts` declarations. They depend on live DOM selectors that break with site updates.

## Code Style

### Language & Modules

- **TypeScript** for all source files, **strict mode** enabled.
- **Plain JavaScript** only for the three fragile DOM files (with companion `.d.ts`).
- **ES Modules everywhere** — `import`/`export`, never `require()`.
- Always include the `.js` extension in relative imports (TypeScript resolves `.js` to `.ts` at compile time).
- Node scripts use `.mjs` extension and `node:` protocol for built-ins (`import fs from 'node:fs'`).

### Formatting

- **2-space indentation**, no tabs.
- **Semicolons required** on every statement.
- **Single quotes** for JS/TS strings; double quotes only in HTML attributes.
- Template literals for interpolation.

### Naming

| Element               | Convention         | Example                                        |
| --------------------- | ------------------ | ---------------------------------------------- |
| Variables / functions | `camelCase`        | `safeSendMessage`, `downloadJob`               |
| Constants             | `UPPER_SNAKE_CASE` | `MESSAGE_TYPES`, `DOWNLOAD_HISTORY_LIMIT`      |
| File names            | `kebab-case`       | `message-types.ts`, `download-view-model.ts`   |
| Feature directories   | `kebab-case`       | `features/youtube/audio/`                      |
| CSS classes           | `kebab-case`       | `.download-card`, `.tab-active`                |
| Interfaces / Types    | `PascalCase`       | `Settings`, `DownloadJob`, `FeatureDescriptor` |

### Functions

- Arrow functions for callbacks and inline helpers: `items.map((x) => x.id)`.
- `function` declarations for top-level named functions.
- Feature modules export a default object: `export default { id, label, description, matches, apply }`.
- Shared/utility modules use named exports.

### TypeScript Specifics

- **No `any`** unless absolutely necessary — prefer `unknown` and narrow.
- Use `import type` for type-only imports (avoids runtime overhead).
- Exception: `content.ts` uses `type X = import('...').X` syntax instead of `import type` to avoid `export {}` in compiled output (content scripts cannot have top-level exports).
- Interfaces for object shapes (`interface Settings { ... }`), type aliases for unions (`type Locale = 'tr' | 'en'`).
- Prefer `as` casts only at runtime boundaries (message payloads). Add runtime validation alongside casts where possible.

### Error Handling

- Wrap Chrome API calls in `try/catch`.
- Always check `chrome.runtime.lastError` in callback-based Chrome APIs.
- Return `{ success: false, error: ... }` from background handlers on failure.
- Use defensive coding: optional chaining (`?.`), guard clauses, early returns, fallback values.

### Contracts

- **Never use raw string literals for message types.** Always import from `shared/contracts/message-types.ts`:
  ```ts
  import { MESSAGE_TYPES } from '../../shared/contracts/message-types.js';
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.YT_AUDIO_DOWNLOAD, ... });
  ```
- **Feature metadata lives in `shared/contracts/feature-registry.ts`** — `featureDescriptors`, `contentFeatureDescriptors`, `getFeatureDescriptor()`.
- When adding a new feature: add its message type to `message-types.ts`, add its descriptor to `feature-registry.ts`, register its handler in `background/index.ts`.

### Chrome Extension Patterns

- Content scripts load feature modules dynamically via `import(chrome.runtime.getURL(...))`.
- Background service worker dispatches messages through a `messageHandlers` map keyed by `MESSAGE_TYPES`.
- Download flow: content sends message → background handler creates job → calls provider → starts `chrome.downloads.download` → updates job state on `onChanged`.
- `safeSendMessage` pattern wraps `chrome.runtime.sendMessage` with error suppression for context invalidation.
- Instagram Analyzer uses two independent content-side UIs: the compact drawer in `features/ig-unfollowers/content/index.ts` and the standalone dashboard overlay in `features/ig-unfollowers/content/dashboard.ts`.
- Large Instagram Analyzer payloads should stay out of `chrome.storage.local`; keep summaries in storage and use the background durable-account flow for full results/history arrays.

## Commit Messages

Follow conventional-ish style:

```
feat(youtube): add quality selector to video download
fix(instagram): stabilize action bar injection
refactor: centralize message types into contracts
chore: update gitignore for artifacts
docs: add architecture overview
```

Format: `<type>(<scope>): <description>` — scope is optional.
Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `ci`.

## Important Rules

1. **Always run `yarn build` before testing in Chrome** — Chrome loads `extension-dist/`, not `extension/`.
2. **Do not reference the `example/` directory** in any runtime code, manifest, or docs. It's gitignored local test data.
3. **All new web-accessible files** must be added to `web_accessible_resources` in `manifest.json`.
4. **Use Yarn** (not npm/pnpm) for dependency management and scripts.
5. **Do not add AGENTS.md to `.gitignore`** — it is part of the repo.
6. **Preserve runtime behavior** — all refactoring must keep the extension functional.
7. **Manifest version** (`extension/manifest.json`) is the single version source of truth. Bump it for release-worthy changes.
8. **Update CHANGELOG.md** for user-facing changes.
9. **i18n**: both `tr` and `en` keys must stay in sync in `shared/i18n.ts`.
10. **No cross-layer imports** — content features must not import from `background/`, and vice versa. Use message passing.
11. **Keep manifest resources aligned** — any new content-side module imported at runtime (for example `features/ig-unfollowers/content/dashboard.js`) must also be reachable through `web_accessible_resources` in `manifest.json`.
