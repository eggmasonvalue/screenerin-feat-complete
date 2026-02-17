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
| **Industry Column** | ✅ Done | Injects "Industry" column into *Upcoming Results* table. Populates from local cache. Hides when filtered. |
| **Company Ratios** | ✅ Done | Re-implemented ratios widget on `/company/` pages. Features categorized templates and native-aligned dropdown. |
| **Add earnings day reaction...**| ✅ Done | Fetches quarterly filing dates and historical prices from NSE to compute reactions (Day of, Next Day, 1 Week). |

## UX Decisions
- **Lazy Load vs. Pre-fetch**: Switched to "Global Pre-fetch" (Warm-up) strategy.
- **Rate Limiting**: 
  - **Dynamic Backoff**: Starts at 5s, grows by 2x per retry (Global Memory).
  - **Slow Decay**: Level decays by 0.05 per success to prevent rapid oscillation.
  - **Visibility**: Popup displays### 3. Quarterly Analysis & Price Reactions
- **Goal**: Provide immediate context on how the market reacted to earnings announcements.
- **Reaction Logic**:
    - **Reaction Date (T)**:
        - If filing time is **<= 15:30 IST**: Reaction date is the **Filing Date**.
        - If filing time is **> 15:30 IST**: Reaction date is the **Next Trading Day**.
    - **Day Change**: `(Close Price on T - Close Price on T-1) / Close Price on T-1`
    - **Next Day Change**: `(Close Price on T+1 - Close Price on T) / Close Price on T`
    - **Next Week Change**: `(Close Price on T+5 - Close Price on T) / Close Price on T`
- **Data Source**: Fetches historical close prices from NSE for targeted windows around each filing date.
"Upcoming Results", we use client-side iterative fetching ("scan next page") to find matches across pagination.
- **Staleness**: Database is considered valid for **84 days** (roughly one quarter).
- **Multi-Level Search**: 
  - **Breadcrumb Extraction**: Parses the `<ul>` containing the "Industries" link to extract all 4 hierarchy levels.
  - **Search Scope**: Searches across all fields (macro, sector, industry, basicIndustry) for maximum discoverability.
  - **Display Format**: Shows basic industry name (bold) with hierarchy path below (smaller, lighter text) for context.
- **Ratios Dashboard**:
  - **Clean UI**: Removed custom ratio functionality to prevent layout drift and maintain a native "one-line" look.
  - **Native Aligned**: Used `baseline` and `center` alignment with `18px` font size to match Screener's native headers.
  - **Column Alignment**: The first column (Ratio names / Earnings metrics) is explicitly left-aligned using `text-align: left` to match Screener's native table aesthetics.
  - **Adaptive CSS**: Switched from JS-computed styles to static CSS variables (`--sif-*`) for instant theme switching without reload.
  - **Data Preservation**: Implemented a "Read Phase" to scrape the original DOM table before it is modified, ensuring Screener's default ratios are never lost.
  - **Silent Fetching**: Replaced visible DOM expansion with `DeepFetcher`, which asynchronously queries `/api/company/{id}/schedules/` to retrieve hidden granular metrics (e.g., Raw Material, Trade Payables) without impacting UI performance.
  - **Normalization**: Uses lowercase key matching and robust text cleaning to handle variation in Screener's table layout and capitalization.
  - **Analyst Standards**: 
    - **Inventory Turnover**: Uses professional COGS logic (Raw Material + Change in Inv).
    - **Inventory/Payable/Debtor Days**: Implemented standard turnover-to-days conversion for working capital analysis.
    - **Dynamic Tax**: ROIC adjusts based on actual trailing tax rates.
    - **Net Capex**: FCF now accounts for both asset purchases and sales to determine net cash outflow.
- **Strategy Scoping**: `getMetrics` (for aggregate stats like Median/Avg) is intentionally restricted to `ListStrategy` (Latest Results) to maintain layout integrity on standard table-based pages.
