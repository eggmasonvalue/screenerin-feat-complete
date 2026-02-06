# Screener.in Industry Filter Extension

This Chrome Extension adds an "Industry Filter" to Screener.in's "Upcoming Results" and other pages.

## Features
- **Industry Database**: Scrapes and builds a local database of Stocks -> Industries (~2 minutes one-time setup).
- **Instant Filtering**: Adds a dropdown to filter the results table by industry.

## Installation
1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (top right).
3.  Click **Load unpacked**.
4.  Select this directory: `d:\Misc2\03_Investing_Tools\screenerin-chrome-ext`.

## Usage
1.  **Initialize**: Click the extension icon in the toolbar. Click "Initialize Industry Database".
2.  Wait for the progress bar to complete (scrapes ~200 industries).
3.  **Filter**: Go to [Upcoming Results](https://www.screener.in/upcoming-results/). You will see a "Filter by Industry" dropdown above the table.

## Development
- `manifest.json`: Configuration.
- `background.js`: Handles scraping logic.
- `content.js`: Handles UI injection and filtering.
- `popup.html/js`: UI for database management.
