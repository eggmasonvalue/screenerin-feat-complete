/**
 * Screener.in Filter Content Script
 * Handles UI injection and row filtering based on cached industry data.
 * v1.10.0: Layout Fix for Upcoming Results & Robust List Handling
 */

console.log("Screener Content Script Active (v1.10.0)");

let stockMap = null;
let activeIndustry = "";
let isFetchingAll = false;
let currentFetchId = 0;

const DELAY_BETWEEN_PAGES = 300;

// -----------------------------------------------------
// Strategies
// -----------------------------------------------------

const PeopleStrategy = {
    name: 'PeopleStrategy',
    matches: (doc) => {
        return window.location.pathname.includes('/people/') &&
            !!doc.querySelector('.responsive-holder table.data-table');
    },
    // No "items" in the filtering sense, but we need to init the analysis
    init: () => {
        startPortfolioAnalysis();
    }
};

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

async function startPortfolioAnalysis() {
    const table = document.querySelector('.responsive-holder table.data-table');
    if (!table) return;

    // 1. Inject Columns
    const theadRow = table.querySelector('thead tr');
    if (theadRow && !theadRow.querySelector('.portfolio-header')) {
        const thPercent = document.createElement('th');
        thPercent.className = 'portfolio-header';
        thPercent.innerText = '% Port';
        thPercent.style.textAlign = 'right';

        const thValue = document.createElement('th');
        thValue.className = 'portfolio-header';
        thValue.innerText = 'Value (Cr)';
        thValue.style.textAlign = 'right';

        theadRow.appendChild(thValue);
        theadRow.appendChild(thPercent);
    }

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const holdings = [];

    // 2. Parse Rows & Setup Placeholders
    rows.forEach(row => {
        // Skip if already has cells
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

        // Extract Data
        const link = row.querySelector('td.text a');
        if (!link) return;

        const url = link.href;
        let percentHolding = 0;

        // Find last non-empty numerical cell (ignoring our new cells)
        const cells = Array.from(row.querySelectorAll('td'));
        // Filter out our new cells just in case they were added before selection? 
        // We just added them, so they are at the end. 
        // Iterate backwards starting from length-3 (last original cell)
        for (let i = cells.length - 3; i >= 0; i--) {
            const txt = cells[i].innerText.trim();
            if (txt && !isNaN(parseFloat(txt))) {
                percentHolding = parseFloat(txt);
                break;
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

    // 3. Status UI
    let statusEl = document.createElement('div');
    statusEl.innerHTML = `<small>Analyzing Portfolio: 0/${holdings.length} companies...</small>`;
    statusEl.style.marginBottom = '10px';
    statusEl.style.color = 'var(--ink-600)';
    table.parentElement.insertBefore(statusEl, table);

    // 4. Fetch Data (Concurrent with rate limit handling)
    let completed = 0;
    let totalPortfolioValue = 0;

    // Process in chunks of 5 to avoid hammering
    const chunkSize = 5;
    for (let i = 0; i < holdings.length; i += chunkSize) {
        const chunk = holdings.slice(i, i + chunkSize);

        await Promise.all(chunk.map(async (item) => {
            try {
                const mcap = await fetchMarketCap(item.url);
                item.marketCap = mcap;
                item.value = mcap * (item.percent / 100);
                totalPortfolioValue += item.value;

                // Update Row Immediately
                const valCell = item.row.querySelector('.portfolio-val');
                if (valCell) valCell.innerText = formatCurrency(item.value);

            } catch (e) {
                console.error(`Failed to fetch for ${item.url}`, e);
                const valCell = item.row.querySelector('.portfolio-val');
                if (valCell) valCell.innerText = 'Err';
            } finally {
                completed++;
                statusEl.innerHTML = `<small>Analyzing Portfolio: ${completed}/${holdings.length} companies...</small>`;
            }
        }));

        // Small delay between chunks
        if (i + chunkSize < holdings.length) {
            await new Promise(r => setTimeout(r, 500));
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

    statusEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>Total Portfolio Value: ${formatCurrency(totalPortfolioValue)} Cr</strong>
            <small style="color:var(--ink-500)">Calculated from ${holdings.length} holdings</small>
        </div>
    `;
}

async function fetchMarketCap(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        // Robust selector for Market Cap
        // Usually in topmost list: <li class="flex flex-space-between"> <span class="name">Market Cap</span> <span class="number">12,345</span> ...
        const items = doc.querySelectorAll('li.flex');
        for (let item of items) {
            const name = item.querySelector('.name')?.innerText;
            if (name && name.includes('Market Cap')) {
                const num = item.querySelector('.number')?.innerText;
                if (num) return parseFloat(num.replace(/,/g, ''));
            }
        }

        // Fallback for older layouts or different screens
        const spans = doc.querySelectorAll('.company-ratios span');
        for (let i = 0; i < spans.length; i++) {
            if (spans[i].innerText.includes('Market Cap')) {
                // Next span usually has the number, or the one after
                // This is less reliable, but a fallback.
                // Better fallback: search for text in top-ratios
            }
        }

        return 0;
    } catch (e) {
        console.warn("Market Cap Fetch Error", e);
        return 0;
    }
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

        const data = await chrome.storage.local.get(['stockMap']);
        if (!data.stockMap) {
            console.log("Screener Filter: No industry data found.");
            // Even if no industry data, we might want to allow other features if added later
            // But for now, just return
            return;
        }
        stockMap = data.stockMap;

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
        injectSidebarUI();

    } catch (err) {
        console.error("Screener Filter Init Error:", err);
    }
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
    summaryText.innerText = "By Industry";
    summary.appendChild(summaryText);

    // Warning Icon with Tooltip
    const warningContainer = document.createElement('span');
    warningContainer.className = 'screener-warning-container';

    const warningIcon = document.createElement('span');
    warningIcon.className = 'screener-warning-icon';
    warningIcon.innerText = '!';

    const tooltip = document.createElement('span');
    tooltip.className = 'screener-tooltip';
    tooltip.innerText = "Applying other filters after this filter would clear this filter. So, apply all the other filters you want before applying this.";

    warningContainer.appendChild(warningIcon);
    warningIcon.appendChild(tooltip); // Nesting allows pure CSS hover
    summary.appendChild(warningContainer);

    const contentContainer = document.createElement('div');
    contentContainer.style.padding = "4px 0";

    // Build Combobox
    const industries = new Set(Object.values(stockMap));
    const sortedIndustries = Array.from(industries).sort();

    const combobox = new Combobox(sortedIndustries, async (selected) => {
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
        showAllRows();
        return;
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
    constructor(items, onSelect) {
        this.items = items;
        this.onSelect = onSelect;
        this.isOpen = false;

        this.element = document.createElement('div');
        this.element.className = 'screener-combobox-container';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'screener-combobox-input';
        this.input.placeholder = 'Select Industry...';
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
        const matches = this.items.filter(i => i.toLowerCase().includes(val));
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
            matches.forEach(item => {
                const li = document.createElement('li');
                li.className = 'screener-combobox-item';
                li.innerText = item;
                // Removed inline hover/selection styles -> moved to CSS
                li.addEventListener('mousedown', () => this.select(item));
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
