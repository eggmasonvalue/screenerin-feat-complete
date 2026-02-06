# Project Overview

**Project**: Screener.in Industry Filter Chrome Extension
**Location**: `d:\Misc2\03_Investing_Tools\screenerin-chrome-ext`
**Description**: A Chrome extension that extends [Screener.in](https://www.screener.in) functionality by adding an industry-based filter to result lists (e.g., "Upcoming Results").

## Core Features
1.  **Global Industry Database**: Scrapes industry mappings from `/market/` and caches them locally (~3,100 stocks).
2.  **Smart Filtering**: Injects a dropdown filter into stock lists to show/hide rows based on cached industry data.
3.  **Privacy Focused**: Runs entirely locally after initial data fetch.

## Tech Stack
- **Platform**: Chrome Extension (Manifest V3)
- **Language**: Vanilla JavaScript, HTML, CSS
- **Storage**: `chrome.storage.local`
