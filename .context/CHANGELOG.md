# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [5.0.0] - 2026-02-09
### Added
- **Multi-Level Hierarchy Search**: Industry filter now extracts and stores NSE's 4-level classification (Macro → Sector → Industry → Basic Industry) for each industry during database initialization. Users can search by any hierarchy level (e.g., typing "Consumer" shows all Consumer Discretionary industries, "Auto" shows all automobile-related industries). Each dropdown item displays the full hierarchy path below the basic industry name for context and discoverability.
- **Industry Column**: Automatically injects an "Industry" column into the *Upcoming Results* table to show the sector for each company at a glance. 
  - Styled to match Screener.in's native design (colored headers).
  - Automatically hidden when an industry filter is applied to avoid redundancy.
  - Plain-text values to distinguish from actionable company links.

### Changed
- **Enhanced Dropdown Display**: Each industry in the dropdown now shows its full classification path (Macro → Sector → Industry) in smaller text below the basic industry name, making the hierarchy structure visible and helping users understand the classification system.

## [4.3.0] - 2026-02-08
### Added
- **Release Automation**: GitHub Actions workflow to automatically build and publish .zip packages on version tags.

## [4.2.0] - 2026-02-07
### Major Features
- **Superinvestor Portfolio Analysis**:
  - Full support for `screener.in/people/*` pages.
  - Adds **"₹ Cr"** and **"% PF"** (Portfolio) columns to the historical Shareholdings table.
  - Dynamic Market Cap fetching via background script with global exponential backoff to handle rate limits.
  - Strict calculation logic using only the latest reported quarter data.
- **Concalls support**: Extended industry filtering to `concalls/` and `concalls/upcoming/` pages.
- **Aggregate Statistics**: Enhanced statistics grid for Latest Results showing Median, Average, and Standard Deviation for key financial metrics.

### Changed
- **Project Structure**: Reorganized codebase into `src/` and `assets/` directories for better maintainability.
- **Mobile Resilience**: Implemented `MutationObserver` to ensure filters function correctly when Screener.in transitions to modal-based layouts on mobile views.
- **Dark Mode Support**: Adaptive UI that seamlessly integrates with Screener.in's native Light/Dark themes.
- **Deep Scanning**: Robust "Scan All Pages" functionality for both Table and List views.
- **Rate Limiting**: Enhanced global backoff manager with persistent status feedback in the popup UI.

### Fixed
- **Robust Table Detection**: Improved selection logic for Superinvestor pages to avoid mis-targeting summary tables.
- **UI Cleanups**: Removed redundant "Count" columns and "Analyzing" status bars for a more native feel.
- **Security**: Obscured developer email in git configuration.

## [3.0.0] - 2026-02-07
### Major Changes
- **Concalls Support**: Extended the industry filter functionality to `concalls/` and `concalls/upcoming/` pages.
- **Documentation**: Updated README with supported pages and superuser tips.

### Added
- **Aggregate Stats (v1.10.0)**:
    - Added a statistics container to the *Latest Results* page showing Median, Average, and Standard Deviation for Sales, EBITDA, Net Profit, and EPS.
    - Implemented `getMetrics` to parse localized numeric formats (e.g., "⇡ 14%") from the data table.
    - Added a helper text to the Industry Filter widget explaining that other filters clear the selection.
- **Portfolio Analysis**:
    - Experimental feature to analyze portfolio value on *People* pages.

### Changed
- **UI Improvements**:
    - Moved the stats container to the top of the results list for better visibility.
    - Updated CSS to match Screener.in's native Light/Dark theme (removed yellow alert style).
    - Replaced "Range" with "Standard Deviation" in stats.
    - Removed redundant "Count" column from the stats grid.
    - Improved alignment of the "Scan All Pages" button and validation text.
    - Added warning icon (using native `icon-info`) next to the "By Industry" header.

### Removed
- **Screens Support**: Removed support for `screens/*` pages as it was not a scheduled feature.

## [2.0.1] - 2026-02-07
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
- **Native Sidebar Widget**: A "By Industry" dropdown that integrates seamlessly with Screener's sidebar.
- **Cleanup Logic**: Robust removal of deep-fetched rows when toggling filters.

### Fixed
- **Rendering Bugs**: Solved issues where financial data tables were missing from scanned results.
- **UI Distortion**: Fixed status bar appearing as a side column on flex-layout pages.

