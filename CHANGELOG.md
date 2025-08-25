# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]
### Added
- GitHub Actions CI: build, lint, and unit tests on PRs and pushes to main.
- Dependabot configuration for Gradle and GitHub Actions.
- Updated PR template to require README, SPEC, and CHANGELOG updates when behavior changes.
- Changeable admin PIN (default 3715) with hashed storage.
- CSV export previews in UI (expand/collapse with row counts).
- Exports now report public Downloads path in Toast.
- Maintenance section (Generate demo data & Clear data) relocated into Import/Eksport screen.

### Changed
- Repository governance docs emphasize "Docs are never optional".
- CSV export saves directly to public Downloads/Medlemscheckin and internal exports dir.
- Admin menu simplified further; demo/clear data buttons removed from root and placed under Import/Eksport.

