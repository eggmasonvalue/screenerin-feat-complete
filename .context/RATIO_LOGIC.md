# Financial Ratio Logic & Data Sources

This document details the formulas and data inputs used in the Screener Chrome Extension's "Company Ratios Dashboard".

## Methodology

The extension uses two strategies to gather data:
1.  **Visible DOM Parsing**: Scrapes data already visible in the `Profit & Loss`, `Balance Sheet`, and `Cash Flow` tables.
2.  **Silent API Fetching (`DeepFetcher`)**: Asynchronously queries Screener's internal API (`/api/company/{id}/schedules/`) to retrieve granular breakdown data that is normally hidden inside collapsed rows. This ensures accurate calculations for metrics like `Inventory Turnover` without requiring manual UI expansion.

## Ratio Definitions

| Ratio | Value Formula | Input Sources & Identification Logic |
| :--- | :--- | :--- |
| **ROE %** | `Net Profit / Average Equity` | **Net Profit**: P&L table (`Net Profit`) <br> **Equity**: Balance Sheet (`Share Capital` + `Reserves`) <br> *Note: Uses average of current and previous year's equity.* |
| **ROCE %** | `EBIT / Average Capital Employed` | **EBIT**: P&L table (`Profit before tax` + `Interest`) <br> **Capital Employed**: Balance Sheet (`Share Capital` + `Reserves` + `Borrowings`) <br> *Note: Uses average capital employed.* |
| **ROIC %** | `NOPAT / Average Invested Capital` | **NOPAT**: `EBIT * (1 - Tax Rate)` <br> **Tax Rate**: Effective tax rate from P&L (`Tax %`) <br> **Invested Capital**: `(Equity + Reserves + Borrowings) - Cash Equivalents - Investments` <br> **Cash Equivalents**: Balance Sheet (`Cash Equivalents`) <br> **Investments**: Balance Sheet (`Investments`, fetched via `DeepFetcher`). |
| **Inventory Turnover** | `COGS / Average Inventory` | **COGS**: `Raw material cost + Change in inventory` (Preferred) OR `Sales * Material Cost %` (Fallback) <br> **Raw material cost**: Fetched via `DeepFetcher` from `Material Cost %` breakdown. <br> **Change in inventory**: Fetched via `DeepFetcher` from `Material Cost %` breakdown. <br> **Inventory**: Balance Sheet (fetched via `DeepFetcher` from `Other Assets` if hidden). |
| **Fixed Asset Turnover** | `Sales / Average Fixed Assets` | **Sales**: P&L table (`Sales`) <br> **Fixed Assets**: Balance Sheet (`Fixed Assets`). |
| **Debtor Days** | `(Average Receivables / Sales) * 365` | **Receivables**: Balance Sheet (`Trade receivables`, often hidden in `Other Assets`). <br> **Sales**: P&L table. |
| **Inventory Days** | `(Average Inventory / COGS) * 365` | **Inventory**: Balance Sheet (`Inventories`, often hidden in `Other Assets`). <br> **COGS**: Calculated as above. |
| **Days Payable** | `(Average Payables / Purchases) * 365` | **Payables**: Balance Sheet (`Trade Payables`, often hidden in `Other Liabilities`). <br> **Purchases**: Approximated as `COGS` (Raw Mat + Change in Inv). |
| **Working Capital Days** | `Debtor Days + Inventory Days - Payable Days` | Derived from the three ratios above. Available in **Screener Default** and **Efficiency** templates. Measures how quickly a company converts its operations into cash. |
| **Cash Conversion Cycle** | Same as Working Capital Days | Synonymous term for most non-financial companies. |
| **Current Ratio** | `Current Assets / Current Liabilities` | **Current Assets**: `Inventories + Trade receivables + Cash Equivalents + Loans n Advances + Other Assets` <br> **Current Liabilities**: `Trade Payables + Other liability items` <br> *Note: Uses granular data fetched via API.* |
| **Quick Ratio** | `Quick Assets / Current Liabilities` | **Quick Assets**: `Trade receivables + Cash Equivalents + Loans n Advances` <br> *Excludes Inventory.* |
| **Cash Ratio** | `Cash Equivalents / Current Liabilities` | **Cash Equivalents**: Balance Sheet (`Cash Equivalents`, fetched via `DeepFetcher`). |
| **Debt to Equity** | `Borrowings / Equity` | **Borrowings**: Balance Sheet (`Borrowings`) <br> **Equity**: Balance Sheet (`Share Capital` + `Reserves`). |
| **Interest Coverage** | `Operating Profit / Interest` | **Operating Profit**: P&L table (`Operating Profit`) <br> **Interest**: P&L table (`Interest`). |
| **Debt to Assets** | `Borrowings / Total Assets` | **Total Assets**: Balance Sheet (`Total Assets`). |
| **Financial Leverage** | `Total Assets / Equity` | Measures the extent to which a company uses debt to finance assets. |
| **CFO / EBITDA** | `CFO / EBITDA` | **CFO**: Cash Flow table (`Cash from Operating Activity`) <br> **EBITDA**: `Operating Profit + Other Income`. |
| **CFO / PAT** | `CFO / Net Profit` | **CFO**: Cash Flow (`Cash from Operating Activity`) <br> **Net Profit**: P&L (`Net Profit`). |
| **FCF Conversion** | `Free Cash Flow / Net Profit` | **Free Cash Flow**: See below. <br> **Net Profit**: P&L (`Net Profit`). |
| **Free Cash Flow** | `CFO + Net Capex` | **CFO**: Cash Flow (`Cash from Operating Activity`) <br> **Net Capex**: `Fixed assets purchased` (negative outflow) + `Fixed assets sold` (positive inflow) <br> *Note: Both Capex items are silently fetched via API from `Cash from Investing Activity` breakdown.* |

## Data Fetching Details

The extension creates a unified data context by merging visible table data with hidden API data.

### `DeepFetcher` Targets
These parent sections are queried to extract specific child rows:
1.  **`Material Cost %` (P&L)**: Extracts `Raw material cost`.
2.  **`Other Liabilities` (Balance Sheet)**: Extracts `Trade Payables`.
3.  **`Other Assets` (Balance Sheet)**: Extracts `Inventories`, `Trade receivables`, `Cash Equivalents`, `Loans n Advances`.
4.  **`Cash from Investing Activity` (Cash Flow)**: Extracts `Fixed assets purchased`, `Fixed assets sold`.

### Aliasing & Normalization
To handle inconsistent naming across different companies, the parser:
-   **Lowercases** all keys (e.g., "Trade Receivables" -> "trade receivables").
-   **Maps Aliases**:
    -   `equity capital` -> `share capital`
    -   `cash from operating activity` -> `net cash flow from operating activities`
