# All-in-One Extension

All-in-One Extension is a Chrome Manifest V3 project that adds download actions to YouTube, Instagram, and Twitter/X.

The project stays intentionally buildless in development: plain JavaScript, native ES modules, and runtime loading through `chrome.runtime.getURL()`.

## Supported features

- YouTube
  - adds audio and video download actions to the share panel
- Instagram
  - adds audio, video, single-image, and multi-image download actions across reels, post, and dialog surfaces
- Twitter / X
  - adds audio, video, and image download actions to the tweet action menu

## Project structure

```text
extension/
  background/        # download orchestration and compatibility bridges
  features/          # feature-first content/background entrypoints + platform shared DOM logic
  popup/             # popup and options UI
  shared/            # storage, i18n, contracts
  _locales/          # extension locale metadata
  icons/             # extension icons
docs/                # architecture, install, release, smoke checklist
scripts/             # validation and packaging scripts
```

## Architecture summary

- `extension/content.js`
  - boots content-side behavior on supported domains
  - loads feature modules from `shared/contracts/feature-registry.js`
- `extension/background/index.js`
  - routes runtime messages through centralized contracts
  - manages downloads, retry, cancel, and job lifecycle
- `extension/popup/popup.js`
  - renders settings and download state
  - uses view-model helpers to keep presentation logic separate
- `extension/features/*-download/*`
  - holds feature-first content and background entrypoints
- `extension/features/{youtube,instagram,twitter}/shared.js`
  - contains fragile DOM integration logic and should be changed carefully

For more detail, see:

- `docs/ARCHITECTURE.md`
- `docs/INSTALL.md`
- `docs/RELEASE.md`
- `docs/SMOKE_CHECKLIST.md`
- `docs/POPUP_REDESIGN.md`

## Local development

### Load the extension

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `extension/` folder

If you are installing from a release asset instead of the repository, use the unpacked package described in `docs/INSTALL.md`.

### Available scripts

```bash
yarn verify
yarn validate:manifest
yarn check:repo
yarn package:extension
yarn package:extension:nested
yarn package:extension:unpacked
yarn release:verify
node --check extension/popup/popup.js
```

- `yarn verify`
  - runs manifest validation and repository hygiene checks
- `yarn validate:manifest`
  - validates `extension/manifest.json`
- `yarn check:repo`
  - checks required files, `.DS_Store`, and basic hygiene rules
- `yarn package:extension`
  - builds both release zip variants into `artifacts/`
- `yarn package:extension:nested`
  - builds the legacy nested zip where the archive root contains `extension/`
- `yarn package:extension:unpacked`
  - builds the user-friendly zip where the archive root contains `manifest.json`
- `yarn release:verify`
  - verifies version, tag, and changelog alignment before a release

There is no linter, formatter, type-checker, or automated test runner in this repository.
If you touch JavaScript files, use `node --check <file>` where needed.

## Release artifacts

Tagged releases publish two zip variants:

- `all-in-one-toolkit-vX.Y.Z.zip`
  - keeps the historical nested layout
- `all-in-one-toolkit-unpacked-vX.Y.Z.zip`
  - optimized for manual installation
  - contains `manifest.json` at the archive root and an `INSTALL.txt` helper file

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
- `extension/background/providers/loaderTo.js`
  - shared external dependency for multiple download flows

## Contributing

See `CONTRIBUTING.md` before opening a pull request.
