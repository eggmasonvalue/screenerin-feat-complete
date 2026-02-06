# Changelog

## [Unreleased]

## [2.0.0] - 2026-02-07
### Added
- **Feature Expansion**: Added industry filtering support to the "Latest Results" page (`/results/latest/`).
- **Deep Scanning**: "Safe Fetch" button to scan all result pages sequentially.
- **Searchable Combobox**: Custom fuzzy-search dropdown for industry selection.
- **Visual Identity**: Custom PNG extension icons (16, 48, 128px) based on Screener.in branding.

### Changed
- **Rate Limiting Engine**:
  - Implemented exponential backoff starting at **5s**, doubling (10s, 20s) on persistent blocks.
  - Added **Global Memory** to prevent backoff resets during multi-page scans.
  - **Slow Decay**: Level recovers slowly (0.05 per success) to maintain protection during high-traffic bursts.
- **UI Architecture**:
  - Refactored Popup to **Full Bleed** layout with native Screener.in design tokens.
  - Added real-time progress bars and status feedback for background scraping.
- **Robustness**:
  - Multi-table support for grouped results.
  - Fetch controllers to prevent race conditions.
  - Comprehensive JSDoc documentation.

### Fixed
- **Rate Limit Oscillation**: Fixed "stuck at 4.2s" bug by implementing slow decay.
- **UI Stability**: Resolved race conditions in sidebar dropdown selection and pagination visibility.

## [1.0.0] - 2026-02-06
### Initial Release
- **Background Scraper**: Scrapes `/market/` for industry mapping.
- **Popup**: Database initialization and stats.
- **Sidebar**: Basic industry filtering injection.
