/**
 * Screener.in Filter Popup Script
 * Manages the database initialization and status display.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('status');
    const btn = document.getElementById('refreshBtn');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');

    /**
     * Formats a timestamp into a readable date string
     * @param {number} ts 
     * @returns {string}
     */
    const formatDate = (ts) => new Date(ts).toLocaleDateString() + ' ' + new Date(ts).toLocaleTimeString();

    /**
     * Checks the current storage status and updates the UI
     */
    async function checkStatus() {
        try {
            const data = await chrome.storage.local.get(['stockMap', 'lastUpdated', 'dbStats']);

            if (data.stockMap && data.lastUpdated) {
                const count = Object.keys(data.stockMap).length;
                let text = `Database ready. ${count} stocks.\nLast updated: ${formatDate(data.lastUpdated)}`;

                if (data.dbStats) {
                    text += `\nIndustries: ${data.dbStats.industriesScraped}/${data.dbStats.totalIndustries}`;
                    if (data.dbStats.errors && data.dbStats.errors.length > 0) {
                        text += `\nErrors: ${data.dbStats.errors.length}`;
                    }
                }
                statusEl.innerText = text;
                btn.textContent = "Refresh Database (Fast Mode)";
            } else {
                statusEl.textContent = "Database empty. Please initialize.";
                btn.textContent = "Initialize (Fast Mode)";
            }
        } catch (err) {
            console.error("Popup: Failed to check status", err);
            statusEl.textContent = "Error reading storage. Check console.";
        }
    }

    // Initial status check
    await checkStatus();

    /**
     * Updates UI based on progress object
     */
    function updateProgressUI(data) {
        const { status, progress, details, error, isActive } = data;

        statusEl.textContent = status;

        const d = document.getElementById('progressDetails');
        if (d) {
            d.textContent = details || "";
        }

        if (isActive) {
            btn.disabled = true;
            btn.textContent = "Scraping safely... (Do not close)";
            progressContainer.style.display = 'block';
            progressBar.style.width = progress + '%';
        } else {
            // Completed or Error
            if (progress >= 100 || error) {
                btn.disabled = false;
                progressBar.style.width = progress + '%';

                if (!error) {
                    setTimeout(checkStatus, 1500);
                } else {
                    btn.textContent = "Retry";
                    statusEl.textContent = "Scrape failed. " + status;
                }
            }
        }
    }

    // Initial State Check: Ask Background if busy
    chrome.runtime.sendMessage({ action: "getScrapeStatus" }, (response) => {
        if (response && response.isActive) {
            updateProgressUI(response);
        } else {
            // Only check storage if not currently scraping
            checkStatus();
        }
    });

    /**
     * Event: Start Scrape
     */
    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = "Scraping safely... (Do not close)";
        progressContainer.style.display = 'block';
        chrome.runtime.sendMessage({ action: "startScrape" });
    });

    /**
     * Listener: Progress Updates from Background
     */
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "progressUpdate") {
            updateProgressUI(msg.data);
        }
    });
});

