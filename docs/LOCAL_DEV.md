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

This watches TypeScript and static assets.
After files change, reload the extension in Chrome.

## Verify before release

```bash
yarn verify
```

## Package release zips locally

```bash
yarn package:extension
```
