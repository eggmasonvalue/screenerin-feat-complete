# Architecture

## Modules

### 1. Background Service (`background.js`)
- **Role**: Data Aggregator.
- **Responsibility**: 
  - Handles the "Warm-up" process (scraping `/market/` and sub-pages).
  - Manages rate-limited fetching queue.
  - Stores the resulting `Map<Symbol, Industry>` in `chrome.storage.local`.

### 2. Content Script (`content.js`)
- **Role**: UI Injector & Interactor.
- **Responsibility**:
  - Runs on `screener.in/upcoming-results/*` and `screener.in/results/latest/*`.
  - Injects **Custom Combobox** (Searchable Dropdown) into Sidebar.
  - **Specialized Strategies**:
    - `TableStrategy`: Handles standard `table.data-table` layouts (e.g. Upcoming Results). Injects status widget *inside* container cards to preserve layout.
    - `ListStrategy`: Handles `.mark-visited .flex-row` layouts (e.g. Latest Results). Manages paired Header+Data DOM nodes.
  - **Deep Scanning**: Robustly fetches subsequent pages for both Table and List views, ensuring financial data tables are correctly adopted and appended.
  - **Cleanup**: Implements `cleanupItems` to remove deep-fetched rows when filters change.

### 3. Popup (`popup.html` / `popup.js`)
- **Role**: Control Panel.
- **Responsibility**:
  - Allows user to manually trigger/refresh the industry database.
  - **State Persistence**: Polls `getScrapeStatus` on load to restore active progress bars.
  - Displays database status (count, last updated) and progress.

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Popup
    participant Background
    participant Storage
    participant Screener(External)
    participant Content

    User->>Popup: Clicks "Initialize DB"
    Popup->>Background: Message: "startScrape"
    Background->>Screener: GET /market/ (Fetch list)
    loop For each Industry
        Background->>Screener: GET /company/industry/...?limit=100
    end
    Background->>Storage: Save { stockMap }
    
    User->>Content: Navigates to /upcoming-results/
    Content->>Storage: Read stockMap
    Content->>Content: Map Table Rows -> Industries
    Content->>Content: Inject Filter Dropdown
    User->>Content: Selects "Textiles"
    Content->>Content: Hides non-Textile rows
```
