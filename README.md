# Screener.in Industry Filter Extension

A powerful Chrome Extension that adds **Industry-wise Filtering** capabilities to [Screener.in](https://www.screener.in/).

## 🚀 Features

### 1. Industry Filter Widget
- **Native Integration**: Adds a "Filter by Industry" dropdown seamlessly into the Screener sidebar.
- **Searchable Dropdown**: Easily find industries with a type-to-search interface.

### 2. Broad Compatibility
Works on multiple Screener.in pages:
- **[Upcoming Results](https://www.screener.in/upcoming-results/)**: Filters the results table.
- **[Latest Results](https://www.screener.in/results/latest/)**: Filters the list and supports deep scanning.

## 🛠️ Installation

1.  **Clone/Download** this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (toggle in top right).
4.  Click **Load unpacked**.
5.  Select the directory containing this `manifest.json`.

## 📖 Usage

1.  **Initialize Database**:
    - Click the extension icon in the toolbar.
    - Click **"Initialize Industry Database"**.
    - Wait for the progress bar. This is a one-time setup (suggest to be refreshed once a quarter).

2.  **Filter Results**:
    - Go to any supported page (e.g., [Upcoming Results](https://www.screener.in/upcoming-results/)).
    - Look for the **"Filter by Industry"** widget in the sidebar.
    - Select an industry to hide irrelevant rows.

## 🏗️ Architecture (v2.0.0)

- **Manifest V3**: Secure and performant.
- **Specialized Strategies**:
    - `TableStrategy`: Handles standard data tables.
    - `ListStrategy`: Handles complex list/card layouts with paired DOM nodes.
- **Rate Limiting**: Smart backoff system to respect Screener.in server limits.

## 🤝 Contributing

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

---
*Note: This is an unofficial extension and is not affiliated with Screener.in.*
