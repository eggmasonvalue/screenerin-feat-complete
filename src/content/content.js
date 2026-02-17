/**
 * Screener.in Filter Content Script
 * Handles UI injection and row filtering based on cached industry data.
 * v5.1.0: Company Ratios Dashboard & Quarterly Analysis
 */

console.log("Screener Content Script Active (v5.1.5-fix-ratio-ui)");

let stockMap = null;
let industryHierarchy = null;
let activeIndustry = "";
let isFetchingAll = false;
let currentFetchId = 0;
let quarterlyData = null; // Stores NSE-derived quarterly metrics

const DELAY_BETWEEN_PAGES = 300;

// -----------------------------------------------------
// Strategies
// -----------------------------------------------------

// PeopleStrategy is defined below with startPortfolioAnalysis

const TableStrategy = {
    name: 'TableStrategy',

    // Matches if we find a table inside a responsive holder (Upcoming) OR a standard data table
    matches: (doc) => {
        return !!doc.querySelector('.responsive-holder table') ||
            !!doc.querySelector('table.data-table tbody');
    },

    getItems: (scope = document) => {
        const table = scope.querySelector('.responsive-holder table') ||
            scope.querySelector('table.data-table');

        if (!table) return [];
        return Array.from(table.querySelectorAll('tbody tr'));
    },

    getSymbol: (item) => {
        const link = item.querySelector('a[href^="/company/"]');
        return link ? link.getAttribute('href').split('/')[2].split('#')[0] : null;
    },

    setVisible: (item, visible) => {
        item.style.display = visible ? '' : 'none';
    },

    appendItems: (newItems) => {
        const table = document.querySelector('.responsive-holder table') ||
            document.querySelector('table.data-table');
        const tbody = table ? table.querySelector('tbody') : null;

        if (tbody) {
            newItems.forEach(item => {
                const imported = document.adoptNode(item);
                imported.classList.add('extension-fetched-row'); // Mark for cleanup
                tbody.appendChild(imported);
            });
        }
    },

    // Inject status INSIDE the card containing the table, at the bottom.
    // This prevents layout breakage in flex containers.
    getStatusInjectionPoint: () => {
        const table = document.querySelector('.responsive-holder table') ||
            document.querySelector('table.data-table');

        // For TableStrategy, we want it just above the responsive holder or the table itself
        if (table) {
            const holder = table.closest('.responsive-holder');
            if (holder) return holder.parentElement;
            return table.parentElement;
        }
        return null;
    },

    cleanupItems: () => {
        document.querySelectorAll('.extension-fetched-row').forEach(el => el.remove());
    },

    updateIndustryColumn: (show) => {
        // Only run on Upcoming Results or Latest Results
        if (!window.location.pathname.includes('/upcoming-results/') &&
            !window.location.pathname.includes('/results/latest/')) return;

        const table = document.querySelector('.responsive-holder table') ||
            document.querySelector('table.data-table');
        if (!table) return;

        // 1. Handle Header
        const theadRow = table.querySelector('thead tr');
        if (theadRow) {
            let th = theadRow.querySelector('.ext-industry-col');
            if (show) {
                if (!th) {
                    th = document.createElement('th');
                    th.className = 'ext-industry-col';

                    // Wrap in <a> to match Screener's header styling (purple/blue color)
                    // Use pointer-events: none to prevent it from looking clickable (no hand cursor)
                    const link = document.createElement('a');
                    link.href = "javascript:void(0)";
                    link.innerText = 'Industry';
                    link.style.pointerEvents = "none";
                    link.style.cursor = "default";
                    link.style.textDecoration = "none";

                    th.appendChild(link);
                    th.style.textAlign = 'left'; // Match typical text column alignment

                    // Insert before the last column (Result Date) or at end if only 2 cols
                    // Current: Company | Date. We want: Company | Industry | Date
                    // So insert at index 1.
                    const targetIndex = 1;
                    if (theadRow.children.length > targetIndex) {
                        theadRow.insertBefore(th, theadRow.children[targetIndex]);
                    } else {
                        theadRow.appendChild(th);
                    }
                }
                th.style.display = '';
            } else if (th) {
                th.style.display = 'none';
            }
        }

        // 2. Handle Rows
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            let td = row.querySelector('.ext-industry-col');

            if (show) {
                if (!td) {
                    td = document.createElement('td');
                    td.className = 'ext-industry-col';
                    td.style.textAlign = 'left';

                    const symbol = TableStrategy.getSymbol(row);
                    const industry = stockMap[symbol];

                    if (industry) {
                        td.innerText = industry;
                    } else {
                        td.innerText = '-';
                    }

                    const targetIndex = 1;
                    if (row.children.length > targetIndex) {
                        row.insertBefore(td, row.children[targetIndex]);
                    } else {
                        row.appendChild(td);
                    }
                }
                td.style.display = '';
            } else if (td) {
                td.style.display = 'none';
            }
        });
    }
};

const ListStrategy = {
    name: 'ListStrategy',
    // Matches Latest Results style: .mark-visited container with .flex-row children
    matches: (doc) => !!doc.querySelector('.mark-visited .flex-row'),

    getItems: (scope = document) => {
        const container = scope.querySelector('.mark-visited');
        // In List View, items are the headers (.flex-row).
        return container ? Array.from(container.querySelectorAll('.flex-row')) : [];
    },

    getSymbol: (item) => {
        const link = item.querySelector('a[href^="/company/"]');
        return link ? link.getAttribute('href').split('/')[2].split('#')[0] : null;
    },

    setVisible: (item, visible) => {
        item.style.display = visible ? '' : 'none';
        const next = item.nextElementSibling;
        if (next && (next.classList.contains('bg-base') || next.querySelector('.bg-base'))) {
            next.style.display = visible ? '' : 'none';
        }
    },

    appendItems: (newItems) => {
        const container = document.querySelector('.mark-visited');
        if (container) {
            newItems.forEach(item => {
                // IMPORTANT: Get reference to sibling BEFORE adopting the header
                const nextSibling = item.nextElementSibling;
                const hasDataHTML = nextSibling && (nextSibling.classList.contains('bg-base') || nextSibling.querySelector('.bg-base'));

                // Adopt Header
                const importedHeader = document.adoptNode(item);
                importedHeader.classList.add('extension-fetched-row');
                container.appendChild(importedHeader);

                // Adopt Data Table if it exists
                if (hasDataHTML) {
                    const importedData = document.adoptNode(nextSibling);
                    importedData.classList.add('extension-fetched-row');
                    container.appendChild(importedData);
                }
            });
        }
    },

    getStatusInjectionPoint: () => {
        // Find the container of the list
        const listContainer = document.querySelector('.mark-visited');
        // We want to return the parent so we can insert *before* the list
        return listContainer ? listContainer.parentElement : document.querySelector('#content-area'); // Fallback
    },

    getMetrics: (item) => {
        const nextSibling = item.nextElementSibling;
        if (!nextSibling) return {};

        // In the list view, the details are in the *next* sibling .responsive-holder usually, 
        // but user says it's a table. Let's find the table in the sibling.
        // The structure is usually ItemRow -> DetailsRow.
        const table = nextSibling.querySelector('table.data-table');

        if (!table) return {
            'Sales': null, 'EBIDT': null, 'Net Profit': null, 'EPS': null
        };

        const getVal = (selector) => {
            const row = table.querySelector(selector);
            if (!row) return null;
            // The value is in the 2nd column (index 1)
            const cell = row.querySelectorAll('td')[1];
            if (!cell) return null;

            const text = cell.innerText.trim(); // "⇡ 14%" or "⇣ 67%"
            const isDown = text.includes('⇣') || cell.querySelector('.down');

            // Extract number
            const match = text.match(/([\d\.]+)/);
            if (match) {
                let val = parseFloat(match[1]);
                if (isDown) val = -val;
                return val;
            }
            return null;
        };

        return {
            'Sales': getVal('tr[data-sales]'),
            'EBIDT': getVal('tr[data-ebidt]'),
            'Net Profit': getVal('tr[data-net-profit]'),
            'EPS': getVal('tr[data-eps]')
        };
    },

    cleanupItems: () => {
        document.querySelectorAll('.extension-fetched-row').forEach(el => el.remove());
    }
};

let activeStrategy = null;

// -----------------------------------------------------
// Analysis Logic (People Page)
// -----------------------------------------------------

const PeopleStrategy = {
    name: 'PeopleStrategy',
    matches: (doc) => {
        return window.location.pathname.includes('/people/') &&
            !!doc.querySelector('#shareholdings table.data-table');
    },
    // No "items" in the filtering sense, but we need to init the analysis
    init: () => {
        startPortfolioAnalysis();
    }
};

function findShareholdingTable(doc = document) {
    // Robust ID-based selector works on both Desktop and Mobile
    return doc.querySelector('#shareholdings table.data-table');
}

// ... existing code ...

async function startPortfolioAnalysis() {
    const table = findShareholdingTable();
    if (!table) {
        console.warn("Portfolio Analysis: Shareholdings table not found.");
        return;
    }

    // 1. Inject Columns
    const theadRow = table.querySelector('thead tr');
    if (theadRow && !theadRow.querySelector('.portfolio-header')) {
        const thValue = document.createElement('th');
        thValue.className = 'portfolio-header';
        thValue.innerText = '₹ Cr';
        thValue.style.textAlign = 'right';
        thValue.title = "Current Value in Crores";

        const thPercent = document.createElement('th');
        thPercent.className = 'portfolio-header';
        thPercent.innerText = '% PF'; // Even shorter
        thPercent.style.textAlign = 'right';
        thPercent.title = "Percentage of visible portfolio";

        theadRow.appendChild(thValue);
        theadRow.appendChild(thPercent);
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const holdings = [];

    // 2. Parse Rows & Setup Placeholders
    rows.forEach(row => {
        if (row.querySelector('.portfolio-cell')) return;

        const tdValue = document.createElement('td');
        tdValue.className = 'portfolio-cell portfolio-val';
        tdValue.style.textAlign = 'right';
        tdValue.innerText = '...';

        const tdPercent = document.createElement('td');
        tdPercent.className = 'portfolio-cell portfolio-pct';
        tdPercent.style.textAlign = 'right';
        tdPercent.innerText = '-';

        row.appendChild(tdValue);
        row.appendChild(tdPercent);

        const link = row.querySelector('td.text a');
        if (!link) return;

        const url = link.href;
        let percentHolding = 0;

        const cells = Array.from(row.querySelectorAll('td'));

        // Strict Logic: Use ONLY the last period's value (last original column)
        // We added 2 columns, so the last original is at index length - 3
        if (cells.length >= 3) {
            const lastOriginalCell = cells[cells.length - 3];
            const txt = lastOriginalCell.innerText.trim();
            if (txt && !isNaN(parseFloat(txt))) {
                percentHolding = parseFloat(txt);
            }
        }

        if (percentHolding > 0) {
            holdings.push({
                row: row,
                url: url,
                percent: percentHolding,
                marketCap: 0,
                value: 0
            });
        }
    });

    // 4. Fetch Data (Via Background script to handle backoff globally)
    // No status UI is shown as per user request

    // Status UI block removed

    // 4. Fetch Data (Via Background script to handle backoff globally)
    let completed = 0;
    let totalPortfolioValue = 0;

    const chunkSize = 3; // Conservative chunking
    for (let i = 0; i < holdings.length; i += chunkSize) {
        const chunk = holdings.slice(i, i + chunkSize);

        await Promise.all(chunk.map(async (item) => {
            try {
                // Background handles retries and backoff
                const mcap = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({ action: "fetchMarketCap", url: item.url }, (res) => {
                        if (res?.error) reject(new Error(res.error));
                        else resolve(res?.mcap || 0);
                    });
                });

                item.marketCap = mcap;
                item.value = mcap * (item.percent / 100);
                totalPortfolioValue += item.value;

                // Update Row Immediately
                const valCell = item.row.querySelector('.portfolio-val');
                if (valCell) valCell.innerText = formatCurrency(item.value);

            } catch (e) {
                console.error(`Portfolio: Failed for ${item.url}`, e);
                const valCell = item.row.querySelector('.portfolio-val');
                if (valCell) valCell.innerText = 'Err';
            } finally {
                completed++;
            }
        }));

        // Delay between chunks to avoid overwhelming the queue
        if (i + chunkSize < holdings.length) {
            await new Promise(r => setTimeout(r, 600));
        }
    }

    // 5. Final Calculation (% Portfolio)
    holdings.forEach(item => {
        if (totalPortfolioValue > 0) {
            const portPct = (item.value / totalPortfolioValue) * 100;
            const pctCell = item.row.querySelector('.portfolio-pct');
            if (pctCell) pctCell.innerText = portPct.toFixed(2) + '%';
        }
    });

    // Summary removed as per user request
}

function formatCurrency(val) {
    return val.toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
    });
}

// -----------------------------------------------------
// Core Logic
// -----------------------------------------------------

async function init() {
    try {
        // Check for People Page Strategy first
        if (PeopleStrategy.matches(document)) {
            console.log("Screener Filter: People Strategy Active");
            PeopleStrategy.init();
            return; // Exit, don't do industry filtering on people pages
        }

        // Check for Company Page Strategy
        if (CompanyStrategy.matches(document)) {
            await CompanyStrategy.init();
            return;
        }

        const data = await chrome.storage.local.get(['stockMap', 'industryHierarchy']);
        if (!data.stockMap) {
            console.log("Screener Filter: No industry data found.");
            // Even if no industry data, we might want to allow other features if added later
            // But for now, just return
            return;
        }
        stockMap = data.stockMap;
        industryHierarchy = data.industryHierarchy || {};

        // Determine Strategy
        if (ListStrategy.matches(document)) {
            activeStrategy = ListStrategy;
        } else if (TableStrategy.matches(document)) {
            activeStrategy = TableStrategy;
        } else {
            console.log("Screener Filter: No compatible view detected.");
            return;
        }

        console.log(`Screener Filter: Strategy selected -> ${activeStrategy.name}`);

        // Initial Industry Column Injection (Show by default)
        if (activeStrategy.updateIndustryColumn) {
            activeStrategy.updateIndustryColumn(true);
        }

        injectSidebarUI();
        initMobileObserver(); // Add observer for mobile modal

    } catch (err) {
        console.error("Screener Filter Init Error:", err);
    }
}

function initMobileObserver() {
    // Watch for the modal being added to the DOM
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.matches('dialog.modal')) {
                        // Modal added, check if it contains our filter
                        handleMobileModal(node);
                    }
                });
            }
        });
    });

    observer.observe(document.body, { childList: true });
}

function handleMobileModal(modal) {
    // delay slightly to let content settle if needed
    setTimeout(() => {
        const filterWrapper = modal.querySelector('.change-list-filter[data-ext="industry-filter"]');
        if (filterWrapper) {
            console.log("Screener Filter: Detected mobile modal. Re-initializing filter.");

            // The content inside is dead (cloned without listeners).
            // We need to clear the old content and re-inject the Combobox.
            // Structure: details > div > combobox
            const contentContainer = filterWrapper.querySelector('details > div');

            if (contentContainer) {
                // Clear dead content
                contentContainer.innerHTML = '';

                // Re-create Combobox
                const industries = new Set(Object.values(stockMap));
                const sortedIndustries = Array.from(industries).sort();

                const combobox = new Combobox(sortedIndustries, industryHierarchy, async (selected) => {
                    activeIndustry = selected;
                    currentFetchId++;
                    isFetchingAll = false;
                    await applyFilter();
                });

                // If there was an active selection, restore it
                if (activeIndustry) {
                    combobox.input.value = activeIndustry;
                }

                contentContainer.appendChild(combobox.element);
            }
        }
    }, 100);
}

function injectSidebarUI() {
    // Skip injection for people pages
    if (PeopleStrategy.matches(document)) {
        return;
    }

    // Primary Target: #change-list-filters (Shared by Upcoming and Latest Results)
    let parent = document.querySelector('#change-list-filters .content');

    // Fallback logic
    if (!parent) parent = document.querySelector('#change-list-filters');
    if (!parent) parent = document.querySelector('aside .sidebar-panel, #sidebar .sidebar-panel');
    if (!parent) parent = document.querySelector('aside, .sidebar, .column-3');

    if (!parent) {
        console.log("Screener Filter: No sidebar found for injection.");
        return;
    }

    // Check if already injected
    if (document.querySelector('.change-list-filter[data-ext="industry-filter"]')) return;

    // Create Widget
    const wrapper = document.createElement('div');
    wrapper.className = 'change-list-filter';
    wrapper.dataset.ext = "industry-filter";
    wrapper.style.marginBottom = "16px";

    const details = document.createElement('details');
    details.open = true;

    const summary = document.createElement('summary');
    summary.style.fontWeight = "600";
    summary.style.cursor = "pointer";
    summary.style.marginBottom = "8px";

    const summaryText = document.createElement('span');
    summaryText.innerHTML = 'By Industry <a href="https://www.nseindia.com/static/products-services/industry-classification" target="_blank" rel="noopener noreferrer" style="font-size: 0.85em; font-weight: normal;">(NSE classification)</a>';
    summary.appendChild(summaryText);

    // Warning Icon with Tooltip
    const warningContainer = document.createElement('span');
    warningContainer.className = 'screener-warning-container';

    // Use Screener's native icon class 'icon-info'
    const warningIcon = document.createElement('i');
    warningIcon.className = 'icon-info screener-warning-icon';

    const tooltip = document.createElement('span');
    tooltip.className = 'screener-tooltip';
    tooltip.innerText = "Applying other filters after this filter would clear this filter. So, apply all the other filters you want before applying this.";

    warningIcon.appendChild(tooltip); // Nesting inside icon for CSS hover
    warningContainer.appendChild(warningIcon);
    summaryText.appendChild(warningContainer);

    const contentContainer = document.createElement('div');
    contentContainer.style.padding = "4px 0";

    // Build Combobox
    const industries = new Set(Object.values(stockMap));
    const sortedIndustries = Array.from(industries).sort();

    const combobox = new Combobox(sortedIndustries, industryHierarchy, async (selected) => {
        activeIndustry = selected;
        currentFetchId++;
        isFetchingAll = false;
        await applyFilter();
    });

    contentContainer.appendChild(combobox.element);
    details.appendChild(summary);
    details.appendChild(contentContainer);
    wrapper.appendChild(details);

    // Strict Prepend
    if (parent.firstChild) {
        parent.insertBefore(wrapper, parent.firstChild);
    } else {
        parent.appendChild(wrapper);
    }
}

async function applyFilter() {
    if (!activeStrategy) return;

    // Cleanup deep-fetched items whenever filter changes or clears
    activeStrategy.cleanupItems();
    // Also remove the status bar if it exists (fresh start)
    document.querySelector('.screener-scanner-status')?.remove();

    if (activeIndustry === "") {
        if (activeStrategy.updateIndustryColumn) {
            activeStrategy.updateIndustryColumn(true); // Show column when no filter
        }
        showAllRows();
        return;
    }

    // Hide Industry column when filtering by industry (redundant info)
    if (activeStrategy.updateIndustryColumn) {
        activeStrategy.updateIndustryColumn(false);
    }

    const items = activeStrategy.getItems(document);
    let visibleCount = 0;

    items.forEach(item => {
        const symbol = activeStrategy.getSymbol(item);
        const industry = stockMap[symbol] || "Unknown";

        if (industry === activeIndustry) {
            activeStrategy.setVisible(item, true);
            visibleCount++;
        } else {
            activeStrategy.setVisible(item, false);
        }
    });

    updateFilterStatus(visibleCount);
}

function showAllRows() {
    if (!activeStrategy) return;
    const items = activeStrategy.getItems(document);
    items.forEach(item => activeStrategy.setVisible(item, true));

    document.querySelector('.screener-scanner-status')?.remove();
    document.querySelector('.paginator')?.style.setProperty('display', '', 'important');
    isFetchingAll = false;
}

function updateFilterStatus(currentMatches, isComplete = false) {
    let statusEl = document.querySelector('.screener-scanner-status');
    const injectionPoint = activeStrategy.getStatusInjectionPoint();

    // Hide native pagination when filtering
    const nativePag = document.querySelector('.paginator');
    if (nativePag) nativePag.style.display = 'none';

    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'screener-scanner-status';

        // Inject at the TOP of the results
        if (injectionPoint) {
            // List Strategy (Latest Results)
            if (activeStrategy.name === 'ListStrategy') {
                const list = document.querySelector('.mark-visited');
                if (list) injectionPoint.insertBefore(statusEl, list);
                else injectionPoint.insertBefore(statusEl, injectionPoint.firstChild);
            }
            // Table Strategy (Screens)
            else {
                // For custom screens, we want it before the table wrapper
                const table = document.querySelector('.responsive-holder') || document.querySelector('table.data-table');
                if (table && injectionPoint.contains(table)) {
                    injectionPoint.insertBefore(statusEl, table);
                } else {
                    injectionPoint.insertBefore(statusEl, injectionPoint.firstChild);
                }
            }
        }
    }

    // --- Calculate Stats ---
    const metrics = {
        'Sales': [],
        'EBIDT': [],
        'Net Profit': [],
        'EPS': []
    };

    if (activeStrategy.getMetrics) {
        const items = activeStrategy.getItems(document);
        items.forEach(item => {
            // Check visibility using style.display
            if (item.style.display === 'none') return;

            const m = activeStrategy.getMetrics(item);
            if (m['Sales'] !== null) metrics['Sales'].push(m['Sales']);
            if (m['EBIDT'] !== null) metrics['EBIDT'].push(m['EBIDT']);
            if (m['Net Profit'] !== null) metrics['Net Profit'].push(m['Net Profit']);
            if (m['EPS'] !== null) metrics['EPS'].push(m['EPS']);
        });
    }

    const calcStats = (arr) => {
        if (arr.length === 0) return { median: '-', avg: '-', dev: '-' };
        arr.sort((a, b) => a - b);

        const sum = arr.reduce((a, b) => a + b, 0);
        const avg = sum / arr.length;

        let median;
        const mid = Math.floor(arr.length / 2);
        if (arr.length % 2 === 0) {
            median = (arr[mid - 1] + arr[mid]) / 2;
        } else {
            median = arr[mid];
        }

        // Standard Deviation (Population)
        const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
        const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / arr.length;
        const stdDev = Math.sqrt(avgSquareDiff);

        return {
            median: median.toFixed(1) + '%',
            avg: avg.toFixed(1) + '%',
            dev: '±' + stdDev.toFixed(1) + '%'
        };
    };

    const stats = {
        'Sales': calcStats(metrics['Sales']),
        'EBIDT': calcStats(metrics['EBIDT']),
        'Net Profit': calcStats(metrics['Net Profit']),
        'EPS': calcStats(metrics['EPS'])
    };

    // --- Build HTML ---
    const nextUrl = getNextPageUrl(document);
    // If nextUrl exists and we haven't completed a scan, show button.
    // If isComplete is true, show "All pages scanned".
    const showButton = nextUrl && !isComplete;

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:600; font-size:16px;">
                Found ${currentMatches} matches
            </div>
            ${showButton ? `<button class="button-primary load-all-btn">Scan All Pages for Complete Stats</button>` : `<span style="color:var(--sif-secondary); font-size:13px;">✓ All pages scanned</span>`}
        </div>
    `;

    if (activeStrategy.name === 'ListStrategy') {
        html += `
            <div class="screener-stats-grid">
                <div></div> <!-- Empty top-left -->
                <div class="screener-stats-header">Median</div>
                <div class="screener-stats-header">Average</div>
                <div class="screener-stats-header">Std Dev</div>

                <div class="screener-stats-label">Sales</div>
                <div class="screener-stats-value">${stats['Sales'].median}</div>
                <div class="screener-stats-value">${stats['Sales'].avg}</div>
                <div class="screener-stats-value" style="font-size:12px;">${stats['Sales'].dev}</div>

                <div class="screener-stats-label">EBIDT</div>
                <div class="screener-stats-value">${stats['EBIDT'].median}</div>
                <div class="screener-stats-value">${stats['EBIDT'].avg}</div>
                <div class="screener-stats-value" style="font-size:12px;">${stats['EBIDT'].dev}</div>

                <div class="screener-stats-label">Net Profit</div>
                <div class="screener-stats-value">${stats['Net Profit'].median}</div>
                <div class="screener-stats-value">${stats['Net Profit'].avg}</div>
                <div class="screener-stats-value" style="font-size:12px;">${stats['Net Profit'].dev}</div>

                <div class="screener-stats-label">EPS</div>
                <div class="screener-stats-value">${stats['EPS'].median}</div>
                <div class="screener-stats-value">${stats['EPS'].avg}</div>
                <div class="screener-stats-value" style="font-size:12px;">${stats['EPS'].dev}</div>
            </div>
        `;
    }

    if (showButton) {
        html += `<div style="margin-top:12px; color:var(--sif-secondary); font-size:12px;">* Stats are currently based on visible rows only. Click 'Scan All Pages' to aggregate data from all result pages.</div>`;
    }

    statusEl.innerHTML = html;

    const btn = statusEl.querySelector('button');
    if (btn) {
        btn.addEventListener('click', () => startDeepFetch(statusEl));
    }
}

async function startDeepFetch(statusEl) {
    if (isFetchingAll || !activeStrategy) return;
    isFetchingAll = true;
    const fetchId = currentFetchId;

    let totalMatches = activeStrategy.getItems(document).filter(item => {
        const sym = activeStrategy.getSymbol(item);
        return (stockMap[sym] || "Unknown") === activeIndustry;
    }).length;

    let pagesScanned = 1;
    let nextUrl = getNextPageUrl(document);
    let errorCount = 0;

    statusEl.innerHTML = `<div style="padding:4px 0;">Fetching all pages... <br>Found: <strong>${totalMatches}</strong></div>`;

    while (nextUrl && isFetchingAll && fetchId === currentFetchId) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES));
        statusEl.innerHTML = `<div style="padding:4px 0;">Scanning Page ${pagesScanned + 1}... <br>Found: <strong>${totalMatches}</strong></div>`;

        try {
            let response = await fetch(nextUrl);
            if (response.status === 429) {
                statusEl.innerHTML += `<div style="color:orange; font-size:11px;">Rate limit hit. Pausing...</div>`;
                await new Promise(r => setTimeout(r, 10000));
                response = await fetch(nextUrl);
            }

            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            const text = await response.text();

            if (!isFetchingAll || fetchId !== currentFetchId) break;

            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const newItems = activeStrategy.getItems(doc);

            const matchesToAdd = [];
            newItems.forEach(item => {
                const sym = activeStrategy.getSymbol(item);
                const ind = stockMap[sym] || "Unknown";
                if (ind === activeIndustry) {
                    matchesToAdd.push(item);
                    totalMatches++;
                }
            });

            if (matchesToAdd.length > 0) {
                activeStrategy.appendItems(matchesToAdd);
            }

            nextUrl = getNextPageUrl(doc);
            pagesScanned++;
            errorCount = 0;

        } catch (e) {
            console.error("Deep fetch error:", e);
            errorCount++;
            if (errorCount > 3) break;
        }
    }

    if (fetchId === currentFetchId) {
        isFetchingAll = false;
        // Re-render the full status UI by passing true for isComplete
        updateFilterStatus(totalMatches, true);
    }
}

function getNextPageUrl(doc) {
    const activePage = doc.querySelector('.paginator span.this-page');
    if (!activePage) return null;
    let nextLink = activePage.nextElementSibling;
    while (nextLink) {
        if (nextLink.tagName === 'A') return nextLink.getAttribute('href');
        nextLink = nextLink.nextElementSibling;
    }
    return null;
}

// -----------------------------------------------------
// UI Components
// -----------------------------------------------------

class Combobox {
    constructor(items, hierarchyMap, onSelect) {
        this.items = items;
        this.hierarchyMap = hierarchyMap || {};
        this.onSelect = onSelect;
        this.isOpen = false;

        this.element = document.createElement('div');
        this.element.className = 'screener-combobox-container';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'screener-combobox-input';
        this.input.placeholder = 'Search by any level...';
        this.input.addEventListener('keydown', (e) => e.stopPropagation());

        // Clear Button (X)
        this.clearBtn = document.createElement('span');
        this.clearBtn.className = 'screener-combobox-clear';
        this.clearBtn.innerHTML = '&times;';
        this.clearBtn.title = "Clear Filter";

        this.clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clear();
        });

        this.list = document.createElement('ul');
        this.list.className = 'screener-combobox-list';

        this.element.appendChild(this.input);
        this.element.appendChild(this.clearBtn);
        this.element.appendChild(this.list);

        this.input.addEventListener('input', () => {
            this.toggleClearBtn();
            this.filterList();
        });
        this.input.addEventListener('focus', () => {
            this.filterList();
            this.open();
        });

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.element.contains(e.target)) this.close();
        });
    }

    toggleClearBtn() {
        if (this.input.value.length > 0) {
            this.clearBtn.style.display = 'block';
        } else {
            this.clearBtn.style.display = 'none';
        }
    }

    filterList() {
        const val = this.input.value.toLowerCase();
        const matches = this.items.filter(basicIndustry => {
            // Search across all hierarchy levels
            const hierarchy = this.hierarchyMap[basicIndustry];
            if (!hierarchy) {
                // Fallback: just search the basic industry name
                return basicIndustry.toLowerCase().includes(val);
            }

            // Match if search term appears in any level
            return basicIndustry.toLowerCase().includes(val) ||
                hierarchy.macro.toLowerCase().includes(val) ||
                hierarchy.sector.toLowerCase().includes(val) ||
                hierarchy.industry.toLowerCase().includes(val);
        });
        this.renderList(matches);
    }

    renderList(matches) {
        this.list.innerHTML = '';
        if (matches.length === 0) {
            const li = document.createElement('li');
            li.className = 'screener-combobox-item no-matches';
            li.innerText = 'No matches';
            this.list.appendChild(li);
        } else {
            matches.forEach(basicIndustry => {
                const li = document.createElement('li');
                li.className = 'screener-combobox-item';

                // Main industry name
                const mainText = document.createElement('div');
                mainText.style.fontWeight = '500';
                mainText.innerText = basicIndustry;

                li.appendChild(mainText);

                // Hierarchy path (if available)
                const hierarchy = this.hierarchyMap[basicIndustry];
                if (hierarchy) {
                    const hierarchyText = document.createElement('div');
                    hierarchyText.style.fontSize = '0.75em';
                    hierarchyText.style.color = 'var(--sif-secondary, #666)';
                    hierarchyText.style.marginTop = '2px';
                    hierarchyText.innerText = `${hierarchy.macro} → ${hierarchy.sector} → ${hierarchy.industry}`;
                    li.appendChild(hierarchyText);
                }

                li.addEventListener('mousedown', () => this.select(basicIndustry));
                this.list.appendChild(li);
            });
        }
    }

    open() { this.element.classList.add('open'); this.list.style.display = 'block'; this.isOpen = true; }
    close() { this.element.classList.remove('open'); this.list.style.display = 'none'; this.isOpen = false; }

    select(item) {
        this.input.value = item;
        this.toggleClearBtn();
        this.onSelect(item);
        this.close();
    }

    clear() {
        this.input.value = '';
        this.toggleClearBtn();
        this.onSelect("");
        this.close();
    }
}

// -----------------------------------------------------
// Company Page Strategy (Ratios)
// -----------------------------------------------------

const CompanyStrategy = {
    name: 'CompanyStrategy',
    matches: (doc) => {
        return window.location.pathname.includes('/company/');
    },
    init: async () => {
        console.log("Screener Filter: Company Strategy Init Start");

        // Wait for Ratios section at the bottom (max 6 seconds)
        let retries = 0;
        const getContainer = () => document.querySelector('section#ratios');

        while ((!getContainer() || !getContainer().querySelector('table')) && retries < 15) {
            await new Promise(r => setTimeout(r, 400));
            retries++;
        }

        const container = getContainer();
        if (!container) {
            console.warn("Screener Filter: Ratios footer section (#ratios) not found after retries.");
            return;
        }
        console.log("Screener Filter: Ratios container found.");

        // 0. Pre-fetch granular data silently (No UI expansion)
        console.log("Screener Filter: Fetching deep data...");
        const deepData = await DeepFetcher.fetchAll();
        console.log("Screener Filter: Deep data fetch complete.", Object.keys(deepData).length, "metrics found.");

        // 1. Data Parsing
        const financialData = DataParser.parseAll();
        if (!financialData) {
            console.error("Screener Filter: Failed to parse financial data.");
            return;
        }

        // 1.5 Merge Deep Data
        DataParser.mergeDeepData(financialData, deepData);

        // 2. Initialize UI (Footer Ratios)
        console.log("Screener Filter: Initializing RatioUI...");
        RatioUI.init(financialData);

        // 3. Quarterly Results Augmentation (Preserve User Feature)
        console.log("Screener Filter: Initializing QuarterlyAnalysis...");
        await QuarterlyAnalysis.init();
        console.log("Screener Filter: Company Strategy Init Complete.");
    }
};

const DeepFetcher = {
    fetchAll: async () => {
        try {
            // Robust companyId retrieval
            const companyId = document.getElementById('company-info')?.dataset.companyId ||
                document.querySelector('[data-company-id]')?.dataset.companyId ||
                document.body.dataset.companyId;

            console.log("DeepFetcher: Resolved companyId:", companyId);
            if (!companyId) {
                console.warn("DeepFetcher: Failed to find company ID. Searched #company-info, [data-company-id], and body dataset.");
                return {};
            }

            // Check if consolidated
            const isConsolidated = document.body.innerText.includes('Consolidated Figures');

            const targets = [
                { parent: 'Material Cost %', section: 'profit-loss' },
                { parent: 'Other Liabilities', section: 'balance-sheet' },
                { parent: 'Other Assets', section: 'balance-sheet' },
                { parent: 'Cash from Investing Activity', section: 'cash-flow' }
            ];

            // Some companies have 'Other Liabilities -' or 'Other Assets +'
            // We'll try to match by partial text if exact fails, but since we fetch by ID,
            // we should try to find the exact name from the DOM first.
            const findExactName = (text) => {
                const btn = Array.from(document.querySelectorAll('button, tr td'))
                    .find(el => el.innerText.trim().toLowerCase().startsWith(text.toLowerCase()));
                return btn ? btn.innerText.trim().replace(/\s*[+\-]$/, '') : text;
            };

            const requests = targets.map(t => {
                const exactParent = findExactName(t.parent);
                console.log(`DeepFetcher: Requesting schedule for "${exactParent}" in ${t.section}`);
                return DeepFetcher.fetchSchedule(companyId, isConsolidated, exactParent, t.section);
            });
            const results = await Promise.all(requests);

            // Merge all results into a single dictionary
            const combined = {};
            results.forEach(res => {
                Object.assign(combined, res);
            });

            console.log(`DeepFetcher: Combined ${Object.keys(combined).length} hidden metrics.`);
            return combined;
        } catch (e) {
            console.error("Screener Filter: DeepFetch failed", e);
            return {};
        }
    },

    fetchSchedule: async (companyId, isConsolidated, parent, section) => {
        try {
            const params = new URLSearchParams({
                parent: parent,
                section: section
            });
            if (isConsolidated) params.append('consolidated', '');

            const url = `/api/company/${companyId}/schedules/?${params.toString()}`;
            const res = await fetch(url);
            if (!res.ok) return {};

            const json = await res.json();
            // JSON format: { "Metric Name": { "Mar 2021": "123", ... }, ... }
            return json;
        } catch (e) {
            return {};
        }
    }
};

const DataParser = {
    parseAll: () => {
        const years = DataParser.getYears();
        if (!years.length) {
            console.error("Screener Filter: Could not find years in Balance Sheet.");
            return null;
        }

        const data = {
            years: years,
            pl: DataParser.parseTable('#profit-loss table'),
            bs: DataParser.parseTable('#balance-sheet table'),
            cf: DataParser.parseTable('#cash-flow table')
        };
        return data;
    },

    getYears: () => {
        // Try to get years from Balance Sheet (usually most consistent)
        const table = document.querySelector('#balance-sheet table');
        if (!table) return [];

        const headerRow = table.querySelector('thead tr');
        if (!headerRow) return [];

        // Skip first cell (Metric name)
        const headers = Array.from(headerRow.querySelectorAll('th')).slice(1);
        return headers.map(th => th.innerText.trim());
    },

    parseTable: (selector) => {
        const table = document.querySelector(selector);
        if (!table) return {};

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        const result = {};

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;

            // Clean metric name and lowercase for robust lookup
            let metricName = cells[0].innerText.trim()
                .replace(/\s*[+\-]$/, '') // Remove trailing + or -
                .replace(/^[+\-\s]+/, '') // Remove leading symbols
                .trim()
                .toLowerCase();

            const values = [];
            for (let i = 1; i < cells.length; i++) {
                const txt = cells[i].innerText.trim().replace(/,/g, '');
                // Handle percentages or bracketed negatives "(123)"
                let cleanedTxt = txt.replace('%', '');
                if (cleanedTxt.startsWith('(') && cleanedTxt.endsWith(')')) {
                    cleanedTxt = '-' + cleanedTxt.slice(1, -1);
                }
                const val = parseFloat(cleanedTxt);
                values.push(isNaN(val) ? null : val);
            }

            result[metricName] = values;
        });

        return result;
    },

    mergeDeepData: (financialData, deepData) => {
        if (!deepData || Object.keys(deepData).length === 0) return;

        const yearMap = {};
        financialData.years.forEach((y, i) => yearMap[y] = i);

        for (const [metric, yearValues] of Object.entries(deepData)) {
            const cleanKey = metric.trim().toLowerCase();
            const values = new Array(financialData.years.length).fill(null);

            let foundAny = false;
            for (const [year, valStr] of Object.entries(yearValues)) {
                if (yearMap.hasOwnProperty(year)) {
                    const idx = yearMap[year];
                    let txt = valStr.toString().replace(/,/g, '');
                    if (txt.includes('%')) txt = txt.replace('%', '');
                    if (txt.startsWith('(') && txt.endsWith(')')) txt = '-' + txt.slice(1, -1);
                    const val = parseFloat(txt);
                    if (!isNaN(val)) {
                        values[idx] = val;
                        foundAny = true;
                    }
                }
            }

            if (foundAny) {
                const overwriteIfEmpty = (sourceKey, key, newValues) => {
                    const existing = financialData[sourceKey][key];
                    // If doesn't exist OR is all nulls/zeros, overwrite
                    if (!existing || existing.every(v => v === null || v === 0)) {
                        financialData[sourceKey][key] = newValues;
                    }
                };

                overwriteIfEmpty('pl', cleanKey, values);
                overwriteIfEmpty('bs', cleanKey, values);
                overwriteIfEmpty('cf', cleanKey, values);
            }
        }
    }
};

const RatioCalculator = {
    calculate: (data, ratioConfig) => {
        const results = [];
        for (let i = 0; i < data.years.length; i++) {
            try {
                // Helper to safely get value for year i with case-insensitive and alias support
                const get = (source, key) => {
                    const cleanKey = key.toLowerCase();
                    const row = data[source][cleanKey];
                    if (row) return row[i];

                    // Fallback Aliases (Screener is inconsistent)
                    const aliases = {
                        'equity capital': ['share capital'],
                        'reserves': ['revenue reserves'],
                        'borrowings': ['total debt', 'long term borrowings'],
                        'trade receivables': ['debtors', 'sundry debtors'],
                        'inventories': ['inventory', 'stock'],
                        'cash equivalents': ['cash & equivalents', 'cash and bank', 'bank balance'],
                        'trade payables': ['creditors', 'sundry creditors'],
                        'investments': ['long term investments', 'short term investments'],
                        'loans n advances': ['loans and advances', 'short-term loans and advances'],
                        'fixed assets': ['net block', 'property, plant and equipment'],
                        'net profit': ['pat', 'profit after tax', 'net profit +'],
                        'profit before tax': ['pbt'],
                        'tax %': ['effective tax rate'],
                        'operating profit': ['ebitda', 'ebitda excluding other income'],
                        'cash from operating activity': ['net cash flow from operating activities', 'cash flow from operating activities'],
                        'fixed assets purchased': ['purchase of fixed assets', 'capital expenditure'],
                        'fixed assets sold': ['sale of fixed assets']
                    };

                    const possibleKeys = aliases[cleanKey] || [];
                    for (const ak of possibleKeys) {
                        const aRow = data[source][ak];
                        if (aRow) return aRow[i];
                    }

                    return null;
                };

                // Context for formula
                const ctx = {
                    pl: (key) => get('pl', key),
                    bs: (key) => get('bs', key),
                    cf: (key) => get('cf', key),
                    prev: (source, key) => {
                        if (i === 0) return null;
                        const row = data[source][key.toLowerCase()];
                        return row ? row[i - 1] : null;
                    }
                };

                const val = ratioConfig.formula(ctx);
                results.push(val);
            } catch (e) {
                console.error(`Ratio Error [${ratioConfig.name}]:`, e);
                results.push(null);
            }
        }
        return results;
    }
};

// Unit Helper - Robust against null/NaN
const U = {
    pct: (val) => (val !== null && val !== undefined && !isNaN(val)) ? val.toFixed(2) + '%' : '-',
    num: (val) => (val !== null && val !== undefined && !isNaN(val)) ? val.toFixed(2) : '-',
    days: (val) => (val !== null && val !== undefined && !isNaN(val)) ? Math.round(val) + ' Days' : '-',
    times: (val) => (val !== null && val !== undefined && !isNaN(val)) ? val.toFixed(2) + 'x' : '-'
};

const RatioTemplates = {
    'Screener Default': [
        // These will be populated from the existing table
        { name: 'ROCE %', unit: 'pct', formula: c => c.pl('ROCE %') || null },
        {
            name: 'Debtor Days', unit: 'days', formula: c => {
                const sales = c.pl('Sales');
                const rec = c.bs('Trade receivables');
                const prevRec = c.prev('bs', 'Trade receivables');
                const avgRec = prevRec ? (rec + prevRec) / 2 : rec;
                return sales ? (avgRec / sales) * 365 : null;
            }
        },
        {
            name: 'Inventory Days', unit: 'days', formula: c => {
                const rawMat = c.pl('Raw material cost');
                const changeInv = c.pl('Change in inventory') || 0;
                let cogs = null;
                if (rawMat !== null) cogs = rawMat + changeInv;
                else {
                    const sales = c.pl('Sales');
                    const matPct = c.pl('Material Cost %');
                    if (sales !== null && matPct !== null) cogs = sales * (matPct / 100);
                }
                const inv = c.bs('Inventories');
                const prevInv = c.prev('bs', 'Inventories');
                const avgInv = prevInv ? (inv + prevInv) / 2 : inv;
                return cogs ? (avgInv / cogs) * 365 : null;
            }
        },
        {
            name: 'Days Payable', unit: 'days', formula: c => {
                const rawMat = c.pl('Raw material cost');
                const changeInv = c.pl('Change in inventory') || 0;
                let purchases = null;
                if (rawMat !== null) purchases = rawMat + changeInv;

                const payables = c.bs('Trade Payables');
                const prevPayables = c.prev('bs', 'Trade Payables');
                const avgPayables = prevPayables ? (payables + prevPayables) / 2 : payables;
                return purchases ? (avgPayables / purchases) * 365 : null;
            }
        },
        {
            name: 'Working Capital Days', unit: 'days', formula: c => {
                const dDays = RatioTemplates['Screener Default'].find(r => r.name === 'Debtor Days').formula(c);
                const iDays = RatioTemplates['Screener Default'].find(r => r.name === 'Inventory Days').formula(c);
                const pDays = RatioTemplates['Screener Default'].find(r => r.name === 'Days Payable').formula(c);
                if (dDays === null || iDays === null || pDays === null) return null;
                return dDays + iDays - pDays;
            }
        },
        {
            name: 'Cash Conversion Cycle', unit: 'days', formula: c => {
                // CCC is essentially same as Working Capital Cycle for most non-financial firms
                return RatioTemplates['Screener Default'].find(r => r.name === 'Working Capital Days').formula(c);
            }
        }
    ],
    'Efficiency': [
        {
            name: 'ROE %', unit: 'pct', formula: c => {
                const sub = (v) => v || 0;
                const equity = sub(c.bs('Equity Capital')) + sub(c.bs('Reserves'));
                const prevEquity = sub(c.prev('bs', 'Equity Capital')) + sub(c.prev('bs', 'Reserves'));
                const avgEquity = prevEquity ? (equity + prevEquity) / 2 : equity;
                return avgEquity ? (c.pl('Net Profit') || 0) / avgEquity * 100 : null;
            }
        },
        {
            name: 'ROCE %', unit: 'pct', formula: c => {
                const ebit = c.pl('Profit before tax') + (c.pl('Interest') || 0);
                const capitalEmployed = (c.bs('Equity Capital') + c.bs('Reserves') + c.bs('Borrowings'));
                const prevCap = (c.prev('bs', 'Equity Capital') + (c.prev('bs', 'Reserves') || 0) + (c.prev('bs', 'Borrowings') || 0));
                const avgCap = prevCap ? (capitalEmployed + prevCap) / 2 : capitalEmployed;
                return avgCap ? ebit / avgCap * 100 : null;
            }
        },
        {
            name: 'ROIC %', unit: 'pct', formula: c => {
                const ebit = c.pl('Profit before tax') + (c.pl('Interest') || 0);
                const taxRate = (c.pl('Tax %') || 25) / 100;
                const nopat = ebit * (1 - taxRate);

                // Invested Capital = (Total Assets - Current Liabilities) - Cash - Investments
                // Approximation: (Equity + Reserves + Borrowings) - Cash - Investments
                const sub = (val) => val || 0;

                const calcIC = (ctxFn) => {
                    const capital = sub(ctxFn('bs', 'Equity Capital')) + sub(ctxFn('bs', 'Reserves')) + sub(ctxFn('bs', 'Borrowings'));
                    const deductions = sub(ctxFn('bs', 'Cash Equivalents')) + sub(ctxFn('bs', 'Investments'));
                    return capital - deductions;
                };

                const investedCapital = calcIC((s, k) => c[s](k));
                const prevIC = calcIC((s, k) => c.prev(s, k));

                const avgIC = prevIC ? (investedCapital + prevIC) / 2 : investedCapital;
                return avgIC ? nopat / avgIC * 100 : null;
            }
        },
        {
            name: 'Inventory Turnover', unit: 'times', formula: c => {
                // Professional Analyst COGS Calculation
                // 1. Try to get explicit 'Raw material cost' + 'Change in inventory' (from DeepFetch)
                const rawMat = c.pl('Raw material cost');
                const changeInv = c.pl('Change in inventory'); // From DeepFetch of Material Cost %

                let cogs = null;
                if (rawMat !== null) {
                    // Check if changeInv exists, else assume 0
                    cogs = rawMat + (changeInv || 0);
                } else {
                    // Fallback to Material % of Sales
                    const sales = c.pl('Sales');
                    const matPct = c.pl('Material Cost %');
                    if (sales !== null && matPct !== null) {
                        cogs = sales * (matPct / 100);
                    }
                }

                const inv = c.bs('Inventories');
                const prevInv = c.prev('bs', 'Inventories');
                const avgInv = prevInv ? (inv + prevInv) / 2 : inv;
                return avgInv && cogs !== null ? cogs / avgInv : null;
            }
        },
        {
            name: 'Fixed Asset Turnover', unit: 'times', formula: c => {
                const sales = c.pl('Sales');
                const fa = c.bs('Fixed Assets');
                const prevFa = c.prev('bs', 'Fixed Assets');
                const avgFa = prevFa ? (fa + prevFa) / 2 : fa;
                return avgFa ? sales / avgFa : null;
            }
        },
        {
            name: 'Debtor Days', unit: 'days', formula: c => {
                const sales = c.pl('Sales');
                const rec = c.bs('Trade receivables');
                const prevRec = c.prev('bs', 'Trade receivables');
                const avgRec = prevRec ? (rec + prevRec) / 2 : rec;
                return sales ? (avgRec / sales) * 365 : null;
            }
        },
        {
            name: 'Inventory Days', unit: 'days', formula: c => {
                const rawMat = c.pl('Raw material cost');
                const changeInv = c.pl('Change in inventory') || 0;
                let cogs = null;
                if (rawMat !== null) cogs = rawMat + changeInv;
                else {
                    const sales = c.pl('Sales');
                    const matPct = c.pl('Material Cost %');
                    if (sales !== null && matPct !== null) cogs = sales * (matPct / 100);
                }
                const inv = c.bs('Inventories');
                const prevInv = c.prev('bs', 'Inventories');
                const avgInv = prevInv ? (inv + prevInv) / 2 : inv;
                return cogs ? (avgInv / cogs) * 365 : null;
            }
        },
        {
            name: 'Days Payable', unit: 'days', formula: c => {
                const rawMat = c.pl('Raw material cost');
                const changeInv = c.pl('Change in inventory') || 0;
                let purchases = null;
                if (rawMat !== null) purchases = rawMat + changeInv;

                const payables = c.bs('Trade Payables');
                const prevPayables = c.prev('bs', 'Trade Payables');
                const avgPayables = prevPayables ? (payables + prevPayables) / 2 : payables;
                return purchases ? (avgPayables / purchases) * 365 : null;
            }
        },
        {
            name: 'Working Capital Days', unit: 'days', formula: c => {
                // Ensure RatioTemplates is fully defined/accessible via deferred execution or direct lookups
                // Since this runs later, it should be fine.
                const findRatio = (name) => {
                    // Search all categories
                    for (const cat in RatioTemplates) {
                        const r = RatioTemplates[cat].find(x => x.name === name);
                        if (r) return r;
                    }
                    return null;
                };

                const d = findRatio('Debtor Days');
                const i = findRatio('Inventory Days');
                const p = findRatio('Days Payable');

                if (!d || !i || !p) return null;

                const dDays = d.formula(c);
                const iDays = i.formula(c);
                const pDays = p.formula(c);

                if (dDays === null || iDays === null || pDays === null) return null;
                return dDays + iDays - pDays;
            }
        }
    ],
    'Liquidity': [
        {
            name: 'Current Ratio', unit: 'times', formula: c => {
                const sub = (v) => v || 0;
                // Screener labels Current Assets as sub-items of 'Other Assets' or 'Other Assets +'
                const currAssets = sub(c.bs('Inventories')) + sub(c.bs('Trade receivables')) + sub(c.bs('Cash Equivalents')) + sub(c.bs('Loans n Advances')) + sub(c.bs('Other asset items'));
                const currLiab = sub(c.bs('Trade Payables')) + sub(c.bs('Other liability items'));
                return currLiab ? currAssets / currLiab : null;
            }
        },
        {
            name: 'Quick Ratio', unit: 'times', formula: c => {
                const sub = (v) => v || 0;
                const quickAssets = sub(c.bs('Trade receivables')) + sub(c.bs('Cash Equivalents')) + sub(c.bs('Loans n Advances')) + sub(c.bs('Other asset items'));
                const currLiab = sub(c.bs('Trade Payables')) + sub(c.bs('Other liability items'));
                return currLiab ? quickAssets / currLiab : null;
            }
        },
        {
            name: 'Cash Ratio', unit: 'times', formula: c => {
                const sub = (v) => v || 0;
                const cash = sub(c.bs('Cash Equivalents'));
                const currLiab = sub(c.bs('Trade Payables')) + sub(c.bs('Other liability items'));
                return currLiab ? cash / currLiab : null;
            }
        }
    ],
    'Solvency': [
        {
            name: 'Debt to Equity', unit: 'times', formula: c => {
                const debt = c.bs('Borrowings');
                const equity = (c.bs('Equity Capital') || 0) + (c.bs('Reserves') || 0);
                return equity ? debt / equity : null;
            }
        },
        {
            name: 'Interest Coverage', unit: 'times', formula: c => {
                const op = c.pl('Operating Profit');
                const int = c.pl('Interest');
                return int ? op / int : null;
            }
        },
        {
            name: 'Debt to Assets', unit: 'times', formula: c => {
                const debt = c.bs('Borrowings');
                const assets = c.bs('Total Assets');
                return assets ? debt / assets : null;
            }
        },
        {
            name: 'Financial Leverage', unit: 'times', formula: c => {
                const assets = c.bs('Total Assets');
                const equity = (c.bs('Equity Capital') || 0) + (c.bs('Reserves') || 0);
                return equity ? assets / equity : null;
            }
        }
    ],
    'Cash Flow': [
        {
            name: 'CFO / EBITDA', formula: c => {
                const cfo = c.cf('Cash from Operating Activity');
                const ebitda = c.pl('Operating Profit') + (c.pl('Other Income') || 0);
                return ebitda ? cfo / ebitda : null;
            }
        },
        {
            name: 'CFO / PAT', formula: c => {
                const cfo = c.cf('Cash from Operating Activity');
                const pat = c.pl('Net Profit');
                return pat ? cfo / pat : null;
            }
        },
        {
            name: 'FCF Conversion', formula: c => {
                const cfo = c.cf('Cash from Operating Activity');
                // Capex is Net Capex = Fixed assets purchased (outflow) + Fixed assets sold (inflow)
                const capex = (c.cf('Fixed assets purchased') || 0) + (c.cf('Fixed assets sold') || 0);
                const fcf = cfo + capex;
                const pat = c.pl('Net Profit');
                return pat ? fcf / pat * 100 : null;
            }
        },
        {
            name: 'Free Cash Flow', formula: c => {
                const cfo = c.cf('Cash from Operating Activity');
                // Capex is Net Capex = Fixed assets purchased (outflow) + Fixed assets sold (inflow)
                const capex = (c.cf('Fixed assets purchased') || 0) + (c.cf('Fixed assets sold') || 0);
                return (cfo !== null) ? cfo + capex : null;
            }
        }
    ]
};

const RatioUI = {
    state: {
        template: 'Screener Default',
        nativeHTML: null
    },
    data: null,

    init: (data) => {
        RatioUI.data = data;
        const container = document.querySelector('section#ratios');
        if (!container) return;

        // 1. Capture Native state (excluding our controls)
        if (!RatioUI.state.nativeHTML) {
            const clone = container.cloneNode(true);
            const controls = clone.querySelector('#sif-ratio-controls');
            if (controls) controls.remove();
            RatioUI.state.nativeHTML = clone.innerHTML;
        }

        // Inject dynamic styles
        RatioUI.injectStyles();

        // Render controls
        RatioUI.renderControls(container);

        // Render table
        RatioUI.renderTable(container);
    },

    injectStyles: () => {
        if (document.getElementById('sif-styles')) return;
        const style = document.createElement('style');
        style.id = 'sif-styles';
        style.textContent = `
            .sif-dropdown {
                font-size: 14px;
                border: 1px solid var(--border-color, #e0e0e0);
                border-radius: 4px;
                padding: 4px 8px;
                background: var(--ink-normal, #fff);
                color: var(--ink-900, #333);
                cursor: pointer;
                margin-left: 12px;
                vertical-align: middle;
            }
            #sif-ratio-controls {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                margin-left: auto !important;
            }
            .sif-dropdown {
                font-size: 13px !important;
                padding: 2px 8px !important;
                border: 1px solid var(--border-color, #dae1e7) !important;
                border-radius: 4px !important;
                background: #fff !important;
                color: #111 !important;
                cursor: pointer !important;
                height: 28px !important;
                line-height: 1 !important;
                -webkit-appearance: menulist !important;
                appearance: menulist !important;
            }
            /* Definite Native Dark Mode support */
            body.dark .sif-dropdown,
            html.dark .sif-dropdown,
            .dark .sif-dropdown {
                background: #2a2e33 !important;
                color: #eee !important;
                border: 1px solid #444 !important;
            }
        `;
        document.head.appendChild(style);
    },

    renderControls: (container) => {
        if (document.getElementById('sif-ratio-controls')) return;

        // Target the native options container (flex-row containing Standalone/Consolidated text)
        // We look for any div/p that specifies Standalone/Consolidated figures
        const targetText = 'Figures in Rs. Crores';
        let optionsArea = Array.from(container.querySelectorAll('div.flex-row, .flex-space-between'))
            .find(el => el.textContent.includes(targetText));

        if (!optionsArea) {
            const sub = Array.from(container.querySelectorAll('p, span')).find(el => el.textContent.includes(targetText));
            if (sub) {
                optionsArea = sub.closest('div.flex-row') || sub.closest('.flex-space-between') || sub.parentElement;
            }
        }

        console.log("RatioUI: optionsArea resolved?", !!optionsArea, "class:", optionsArea?.className);

        if (!optionsArea) {
            console.log("RatioUI: Falling back to header wrap.");
            const heading = container.querySelector('h2');
            if (heading) {
                const flexRow = document.createElement('div');
                flexRow.className = 'flex-row flex-space-between flex-gap-16';
                flexRow.style.display = 'flex';
                flexRow.style.justifyContent = 'space-between';
                flexRow.style.alignItems = 'center';
                flexRow.style.width = '100%';
                flexRow.style.marginBottom = '10px';

                heading.parentNode.insertBefore(flexRow, heading);
                flexRow.appendChild(heading);
                optionsArea = flexRow;
            } else {
                optionsArea = container;
            }
        } else {
            // Ensure the found optionsArea is a flex container for proper spacing
            optionsArea.style.display = 'flex';
            optionsArea.style.justifyContent = 'space-between';
            optionsArea.style.alignItems = 'center';
        }

        const wrapper = document.createElement('div');
        wrapper.id = 'sif-ratio-controls';

        const select = document.createElement('select');
        select.className = 'sif-dropdown';

        Object.keys(RatioTemplates).forEach(key => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.innerText = key;
            if (key === RatioUI.state.template) opt.selected = true;
            select.appendChild(opt);
        });

        select.onchange = (e) => {
            RatioUI.state.template = e.target.value;
            RatioUI.renderTable(container);
        };
        wrapper.appendChild(select);
        optionsArea.appendChild(wrapper);
    },

    renderTable: (container) => {
        // 1. Reset to native state
        if (RatioUI.state.nativeHTML) {
            const controls = document.getElementById('sif-ratio-controls');
            container.innerHTML = RatioUI.state.nativeHTML;

            // Re-inject controls into the newly rendered native header
            if (controls) {
                // Ensure label is gone inside controls if it exists
                const labelInControls = controls.querySelector('.sif-label');
                if (labelInControls) labelInControls.remove();

                const targetText = 'Figures in Rs. Crores';
                let optionsArea = Array.from(container.querySelectorAll('.flex-row, .flex-space-between'))
                    .find(el => el.textContent.includes(targetText));
                if (optionsArea) {
                    optionsArea.appendChild(controls);
                    optionsArea.style.display = 'flex';
                    optionsArea.style.justifyContent = 'space-between';
                    optionsArea.style.alignItems = 'center';
                    optionsArea.style.width = '100%';
                } else {
                    container.prepend(controls);
                }
            }
        }

        if (RatioUI.state.template === 'Screener Default') return;

        // 2. Build Custom Table
        const template = RatioTemplates[RatioUI.state.template];
        if (!template) return;

        const table = document.createElement('table');
        table.className = 'data-table responsive-text-nowrap'; // Exact native classes

        // Headers
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `<th class="text">Attributes</th>` +
            RatioUI.data.years.map(y => `<th>${y}</th>`).join('');
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        const tbody = document.createElement('tbody');

        template.forEach((r, i) => {
            try {
                const values = RatioCalculator.calculate(RatioUI.data, r);
                const tr = document.createElement('tr');
                if (i % 2 !== 0) tr.className = 'stripe';

                const fmt = (val) => {
                    if (val === null || val === undefined) return '';
                    if (r.unit === '%') return val.toFixed(0) + '%';
                    return val.toFixed(2);
                };

                tr.innerHTML = `<td class="text">${r.name}</td>` +
                    values.map(v => `<td>${fmt(v)}</td>`).join('');
                tbody.appendChild(tr);
            } catch (e) {
                console.error(`Ratio Render Error [${r.name}]:`, e);
            }
        });
        table.appendChild(tbody);

        // Replace original table
        const oldTable = container.querySelector('table');
        if (oldTable) oldTable.replaceWith(table);
        else container.appendChild(table);
    }
};

window.RatioUI = RatioUI; // For debugging

const QuarterlyAnalysis = {
    init: async () => {
        const quartSection = document.querySelector('#quarters');
        if (!quartSection) return;

        const symbol = window.location.pathname.split('/')[2].toUpperCase();
        if (!symbol) return;

        try {
            // 1. Fetch from BOTH legacy and integrated endpoints
            const legacyUrl = `https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol=${symbol}&period=Quarterly`;
            const integratedUrl = `https://www.nseindia.com/api/integrated-filing-results?index=equities&symbol=${symbol}&period_ended=all&type=Integrated%20Filing-%20Financials`;

            const [legacyData, integratedData] = await Promise.all([
                new Promise(resolve => chrome.runtime.sendMessage({ action: "fetchNSEData", url: legacyUrl }, res => resolve(res?.data || []))),
                new Promise(resolve => chrome.runtime.sendMessage({ action: "fetchNSEData", url: integratedUrl }, res => resolve(res?.data?.data || [])))
            ]);

            // 2. Normalize into common format: {toDate, filingDate, consolidated}
            // 2. Normalize into common format: {toDate, filingDate, consolidated}
            const normalizedLegacy = (legacyData || []).map(r => ({
                toDate: r.toDate || r.reportingPeriod,
                filingDate: r.filingDate || r.broadCastDate || r.exchdisstime, // Fallback for old results
                consolidated: r.consolidated
            }));

            const normalizedIntegrated = (integratedData || []).map(r => ({
                toDate: r.qe_Date,
                filingDate: r.broadcast_Date || r.revised_Date, // Fallback for Revised filings (e.g. RKSWAMY Mar 2025)
                consolidated: (r.consolidated === "Standalone" || r.consolidated === "Standalone-NR") ? "Non-Consolidated" : r.consolidated
            }));

            const mergedData = [...normalizedIntegrated, ...normalizedLegacy];
            if (mergedData.length === 0) {
                console.log(`QuarterlyAnalysis [${symbol}]: No filing data found from NSE.`);
                return;
            }

            console.log(`QuarterlyAnalysis [${symbol}]: Starting augmentation with ${mergedData.length} records.`);
            console.log("Screener Content Script Active (v5.1.7-fix-missing-date)");
            await QuarterlyAnalysis.augmentTable(quartSection, symbol, mergedData);
        } catch (e) {
            console.error(`QuarterlyAnalysis [${symbol}]: Initialization failed`, e);
        }
    },

    augmentTable: async (section, symbol, nseResults) => {
        const table = section.querySelector('table');
        if (!table) return;

        const headers = Array.from(table.querySelectorAll('thead th')).slice(1);
        const periods = headers.map(th => th.innerText.trim());

        // Initialize rows
        const earningsDateRow = { name: 'Earnings Day', values: periods.map(() => '-') };
        const dayReactionRow = { name: 'Reaction', values: periods.map(() => '-') };
        const nextDayRow = { name: 'Next Day', values: periods.map(() => '-') };
        const nextWeekRow = { name: 'Next Week', values: periods.map(() => '-') };

        const monthMap = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11 };

        // 1. Map columns to matches and identify date range for batch price fetch
        const columnData = [];
        let minFilingDate = null;
        let maxFilingDate = null;

        for (let i = 0; i < periods.length; i++) {
            const period = periods[i];
            const scrDate = new Date(period);

            const periodMatches = nseResults.filter(r => {
                const nsePeriod = r.toDate;
                if (!nsePeriod) return false;
                const nseDate = new Date(nsePeriod);
                return nseDate.getMonth() === scrDate.getMonth() && nseDate.getFullYear() === scrDate.getFullYear();
            });

            if (periodMatches.length === 0) {
                columnData[i] = null;
                continue;
            }

            const match = periodMatches.find(r => r.consolidated === "Consolidated") || periodMatches[0];
            columnData[i] = match;

            if (match.filingDate) {
                const datePart = match.filingDate.split(' ')[0];
                const parts = datePart.split('-');
                const d = new Date(parseInt(parts[2]), monthMap[parts[1].toUpperCase()], parseInt(parts[0]));
                if (!isNaN(d.getTime())) {
                    if (!minFilingDate || d < minFilingDate) minFilingDate = d;
                    if (!maxFilingDate || d > maxFilingDate) maxFilingDate = d;
                }
            }
        }

        // 2. Fetch prices for specific filing windows (Targeted Fetching)
        let allPrices = [];
        const uniqueFilingDates = new Set();
        columnData.forEach(m => {
            if (m && m.filingDate) uniqueFilingDates.add(m.filingDate.split(' ')[0]);
        });

        if (uniqueFilingDates.size > 0) {
            console.log(`QuarterlyAnalysis [${symbol}]: Starting targeted fetch for ${uniqueFilingDates.size} events.`);
            console.log("Screener Content Script Active (v5.1.8-ui-polish)");

            const formatDate = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
            const yesterdayEnd = new Date();
            yesterdayEnd.setHours(0, 0, 0, 0);
            const endRangeLimit = yesterdayEnd.getTime() - 1;

            const fetchPromises = Array.from(uniqueFilingDates).map(async (dateStr) => {
                // Parse date (DD-MMM-YYYY or YYYY-MM-DD handled by Date constructor usually, but manual parse is safer if mixed)
                // Reuse parseDate logic logic akin to calculateReactionFromPrices or simple Date if format is known clean
                // The normalized format from step 1 is likely "DD-MM-YYYY" or "YYYY-MM-DD" depending on source.
                // Let's use a robust parser here or trust the existing flow.
                // Step 1 produced normalizedLegacy/Integrated which has toDate/filingDate.
                // columnData has match.filingDate.

                let filingDate = new Date(dateStr); // Try standard parse first
                if (isNaN(filingDate.getTime())) {
                    // Fallback for DD-MMM-YYYY
                    const parts = dateStr.split('-');
                    const months = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11 };
                    if (months[parts[1].toUpperCase()] !== undefined) {
                        filingDate = new Date(parseInt(parts[2]), months[parts[1].toUpperCase()], parseInt(parts[0]));
                    }
                }

                if (isNaN(filingDate.getTime())) return [];

                // Window: -10 days to +15 days
                const start = new Date(filingDate);
                start.setDate(start.getDate() - 10);

                let end = new Date(filingDate);
                end.setDate(end.getDate() + 15);

                if (end.getTime() > endRangeLimit) end = new Date(endRangeLimit);
                if (start.getTime() > end.getTime()) return []; // Start is in future?

                const url = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getHistoricalTradeData&symbol=${symbol}&series=EQ&fromDate=${formatDate(start)}&toDate=${formatDate(end)}`;

                try {
                    const res = await new Promise(resolve => chrome.runtime.sendMessage({ action: "fetchNSEData", url: url }, resolve));
                    if (res?.error) {
                        console.warn(`QuarterlyAnalysis [${symbol}]: Fetch failed for window ${formatDate(start)}: ${res.error}`);
                        return [];
                    }
                    return res?.data?.data || (Array.isArray(res?.data) ? res.data : []) || [];
                } catch (e) {
                    console.error(`QuarterlyAnalysis [${symbol}]: Error fetching window ${formatDate(start)}`, e);
                    return [];
                }
            });

            const results = await Promise.all(fetchPromises);
            results.forEach(chunk => {
                if (Array.isArray(chunk)) allPrices = allPrices.concat(chunk);
            });

            // Deduplicate and sort
            allPrices = Array.from(new Map(allPrices.map(p => [p.mtimestamp, p])).values());
            allPrices.sort((a, b) => {
                const d1 = a.mtimestamp.split('-');
                const d2 = b.mtimestamp.split('-');
                const m1 = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11 }[d1[1].toUpperCase()];
                const m2 = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11 }[d2[1].toUpperCase()];
                return new Date(parseInt(d1[2]), m1, parseInt(d1[0])) -
                    new Date(parseInt(d2[2]), m2, parseInt(d2[0]));
            });

            console.log(`QuarterlyAnalysis [${symbol}]: Targeted fetch complete. ${allPrices.length} records.`);
        }

        // 3. Process each column using pre-fetched prices
        for (let i = 0; i < columnData.length; i++) {
            const match = columnData[i];
            if (match && match.filingDate) {
                const cleanFilingDate = match.filingDate.split(' ')[0];
                // Format: DD MMM (e.g., 12 Feb) - Remove Year
                const parts = cleanFilingDate.split('-');
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                let formattedDate = cleanFilingDate;

                // Parse DD-MMM-YYYY or YYYY-MM-DD
                if (parts.length === 3) {
                    if (parts[0].length === 4) {
                        // YYYY-MM-DD
                        const mIndex = parseInt(parts[1]) - 1;
                        formattedDate = `${parts[2]} ${monthNames[mIndex]}`;
                    } else {
                        // DD-MMM-YYYY
                        const titleCaseMonth = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
                        formattedDate = `${parts[0]} ${titleCaseMonth}`;
                    }
                }

                earningsDateRow.values[i] = formattedDate;

                const reactions = await QuarterlyAnalysis.calculateReactionFromPrices(symbol, match.filingDate, allPrices);
                if (reactions) {
                    dayReactionRow.values[i] = reactions.day;
                    nextDayRow.values[i] = reactions.nextDay;
                    nextWeekRow.values[i] = reactions.nextWeek;
                } else {
                    dayReactionRow.values[i] = `<span title="Could not find enough price data to calculate anchor for ${match.filingDate}">-</span>`;
                }
            }
        }

        // Inject rows before "Raw PDF" row
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const pdfRow = rows.find(r => r.innerText.includes('Raw PDF'));

        [earningsDateRow, dayReactionRow, nextDayRow, nextWeekRow].forEach(rowData => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align: left; font-weight: 500;">${rowData.name}</td>
                ${rowData.values.map(v => `<td>${v}</td>`).join('')}
            `;
            if (pdfRow) {
                tbody.insertBefore(tr, pdfRow);
            } else {
                tbody.appendChild(tr);
            }
        });
    },

    calculateReactionFromPrices: async (symbol, fullFilingDate, prices) => {
        try {
            if (!prices || prices.length < 2) return null;

            const parseDate = (dateStr) => {
                if (!dateStr) return null;
                // Handle "YYYY-MM-DD" or "DD-MMM-YYYY"
                const parts = dateStr.includes(' ') ? dateStr.split(' ')[0].split('-') : dateStr.split('-');

                // Format: YYYY-MM-DD
                if (parts[0].length === 4) {
                    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                }

                // Format: DD-MMM-YYYY
                const months = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11 };
                const mStr = parts[1].toUpperCase();
                const mIdx = months[mStr];

                if (mIdx !== undefined) {
                    return new Date(parseInt(parts[2]), mIdx, parseInt(parts[0]));
                }

                // Fallback: DD-MM-YYYY
                if (!isNaN(parseInt(mStr))) {
                    return new Date(parseInt(parts[2]), parseInt(mStr) - 1, parseInt(parts[0]));
                }
                return null;
            };

            const filingDate = parseDate(fullFilingDate);
            if (!filingDate || isNaN(filingDate.getTime())) {
                console.warn(`QuarterlyAnalysis [${symbol}]: Invalid filing date format: ${fullFilingDate}`);
                return null;
            }

            // Market Date logic
            let marketDate = new Date(filingDate);
            const timePart = fullFilingDate.includes(' ') ? fullFilingDate.split(' ')[1] : null;
            if (timePart) {
                const [hh, mm] = timePart.split(':');
                // Market closes at 15:30. If filing is after, reaction is next trading day.
                if (parseInt(hh) > 15 || (parseInt(hh) === 15 && parseInt(mm) >= 30)) {
                    marketDate.setDate(marketDate.getDate() + 1);
                }
            }

            // Helper to parse price date (always DD-MMM-YYYY from NSE)
            const getPriceDate = (p) => {
                const parts = p.mtimestamp.split('-');
                const months = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11 };
                return new Date(parseInt(parts[2]), months[parts[1].toUpperCase()], parseInt(parts[0]));
            };

            const marketTime = marketDate.getTime();
            const filingIdx = prices.findIndex(p => {
                const pDate = getPriceDate(p).getTime();
                return pDate >= marketTime;
            });

            if (filingIdx === -1) {
                const lastPrice = prices[prices.length - 1];
                console.warn(`QuarterlyAnalysis [${symbol}]: Price data ends (${lastPrice?.mtimestamp}) before market date (${marketDate.toDateString()})`);
                return null;
            }

            // Anchor is the closing price of the day BEFORE the reaction day (filingIdx)
            // We search backwards from filingIdx to find the latest valid trading day
            let basePrice = null;
            let baseIdx = filingIdx - 1;
            while (baseIdx >= 0) {
                if (prices[baseIdx].chClosingPrice && prices[baseIdx].chClosingPrice > 0) {
                    basePrice = prices[baseIdx].chClosingPrice;
                    break;
                }
                baseIdx--;
            }

            if (!basePrice) {
                const firstPrice = prices[0];
                console.warn(`QuarterlyAnalysis [${symbol}]: No base price found before ${prices[filingIdx].mtimestamp}. History starts at ${firstPrice?.mtimestamp}`);
                return null;
            }

            const dayPrice = prices[filingIdx].chClosingPrice;
            const nextDayPrice = prices[filingIdx + 1]?.chClosingPrice;
            const nextWeekIdx = Math.min(filingIdx + 5, prices.length - 1);
            const nextWeekPrice = prices[nextWeekIdx].chClosingPrice;

            const calc = (p, b) => {
                if (!p || !b) return '-';
                const diff = (((p - b) / b) * 100).toFixed(2);
                const color = diff > 0 ? 'green' : (diff < 0 ? 'red' : 'inherit');
                return `<span style="color:${color}">${diff}%</span>`;
            };

            return {
                day: calc(dayPrice, basePrice),
                nextDay: calc(nextDayPrice, dayPrice),
                nextWeek: calc(nextWeekPrice, dayPrice)
            };
        } catch (e) {
            console.error(`QuarterlyAnalysis [${symbol}]: Calc Error for ${fullFilingDate}`, e);
            return null;
        }
    }
};

// Expose for debugging in isolated world console
window.QuarterlyAnalysis = QuarterlyAnalysis;


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
