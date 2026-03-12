# Architecture

## Build pipeline

Source code is TypeScript in `extension/`. A lightweight build step compiles to `extension-dist/`:

1. `tsc` compiles `extension/**/*.ts` → `extension-dist/**/*.js`
2. `scripts/copy-static.mjs` copies static assets (manifest, HTML, CSS, icons, locales, fragile `.js` files) → `extension-dist/`
3. Chrome loads `extension-dist/` via "Load unpacked"

Three fragile DOM integration files stay as plain JavaScript with companion `.d.ts` declarations:
- `extension/features/youtube/shared.js`
- `extension/features/instagram/shared.js`
- `extension/features/twitter/shared.js`

## Runtime surfaces

- `extension/content.ts` boots content-side features on supported domains.
- `extension/background/index.ts` is the message router and download orchestrator.
- `extension/popup/popup.ts` renders settings and download history in the popup.
- `extension/shared/*` contains cross-surface contracts and persistence helpers.

## Current structure

### Core contracts

- `extension/shared/contracts/message-types.ts` is the single source of truth for runtime message names.
- `extension/shared/contracts/feature-registry.ts` describes content features and their module paths.

### Features

- Content loading enters through feature-first paths such as `extension/features/yt-audio-download/content/index.ts`.
- Platform-specific shared DOM logic stays inside each platform folder:
  - `extension/features/youtube/shared.js` (+ `shared.d.ts`)
  - `extension/features/instagram/shared.js` (+ `shared.d.ts`)
  - `extension/features/twitter/shared.js` (+ `shared.d.ts`)

### Background

- `extension/background/index.ts` dispatches messages by contract with runtime validation of message payloads.
- Feature-first background entrypoints live under `extension/features/*/background/index.ts`.
- `extension/background/providers/loaderTo.ts` handles external API communication with adaptive polling.

### Popup

- `extension/popup/popup.ts` keeps event wiring.
- `extension/popup/model/download-view-model.ts` prepares card-ready download data.
- `extension/popup/model/theme-model.ts` owns theme resolution and system-theme syncing.

## Target direction

The next refactor stage should move toward feature-first folders where each feature can own:

- descriptor
- content behavior
- background behavior
- optional popup integration metadata

Suggested end-state shape:

```text
extension/
  core/
  features/
    youtube-audio-download/
    youtube-video-download/
    instagram-audio-download/
    instagram-video-download/
    instagram-image-download/
    twitter-audio-download/
    twitter-video-download/
    twitter-image-download/
  popup/
  providers/
```

## Popup redesign constraints

Any popup redesign must preserve these behaviors:

- active/history tabs
- sort toggle
- clear history action
- retry and cancel actions
- theme and language controls
- expandable download detail rows

UI changes are safe as long as the underlying data contract remains stable:

- `downloads.active`
- `downloads.history`
- job fields: `id`, `type`, `title`, `fileName`, `sourceUrl`, `mediaUrl`, `status`, `progress`, `downloadId`, `createdAt`, `updatedAt`, `error`

## Known refactor boundaries

- `extension/features/instagram/shared.js` is the riskiest DOM integration area.
- `extension/features/twitter/shared.js` also has fragile selector logic.
- `extension/manifest.json` must stay aligned with any content-side module moves.

## Risk hotspots and safe-change rules

### Instagram DOM and observer logic

- `extension/features/instagram/shared.js` mixes permalink detection, scope detection, menu injection, and observer timing heuristics in one place.
- The file depends on brittle live DOM details such as ARIA labels, action-bar structure, and dialog/article traversal.
- During refactors, avoid changing selectors, observer cadence, or insertion ordering unless the goal is a targeted Instagram bug fix.
- Safer approach: add thin adapters around it first, then move responsibility gradually.

### Popup and download job schema coupling

- `extension/popup/popup.ts` reads `downloads.active` and `downloads.history` directly from storage.
- The popup currently relies on job fields staying stable: `id`, `type`, `title`, `fileName`, `sourceUrl`, `mediaUrl`, `status`, `progress`, `downloadId`, `createdAt`, `updatedAt`, `error`.
- `extension/background/downloads/store.ts` is therefore part of the popup contract, not just background internals.
- To reduce risk, new popup presentation rules should be normalized in `extension/popup/model/download-view-model.ts` instead of spreading raw job field assumptions across the UI.

### Shared provider dependency: loader.to

- `extension/background/providers/loaderTo.ts` is a shared dependency for multiple audio/video download flows.
- Polling uses an adaptive strategy: normal attempts (~2 min) plus bonus attempts for init-phase statuses (~1 min extra).
- Keep provider-specific behavior isolated behind background handlers; avoid leaking provider response shapes into content features or popup logic.

### Manifest and registry drift

- Feature content modules are declared in `extension/shared/contracts/feature-registry.ts` and must remain reachable through `extension/manifest.json` `web_accessible_resources`.
- `scripts/validate-manifest.mjs` should be treated as the guardrail for this relationship.
- Any future feature move should update the registry first, then satisfy manifest validation before runtime testing.

## Safe bridge strategy for fragile shared DOM files

- `extension/features/youtube/shared.js`, `extension/features/instagram/shared.js`, and `extension/features/twitter/shared.js` should be treated as stable DOM boundaries during refactors.
- New behavior should be introduced through thin adapters around these files before any selector or observer logic is moved.
- DOM-facing changes should be smoke-tested manually in feed, modal, permalink, and action-menu contexts before release.
