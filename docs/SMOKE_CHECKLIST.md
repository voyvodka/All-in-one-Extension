# Manual Smoke Checklist

Use this checklist before tagging a release or after touching fragile DOM integration files.

## Build

- Run `yarn build` and confirm it succeeds with zero errors
- Run `yarn verify` and confirm all checks pass

## Global

- Load `extension-dist/` in Chrome without manifest errors
- Confirm the background service worker starts cleanly (no console errors)
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

## Instagram Analyzer

- Open Instagram while signed in and confirm the top-right launcher group appears (Analyzer + Dashboard buttons)
- Click Analyzer — confirm the compact drawer opens with correct account label
- Start a scan and confirm progress updates in the drawer
- After scan completes, confirm non-follower results render in the drawer with whitelist toggle and copy/export actions
- Open History in the drawer and confirm scan entries and diff details render

### Dashboard

- Click Dashboard button — confirm the full-screen overlay opens over Instagram
- Confirm the header shows the correct account and last scan time
- Confirm KPI cards render with correct counts (following, followers, non-followers, whitelisted)
- Confirm sparklines appear in KPI cards after more than one scan
- Confirm trend charts and changes bar chart render after two or more scans
- Confirm Quick Compare section shows latest vs previous scan with delta values
- Expand the diff lists in Compare and confirm followed/unfollowed users appear
- Open the User List, switch between non-followers / whitelist / following / followers sources
- Search for a username and confirm filtering works
- Hover over a username link — confirm the hover card appears below/above the anchor with avatar, name, and action buttons
- Scroll the list while a hover card is open — confirm the card tracks the anchor position
- Click Whitelist in the hover card and confirm the user moves between lists
- Click Open Profile in the hover card and confirm it opens the Instagram profile in a new tab
- Open Scan History and expand an entry — confirm stat grid renders
- Click "Compare this scan" from history and confirm it scrolls to and updates the Compare section
- Press Esc or click the backdrop — confirm the dashboard closes
- Switch theme in the popup (light/dark/system) while the dashboard is open — confirm it updates immediately
- Confirm dashboard closes cleanly and re-opens without stale state

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
