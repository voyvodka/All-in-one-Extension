# Manual Smoke Checklist

Use this checklist before tagging a release or after touching fragile DOM integration files.

## Global

- Load the extension in Chrome without manifest errors
- Confirm the background service worker starts cleanly
- Open the popup and confirm:
  - language switch works
  - theme switch works
  - active/history tabs switch correctly
  - sort toggle works
  - clear history is disabled or enabled appropriately

## YouTube

- Open a normal watch page
- Open the share panel
- Confirm both audio and video actions appear
- Click both actions and confirm a download job is created

## Instagram

- Test a reel with video content
- Confirm audio and video actions appear in the menu
- Test a single-image post and confirm single image download appears
- Test a multi-image carousel and confirm bulk image download appears
- Repeat at least one flow inside a dialog/modal surface

## Twitter / X

- Test a tweet with video and confirm audio/video actions appear
- Test a tweet with one image and confirm single image download works
- Test a tweet with multiple images and confirm zip download works
- Test at least one image flow in fullscreen media view

## Popup job lifecycle

- Start a download and confirm it appears under Active
- Cancel an active job and confirm state updates correctly
- Retry a supported history entry and confirm a new job starts
- Expand a card and confirm details render correctly

## Packaging

- Run `yarn package:extension`
- Confirm both artifacts are created in `artifacts/`
- Confirm the unpacked zip contains `manifest.json` at the root
