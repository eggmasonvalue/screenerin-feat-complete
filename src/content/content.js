/**
 * Screener.in Filter Content Script
 * Handles UI injection and row filtering based on cached industry data.
 * v1.10.0: Layout Fix for Upcoming Results & Robust List Handling
 */

console.log("Screener Content Script Active (v1.10.0)");

let stockMap = null;
let industryHierarchy = null;
let activeIndustry = "";
let isFetchingAll = false;
let currentFetchId = 0;

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
        console.log("Screener Filter: Company Strategy Active");

        // Wait for Ratios section (max 5 seconds)
        let retries = 0;
        while (!document.querySelector('#ratios') && retries < 10) {
            await new Promise(r => setTimeout(r, 500));
            retries++;
        }

        if (!document.querySelector('#ratios')) {
            console.warn("Screener Filter: Ratios section not found after waiting.");
            return;
        }

        // 0. Pre-expansion: Expand "Expenses" to get Material/Employee costs
        await CompanyStrategy.expandExpenses();

        // 1. Data Parsing
        const financialData = DataParser.parseAll();
        if (!financialData) {
            console.error("Screener Filter: Failed to parse financial data.");
            return;
        }

        // 2. Initialize UI
        RatioUI.init(financialData);
    },

    expandExpenses: async () => {
        const plTable = document.querySelector('#profit-loss table');
        if (!plTable) return;

        // Find Expenses button
        const buttons = Array.from(plTable.querySelectorAll('button.button-plain'));
        const expBtn = buttons.find(b => b.innerText.includes('Expenses'));

        if (expBtn && expBtn.querySelector('span')?.innerText.includes('+')) {
            expBtn.click();
            // Wait a tiny bit for expansion (usually instant but good to be safe)
            await new Promise(r => setTimeout(r, 50));
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

            // Clean metric name: "Sales +", "Expenses +" -> "Sales", "Expenses"
            let metricName = cells[0].innerText.trim().replace(/\s*[+\-]$/, '').trim();

            const values = [];
            for (let i = 1; i < cells.length; i++) {
                const txt = cells[i].innerText.trim().replace(/,/g, '');
                // Handle percentages in text if present (e.g. "12%")
                const val = parseFloat(txt.replace('%', ''));
                values.push(isNaN(val) ? null : val);
            }

            result[metricName] = values;
        });

        return result;
    }
};

const RatioCalculator = {
    calculate: (data, ratioConfig) => {
        const results = [];
        for (let i = 0; i < data.years.length; i++) {
            try {
                // Helper to safely get value for year i
                const get = (source, key) => {
                    const row = data[source][key];
                    return row ? row[i] : null;
                };

                // Context for formula
                const ctx = {
                    pl: (key) => get('pl', key),
                    bs: (key) => get('bs', key),
                    cf: (key) => get('cf', key),
                    prev: (source, key) => {
                        if (i === 0) return null;
                        const row = data[source][key];
                        return row ? row[i - 1] : null;
                    }
                };

                const val = ratioConfig.formula(ctx);
                results.push(val);
            } catch (e) {
                results.push(null);
            }
        }
        return results;
    }
};

// Unit Helper
const U = {
    pct: (val) => val !== null ? val.toFixed(2) + '%' : '-',
    num: (val) => val !== null ? val.toFixed(2) : '-',
    days: (val) => val !== null ? Math.round(val) + ' Days' : '-',
    times: (val) => val !== null ? val.toFixed(2) + 'x' : '-'
};

const RatioTemplates = {
    'Screener Default': [
        // These will be populated from the existing table
        { name: 'ROCE %', unit: 'pct', formula: c => c.pl('ROCE %') || null },
        { name: 'Debtor Days', unit: 'days', formula: c => null }, // Placeholder
        { name: 'Inventory Days', unit: 'days', formula: c => null }, // Placeholder
        { name: 'Days Payable', unit: 'days', formula: c => null }, // Placeholder
        { name: 'Cash Conversion Cycle', unit: 'days', formula: c => null }, // Placeholder
        { name: 'Working Capital Days', unit: 'days', formula: c => null } // Placeholder
    ],
    'Efficiency': [
        {
            name: 'ROE %', unit: 'pct', formula: c => {
                const equity = c.bs('Share Capital') + c.bs('Reserves');
                const prevEquity = (c.prev('bs', 'Share Capital') || 0) + (c.prev('bs', 'Reserves') || 0);
                const avgEquity = prevEquity ? (equity + prevEquity) / 2 : equity;
                return c.pl('Net Profit') / avgEquity * 100;
            }
        },
        {
            name: 'ROCE %', unit: 'pct', formula: c => {
                const ebit = c.pl('Profit before tax') + (c.pl('Interest') || c.pl('Finance Costs') || 0);
                const capitalEmployed = (c.bs('Share Capital') + c.bs('Reserves') + c.bs('Borrowings'));
                const prevCap = (c.prev('bs', 'Share Capital') + c.prev('bs', 'Reserves') + c.prev('bs', 'Borrowings'));
                const avgCap = prevCap ? (capitalEmployed + prevCap) / 2 : capitalEmployed;
                return avgCap ? ebit / avgCap * 100 : null;
            }
        },
        {
            name: 'ROIC %', unit: 'pct', formula: c => {
                // Approximate NOPAT = EBIT * (1 - 0.25) [Assume 25% tax rate as safe default]
                const ebit = c.pl('Profit before tax') + (c.pl('Interest') || c.pl('Finance Costs') || 0);
                const nopat = ebit * 0.75;

                const investedCapital = (c.bs('Share Capital') + c.bs('Reserves') + c.bs('Borrowings')) - (c.bs('Cash Equivalents') || 0);
                const prevIC = (c.prev('bs', 'Share Capital') + c.prev('bs', 'Reserves') + c.prev('bs', 'Borrowings')) - (c.prev('bs', 'Cash Equivalents') || 0);

                const avgIC = prevIC ? (investedCapital + prevIC) / 2 : investedCapital;
                return avgIC ? nopat / avgIC * 100 : null;
            }
        },
        {
            name: 'Inventory Turnover', unit: 'times', formula: c => {
                const sales = c.pl('Sales');
                const inv = c.bs('Inventories');
                const prevInv = c.prev('bs', 'Inventories');
                const avgInv = prevInv ? (inv + prevInv) / 2 : inv;
                return avgInv ? sales / avgInv : null;
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
                const rec = c.bs('Trade Receivables');
                const prevRec = c.prev('bs', 'Trade Receivables');
                const avgRec = prevRec ? (rec + prevRec) / 2 : rec;
                return sales ? (avgRec / sales) * 365 : null;
            }
        }
    ],
    'Liquidity': [
        {
            name: 'Current Ratio', unit: 'times', formula: c => {
                const currAssets = (c.bs('Inventories') || 0) + (c.bs('Trade Receivables') || 0) + (c.bs('Cash Equivalents') || 0) + (c.bs('Other Assets') || 0);
                const currLiab = (c.bs('Trade Payables') || 0) + (c.bs('Other Liabilities') || 0);
                return currLiab ? currAssets / currLiab : null;
            }
        },
        {
            name: 'Quick Ratio', unit: 'times', formula: c => {
                const quickAssets = (c.bs('Trade Receivables') || 0) + (c.bs('Cash Equivalents') || 0) + (c.bs('Other Assets') || 0);
                const currLiab = (c.bs('Trade Payables') || 0) + (c.bs('Other Liabilities') || 0);
                return currLiab ? quickAssets / currLiab : null;
            }
        },
        {
            name: 'Cash Ratio', unit: 'times', formula: c => {
                const cash = c.bs('Cash Equivalents') || 0;
                const currLiab = (c.bs('Trade Payables') || 0) + (c.bs('Other Liabilities') || 0);
                return currLiab ? cash / currLiab : null;
            }
        }
    ],
    'Solvency': [
        {
            name: 'Debt to Equity', unit: 'times', formula: c => {
                const debt = c.bs('Borrowings');
                const equity = (c.bs('Share Capital') || 0) + (c.bs('Reserves') || 0);
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
                const assets = (c.bs('Fixed Assets') || 0) + (c.bs('CWIP') || 0) + (c.bs('Investments') || 0) + (c.bs('Other Assets') || 0) +
                    (c.bs('Inventories') || 0) + (c.bs('Trade Receivables') || 0) + (c.bs('Cash Equivalents') || 0);
                return assets ? debt / assets : null;
            }
        },
        {
            name: 'Financial Leverage', unit: 'times', formula: c => {
                const assets = (c.bs('Fixed Assets') || 0) + (c.bs('CWIP') || 0) + (c.bs('Investments') || 0) + (c.bs('Other Assets') || 0) +
                    (c.bs('Inventories') || 0) + (c.bs('Trade Receivables') || 0) + (c.bs('Cash Equivalents') || 0);
                const equity = (c.bs('Share Capital') || 0) + (c.bs('Reserves') || 0);
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
                const capex = Math.abs(c.cf('Fixed assets purchased') || 0);
                const fcf = cfo - capex;
                const pat = c.pl('Net Profit');
                return pat ? fcf / pat * 100 : null;
            }
        }
    ]
};

const RatioUI = {
    state: {
        template: 'Screener Default' // Set default to 'Screener Default'
    },
    data: null,
    defaultRatiosMap: {}, // To store pre-calculated values

    init: (data) => {
        RatioUI.data = data;
        const container = document.querySelector('#ratios');
        if (!container) return;

        if (!container) return;

        // Inject dynamic styles based on current theme
        RatioUI.injectStyles(container);

        // 1. Capture Existing Default Ratios (Read Phase)
        // We do this BEFORE modifying the DOM to ensure we capture the original values.
        RatioUI.captureDefaultRatios(container);

        // Restore Header & Structure
        let header = container.querySelector('h2');
        if (!header) {
            header = document.createElement('h2');
            header.innerText = 'Ratios';
            container.prepend(header);
        } else {
            header.innerText = 'Ratios';
        }

        // Add Flex container for Header + Controls if not present
        if (!header.parentElement.classList.contains('flex-row')) {
            const headerRow = document.createElement('div');
            headerRow.className = 'flex-row';
            headerRow.style.alignItems = 'baseline'; // Baseline for proper text alignment
            headerRow.style.marginBottom = '16px';

            // Allow header to sit naturally
            header.style.marginBottom = '0';
            header.style.marginRight = '8px';
            header.style.lineHeight = '1'; // Ensure line-height doesn't shift baseline

            // Move header into row
            header.parentElement.insertBefore(headerRow, header);
            headerRow.appendChild(header);

            // Container for controls - positioned immediately after header
            const controlsContainer = document.createElement('div');
            controlsContainer.id = 'ratio-controls';
            // No margin needed if header has margin-right
            headerRow.appendChild(controlsContainer);
        }

        // Remove old content (Table) but keep the new header structure
        const oldTable = container.querySelector('.responsive-holder');
        if (oldTable) oldTable.remove();

        // 2. Table Container
        const tableResponsive = document.createElement('div');
        tableResponsive.className = 'responsive-holder fill-card-width';

        const table = document.createElement('table');
        table.className = 'data-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th class="text-left">Ratio</th>
                    ${data.years.map(y => `<th>${y}</th>`).join('')} 
                </tr>
            </thead>
            <tbody id="ratio-table-body"></tbody>
        `;

        tableResponsive.appendChild(table);
        container.appendChild(tableResponsive);



        // Initialize State
        // Ensure 'Screener Default' is always the starting template

        RatioUI.state.template = 'Screener Default';

        // Initial Render
        RatioUI.renderControls();
        RatioUI.renderTable();
    },

    captureDefaultRatios: (container) => {
        // Scrape the existing table to populate defaultRatiosMap
        const table = container.querySelector('table');
        if (!table) return;

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;

            const name = cells[0].innerText.trim();
            const values = [];
            for (let i = 1; i < cells.length; i++) {
                values.push(cells[i].innerText.trim()); // Keep as string to preserve exact formatting
            }
            RatioUI.defaultRatiosMap[name] = values;
        });
    },

    renderControls: () => {
        const controls = document.querySelector('#ratio-controls');
        if (!controls) return;

        const templates = Object.keys(RatioTemplates);

        controls.innerHTML = `
            <select id="ratio-template-select" class="ratio-select">
                ${templates.map(t => `<option value="${t}" ${RatioUI.state.template === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
        `;

        // Bind Control Events
        const tmplSelect = controls.querySelector('#ratio-template-select');
        tmplSelect.addEventListener('change', (e) => {
            RatioUI.setTemplate(e.target.value);
        });
    },

    renderTable: () => {
        const tbody = document.querySelector('#ratio-table-body');
        if (!tbody) return;

        const ratios = RatioTemplates[RatioUI.state.template];

        tbody.innerHTML = ratios.map((r) => {
            let values;

            // Use captured default values if available
            if (RatioUI.defaultRatiosMap[r.name]) {
                values = RatioUI.defaultRatiosMap[r.name];
            } else {
                const rawValues = RatioCalculator.calculate(RatioUI.data, r);
                const fmt = r.unit && U[r.unit] ? U[r.unit] : U.num;
                values = rawValues.map(v => fmt(v));
            }

            return `
                <tr>
                    <td class="text-left" style="font-weight: 500;">${r.name}</td>
                    ${values.map(v => `<td>${v}</td>`).join('')}
                </tr>
            `;
        }).join('');
    },

    setTemplate: (name) => {
        RatioUI.state.template = name;
        RatioUI.renderTable();
        RatioUI.renderControls();
    },

    injectStyles: (container) => {
        if (document.getElementById('ratio-dynamic-styles')) return;

        const style = document.createElement('style');
        style.id = 'ratio-dynamic-styles';
        style.textContent = `
            .ratio-select {
                font-size: inherit; 
                font-family: inherit; 
                font-weight: 500; 
                color: var(--sif-text, inherit); 
                border: none; 
                background-color: transparent;
                background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>');
                background-repeat: no-repeat;
                background-position: right center;
                padding-right: 20px;
                padding-left: 4px;
                cursor: pointer; 
                outline: none;
                margin: 0;
                appearance: none;
                -webkit-appearance: none;
            }
            .ratio-select option {
                background-color: var(--sif-bg, #fff);
                color: var(--sif-text, #333);
            }
        `;
        document.head.appendChild(style);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
