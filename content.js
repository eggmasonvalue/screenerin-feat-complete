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

        const card = table ? table.closest('.card') : null;

        if (card) {
            // If card exists, we return it so we can appendChild (puts at bottom inside card)
            return card;
        }

        // Fallback: parent of table
        return table ? table.parentElement : null;
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
        return document.querySelector('.mark-visited');
    },

    cleanupItems: () => {
        document.querySelectorAll('.extension-fetched-row').forEach(el => el.remove());
    }
};

let activeStrategy = null;

// -----------------------------------------------------
// Core Logic
// -----------------------------------------------------

async function init() {
    try {
        const data = await chrome.storage.local.get(['stockMap']);
        if (!data.stockMap) {
            console.log("Screener Filter: No industry data found.");
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
    summary.innerText = "Filter by Industry";
    summary.style.fontWeight = "600";
    summary.style.cursor = "pointer";
    summary.style.marginBottom = "8px";

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

function updateFilterStatus(currentMatches) {
    let statusEl = document.querySelector('.screener-scanner-status');
    const injectionPoint = activeStrategy.getStatusInjectionPoint();

    // Hide native pagination when filtering
    const nativePag = document.querySelector('.paginator');
    if (nativePag) nativePag.style.display = 'none';

    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'screener-scanner-status';
        statusEl.style.marginTop = '16px';
        statusEl.style.padding = '12px';
        statusEl.style.background = '#fcf8e3';
        statusEl.style.borderRadius = '4px';
        statusEl.style.border = '1px solid #faebcc';
        statusEl.style.color = '#8a6d3b';

        // Inject INTO the container, at the bottom
        // This handles both TableStrategy (inside .card) and ListStrategy (after list items)
        if (injectionPoint) {
            injectionPoint.appendChild(statusEl);
        }
    }

    const nextUrl = getNextPageUrl(document);
    let html = `<div>Showing <strong>${currentMatches}</strong> matches on this page.</div>`;

    if (nextUrl) {
        html += `<div style="margin-top:5px; color:#666; font-size:12px;">More matches may exist on subsequent pages.</div>`;
        html += `<button class="button-primary load-all-btn" style="margin-top:8px; padding: 6px 12px; cursor: pointer;">Scan All Pages</button>`;
    } else {
        html += `<div style="margin-top:5px; color:#27ae60; font-weight:500;">✓ End of Results.</div>`;
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

    statusEl.innerHTML = `<div>Fetching all pages... <br>Found: <strong>${totalMatches}</strong></div>`;

    while (nextUrl && isFetchingAll && fetchId === currentFetchId) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES));
        statusEl.innerHTML = `<div>Scanning Page ${pagesScanned + 1}... <br>Found: <strong>${totalMatches}</strong></div>`;

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
        statusEl.innerHTML = `<div><strong>Scan Complete!</strong> Checked ${pagesScanned} pages.<br>Total Matches: <strong>${totalMatches}</strong></div>`;
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
        this.element.style.position = 'relative';
        this.element.style.display = 'flex';
        this.element.style.alignItems = 'center';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.placeholder = 'Select Industry...';
        this.input.style.width = '100%';
        this.input.style.padding = '8px';
        this.input.style.paddingRight = '30px';
        this.input.style.border = '1px solid #d1d5db';
        this.input.style.borderRadius = '4px';
        this.input.addEventListener('keydown', (e) => e.stopPropagation());

        // Clear Button (X)
        this.clearBtn = document.createElement('span');
        this.clearBtn.innerHTML = '&times;';
        this.clearBtn.style.position = 'absolute';
        this.clearBtn.style.right = '10px';
        this.clearBtn.style.cursor = 'pointer';
        this.clearBtn.style.color = '#999';
        this.clearBtn.style.fontSize = '18px';
        this.clearBtn.style.display = 'none';
        this.clearBtn.title = "Clear Filter";

        this.clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clear();
        });

        this.list = document.createElement('ul');
        this.list.style.display = 'none';
        this.list.style.position = 'absolute';
        this.list.style.top = '100%';
        this.list.style.left = '0';
        this.list.style.zIndex = '1000';
        this.list.style.background = 'white';
        this.list.style.border = '1px solid #d1d5db';
        this.list.style.borderRadius = '4px';
        this.list.style.width = '100%';
        this.list.style.maxHeight = '200px';
        this.list.style.overflowY = 'auto';
        this.list.style.listStyle = 'none';
        this.list.style.padding = '0';
        this.list.style.margin = '4px 0 0 0';
        this.list.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';

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
            li.innerText = 'No matches';
            li.style.padding = '8px';
            li.style.color = '#9ca3af';
            this.list.appendChild(li);
        } else {
            matches.forEach(item => {
                const li = document.createElement('li');
                li.innerText = item;
                li.style.padding = '8px';
                li.style.cursor = 'pointer';
                li.style.borderBottom = '1px solid #f3f4f6';
                li.addEventListener('mouseenter', () => li.style.background = '#f9fafb');
                li.addEventListener('mouseleave', () => li.style.background = 'white');
                li.addEventListener('mousedown', () => this.select(item));
                this.list.appendChild(li);
            });
        }
    }

    open() { this.list.style.display = 'block'; this.isOpen = true; }
    close() { this.list.style.display = 'none'; this.isOpen = false; }

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
