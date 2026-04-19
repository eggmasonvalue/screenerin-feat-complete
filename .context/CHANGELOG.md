# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- **Prior Year Earnings Dates**: Added three new columns ("1Yr Ago", "2Yr Ago", "3Yr Ago") to the "Upcoming Results" table. Dynamically fetches past filing dates matching the target quarter to help contextualize upcoming reporting schedules.
### Changed
- **License Upgrade**: Re-licensed the project from MIT to **GNU GPL 3.0** to ensure long-term freedom and copyleft protection for all users and contributors.
### Fixed
- **Industry Cache Bootstrap**: The extension now rebuilds the industry database when local storage is empty, even if an old `ETag` is still present, so the filter UI no longer gets stuck at "No industry data found."
### Improved
- **Interactive Quarterly Analysis**: Made the "Reaction" row in the Quarterly Analysis section a collapsible element (with a '+' / '&minus;' toggle) that controls the visibility of the "Next Day" and "Next Week" rows. Polished to match native Screener.in collapsible behavior (blue toggle on the right, clickable labels).
- **Professional Financial Ratios**: Upgraded the Ratios Dashboard to professional analyst standards:
    - **Inventory Turnover**: Implemented accurate COGS logic using "Raw material cost" and "Change in inventory" (with fallback to Material % of Sales).
    - **ROIC %**: Switched from a hardcoded 25% tax rate to a dynamic adjustment using the actual "Tax %" from the company's P&L.
    - **Liquidity Ratios**: Enhanced accuracy by including "Loans n Advances" in Current/Quick assets and "Other liability items" in Current Liabilities.
- **Deep Metric Extraction**: Implemented "Silent API Fetching" (`DeepFetcher`) to retrieve granular data:
    - Bypasses UI expansion (clicking/scrolling) entirely.
    - Directly queries Screener's internal API (`/api/company/{id}/schedules/`) for "Material Cost %", "Other Liabilities", "Other Assets", and "Cash from Investing Activity".
    - Merges this high-fidelity data into the parser, ensuring ratios have access to hidden metrics like "Raw material cost" and "Trade Payables" without any visual glitching.
- **Robust Parsing**:
    - **Case-Insensitive Normalization**: All metric keys are now lowercased during parsing, eliminating bugs caused by Screener's inconsistent capitalization (e.g., "Trade Receivables" vs "Trade receivables").
    - **Metric Aliasing**: Added support for standard aliases (e.g., "Equity Capital" mapping to "Share Capital" logic) to ensure calculations work across different company report formats.
- **Enhanced Cash Flow Analysis**:
    - **FCF Refinement**: Improved FCF logic to use "Net Capex" (Fixed assets purchased + Fixed assets sold).
    - **New Metrics**: Added absolute "Free Cash Flow" to the dashboard and fixed "FCF Conversion" logic.
- **Deep Efficiency Metrics**:
    - Implemented full "Working Capital Cycle" logic including Debtor Days, Inventory Days, and Payable Days.
    - Standardized "Screener Default" template to provide immediate coverage for core efficiency ratios.
- **Robust Quarterly Analysis**:
    - **Holiday/Weekend Handling**: Implemented "First Trading Day ON or AFTER" logic for price reactions. Corrects missing data for filings on non-trading days (e.g., Aug 15 Independence Day or Saturdays).
    - **Revision Date Support**: Added fallback to `revised_Date` for filings where `broadcast_Date` is null (fixes missing Mar 2025 earnings date for RKSWAMY and similar cases).
    - **Refined Reaction Display**: Renamed reaction columns for better readability and removed the year from dates to reduce clutter.
- **Targeted Event Fetching**: Replaced broad historical data fetching with targeted, window-specific queries. This eliminates data truncation issues and ensures accurate reaction calculations.
- **Smart Date Logic**: Filings reported after 15:30 IST automatically shift the reaction date to T+1. Implemented strict date capping to prevent 404 errors on recent filings.
- **Enhanced Parsing**: Improved robustness of filing date parsing and increased lookback buffer to ensure accurate price reaction calculations. Added fallbacks for NSE's inconsistent data formats.
- **Backwards Anchor Search**: Improved price reaction accuracy by searching backwards for the most recent valid closing price.

## [5.1.0] - 2026-02-16
### Added
- **Company Ratios Re-implementation**: Successfully restored and refined the "Ratios" widget on company pages (`/company/*`).
- **Templated Ratios**: New categorized views: "Efficiency", "Liquidity", "Solvency", and "Cash Flow".
- **Instant Theme Adaptation**: The UI now uses native CSS variables (`--sif-bg`, `--sif-text`) for instant, refresh-free transitions between Light and Dark modes.
- **Quarterly Analysis**: Added earnings dates and price reaction metrics (Day/Next Day/Week) to the "Quarters" section on company pages, fetched reliably via background script from NSE.

### Changed
  - **Adaptive CSS**: Switched from JS-computed styles to static CSS variables (`--sif-*`) for instant theme switching without reload.
  - **Data Preservation**: Implemented a "Read Phase" to scrape the original DOM table before it is modified, ensuring Screener's default ratios are never lost.
  - **Silent Fetching**: Replaced clunky DOM expansion with `DeepFetcher` which queries the internal API for nested schedule data, providing a smoother user experience.
  - **Normalization**: Uses lowercase key matching and robust text cleaning to handle variation in Screener's table layout and capitalization.
  - **Analyst Standards**: 
    - **Inventory Turnover**: Uses professional COGS logic (Raw Material + Change in Inv).
    - **Inventory/Payable/Debtor Days**: Implemented standard turnover-to-days conversion for working capital analysis.
    - **Dynamic Tax**: ROIC adjusts based on actual trailing tax rates.
    - **Net Capex**: FCF now accounts for both asset purchases and sales to determine net cash outflow.
- **Simplified UI**: Focused the interface on core financial data, removing redundant custom ratio components.
- **Precise Alignment**: Refined layout of headers and dropdowns for a more native Screener.in integration.
- **Default Data Capture**: Implemented a "Read Phase" to capture Screener's original default ratios from the DOM before rendering custom templates, preventing data loss.
- **Strategy Scoping**: `getMetrics` (for aggregate stats like Median/Avg) is intentionally restricted to `ListStrategy` (Latest Results) to maintain layout integrity on standard table-based pages.

### Fixed
- **Quarterly Analysis Scrolling**: Injected "Earnings Day" and "Reaction" rows now have their first column correctly frozen when scrolling horizontally, fixing an issue where they would scroll off-screen.
- **Dark Mode Dropdown**: Resolved an issue where the dropdown background remained white in dark mode.
- **Zero-Value Ratios**: Fixed a bug where calculated ratios would show 0 if default values weren't captured correctly.
- **Layout Stability**: Resolved overlap and alignment issues in Ratios and Quarterly Analysis tables.

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
- **UI Cleanups**: Removed redundant status bars and counters for a more native feel.

## [2.0.0] - 2026-02-07
### Major Changes
- **Specialized DOM Strategies**: Replaced experimental "Universal Strategy" with robust, page-specific strategies (`TableStrategy`, `ListStrategy`).
- **Deep Scanning**: Implemented "Scan All Pages" functionality for both company headers and financial data tables.
- **Native Sidebar Widget**: Integrated "By Industry" dropdown seamlessly into Screener's sidebar.
- **Improved Layouts**: Resolved flexbox distortions and stabilized UI injection on data-heavy pages.

