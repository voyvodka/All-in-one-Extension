# Release Flow

## Version source of truth

- Extension version lives in `extension/manifest.json`.
- Release tags must use `vX.Y.Z` and match the manifest version exactly.

## Branch and PR flow

1. Work happens on feature branches.
2. Changes land in `main` through pull requests.
3. A release-ready PR updates:
   - `extension/manifest.json`
   - `CHANGELOG.md`
   - any user-facing docs affected by the release
4. After the release PR is merged, tag the exact `main` commit with `vX.Y.Z`.

## CI / CD structure

- `ci.yml`
  - runs on pull requests and non-tag pushes
  - validates manifest and repo hygiene
  - packages the extension as an artifact
- `delivery.yml`
  - runs on `main`
  - produces a packaged artifact for the current main commit
- `release.yml`
  - runs on version tags
  - verifies tag/version alignment
  - packages the extension
  - publishes a GitHub Release with the zip artifact

## Local commands

```bash
yarn verify
yarn package:extension
yarn package:extension:nested
yarn package:extension:unpacked
yarn release:verify
```

## Release artifacts

- `all-in-one-toolkit-vX.Y.Z.zip`
  - legacy nested layout
  - zip root contains the `extension/` folder
- `all-in-one-toolkit-unpacked-vX.Y.Z.zip`
  - user-friendly unpacked layout
  - zip root contains `manifest.json` directly for easier `Load unpacked`
  - includes `INSTALL.txt` with short setup steps

Tagged releases and `main` delivery artifacts publish both zip variants.

Supporting docs:

- `docs/INSTALL.md`
- `docs/SMOKE_CHECKLIST.md`

## SemVer guidance

- `patch`: bug fixes and internal cleanup without new user-facing capability
- `minor`: backward-compatible features or workflow improvements
- `major`: breaking behavior, permissions, or structure changes that require migration notes
