# Project Overview

**Project**: Screener.in Industry Filter Chrome Extension
**Location**: `d:\Misc2\03_Investing_Tools\screenerin-chrome-ext`
**Description**: A Chrome extension that extends [Screener.in](https://www.screener.in) functionality by adding an industry-based filter to result lists (e.g., "Upcoming Results").

## Core Features
1.  **Global Industry Database**: Scrapes industry mappings from `/market/` and caches them locally (~3,100 stocks).
2.  **Multi-Level Hierarchy Search**: Extracts and stores NSE's 4-level classification (Macro → Sector → Industry → Basic Industry) for each industry, enabling search by any level.
3.  **Smart Filtering**: Injects a dropdown filter with hierarchy context into stock lists to show/hide rows based on cached industry data.
4.  **Company Ratios Dashboard**: Advanced ratio templates (Efficiency, Liquidity, etc.) injected directly into company pages with native-aligned UI.
5.  **Privacy Focused**: Runs entirely locally after initial data fetch.

## Tech Stack
- **Platform**: Chrome Extension (Manifest V3)
- **Language**: Vanilla JavaScript, HTML, CSS
- **Storage**: `chrome.storage.local`
