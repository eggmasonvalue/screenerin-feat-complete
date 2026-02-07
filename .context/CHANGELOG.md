# Changelog

All notable changes to this project will be documented in this file.

## [2.0.1] - 2026-02-07
### Removed
- **Screens Support**: Removed support for `screens/*` pages as it was not a scheduled feature.

### Added
- **License**: Added MIT LICENSE file.

### Documentation
- Updated `README.md` to accurately reflect v2.0.0 features (Deep Scanning, Native Sidebar, Specialized Strategies).

## [2.0.0] - 2026-02-07

### Major Changes
- **Specialized DOM Strategies**: Completely replaced the experimental "Universal Strategy" with robust, page-specific strategies:
  - `TableStrategy`: Handles standard data tables (e.g., Upcoming Results).
  - `ListStrategy`: Handles complex list/data-pair layouts (e.g., Latest Results).
- **Deep Scanning**: Implemented "Scan All Pages" functionality that successfully adopts both company headers and financial data tables across pages.
- **Layout Stabilization**: Fixed flexbox layout corruptions on Upcoming Results by targeting specific card containers for UI injection.

### Added
- **Native Sidebar Widget**: A "Filter by Industry" dropdown that integrates seamlessly with Screener's sidebar.
- **Cleanup Logic**: Robust removal of deep-fetched rows when toggling filters.

### Fixed
- **Rendering Bugs**: Solved issues where financial data tables were missing from scanned results.
- **UI Distortion**: Fixed status bar appearing as a side column on flex-layout pages.

