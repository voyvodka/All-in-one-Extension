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

## Build pipeline

The project uses a TypeScript compile step:

1. `tsc` compiles `extension/**/*.ts` → `extension-dist/**/*.js`
2. `scripts/copy-static.mjs` copies static assets → `extension-dist/`
3. `scripts/package-extension.mjs` packages `extension-dist/` into release zips

All CI workflows run `yarn verify` (which includes `yarn build:check`) before packaging.
`yarn package:extension` runs `yarn build` first to ensure `extension-dist/` is up to date.

## CI / CD structure

- `ci.yml`
  - runs on pull requests and non-tag pushes
  - validates manifest, type-checks TypeScript, and checks repo hygiene
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
yarn build                     # compile TS + copy static assets
yarn verify                    # type-check + manifest + repo hygiene
yarn package:extension         # build + package both zip variants
yarn package:extension:nested  # legacy nested zip only
yarn package:extension:unpacked # user-friendly zip only
yarn release:verify            # verify version/tag/changelog alignment
```

## Release artifacts

- `all-in-one-toolkit-vX.Y.Z.zip`
  - legacy nested layout
  - zip root contains the `extension/` folder
- `all-in-one-toolkit-unpacked-vX.Y.Z.zip`
  - user-friendly unpacked layout
  - zip root contains a single `All-in-One Toolkit/` folder
  - users load that folder directly in `chrome://extensions`
  - includes `INSTALL.txt` inside the folder with short setup steps

Tagged releases and `main` delivery artifacts publish both zip variants.

Supporting docs:

- `docs/INSTALL.md`
- `docs/LOCAL_DEV.md`
- `docs/SMOKE_CHECKLIST.md`

## SemVer guidance

- `patch`: bug fixes and internal cleanup without new user-facing capability
- `minor`: backward-compatible features or workflow improvements
- `major`: breaking behavior, permissions, or structure changes that require migration notes
