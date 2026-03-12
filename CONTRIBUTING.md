# Contributing

Thanks for contributing to All-in-One Extension.

This repository is a buildless Chrome MV3 extension. Please keep changes small, runtime-safe, and aligned with the existing contracts.

## Before you start

- Use `yarn` for all scripts and dependency work.
- The version source of truth is `extension/manifest.json`.
- This repo has no automated test runner. Do not claim tests were run if they do not exist.
- Validation in this repo means `yarn verify` and targeted `node --check <file>` where needed.

## Local validation

Run the commands that match your change:

```bash
yarn verify
yarn validate:manifest
yarn check:repo
yarn package:extension
yarn release:verify
node --check extension/popup/popup.js
```

Validation expectations:

- Always run `yarn verify` before opening a PR.
- Run `node --check <file>` for edited JavaScript files when there is no broader automated coverage.
- Run `yarn package:extension` for release-oriented or packaging changes.
- Run `yarn release:verify` when touching versioning, changelog, or release workflow files.

## Architecture guardrails

- Keep the project buildless in normal development.
- Use plain JavaScript and ES modules only.
- Always include the `.js` extension in relative imports.
- Do not introduce raw string literals for runtime message types. Use `extension/shared/contracts/message-types.js`.
- Keep feature metadata in `extension/shared/contracts/feature-registry.js`.
- Do not create cross-layer imports from content features into background code or vice versa.
- If a new runtime file must be loaded by content code, update `extension/manifest.json` `web_accessible_resources`.

## Feature change protocol

When adding or changing a download feature:

1. Update `extension/shared/contracts/message-types.js` if a new message type is needed.
2. Update `extension/shared/contracts/feature-registry.js` if a content module path or descriptor changes.
3. Register the handler in `extension/background/index.js` if background routing changes.
4. Keep `manifest.json` and registry module paths aligned.
5. Update `CHANGELOG.md` for user-facing changes.

## High-risk files

These files are fragile and should be changed only with a targeted reason and manual smoke testing:

- `extension/features/instagram/shared.js`
- `extension/features/twitter/shared.js`
- `extension/features/youtube/shared.js`

Rules for these files:

- Prefer thin adapters and bridges before editing selector or observer logic directly.
- Keep diffs minimal.
- Manually verify feed, modal/dialog, permalink, and action menu surfaces after changes.

## Commit format

Use the existing conventional style:

```text
feat(youtube): add quality selector to video download
fix(instagram): stabilize action bar injection
refactor: move feature entries into feature-first folders
docs: update release flow documentation
```

Format: `<type>(<scope>): <description>`

Allowed types:

- `feat`
- `fix`
- `refactor`
- `chore`
- `docs`
- `ci`

## Pull request checklist

Before opening a PR, confirm the following:

- `yarn verify` passes
- changed JS files pass `node --check` when appropriate
- `manifest.json` is still valid after runtime path changes
- `web_accessible_resources` was updated if new content-side files were introduced
- `CHANGELOG.md` was updated for user-facing changes
- version and changelog are aligned for release-oriented work

## Release-oriented changes

If your change is intended for release:

- bump `extension/manifest.json`
- add a matching section to `CHANGELOG.md`
- run `yarn release:verify`
- verify both package variants with `yarn package:extension`

## Manual verification

Use `docs/SMOKE_CHECKLIST.md` for release and high-risk feature changes.
