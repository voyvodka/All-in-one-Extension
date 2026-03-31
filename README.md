# All-in-One Extension

All-in-One Extension is a Chrome Manifest V3 project that adds download actions to YouTube, Instagram, and Twitter/X.

Source code is written in **TypeScript** (`strict` mode). A lightweight `tsc` compile step produces the runtime JavaScript that Chrome loads from `extension-dist/`.

## Supported features

- YouTube
  - adds audio and video download actions to the share panel
- Instagram
  - adds audio, video, single-image, and multi-image download actions across reels, post, and dialog surfaces
  - **Instagram Analyzer** — a per-account follower analysis tool with a compact drawer and a full-screen dashboard overlay (non-followers detection, whitelist management, scan history with diffs, trend charts, quick compare, and hover cards on usernames)
- Twitter / X
  - adds audio, video, and image download actions to the tweet action menu

## Project structure

```text
extension/                # TypeScript source (+ fragile .js DOM files)
  background/             # download orchestration, message router
  features/               # feature-first content/background entrypoints + platform shared DOM logic
  popup/                  # popup and options UI
  shared/                 # storage, i18n, contracts
  _locales/               # extension locale metadata
  icons/                  # extension icons
extension-dist/           # compiled output (gitignored) — Chrome loads this folder
docs/                     # architecture, install, release, smoke checklist
scripts/                  # build, validation, packaging, and dev-mode scripts
```

## Architecture summary

- `extension/content.ts`
  - boots content-side behavior on supported domains
  - loads feature modules from `shared/contracts/feature-registry.ts`
- `extension/background/index.ts`
  - routes runtime messages through centralized contracts
  - manages downloads, retry, cancel, and job lifecycle
- `extension/popup/popup.ts`
  - renders settings and download state
  - uses view-model helpers to keep presentation logic separate
- `extension/features/*-download/*`
  - holds feature-first content and background entrypoints
- `extension/features/ig-unfollowers/content/index.ts`
  - compact analyzer drawer (launcher, scan controls, results, whitelist, history)
- `extension/features/ig-unfollowers/content/dashboard.ts`
  - standalone full-screen analytics dashboard (KPI cards, charts, compare, user list with hover cards, scan history)
- `extension/features/{youtube,instagram,twitter}/shared.js`
  - contains fragile DOM integration logic and should be changed carefully
  - these files stay as plain JavaScript with `.d.ts` declarations for TypeScript integration

For more detail, see:

- `docs/ARCHITECTURE.md`
- `docs/INSTALL.md`
- `docs/LOCAL_DEV.md`
- `docs/RELEASE.md`
- `docs/SMOKE_CHECKLIST.md`

## Local development

For the full developer setup guide, see `docs/LOCAL_DEV.md`.

### Prerequisites

- Node.js 20+
- Yarn 1.x (`corepack enable && corepack prepare yarn@1.22.22 --activate`)

### Build and load

```bash
yarn install
yarn build        # compile TS + copy static assets → extension-dist/
```

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the **`extension-dist/`** folder (not `extension/`)

### Watch mode

```bash
yarn dev          # tsc --watch + static asset watcher in parallel
```

Edit `.ts` files → `extension-dev-dist/` updates automatically → reload extension in Chrome.

### Available scripts

```bash
yarn dev                       # recommended watch mode -> extension-dev-dist/ (separately branded dev build)
yarn dev:prod                  # watch mode for production-like output -> extension-dist/
yarn build                     # one-shot compile + copy static assets
yarn build:dev                 # build separately branded dev output -> extension-dev-dist/
yarn build:check               # type-check only (no emit)
yarn verify                    # build:check + validate:manifest + check:repo
yarn validate:manifest         # validate manifest.json structure
yarn check:repo                # repo hygiene (no .DS_Store, no secrets, etc.)
yarn package:extension           # build + package zip into artifacts/
yarn package:extension:unpacked  # unpacked zip only (no build)
yarn package:extension:unpacked:dev # branded dev zip for side-by-side install
yarn release <patch|minor|major> # bump version + generate changelog draft
yarn release:verify              # verify version/tag/changelog alignment
```

- `yarn verify` is the main pre-commit / CI gate.
- `yarn build:check` runs the TypeScript compiler in check-only mode.
- `yarn package:extension` produces release-ready zip files from `extension-dist/`.

## Release artifacts

Tagged releases publish:

- `all-in-one-toolkit-unpacked-vX.Y.Z.zip`
  - contains a single `All-in-One Toolkit/` folder and an `INSTALL.txt` helper file

Release flow details live in `docs/RELEASE.md`.

## CI / delivery / release

- `.github/workflows/ci.yml`
  - validates the repo and packages an artifact on pull requests and non-tag pushes
- `.github/workflows/delivery.yml`
  - builds both package variants for every `main` push
- `.github/workflows/release.yml`
  - runs on `vX.Y.Z` tags, verifies release metadata, packages both variants, and publishes the GitHub Release

## Versioning

- Source of truth: `extension/manifest.json`
- Tag format: `vX.Y.Z`
- `CHANGELOG.md` must contain a matching section before a tag is created

## Privacy and terms

- `extension/PRIVACY_POLICY.md`
- `extension/terms.md`

## High-risk areas

- `extension/features/instagram/shared.js`
  - fragile Instagram DOM selectors and observer logic
- `extension/features/twitter/shared.js`
  - fragile tweet action-bar integration
- `extension/features/youtube/shared.js`
  - fragile share-panel integration
- `extension/background/providers/loaderTo.ts`
  - shared external dependency for multiple download flows

## Contributing

See `CONTRIBUTING.md` before opening a pull request.
