# Project Instructions

## Overview

Chrome Manifest V3 extension — adds download actions to YouTube, Instagram, and Twitter/X, plus an Instagram Analyzer feature.

- **Source**: `extension/` (TypeScript strict mode + 3 fragile `.js` files)
- **Output**: `extension-dist/` (compiled by `tsc`, Chrome loads this)
- **Package manager**: Yarn 1.x only
- **Current version**: check `extension/manifest.json` (single source of truth)

## Commands

```bash
yarn dev              # Watch mode → extension-dev-dist/ (dev branded)
yarn build            # One-shot compile + copy static → extension-dist/
yarn build:check      # Type-check only (no emit)
yarn verify           # build:check + lint + format:check + validate:manifest + check:repo
yarn lint              # ESLint check
yarn lint:fix          # ESLint auto-fix
yarn format            # Prettier format all files
yarn format:check      # Prettier check (CI gate)
yarn validate:manifest
yarn check:repo       # Repo hygiene
yarn package:extension # Build + zip into artifacts/
yarn release           # Bump version + generate changelog draft (patch|minor|major)
yarn release:verify   # Version/tag/changelog alignment
```

There is no test runner. ESLint and Prettier are configured; `yarn verify` includes lint + format checks.

## Code Style

- 2-space indentation, semicolons required, single quotes
- `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants, `PascalCase` for types/interfaces
- `kebab-case` for file names and CSS classes
- ES Modules everywhere — always use `.js` extension in relative imports
- Arrow functions for callbacks, `function` declarations for top-level
- No `any` — prefer `unknown` and narrow
- Use `import type` for type-only imports

## Architecture Rules

- **No cross-layer imports** — content features must not import from `background/`, and vice versa. Use message passing.
- **Never use raw string literals for message types** — always import from `shared/contracts/message-types.ts`.
- **New features**: add message type to `message-types.ts`, descriptor to `feature-registry.ts`, handler to `background/index.ts`.
- **New content-side modules** must be added to `web_accessible_resources` in `manifest.json`.

## Fragile Files — Change With Extreme Care

These are plain JavaScript with `.d.ts` declarations. They depend on live DOM selectors that break with site updates:

- `extension/features/instagram/shared.js` (~1162 lines)
- `extension/features/twitter/shared.js` (~651 lines)
- `extension/features/youtube/shared.js` (~232 lines)

## DOM Element Detection & Button Injection

Element detection (action bars, share buttons, like buttons, etc.) and download button injection must work correctly across **all UI languages**, not just English or Turkish. Rules:

- **Never match user-visible text** (button labels, tooltips, etc.) for element detection — these change per locale.
- Instagram keeps SVG `aria-label` attributes in English regardless of UI language; these are safe to use as selectors.
- YouTube and Twitter/X may localize `aria-label` values — prefer structural selectors (`role`, `data-*`, tag hierarchy) over `aria-label` for these platforms.
- When adding or modifying selectors, verify they hold across at least `en`, `tr`, and one RTL locale (e.g. `ar`).

## Release & Versioning

- Version source of truth: `extension/manifest.json`
- Tag format: `vX.Y.Z`
- `CHANGELOG.md` must have a matching section before tagging
- Update `CHANGELOG.md` for all user-facing changes

## i18n

Both `tr` and `en` keys must stay in sync in `shared/i18n.ts` and `_locales/`.
