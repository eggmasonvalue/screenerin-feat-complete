/**
 * Screener.in Filter Background Script
 * Handles data aggregation (scraping) and storage management.
 */

const BASE_DELAY = 350;

/**
 * Utility to pause execution
 * @param {number} ms 
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch with automatic retries and exponential backoff for rate limits
 * @param {string} url 
 * @param {number} retries 
 * @returns {Promise<string>}
 */
// Global counter for persistent backoff scaling
let rateLimitLevel = 0;

async function fetchWithBackoff(url, retries = 3) {
    let currentDelay = BASE_DELAY;

    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Fetching: ${url} (Attempt ${i + 1})`);
            const response = await fetch(url);

            if (response.status === 429 || response.status === 403) {
                rateLimitLevel++; // Increment global level

                // Modified backoff: start at 5s, grow by double (2x) based on GLOBAL level
                // Level 1: 5s, Level 2: 10s, Level 3: 20s
                const backoffTime = 5000 * Math.pow(2, rateLimitLevel - 1);
                const seconds = (backoffTime / 1000).toFixed(1);

                console.warn(`Rate limit hit (${response.status}) on ${url}. Level: ${rateLimitLevel}. Pausing ${seconds}s...`);

                // Visible Backoff
                if (typeof updateState === 'function') {
                    updateState({ details: `Rate limit hit (${response.status}).\nPausing for ${seconds}s...` });
                }

                await delay(backoffTime);
                continue;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Success: Slowly reduce rate limit level
            if (rateLimitLevel > 0) rateLimitLevel = Math.max(0, rateLimitLevel - 0.05);

            return await response.text();

        } catch (err) {
            console.error(`Fetch failed for ${url}: ${err.message}`);
            if (i === retries - 1) throw err;

            if (typeof updateState === 'function') {
                updateState({ details: `Request failed. Retrying (${i + 1}/${retries})...` });
            }
            await delay(2000 * (i + 1));
        }
    }
}

/**
 * Scrapes the main market page to get a list of all industries
 * @returns {Promise<Array<{url: string, name: string}>>}
 */
async function fetchIndustryList() {
    const text = await fetchWithBackoff('https://www.screener.in/market/');

    // Regex to capture URL and Industry Name from Screener's market page
    const industryRegex = /<a[^>]+href="(\/market\/IN[^"]+?\/)"[^>]*>([\s\S]*?)<\/a>/g;
    const matches = [...text.matchAll(industryRegex)];

    const industryMap = new Map();

    matches.forEach(m => {
        const url = `https://www.screener.in${m[1]}`;
        const name = m[2].trim().replace(/&amp;/g, '&');
        // Avoid urls with query params which might be duplicates or subsets
        if (!url.includes("?")) {
            industryMap.set(url, name);
        }
    });

    return Array.from(industryMap.entries()).map(([url, name]) => ({ url, name }));
}

/**
 * Scrapes an individual industry page for stock symbols and hierarchy
 * @param {string} url 
 * @returns {Promise<{symbols: string[], hierarchy: object}>}
 */
async function scrapeIndustryPage(url) {
    const stocks = new Set();
    let hierarchy = null;
    let nextUrl = `${url}?limit=100`;

    let pages = 0;
    while (nextUrl && pages < 10) { // Limit to 10 pages per industry to avoid infinite loops
        try {
            const text = await fetchWithBackoff(nextUrl);

            // Extract hierarchy from breadcrumb (only on first page)
            if (pages === 0 && !hierarchy) {
                // Find the breadcrumb by locating the "Industries" link and getting its parent UL
                // Pattern: <a href="/market/">Industries</a> ... <a>Macro</a> ... <a>Sector</a> ... <a>Industry</a> ... Basic Industry
                const industriesLinkRegex = /<a[^>]*href="\/market\/"[^>]*>([^<]+)<\/a>/i;
                const industriesMatch = text.match(industriesLinkRegex);

                if (industriesMatch) {
                    // Find the UL container that includes this link
                    const ulStartIndex = text.lastIndexOf('<ul', industriesMatch.index);
                    const ulEndIndex = text.indexOf('</ul>', industriesMatch.index) + 5;

                    if (ulStartIndex !== -1 && ulEndIndex !== -1) {
                        const breadcrumbHTML = text.substring(ulStartIndex, ulEndIndex);

                        // Extract all link texts from breadcrumb (ignoring icons)
                        const linkRegex = /<a[^>]*href="\/market\/[^"]*"[^>]*>([^<]+)<\/a>/g;
                        const links = [...breadcrumbHTML.matchAll(linkRegex)].map(m => m[1].trim());

                        // Also get the last text (Basic Industry) which might not be a link
                        // Look for text after the last </a> tag
                        const lastLinkIndex = breadcrumbHTML.lastIndexOf('</a>');
                        const remainingHTML = breadcrumbHTML.substring(lastLinkIndex);
                        const textMatch = remainingHTML.match(/>([^<>]+)</);
                        const lastText = textMatch ? textMatch[1].trim() : '';

                        // Expected links: ["Industries", "Macro", "Sector", "Industry"]
                        // Plus lastText: "Basic Industry"
                        if (links.length >= 4) {
                            hierarchy = {
                                macro: links[1],
                                sector: links[2],
                                industry: links[3],
                                basicIndustry: lastText || links[4] || links[links.length - 1]
                            };
                        }
                    }
                }
            }

            // Extract stock symbols from company links
            const stockRegex = /href="\/company\/([A-Za-z0-9-]+)\//g;
            const stockMatches = [...text.matchAll(stockRegex)];

            if (stockMatches.length === 0) break;

            stockMatches.forEach(m => {
                const symbol = m[1];
                if (symbol.toLowerCase() !== "industry") {
                    stocks.add(symbol);
                }
            });

            // If we have fewer than 50 stocks, it's likely the last page (Screener uses 50-100 per page)
            if (stockMatches.length < 50) {
                nextUrl = null;
            } else {
                pages++;
                const currentUrlObj = new URL(nextUrl);
                let pageNum = parseInt(currentUrlObj.searchParams.get("page") || "1");
                currentUrlObj.searchParams.set("page", pageNum + 1);
                nextUrl = currentUrlObj.toString();
            }

            await delay(BASE_DELAY + Math.random() * 50);

        } catch (e) {
            console.error("Error scraping " + nextUrl, e);
            break;
        }
    }

    return {
        symbols: Array.from(stocks),
        hierarchy: hierarchy
    };
}

/**
 * Builds the complete industry database
 * @param {Function} sendProgress Callback to send status updates
 */
async function buildDatabase(sendProgress) {
    try {
        console.log("Starting database build...");
        sendProgress({ status: "Fetching industry list...", progress: 0 });

        const industries = await fetchIndustryList();
        console.log(`Found ${industries.length} industries.`);

        const stockToIndustry = {};
        const industryHierarchy = {};
        const timestamp = Date.now();

        const stats = {
            totalIndustries: industries.length,
            industriesScraped: 0,
            stocksFound: 0,
            startTime: timestamp,
            errors: []
        };

        // Reset State
        updateState({
            isActive: true,
            status: "Fetching industry list...",
            progress: 0,
            details: "",
            error: false
        });

        let completed = 0;

        for (const ind of industries) {
            try {
                const result = await scrapeIndustryPage(ind.url);

                result.symbols.forEach(sym => {
                    stockToIndustry[sym] = ind.name;
                });

                // Store hierarchy for this basic industry
                if (result.hierarchy) {
                    industryHierarchy[ind.name] = result.hierarchy;
                }

                stats.industriesScraped++;
                stats.stocksFound += result.symbols.length;

            } catch (err) {
                console.error(`Failed to scrape ${ind.name}`, err);
                stats.errors.push(`Failed: ${ind.name}`);
            }

            completed++;
            const percent = Math.round((completed / industries.length) * 100);
            sendProgress({
                isActive: true,
                status: `Scraping: ${ind.name} (${completed}/${industries.length})`,
                progress: percent,
                details: `Stocks found so far: ${stats.stocksFound}`
            });
        }

        console.log(`Database built. Saving ${Object.keys(stockToIndustry).length} stocks and ${Object.keys(industryHierarchy).length} hierarchies.`);

        await chrome.storage.local.set({
            stockMap: stockToIndustry,
            industryHierarchy: industryHierarchy,
            lastUpdated: timestamp,
            dbStats: stats
        });

        sendProgress({
            isActive: false,
            status: "Complete!",
            progress: 100,
            count: Object.keys(stockToIndustry).length,
            stats: stats
        });

    } catch (err) {
        console.error("Database Build Failed:", err);
        sendProgress({
            isActive: false,
            status: "Error: " + err.message,
            progress: 0,
            error: true
        });
    }
}

// Track global state
let scrapingState = {
    isActive: false,
    status: "",
    progress: 0,
    details: "",
    error: false
};

function updateState(newState) {
    scrapingState = { ...scrapingState, ...newState };
    // Broadcast to any open popups
    chrome.runtime.sendMessage({ action: "progressUpdate", data: scrapingState }).catch(() => { });
}

/**
 * Message Listener for Extension Communication
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startScrape") {
        if (scrapingState.isActive) {
            sendResponse({ started: false, reason: "Already active" });
            return;
        }

        buildDatabase((progressData) => {
            updateState(progressData);
        });
        sendResponse({ started: true });
    } else if (request.action === "getScrapeStatus") {
        sendResponse(scrapingState);
    } else if (request.action === "fetchMarketCap") {
        fetchMarketCapFromPage(request.url)
            .then(mcap => sendResponse({ mcap }))
            .catch(err => sendResponse({ error: err.message }));
        return true; // Keep channel open
    }
    return true; // Keep channel open
});

/**
 * Specifically fetches and parses Market Cap for the portfolio feature
 * @param {string} url 
 * @returns {Promise<number>}
 */
async function fetchMarketCapFromPage(url) {
    try {
        const text = await fetchWithBackoff(url);

        // Match: <span class="name">Market Cap</span> ... <span class="number">1,23,456</span>
        // The structure is flexible with whitespace and tags
        const mcapRegex = /Market\s+Cap[\s\S]*?class="number">([\d,.]+)</i;
        const match = text.match(mcapRegex);

        if (match) {
            return parseFloat(match[1].replace(/,/g, ''));
        }

        console.warn(`Market Cap not found in HTML for ${url}`);
        return 0;
    } catch (e) {
        console.error(`Error fetching Market Cap for ${url}:`, e);
        throw e;
    }
}

