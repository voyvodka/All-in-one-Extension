# Changelog

All notable changes to this project should be documented in this file.

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
