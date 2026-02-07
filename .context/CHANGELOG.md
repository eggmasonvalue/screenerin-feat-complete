# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [4.1.1] - 2026-02-07
### Documentation
- Updated `README.md` to use consistent `% PF` (Portfolio) terminology instead of `% Pt`.

## [4.1.0] - 2026-02-07
### Fixed
- **Mobile Filter**: Fixed issue where the industry filter would not function on mobile views due to Screener.in moving the sidebar content into a modal. Implemented `MutationObserver` to re-initialize the filter logic when it detects this layout change.
- **Portfolio Logic**: Refined `getPercentHolding` to strictly use the last column (latest quarter) of data.
- **UI Cleanup**: Removed the "Analyzing Portfolio" status bar and summary footer to act more like a native feature.
- **Documentation**: Comprehensive update to `README.md` to reflect v4.0.0 features and streamlined the feature presentation.


## [4.0.0] - 2026-02-07
### Major Changes
- **Portfolio Analysis**: Full support for `screener.in/people/*` pages with robust portfolio value calculations.
  - Adds **"₹ Cr"** and **"% PF"** columns to the historical Shareholdings table initially populated with "..." placeholder.
  - **Refined Calculation**: Logic now strictly uses the **last reported quarter** (latest column) for holding percentages. If a stock was exited in the last quarter (empty cell), it correctly computes as 0 value.
  - **Robustness**: Implemented smart table detection using date-pattern matching headers (e.g., "Jun 2025") to avoid mis-targeting summary tables like "Bulk Deals".
  - **Performance**: Shifted fetching logic to `background.js` to utilize a global exponential backoff strategy, preventing rate-limit issues on large portfolios.

### Added
- **Dark Mode Support**: Adaptive UI that seamlessly integrates with Screener.in's native Light/Dark themes.
- **Rate Limiting Improvements**: Enhanced backoff display in popup with accurate progress feedback.

### Security
- Obscured email in git commits for privacy.

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

