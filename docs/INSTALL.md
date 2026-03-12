# Install Guide

## Recommended release asset

For manual installation, use:

- `all-in-one-toolkit-unpacked-vX.Y.Z.zip`

This package is easier to load because `manifest.json` is placed at the archive root.

## Manual installation in Chrome

1. Download the latest release asset
2. Extract the zip to a permanent folder
3. Open `chrome://extensions`
4. Enable `Developer mode`
5. Click `Load unpacked`
6. Select the extracted folder that contains `manifest.json`

## Which package should I choose?

- `all-in-one-toolkit-unpacked-vX.Y.Z.zip`
  - best for normal users
  - extract and select the folder directly
- `all-in-one-toolkit-vX.Y.Z.zip`
  - keeps the historical nested `extension/` structure
  - useful if you want the release archive to mirror the repository runtime folder

## Troubleshooting

- If Chrome says the manifest is missing, you selected the wrong folder level.
- If the extension does not appear after loading, remove it and load the extracted folder again.
- If the service worker fails to start, re-download the latest release and make sure the extraction completed fully.

## Local repository install (developer)

If you are installing from a local clone instead of a release asset:

1. Install dependencies: `yarn install`
2. Build the project: `yarn build`
3. Open `chrome://extensions`
4. Enable `Developer mode`
5. Click `Load unpacked`
6. Select the **`extension-dist/`** folder (not `extension/`)

> **Important:** Chrome loads compiled output from `extension-dist/`. The `extension/` folder contains TypeScript source and cannot be loaded directly.

For development with auto-recompilation:

```bash
yarn dev    # starts tsc --watch + static asset watcher
```

Edit `.ts` files, then reload the extension in Chrome to pick up changes.
