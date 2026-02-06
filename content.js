/**
 * Screener.in Filter Content Script
 * Handles UI injection and row filtering based on cached industry data.
 */

console.log("Screener Content Script Active (v1.3.1)");

let stockMap = null;
let activeIndustry = "";
let isFetchingAll = false;
let currentFetchId = 0; // To track and cancel old fetches

const DELAY_BETWEEN_PAGES = 200;

/**
 * Utility to pause execution
 * @param {number} ms - Milliseconds to delay
 */
const delay = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Main initialization function
 */
async function init() {
    try {
        const data = await chrome.storage.local.get(['stockMap']);
        if (!data.stockMap) {
            console.log("Screener Filter: No industry data found. Use the extension popup to initialize.");
            return;
        }
        stockMap = data.stockMap;

        // Injection Point: Sidebar (Screener specific class)
        const sidebar = document.querySelector('.change-list-filter');
        if (!sidebar) {
            console.warn("Screener Filter: Sidebar (.change-list-filter) not found on this page.");
            return;
        }

        injectSidebarUI(sidebar);
    } catch (err) {
        console.error("Screener Filter Init Error:", err);
    }
}

/**
 * Injects the filter UI into the Screener sidebar
 * @param {HTMLElement} sidebar 
 */
function injectSidebarUI(sidebar) {
    const container = document.createElement('div');
    container.className = 'screener-industry-filter';

    const label = document.createElement('label');
    label.innerText = "Filter by Industry";

    // Extract and sort unique industries
    const industries = new Set(Object.values(stockMap));
    const sortedIndustries = Array.from(industries).sort();

    // Create Searchable Combobox
    const combobox = new Combobox(sortedIndustries, async (selected) => {
        activeIndustry = selected;
        // Stop any running deep scans
        currentFetchId++;
        isFetchingAll = false;
        await applyFilter();
    });

    container.appendChild(label);
    container.appendChild(combobox.element);

    sidebar.insertBefore(container, sidebar.firstChild);
}

// -----------------------------------------------------
// Custom Combobox Class (Vanilla JS)
// -----------------------------------------------------

/**
 * A searchable dropdown component
 */
class Combobox {
    constructor(items, onSelect) {
        this.items = items;
        this.onSelect = onSelect;
        this.selectedIndex = -1;
        this.isOpen = false;

        this.element = document.createElement('div');
        this.element.className = 'screener-combobox-container';

        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.className = 'screener-combobox-input';
        this.input.placeholder = 'Type to search...';

        this.list = document.createElement('ul');
        this.list.className = 'screener-combobox-list';

        this.element.appendChild(this.input);
        this.element.appendChild(this.list);

        this.input.addEventListener('input', () => this.onInput());
        this.input.addEventListener('focus', () => this.onInput());
        this.input.addEventListener('keydown', (e) => this.onKeydown(e));

        // Use global click to close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.element.contains(e.target)) {
                this.close();
            }
        });
    }

    onInput() {
        const val = this.input.value.toLowerCase();
        const matches = this.items.filter(item => item.toLowerCase().includes(val));
        this.renderList(matches);
        this.open();
    }

    renderList(matches) {
        this.list.innerHTML = '';
        if (matches.length === 0) {
            const li = document.createElement('li');
            li.innerText = 'No matches found';
            li.className = 'no-matches';
            this.list.appendChild(li);
            return;
        }

        matches.forEach((item) => {
            const li = document.createElement('li');
            li.innerText = item;
            li.innerText = item;
            li.addEventListener('click', () => this.select(item));

            if (item === this.input.value) li.classList.add('selected');
            this.list.appendChild(li);
        });

        this.selectedIndex = -1;
    }

    open() {
        this.list.style.display = 'block';
        this.isOpen = true;
    }

    close() {
        this.list.style.display = 'none';
        this.isOpen = false;
    }

    select(item) {
        this.input.value = item;
        this.onSelect(item);
        this.close();
    }

    onKeydown(e) {
        if (!this.isOpen && e.key !== 'Enter' && e.key !== 'ArrowDown') return;

        const options = this.list.querySelectorAll('li:not(.no-matches)');

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (!this.isOpen) this.open();
                this.selectedIndex = Math.min(this.selectedIndex + 1, options.length - 1);
                this.highlight(options);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.highlight(options);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0 && options[this.selectedIndex]) {
                    this.select(options[this.selectedIndex].innerText);
                } else if (this.input.value === "") {
                    this.onSelect("");
                    this.input.blur();
                }
                break;
            case 'Escape':
                this.input.blur();
                this.close();
                break;
        }
    }

    highlight(options) {
        options.forEach(o => o.classList.remove('focused'));
        if (options[this.selectedIndex]) {
            options[this.selectedIndex].classList.add('focused');
            options[this.selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }
}

// -----------------------------------------------------
// Core Filter Logic
// -----------------------------------------------------

/**
 * Finds the "Next" page URL from the native pagination
 * @param {Document|HTMLElement} doc 
 * @returns {string|null}
 */
function getNextPageUrl(doc) {
    const activePage = doc.querySelector('.paginator span.this-page');
    if (activePage && activePage.nextElementSibling && activePage.nextElementSibling.tagName === 'A') {
        return activePage.nextElementSibling.getAttribute('href');
    }
    return null;
}

/**
 * Applies the filter to the visible table rows
 */
/**
 * Applies the filter to the visible table rows
 */
async function applyFilter() {
    const tableBodies = document.querySelectorAll('table.data-table tbody');
    if (tableBodies.length === 0) return;

    if (activeIndustry === "") {
        showAllRows(tableBodies);
        resetPaginationUI();
        return;
    }

    let totalMatches = 0;
    tableBodies.forEach(tbody => {
        totalMatches += filterRows(tbody, activeIndustry);
    });

    updateFilterStatus(totalMatches, tableBodies.length);
}

/**
 * Shows all rows and resets UI to default
 * @param {NodeList} tablebodies 
 */
function showAllRows(tableBodies) {
    tableBodies.forEach(tbody => {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.forEach(tr => tr.style.display = '');
    });

    document.querySelector('.screener-scanner-status')?.remove();
    document.querySelector('.paginator')?.style.setProperty('display', '', 'important');
    isFetchingAll = false;
}

/**
 * Hides/Shows rows based on industry
 * @param {HTMLElement} tbody 
 * @param {string} industry 
 * @returns {number} Count of visible rows
 */
function filterRows(tbody, industry) {
    let count = 0;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach(row => {
        const link = row.querySelector('a[href^="/company/"]');
        if (link) {
            const parts = link.getAttribute('href').split('/');
            const symbol = parts[2];
            const ind = stockMap[symbol] || "Unknown";

            if (ind === industry) {
                row.style.display = '';
                count++;
            } else {
                row.style.display = 'none';
            }
        }
    });
    return count;
}

/**
 * Updates the UI status below the table
 * @param {number} currentMatches 
 * @param {number} tableCount
 */
function updateFilterStatus(currentMatches, tableCount) {
    let statusEl = document.querySelector('.screener-scanner-status');

    const nativePag = document.querySelector('.paginator');
    if (nativePag) nativePag.style.display = 'none';

    const nextUrl = getNextPageUrl(document);
    // Find the LAST data table to append the status element after
    const tables = document.querySelectorAll('table.data-table');
    const lastTable = tables[tables.length - 1];

    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.className = 'screener-scanner-status';
        if (lastTable && lastTable.parentElement) {
            lastTable.parentElement.appendChild(statusEl);
        }
    }

    if (isFetchingAll) return;

    let html = `<div>Showing <strong>${currentMatches}</strong> matches on this page.</div>`;

    if (nextUrl) {
        if (tableCount > 1) {
            html += `<div style="margin-top:5px; color:#e67e22; font-size:12px;">Deep Scan disabled: Multiple tables detected.</div>`;
        } else {
            html += `<div style="margin-top:5px; color:#666; font-size:12px;">More matches may exist on subsequent pages.</div>`;
            html += `<button class="button-primary load-all-btn">Scan All Pages (Safe Fetch)</button>`;
        }
    } else {
        html += `<div style="margin-top:5px; color:#27ae60; font-weight:500;">✓ End of Results.</div>`;
    }

    statusEl.innerHTML = html;

    const btn = statusEl.querySelector('button');
    if (btn) {
        btn.addEventListener('click', () => startDeepFetch(statusEl));
    }
}

/**
 * Scans following pages and appends matching rows to the current table
 * @param {HTMLElement} statusEl 
 */
async function startDeepFetch(statusEl) {
    if (isFetchingAll) return;
    isFetchingAll = true;
    const fetchId = currentFetchId;

    const tbody = document.querySelector('table.data-table tbody'); // Only works for single table pages
    let totalMatches = filterRows(tbody, activeIndustry);
    let pagesScanned = 1;
    let nextUrl = getNextPageUrl(document);

    statusEl.innerHTML = `<div>Fetching all pages... <br>Found: <strong>${totalMatches}</strong></div>`;

    while (nextUrl && isFetchingAll && fetchId === currentFetchId) {
        await delay(DELAY_BETWEEN_PAGES);

        statusEl.innerHTML = `<div>Scanning Page ${pagesScanned + 1}... <br>Found: <strong>${totalMatches}</strong></div>`;

        try {
            let response = await fetch(nextUrl);

            // Handle Rate Limit (429)
            if (response.status === 429) {
                statusEl.innerHTML += `<div style="color:orange; font-size:11px;">Rate limit hit (429). Pausing for 10s...</div>`;
                await delay(10000);
                response = await fetch(nextUrl); // Retry once
            }

            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            const text = await response.text();

            // Check if we are still active and same fetch
            if (!isFetchingAll || fetchId !== currentFetchId) break;

            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            const newRows = Array.from(doc.querySelectorAll('table tbody tr'));

            for (const row of newRows) {
                const link = row.querySelector('a[href^="/company/"]');
                if (link) {
                    const parts = link.getAttribute('href').split('/');
                    const symbol = parts[2];
                    const ind = stockMap[symbol] || "Unknown";

                    if (ind === activeIndustry) {
                        tbody.appendChild(row);
                        totalMatches++;
                    }
                }
            }

            nextUrl = getNextPageUrl(doc);
            pagesScanned++;

        } catch (e) {
            console.error("Deep fetch error:", e);
            statusEl.innerHTML += `<div style="color:red; font-size:11px;">Error on page ${pagesScanned + 1}: ${e.message}. Stopped.</div>`;
            break;
        }
    }

    if (fetchId === currentFetchId) {
        isFetchingAll = false;
        statusEl.innerHTML = `<div><strong>Scan Complete!</strong> Checked ${pagesScanned} pages.<br>Total Matches: <strong>${totalMatches}</strong></div>`;
    }
}

/**
 * Restores visibility of native pagination
 */
function resetPaginationUI() {
    document.querySelector('.paginator')?.style.setProperty('display', '', 'important');
}

// Initial Run
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

