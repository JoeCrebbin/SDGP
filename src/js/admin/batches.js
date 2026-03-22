/*
 * admin/batches.js - All Batches Page Handler (Admin Only)
 *
 * Displays every optimisation batch across all users (unlike the regular
 * history page which only shows the logged-in user's batches).
 *
 * Features:
 *   - Searchable table of all batches with user email, name, waste %, date
 *   - Click "View" to see the full CSV output for any batch
 *   - Download CSV from the detail view
 */

document.addEventListener('DOMContentLoaded', async () => {
    const batchesBody = document.getElementById('batches-body');
    const detailSection = document.getElementById('batch-detail-section');
    const searchInput = document.getElementById('batch-search');
    const searchBtn = document.getElementById('batch-search-btn');

    let currentChart = null;

    /**
     * Load all batches from the backend.
     * Uses a LEFT JOIN with users to show the email of who created each batch.
     * Optional search filters by batch name, user email, or date.
     */
    async function loadBatches(search) {
        try {
            const response = await window.adminAPI.listAllBatches(search || '');
            if (!response.success) {
                batchesBody.innerHTML = '<tr><td colspan="5">Failed to load batches.</td></tr>';
                return;
            }

            if (response.batches.length === 0) {
                batchesBody.innerHTML = '<tr><td colspan="5">No batches found.</td></tr>';
                return;
            }

            // Build a row for each batch
            batchesBody.innerHTML = '';
            for (const batch of response.batches) {
                const row = document.createElement('tr');
                const dateStr = batch.created_at
                    ? new Date(batch.created_at).toLocaleString()
                    : 'N/A';
                row.innerHTML = `
                    <td>${escapeHtml(batch.batch_name || 'Unnamed')}</td>
                    <td>${escapeHtml(batch.user_email || 'N/A')}</td>
                    <td>${batch.total_wastage_percent != null ? batch.total_wastage_percent.toFixed(2) + '%' : 'N/A'}</td>
                    <td>${dateStr}</td>
                    <td><button class="secondary-btn view-btn" data-id="${batch.id}">View</button></td>
                `;
                batchesBody.appendChild(row);
            }

            // Wire up "View" buttons
            batchesBody.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', () => loadDetail(parseInt(btn.dataset.id)));
            });
        } catch (err) {
            console.error('Load batches error:', err);
            batchesBody.innerHTML = '<tr><td colspan="5">Error loading batches.</td></tr>';
        }
    }

    /**
     * Load full details for a batch (reads the CSV file from disk).
     * Renders a summary card and the CSV data table with download option.
     */
    async function loadDetail(batchId) {
        try {
            const response = await window.adminAPI.batchDetail(batchId);
            if (!response.success) {
                alert(response.message || 'Failed to load details.');
                return;
            }

            const { batch, csvContent } = response;
            detailSection.style.display = 'block';
            detailSection.innerHTML = '';

            // Summary stats
            detailSection.insertAdjacentHTML('beforeend', `
                <hr>
                <h3>${escapeHtml(batch.batch_name || 'Unnamed')}</h3>
                <div class="stats-row">
                    <div class="stat-card">
                        <p class="stat-value">${batch.total_wastage_percent != null ? batch.total_wastage_percent.toFixed(2) + '%' : 'N/A'}</p>
                        <p class="stat-label">Waste Percentage</p>
                    </div>
                    <div class="stat-card">
                        <p class="stat-value">${batch.created_at ? new Date(batch.created_at).toLocaleDateString() : 'N/A'}</p>
                        <p class="stat-label">Created</p>
                    </div>
                </div>
            `);

            // CSV viewer (if the file exists)
            if (csvContent && csvContent.trim()) {
                detailSection.insertAdjacentHTML('beforeend', buildCsvViewer(csvContent, batch.batch_name || 'batch'));
                const dlBtn = detailSection.querySelector('#btn-download-csv');
                if (dlBtn) {
                    dlBtn.addEventListener('click', () => downloadCsv(csvContent, batch.batch_name || 'batch'));
                }
            } else {
                detailSection.insertAdjacentHTML('beforeend', '<div class="card"><p>No CSV data available for this batch.</p></div>');
            }

            // Close button
            detailSection.insertAdjacentHTML('beforeend', '<button class="secondary-btn" id="detail-close" style="margin-top:8px;">Close Details</button>');
            document.getElementById('detail-close').addEventListener('click', () => {
                detailSection.style.display = 'none';
                if (currentChart) { currentChart.destroy(); currentChart = null; }
            });

        } catch (err) {
            console.error('Detail load error:', err);
            alert('Error loading batch details.');
        }
    }

    // Load all batches on page load
    await loadBatches();

    // Search - button click and Enter key
    searchBtn.addEventListener('click', () => loadBatches(searchInput.value.trim()));
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadBatches(searchInput.value.trim());
    });

    // ---- Helper Functions ----

    // Build a scrollable CSV data table
    function buildCsvViewer(csvContent, batchName) {
        const lines = csvContent.split('\n').filter(l => l.trim());
        if (lines.length === 0) return '';
        const headers = lines[0].split(',');
        let tableHtml = '<thead><tr>';
        for (const h of headers) tableHtml += `<th>${escapeHtml(h)}</th>`;
        tableHtml += '</tr></thead><tbody>';
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',');
            tableHtml += '<tr>';
            for (const c of cells) tableHtml += `<td>${escapeHtml(c)}</td>`;
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody>';
        return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><h3 style="margin:0;">Output CSV</h3><button class="secondary-btn" id="btn-download-csv">Download CSV</button></div><div class="csv-viewer"><table>${tableHtml}</table></div></div>`;
    }

    // Trigger a CSV file download using a temporary Blob URL
    function downloadCsv(csvContent, batchName) {
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${batchName.replace(/[^a-zA-Z0-9_-]/g, '_')}_output.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // XSS prevention
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
});
