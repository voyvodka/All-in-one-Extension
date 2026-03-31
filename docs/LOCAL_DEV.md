# Local Development

Use this guide if you are working from a local clone of the repository.

## Install dependencies

```bash
yarn install
```

## Build the extension

```bash
yarn build
```

Chrome does not load `extension/` directly.
Load the compiled output from `extension-dist/`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select the `extension-dist/` folder.

## Watch mode

```bash
yarn dev
```

This is the recommended local workflow.
It writes to `extension-dev-dist/` and applies separate dev branding.
After files change, reload the extension in Chrome.

## Run a separate Dev build

If you want to keep the live extension and a development build installed on the same machine:

```bash
yarn build:dev
```

Then load `extension-dev-dist/` in Chrome.

The dev build is branded separately so it is easier to recognize:

- extension name becomes `All-in-One Toolkit Dev`
- popup header becomes `All-in-One Toolkit Dev`
- output folder is `extension-dev-dist/`

If you explicitly want the normal production-like watch output instead:

```bash
yarn dev:prod
```

That writes to `extension-dist/`.

Recommended setup:

- live extension -> load from your normal release folder
- dev extension -> load from `extension-dev-dist/`
- if possible, use a separate Chrome profile for development

## Lint & Format

```bash
yarn lint              # ESLint check
yarn lint:fix          # ESLint auto-fix
yarn format            # Prettier format all files
yarn format:check      # Prettier check (CI gate)
```

## Verify before release

```bash
yarn verify
```

This runs type-check, lint, format check, manifest validation, and repo hygiene in one command.

## Package release zips locally

```bash
yarn package:extension
```

To package a separately branded dev zip:

```bash
yarn package:extension:unpacked:dev
```
