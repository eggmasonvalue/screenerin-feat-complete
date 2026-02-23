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

            if (response.status === 404) {
                console.error(`Fetch 404 (Not Found) for ${url}. Not retrying.`);
                throw new Error("HTTP 404");
            }

            if (response.status === 429 || response.status === 403) {
                rateLimitLevel++; // Increment global level
                const backoffTime = 5000 * Math.pow(2, rateLimitLevel - 1);
                console.warn(`Rate limit hit (${response.status}) on ${url}. Pausing ${(backoffTime / 1000).toFixed(1)}s...`);
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
            if (err.message === "HTTP 404") throw err; // Don't retry 404s

            console.error(`Fetch failed for ${url}: ${err.message}`);
            if (i === retries - 1) throw err;

            await delay(2000 * (i + 1));
        }
    }
}

/**
 * Builds the complete industry database
 * @param {Function} sendProgress Callback to send status updates
 */
async function buildDatabase(sendProgress) {
    try {
        console.log("Starting database build...");
        sendProgress({ status: "Fetching industry data...", progress: 0 });

        // Reset State
        updateState({
            isActive: true,
            status: "Fetching industry data...",
            progress: 0,
            details: "",
            error: false
        });

        const INDUSTRY_DATA_URL = 'https://raw.githubusercontent.com/eggmasonvalue/stock-industry-map-in/master/out/industry_data.json';
        const jsonText = await fetchWithBackoff(INDUSTRY_DATA_URL);
        const json = JSON.parse(jsonText);

        sendProgress({ status: "Processing data...", progress: 50 });

        const stockToIndustry = {};
        const industryHierarchy = {};
        const timestamp = Date.now();
        let stocksFound = 0;

        // json.data[SYMBOL] = [Macro, Sector, Industry, Basic Industry]
        for (const [symbol, hierarchyArray] of Object.entries(json.data)) {
             if (hierarchyArray.length < 4) continue;

             const [macro, sector, industry, basicIndustry] = hierarchyArray;

             // Update Stock Map
             stockToIndustry[symbol] = basicIndustry;

             // Update Hierarchy Map
             if (!industryHierarchy[basicIndustry]) {
                 industryHierarchy[basicIndustry] = {
                     macro,
                     sector,
                     industry,
                     basicIndustry
                 };
             }
             stocksFound++;
        }

        const totalIndustries = Object.keys(industryHierarchy).length;
        const stats = {
            totalIndustries: totalIndustries,
            industriesScraped: totalIndustries,
            stocksFound: stocksFound,
            startTime: timestamp,
            errors: []
        };

        console.log(`Database built. Saving ${Object.keys(stockToIndustry).length} stocks and ${totalIndustries} hierarchies.`);

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
    } else if (request.action === "fetchNSEData") {
        fetchWithBackoff(request.url)
            .then(text => {
                try {
                    const json = JSON.parse(text);
                    sendResponse({ data: json });
                } catch (e) {
                    sendResponse({ error: "Failed to parse JSON" });
                }
            })
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
