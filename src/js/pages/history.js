/*
 * history.js - Batch History Page Handler
 *
 * Lets users view their past optimisation runs. Features:
 *   - Table of all batches with name, waste %, and date
 *   - Search/filter by batch name or date
 *   - Click "View" to expand a batch's full details (CSV table + charts)
 *   - Same chart types as the dashboard (bar, pie, doughnut, per-nest)
 */

document.addEventListener('DOMContentLoaded', async () => {
    const historyBody = document.getElementById('history-body');
    const detailSection = document.getElementById('detail-section');
    const searchInput = document.getElementById('history-search');
    const searchBtn = document.getElementById('history-search-btn');

    /**
     * Load batches from the backend and render the history table.
     * If a search term is provided, uses the search endpoint;
     * otherwise loads all batches for the current user.
     */
    async function loadBatches(search) {
        try {
            const response = search
                ? await window.historyAPI.search(search)
                : await window.historyAPI.list();

            if (!response.success) {
                historyBody.innerHTML = '<tr><td colspan="4">Failed to load history.</td></tr>';
                return;
            }

            if (response.batches.length === 0) {
                historyBody.innerHTML = '<tr><td colspan="4">No past optimisations found.</td></tr>';
                return;
            }

            // Build table rows for each batch
            historyBody.innerHTML = '';
            for (const batch of response.batches) {
                const row = document.createElement('tr');
                const dateStr = batch.created_at
                    ? new Date(batch.created_at).toLocaleString()
                    : 'N/A';
                row.innerHTML = `
                    <td>${escapeHtml(batch.batch_name || 'Unnamed')}</td>
                    <td>${batch.total_wastage_percent != null ? batch.total_wastage_percent.toFixed(2) + '%' : 'N/A'}</td>
                    <td>${dateStr}</td>
                    <td><button class="secondary-btn view-btn" data-id="${batch.id}">View</button></td>
                `;
                historyBody.appendChild(row);
            }

            // Wire up "View" buttons to load batch details
            historyBody.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', () => loadDetail(parseInt(btn.dataset.id)));
            });
        } catch (err) {
            console.error('History load error:', err);
            historyBody.innerHTML = '<tr><td colspan="4">Error loading history.</td></tr>';
        }
    }

    // Load all batches on page load
    await loadBatches();

    // Wire up search button and Enter key
    if (searchBtn) {
        searchBtn.addEventListener('click', () => loadBatches(searchInput.value.trim()));
    }
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') loadBatches(searchInput.value.trim());
        });
    }

    let currentChart = null;

    /**
     * Load and display full details for a specific batch.
     * Reads the saved CSV file and renders the same CSV viewer + charts
     * as the dashboard results section.
     */
    async function loadDetail(batchId) {
        try {
            const response = await window.historyAPI.detail(batchId);
            if (!response.success) {
                alert(response.message || 'Failed to load details.');
                return;
            }

            const { batch, csvContent } = response;
            detailSection.style.display = 'block';
            detailSection.innerHTML = '';

            // Summary cards
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

            if (csvContent && csvContent.trim()) {
                // Render the CSV data table with download button
                detailSection.insertAdjacentHTML('beforeend', buildCsvViewer(csvContent, batch.batch_name || 'batch'));
                const dlBtn = detailSection.querySelector('#btn-download-csv');
                if (dlBtn) {
                    dlBtn.addEventListener('click', () => downloadCsv(csvContent, batch.batch_name || 'batch'));
                }

                // Render waste comparison charts
                const chartData = parseChartData(csvContent, batch.total_wastage_percent);
                detailSection.insertAdjacentHTML('beforeend', `
                    <div class="card">
                        <h3 style="margin-top:0;">Waste Comparison</h3>
                        <div class="chart-controls">
                            <label for="chart-type" style="font-size:13px; font-weight:500;">Chart type:</label>
                            <select id="chart-type" style="width:auto;">
                                <option value="overview-bar">Overall Comparison</option>
                                <option value="overview-pie">Material Utilisation (Pie)</option>
                                <option value="overview-doughnut">Material Utilisation (Doughnut)</option>
                                <option value="nest-bar">Per-Nest Waste (Top 15)</option>
                            </select>
                            <button class="secondary-btn" id="btn-download-chart-pdf">Download Chart as PDF</button>
                        </div>
                        <div class="chart-container" style="height:360px;">
                            <canvas id="history-chart"></canvas>
                        </div>
                    </div>
                `);

                buildChart(chartData, 'history-chart');
                document.getElementById('chart-type').addEventListener('change', () => buildChart(chartData, 'history-chart'));
                document.getElementById('btn-download-chart-pdf').addEventListener('click', () => downloadChartAsPdf('history-chart'));
            } else {
                detailSection.insertAdjacentHTML('beforeend', '<div class="card"><p>No CSV data available for this batch.</p></div>');
            }

            // Close button to collapse the detail view
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

    /**
     * Parse CSV content into chart-friendly data.
     * Similar to dashboard.js parseChartData but works from saved CSV
     * rather than live optimisation results.
     */
    function parseChartData(csvContent, totalWastePct) {
        const data = {
            optimisedWastePct: totalWastePct || 0,
            optimisedUsedPct: 100 - (totalWastePct || 0),
            totalStockMm: 0,
            totalWasteMm: 0,
            totalCutMm: 0,
            oldWastePct: null,
            nests: []
        };

        const lines = csvContent.split('\n').filter(l => l.trim());
        if (lines.length < 2) return data;

        // Find column indices from the header row
        const headers = lines[0].split(',');
        const oldWasteIdx = headers.indexOf('OldWaste_mm');
        const beamIdx = headers.indexOf('AssignedBeam_mm');
        const beamIndexIdx = headers.indexOf('BeamIndex');
        const nestIdx = headers.indexOf('NestID');
        const wasteIdx = headers.indexOf('WasteOnBeam_mm');
        const lengthIdx = headers.indexOf('Length_mm');

        let totalOldWaste = 0;
        let hasAnyOld = false;
        const beamsSeen = new Set();  // Track unique beams to avoid double-counting
        const nestMap = {};

        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',');
            const bi = cells[beamIndexIdx];
            const beamLen = parseFloat(cells[beamIdx]) || 0;
            const waste = parseFloat(cells[wasteIdx]) || 0;
            const oldW = parseFloat(cells[oldWasteIdx]) || 0;
            const nid = cells[nestIdx] || '';
            const compLen = parseFloat(cells[lengthIdx]) || 0;

            // Only count each beam once for stock/waste totals
            if (!beamsSeen.has(bi)) {
                beamsSeen.add(bi);
                data.totalStockMm += beamLen;
                data.totalWasteMm += waste;
            }
            data.totalCutMm += compLen;

            if (oldW > 0) {
                totalOldWaste += oldW;
                hasAnyOld = true;
            }

            // Build per-nest aggregates
            if (!nestMap[nid]) nestMap[nid] = { stock: 0, waste: 0, beamsSeen: new Set() };
            if (!nestMap[nid].beamsSeen.has(bi)) {
                nestMap[nid].beamsSeen.add(bi);
                nestMap[nid].stock += beamLen;
                nestMap[nid].waste += waste;
            }
        }

        if (hasAnyOld && data.totalStockMm > 0) {
            data.oldWastePct = (totalOldWaste / data.totalStockMm) * 100;
        }

        for (const [nid, nd] of Object.entries(nestMap)) {
            data.nests.push({ id: nid, wastePct: nd.stock > 0 ? (nd.waste / nd.stock) * 100 : 0 });
        }
        data.nests.sort((a, b) => b.wastePct - a.wastePct);

        return data;
    }

    // Custom plugin to draw percentage labels outside pie/doughnut slices
    // (same as dashboard.js - needed because this page renders its own charts)
    const pieDataLabelsPlugin = {
        id: 'pieDataLabels',
        afterDraw(chart) {
            const { ctx } = chart;
            const dataset = chart.data.datasets[0];
            const meta = chart.getDatasetMeta(0);
            const total = dataset.data.reduce((a, b) => a + b, 0);
            if (total === 0) return;
            ctx.save();
            ctx.font = 'bold 12px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            meta.data.forEach((element, i) => {
                const pct = ((dataset.data[i] / total) * 100).toFixed(1);
                const midAngle = (element.startAngle + element.endAngle) / 2;
                const outerRadius = element.outerRadius;
                const x = element.x + Math.cos(midAngle) * (outerRadius + 20);
                const y = element.y + Math.sin(midAngle) * (outerRadius + 20);
                ctx.fillStyle = '#111';
                ctx.fillText(`${pct}%`, x, y);
            });
            ctx.restore();
        }
    };

    /**
     * Build a Chart.js chart. Same chart types as the dashboard:
     * - overview-bar: waste % comparison
     * - overview-pie/doughnut: material utilisation
     * - nest-bar: per-nest waste ranking
     */
    function buildChart(chartData, canvasId) {
        const typeSelect = document.getElementById('chart-type');
        const chartType = typeSelect ? typeSelect.value : 'overview-bar';
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (currentChart) { currentChart.destroy(); currentChart = null; }

        let config;

        if (chartType === 'overview-bar') {
            const labels = ['Optimised'];
            const optData = [parseFloat(chartData.optimisedWastePct.toFixed(2))];
            const oldData = chartData.oldWastePct !== null ? [parseFloat(chartData.oldWastePct.toFixed(2))] : null;

            const datasets = [{
                label: 'Optimised Waste %',
                data: optData,
                backgroundColor: 'rgba(0, 120, 212, 0.75)',
                borderColor: 'rgba(0, 120, 212, 1)',
                borderWidth: 1,
                barPercentage: 0.5
            }];

            if (oldData) {
                datasets.push({
                    label: 'Previous Waste %',
                    data: oldData,
                    backgroundColor: 'rgba(220, 38, 38, 0.6)',
                    borderColor: 'rgba(220, 38, 38, 1)',
                    borderWidth: 1,
                    barPercentage: 0.5
                });
            }

            config = {
                type: 'bar',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' },
                        title: { display: true, text: 'Overall Waste Comparison' }
                    },
                    scales: {
                        y: { beginAtZero: true, max: Math.max(100, (chartData.oldWastePct || 0) * 1.2), title: { display: true, text: 'Waste %' } }
                    }
                }
            };
        } else if (chartType === 'overview-pie' || chartType === 'overview-doughnut') {
            const total = chartData.totalCutMm + chartData.totalWasteMm;
            const usedPct = total > 0 ? ((chartData.totalCutMm / total) * 100).toFixed(1) : '0';
            const wastePct = total > 0 ? ((chartData.totalWasteMm / total) * 100).toFixed(1) : '0';
            config = {
                type: chartType === 'overview-pie' ? 'pie' : 'doughnut',
                data: {
                    labels: [`Material Used (${usedPct}%)`, `Waste (${wastePct}%)`],
                    datasets: [{
                        data: [chartData.totalCutMm, chartData.totalWasteMm],
                        backgroundColor: ['rgba(0, 120, 212, 0.75)', 'rgba(220, 38, 38, 0.6)'],
                        borderColor: ['rgba(0, 120, 212, 1)', 'rgba(220, 38, 38, 1)'],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' },
                        title: { display: true, text: 'Material Utilisation' },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const t = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = ((ctx.raw / t) * 100).toFixed(1);
                                    return `${ctx.label}: ${ctx.raw.toFixed(0)} mm (${pct}%)`;
                                }
                            }
                        }
                    }
                },
                plugins: [pieDataLabelsPlugin]
            };
        } else if (chartType === 'nest-bar') {
            const top = chartData.nests.slice(0, 15);
            config = {
                type: 'bar',
                data: {
                    labels: top.map(n => `Nest ${n.id}`),
                    datasets: [{
                        label: 'Waste %',
                        data: top.map(n => parseFloat(n.wastePct.toFixed(2))),
                        backgroundColor: top.map(n => n.wastePct > 20 ? 'rgba(220, 38, 38, 0.6)' : 'rgba(0, 120, 212, 0.75)'),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        title: { display: true, text: 'Top 15 Nests by Waste %' }
                    },
                    scales: {
                        x: { beginAtZero: true, title: { display: true, text: 'Waste %' } }
                    }
                }
            };
        }

        if (config) {
            currentChart = new Chart(canvas.getContext('2d'), config);
        }
    }

    // ---- Helper Functions ----

    // Build a scrollable HTML table from CSV content
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

        return `
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <h3 style="margin:0;">Output CSV</h3>
                    <button class="secondary-btn" id="btn-download-csv">Download CSV</button>
                </div>
                <div class="csv-viewer">
                    <table>${tableHtml}</table>
                </div>
            </div>
        `;
    }

    // Trigger CSV file download
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

    // Open chart as printable image in a new window
    function downloadChartAsPdf(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const imgData = canvas.toDataURL('image/png', 1.0);
        const printWindow = window.open('', '_blank');
        if (!printWindow) { alert('Pop-up blocked.'); return; }
        printWindow.document.write(`<!DOCTYPE html>
<html><head><title>Waste Chart</title>
<style>body{margin:40px;font-family:sans-serif;text-align:center}img{max-width:100%}@media print{button{display:none}}</style>
</head><body>
<h2>Waste Comparison Chart</h2>
<img src="${imgData}" alt="Chart"><br><br>
<button onclick="window.print()">Print / Save as PDF</button>
</body></html>`);
        printWindow.document.close();
    }

    // XSS prevention - escapes HTML entities in user-provided strings
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
});
