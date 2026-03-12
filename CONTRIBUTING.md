# Contributing

Thanks for contributing to All-in-One Extension.

This repository is a Chrome MV3 extension written in TypeScript. Source lives in `extension/`, compiled output goes to `extension-dist/`, and Chrome loads `extension-dist/`.

## Before you start

- Use `yarn` for all scripts and dependency work.
- The version source of truth is `extension/manifest.json`.
- This repo has no automated test runner. Do not claim tests were run if they do not exist.
- Validation in this repo means `yarn verify` (type-check + manifest + repo hygiene).

## Local validation

Run the commands that match your change:

```bash
yarn build                # compile TS + copy static assets → extension-dist/
yarn dev                  # watch mode for development
yarn verify               # build:check + validate:manifest + check:repo
yarn build:check          # type-check only (no emit)
yarn validate:manifest    # validate manifest.json structure
yarn check:repo           # repo hygiene checks
yarn package:extension    # build + package both zip variants
yarn release:verify       # verify version/tag/changelog alignment
```

Validation expectations:

- Always run `yarn verify` before opening a PR.
- Always run `yarn build` and test in Chrome before submitting changes.
- Run `yarn package:extension` for release-oriented or packaging changes.
- Run `yarn release:verify` when touching versioning, changelog, or release workflow files.

## Architecture guardrails

- Source code is **TypeScript** (`strict: true`). Chrome loads compiled output from `extension-dist/`.
- Always include the `.js` extension in relative imports (TypeScript resolves `.js` → `.ts` at compile time).
- Use `import type` for type-only imports to avoid runtime overhead.
- Exception: `content.ts` uses `type X = import('...').X` syntax to avoid `export {}` in compiled output.
- Do not introduce raw string literals for runtime message types. Use `extension/shared/contracts/message-types.ts`.
- Keep feature metadata in `extension/shared/contracts/feature-registry.ts`.
- Do not create cross-layer imports from content features into background code or vice versa.
- If a new runtime file must be loaded by content code, update `extension/manifest.json` `web_accessible_resources`.

## Feature change protocol

When adding or changing a download feature:

1. Update `extension/shared/contracts/message-types.ts` if a new message type is needed.
2. Update `extension/shared/contracts/feature-registry.ts` if a content module path or descriptor changes.
3. Register the handler in `extension/background/index.ts` if background routing changes.
4. Keep `manifest.json` and registry module paths aligned.
5. Update `CHANGELOG.md` for user-facing changes.

## High-risk files

These files are fragile and should be changed only with a targeted reason and manual smoke testing:

- `extension/features/instagram/shared.js`
- `extension/features/twitter/shared.js`
- `extension/features/youtube/shared.js`

Rules for these files:

- These stay as plain JavaScript with companion `.d.ts` declaration files.
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

- `yarn verify` passes (type-check + manifest + repo hygiene)
- `yarn build` succeeds and the extension works in Chrome from `extension-dist/`
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
