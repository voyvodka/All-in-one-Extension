# Changelog

All notable changes to this project should be documented in this file.

## 0.3.0

- Migrated the entire codebase from plain JavaScript to TypeScript with `strict` mode enabled.
- Added a lightweight build pipeline: `tsc` compiles `extension/` → `extension-dist/`, which Chrome now loads.
- Added `yarn dev` watch mode for development (tsc --watch + static asset watcher, no extra dependencies).
- Removed all legacy compatibility bridge files (8 content + 4 background handlers).
- Fixed download progress tracking: added missing `registerDownloadId` calls in YouTube, Instagram, and Twitter download handlers.
- Improved loader.to polling resilience: adaptive timeout for init-phase statuses (InitialisingContext), network error tolerance during polling, and deduplicated polling logic.
- Added runtime validation for all message payloads in the background service worker to prevent undefined values from reaching providers.
- Fixed `updatedAt` not being set on job state changes in the download store.
- Updated all documentation (README, CONTRIBUTING, ARCHITECTURE, INSTALL, RELEASE, SMOKE_CHECKLIST, AGENTS) to reflect the TypeScript build workflow.

## 0.2.0

- Physically moved content and background leaf implementations into feature-first folders while keeping legacy paths as compatibility bridges.
- Redesigned the popup into a more compact modern layout and kept the existing settings and download-management behaviors intact.
- Added dual release packaging: a legacy nested zip and a user-friendly unpacked zip with quick installation notes.
- Strengthened repo hygiene and manifest guardrails to reduce registry/resource drift during future refactors.

## 0.1.6

- Added shared runtime contracts for message types and feature registry metadata.
- Refactored background routing to use centralized handlers and removed the Instagram image handler dependency on content-side feature code.
- Prepared popup code for a full redesign by extracting view-model and theme helpers.
- Added README, release docs, packaging scripts, and GitHub Actions workflows for CI, delivery, and tagged releases.
