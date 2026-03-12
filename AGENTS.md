# AGENTS.md — All-in-One Extension

> Guidelines for AI coding agents operating in this repository.

## Project Overview

Chrome MV3 extension that adds download buttons to YouTube, Instagram, and Twitter/X.
**Buildless** — no bundler, no transpiler. Pure ES modules served via `chrome.runtime.getURL()`.

## Commands

```bash
yarn verify              # Run all checks (manifest + repo hygiene)
yarn validate:manifest   # Validate manifest.json structure
yarn check:repo          # Repo hygiene (no .DS_Store, no secrets, etc.)
yarn package:extension   # Build .zip into artifacts/
yarn release:verify      # Verify version/tag/changelog alignment
```

There is **no linter, formatter, type-checker, or test runner** configured.
Syntax-check a file manually: `node --check <file>`.
No single-test command exists — there are no tests.

## Architecture

```
extension/
├── manifest.json              # MV3 manifest, version source of truth
├── content.js                 # Content-script bootstrap (dynamic import per feature)
├── background/
│   ├── index.js               # Service-worker message router (contract-driven)
│   ├── handlers/              # One handler file per platform (+ instagram-image.js)
│   ├── downloads/             # Job store, zip builder
│   ├── providers/             # External API adapters (loaderTo)
│   └── utils.js
├── features/
│   ├── index.js               # Re-exports from central registry
│   ├── youtube/  instagram/  twitter/
│   │   ├── shared.js          # DOM injection + MutationObserver (FRAGILE — see below)
│   │   ├── audio/index.js
│   │   ├── video/index.js
│   │   └── image/index.js     # (instagram, twitter only)
├── popup/
│   ├── popup.html / popup.js / popup.css
│   └── model/                 # View-model + theme-model (pure functions)
└── shared/
    ├── contracts/
    │   ├── message-types.js   # MESSAGE_TYPES — single source of truth
    │   └── feature-registry.js# featureDescriptors — feature metadata
    ├── storage.js             # chrome.storage wrapper
    └── i18n.js                # Inline TR/EN dictionary
scripts/                       # Node utility scripts (.mjs)
docs/                          # ARCHITECTURE.md, RELEASE.md, POPUP_REDESIGN.md
```

### Fragile Files — Do NOT Modify Without Extreme Care

- `extension/features/instagram/shared.js` (~1162 lines) — menu injection, scope detection, media extraction
- `extension/features/twitter/shared.js` (~651 lines) — tweet action bar injection
- `extension/features/youtube/shared.js` (~232 lines) — share panel injection

These files depend on live DOM selectors that break with site updates.

## Code Style

### Language & Modules

- **Plain JavaScript only** — no TypeScript, no JSX.
- **ES Modules everywhere** — `import`/`export`, never `require()`.
- Always include the `.js` extension in relative imports.
- Node scripts use `.mjs` extension and `node:` protocol for built-ins (`import fs from 'node:fs'`).

### Formatting

- **2-space indentation**, no tabs.
- **Semicolons required** on every statement.
- **Single quotes** for JS strings; double quotes only in HTML attributes.
- Template literals for interpolation.

### Naming

| Element                | Convention         | Example                          |
|------------------------|--------------------|----------------------------------|
| Variables / functions  | `camelCase`        | `safeSendMessage`, `downloadJob` |
| Constants              | `UPPER_SNAKE_CASE` | `MESSAGE_TYPES`, `DOWNLOAD_HISTORY_LIMIT` |
| File names             | `kebab-case`       | `message-types.js`, `download-view-model.js` |
| Feature directories    | `kebab-case`       | `features/youtube/audio/`        |
| CSS classes            | `kebab-case`       | `.download-card`, `.tab-active`  |

### Functions

- Arrow functions for callbacks and inline helpers: `items.map((x) => x.id)`.
- `function` declarations for top-level named functions.
- Feature modules export a default object: `export default { id, label, description, matches, apply }`.
- Shared/utility modules use named exports.

### Error Handling

- Wrap Chrome API calls in `try/catch`.
- Always check `chrome.runtime.lastError` in callback-based Chrome APIs.
- Return `{ success: false, error: ... }` from background handlers on failure.
- Use defensive coding: optional chaining (`?.`), guard clauses, early returns, fallback values.

### Contracts

- **Never use raw string literals for message types.** Always import from `shared/contracts/message-types.js`:
  ```js
  import { MESSAGE_TYPES } from '../../shared/contracts/message-types.js';
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.YT_AUDIO_DOWNLOAD, ... });
  ```
- **Feature metadata lives in `shared/contracts/feature-registry.js`** — `featureDescriptors`, `contentFeatureDescriptors`, `getFeatureDescriptor()`.
- When adding a new feature: add its message type to `message-types.js`, add its descriptor to `feature-registry.js`, register its handler in `background/index.js`.

### Chrome Extension Patterns

- Content scripts load feature modules dynamically via `import(chrome.runtime.getURL(...))`.
- Background service worker dispatches messages through a `messageHandlers` map keyed by `MESSAGE_TYPES`.
- Download flow: content sends message → background handler creates job → calls provider → starts `chrome.downloads.download` → updates job state on `onChanged`.
- `safeSendMessage` pattern wraps `chrome.runtime.sendMessage` with error suppression for context invalidation.

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

1. **Do not create bundler configs** — this is a buildless extension.
2. **Do not reference the `example/` directory** in any runtime code, manifest, or docs. It's gitignored local test data.
3. **All new web-accessible files** must be added to `web_accessible_resources` in `manifest.json`.
4. **Use Yarn** (not npm/pnpm) for dependency management and scripts.
5. **Do not add AGENTS.md to `.gitignore`** — it is part of the repo.
6. **Preserve runtime behavior** — all refactoring must keep the extension functional.
7. **Manifest version** (`extension/manifest.json`) is the single version source of truth. Bump it for release-worthy changes.
8. **Update CHANGELOG.md** for user-facing changes.
9. **i18n**: both `tr` and `en` keys must stay in sync in `shared/i18n.js`.
10. **No cross-layer imports** — content features must not import from `background/`, and vice versa. Use message passing.
