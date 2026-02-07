# Design Specifications

## Features Status

| Feature | Status | Implementation Details |
| :--- | :--- | :--- |
| **Manifest V3 Setup** | ✅ Done | `manifest.json` configured with storage permissions. |
| **Industry Scraping** | ✅ Done | `background.js` scrapes `/market/` with rate limiting. |
| **Local Storage** | ✅ Done | Data stored as `stockMap` (Symbol -> Industry). |
| **Popup UI** | ✅ Done | Simple interface to trigger scrape and view progress. |
| **Filter Injection** | ✅ Done | Injects into `.change-list-filter` (Sidebar) on `/upcoming-results/`, `/results/latest/`, and `/concalls/`. |
| **Client-side Filtering** | ✅ Done | Toggles `display`. |
| **Pagination Support** | ✅ Done | "Deep Scan": Robustly fetches next pages for both Table and List views; handles complex DOM adoption. |
| **Specialized DOM Handling** | ✅ Done | Distinct strategies (`TableStrategy`, `ListStrategy`) for different page layouts. |
| **Extension Icon** | ✅ Done | Custom SVG (Bars + Funnel). |
| **Context Menu** | ❌ Not Planned | Context menu actions not required for v1. |

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
