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
- `extension/features/ig-unfollowers/content/index.ts` runs the compact analyzer drawer inside Instagram.
- `extension/features/ig-unfollowers/content/dashboard.ts` runs the standalone full-screen analytics dashboard inside Instagram (shadow DOM, independent of the drawer).

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

#### Instagram Analyzer

The analyzer is split into two independent UI surfaces that share the same storage and background scan infrastructure:

- **Compact drawer** (`extension/features/ig-unfollowers/content/index.ts`) — a fixed top-right launcher + side panel with scan controls, result list, whitelist management, and history detail. Stays small and always accessible.
- **Dashboard** (`extension/features/ig-unfollowers/content/dashboard.ts`) — a near-full-screen overlay opened via a separate "Dashboard" button in the launcher group. Single scrollable page layout with:
  - KPI cards (following, followers, non-followers, whitelisted) with sparklines and deltas
  - Trend line charts (following/followers over time, non-follower count over time)
  - Grouped bar chart (per-scan follow/unfollow/follower changes)
  - Quick compare section with scan picker and expandable diff lists
  - Searchable/paginated user list (non-followers, whitelist, following, followers)
  - Collapsible scan history with per-entry detail grid and "Compare this scan" action
  - Hover card on username links showing avatar, display name, verified/private/whitelist badges, and quick actions

Both surfaces mount into isolated shadow DOM hosts (`aio-instagram-analyzer-host`, `aio-ig-dashboard-host`) so they never conflict with Instagram's own DOM.

Storage is split:
- `chrome.storage.local` — lightweight account summaries, job state, whitelist, scan metadata
- `IndexedDB` (via background message `IG_ANALYZER_GET_DURABLE_ACCOUNT`) — full result arrays, following/followers snapshots, and history diff payloads for large accounts

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
- `extension/features/ig-unfollowers/content/dashboard.ts` and `index.ts` both import from `./dashboard.js` — any rename or split must update both the import path and `web_accessible_resources` in `manifest.json`.

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
