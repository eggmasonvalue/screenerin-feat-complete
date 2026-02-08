# Design Specifications

## Features Status

| Feature | Status | Implementation Details |
| :--- | :--- | :--- |
| **Manifest V3 Setup** | ✅ Done | `manifest.json` configured with storage permissions. |
| **Industry Scraping** | ✅ Done | `src/background/background.js` scrapes `/market/` with rate limiting. |
| **Local Storage** | ✅ Done | Data stored as `stockMap` (Symbol → Basic Industry) and `industryHierarchy` (Basic Industry → {macro, sector, industry, basicIndustry}). |
| **Popup UI** | ✅ Done | Simple interface to trigger scrape and view progress. |
| **Filter Injection** | ✅ Done | Injects into `.change-list-filter` (Sidebar) on `/upcoming-results/`, `/results/latest/`, and `/concalls/`. |
| **Client-side Filtering** | ✅ Done | Toggles `display`. |
| **Pagination Support** | ✅ Done | "Deep Scan": Robustly fetches next pages for both Table and List views; handles complex DOM adoption. |
| **Specialized DOM Handling** | ✅ Done | Distinct strategies (`TableStrategy`, `ListStrategy`) for different page layouts. |
| **Extension Icon** | ✅ Done | Custom SVG (Bars + Funnel). |
| **Portfolio Analysis** | ✅ Done | Adds "% PF" and "₹ Cr" to Shareholdings table on People pages. <br> - **Strict Logic**: Uses only the *latest* holding period (last column) for calculations. <br> - **Robustness**: Targets specific historical table via date-pattern headers. <br> - **Performance**: Fetches Market Cap via background script with global exponential backoff.<br> - **Note**: Background service handles calculations seamlessly; no overlay UI shown. |
| **Mobile Support** | ✅ Done | Filter persists and functions correctly when moved to modal on mobile view (uses MutationObserver). |
| **Dark Mode Support** | ✅ Done | Adaptive UI that seamlessly integrates with Screener.in's native Light/Dark themes. |
| **Release Automation** | ✅ Done | GitHub Actions workflow builds .zip packages on version tags and creates GitHub Releases. |
| **Multi-Level Hierarchy Search** | ✅ Done | Extracts NSE's 4-level classification from breadcrumb navigation during scraping. Users can search by any level (Macro/Sector/Industry/Basic Industry). Each dropdown item displays full hierarchy path for context. |
| **Add earnings day reaction/next day reaction in the filtered results list** | ❌ Planned | upcoming |

## UX Decisions
- **Lazy Load vs. Pre-fetch**: Switched to "Global Pre-fetch" (Warm-up) strategy.
- **Rate Limiting**: 
  - **Dynamic Backoff**: Starts at 5s, grows by 2x per retry (Global Memory).
  - **Slow Decay**: Level decays by 0.05 per success to prevent rapid oscillation.
  - **Visibility**: Popup displays exact pause duration.
- **Popup UI**: "Full Bleed" card design using native Screener.in tokens (Inter, Purple).
- **State Persistence**: Background script is the source of truth; Popup polls state on load.
- **Pagination**: Since native "Industry" filtering isn't supported for "Upcoming Results", we use client-side iterative fetching ("scan next page") to find matches across pagination.
- **Staleness**: Database is considered valid for **84 days** (roughly one quarter).
- **Multi-Level Search**: 
  - **Breadcrumb Extraction**: Parses the `<ul>` containing the "Industries" link to extract all 4 hierarchy levels.
  - **Search Scope**: Searches across all fields (macro, sector, industry, basicIndustry) for maximum discoverability.
  - **Display Format**: Shows basic industry name (bold) with hierarchy path below (smaller, lighter text) for context.
