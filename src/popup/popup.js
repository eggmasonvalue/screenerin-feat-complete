/**
 * Screener.in Filter Popup Script
 * Manages the database status display.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('status');
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
                    text += `\nIndustries: ${data.dbStats.totalIndustries}`;
                }
                text += `\n\nDatabase is automatically synchronized with the latest industry classifications.`;
                statusEl.innerText = text;
            } else {
                statusEl.textContent = "Initializing database...";
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
        const { status, progress, details, isActive } = data;

        // If active, show progress
        if (isActive) {
            statusEl.textContent = status;
            progressContainer.style.display = 'block';
            progressBar.style.width = progress + '%';

            const d = document.getElementById('progressDetails');
            if (d) {
                d.textContent = details || "";
            }
        } else {
            // If finished, refresh status
             progressContainer.style.display = 'none';
             if (progress >= 100) {
                 checkStatus();
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
     * Listener: Progress Updates from Background
     */
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "progressUpdate") {
            updateProgressUI(msg.data);
        }
    });
});
