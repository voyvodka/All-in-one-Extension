# Popup Redesign Notes

## Goal

The popup will be redesigned from scratch in a later iteration without breaking existing behavior.

## Functional inventory

The popup currently needs to support:

- language selection
- theme selection
- bug report entry point
- active download list
- download history list
- sort order toggle
- clear history action
- per-item cancel action for active jobs
- per-item retry action for history jobs
- expandable detail view

## Data entry points

- settings: `extension/shared/storage.js`
- downloads state: `extension/shared/storage.js`
- popup rendering logic: `extension/popup/popup.js`
- view-model helpers: `extension/popup/model/*.js`

## Design constraints for the next phase

- keep the popup compact and scannable at ~360px width
- support light and dark modes through tokens
- preserve current interactions before introducing new navigation
- design empty, loading, and error states intentionally
- keep action buttons obvious on mobile-sized popup dimensions

## Safe redesign boundary

If the future redesign only changes:

- `extension/popup/popup.html`
- `extension/popup/popup.css`
- `extension/popup/popup.js`
- `extension/popup/model/*.js`

and does not change the download/state contract, the rest of the extension should remain unaffected.
