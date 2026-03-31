/*
 * history.js - Batch History Page
 * SDGP 2025/26
 *
 * Shows all your past optimisation runs in a table. You can search
 * by name or date and click View to see the full results.
 * The detail view shows the same stuff as the dashboard - stats,
 * cutting layout, CSV table and charts. We had to reconstruct the
 * beam data from the saved CSV which was a bit fiddly but it works.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const historyTable = document.getElementById('history-table');
    const historyBody = document.getElementById('history-body');
    const detailSection = document.getElementById('detail-section');
    const searchInput = document.getElementById('history-search');
    const searchBtn = document.getElementById('history-search-btn');
    let trendPoints = [];

    // fetch batches from the backend and render the table
    async function loadBatches(search) {
        try {
            const response = search
                ? await window.historyAPI.search(search)
                : await window.historyAPI.list();

            if (!response.success) {
                historyBody.innerHTML = '<tr><td colspan="5">Failed to load history.</td></tr>';
                return;
            }

            if (response.batches.length === 0) {
                historyBody.innerHTML = '<tr><td colspan="5">No optimisation history found for your location.</td></tr>';
                trendPoints = [];
                return;
            }

            trendPoints = [...response.batches]
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .map((b) => ({ id: b.id, batch_name: b.batch_name, created_at: b.created_at, waste: b.total_wastage_percent }));

            // Build table rows for each batch
            historyBody.innerHTML = '';
            for (const batch of response.batches) {
                const row = document.createElement('tr');
                const dateStr = batch.created_at
                    ? new Date(batch.created_at).toLocaleString()
                    : 'N/A';
                const ownerEmail = batch.owner_email || 'Unknown';
                const ownerLabel = batch.is_own === 1 ? `${ownerEmail} (You)` : ownerEmail;
                row.innerHTML = `
                    <td>${escapeHtml(batch.batch_name || 'Unnamed')}</td>
                    <td>${escapeHtml(ownerLabel)}</td>
                    <td>${batch.total_wastage_percent != null ? batch.total_wastage_percent.toFixed(2) + '%' : 'N/A'}</td>
                    <td>${dateStr}</td>
                    <td><button class="secondary-btn view-btn" data-id="${batch.id}">View</button></td>
                `;
                historyBody.appendChild(row);
            }

            historyBody.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', () => loadDetail(parseInt(btn.dataset.id)));
            });
        } catch (err) {
            console.error('History load error:', err);
            historyBody.innerHTML = '<tr><td colspan="5">Error loading history.</td></tr>';
        }
    }

    await loadBatches();

    if (searchBtn) {
        searchBtn.addEventListener('click', () => loadBatches(searchInput.value.trim()));
    }
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') loadBatches(searchInput.value.trim());
        });
    }

    // ============================================================
  
    // Detail view - shows the full results just like the dashboard

    // loads a specific batch and renders all the same sections as dashboard
    async function loadDetail(batchId) {
        try {
            const response = await window.historyAPI.detail(batchId);
            if (!response.success) {
                alert(response.message || 'Failed to load details.');
                return;
            }

            const { batch, csvContent } = response;
            const batchName = batch.batch_name || 'Unnamed';
            historyTable.style.display = 'none';
            detailSection.style.display = 'block';
            detailSection.innerHTML = '';

            if (!csvContent || !csvContent.trim()) {
                detailSection.insertAdjacentHTML('beforeend', '<div class="card"><p>No CSV data available for this batch.</p></div>');
                addCloseButton();
                return;
            }

            const parsed = window.batchDetailHelpers.parseSavedCsv(csvContent);
            const chartData = parseChartData(csvContent, parsed);
            const safeBatch = batchName.replace(/[^a-zA-Z0-9_-]/g, '_');

            detailSection.insertAdjacentHTML('beforeend', `
                <hr>
                <h3>${escapeHtml(batchName)}</h3>
                <div class="stats-row">
                    <div class="stat-card">
                        <p class="stat-value">${parsed.totalBeams}</p>
                        <p class="stat-label">Beams Used</p>
                    </div>
                    <div class="stat-card">
                        <p class="stat-value">${parsed.totalStockMm.toLocaleString()} mm</p>
                        <p class="stat-label">Total Stock</p>
                    </div>
                    <div class="stat-card">
                        <p class="stat-value">${parsed.totalCutMm.toLocaleString()} mm</p>
                        <p class="stat-label">Material Cut</p>
                    </div>
                    <div class="stat-card">
                        <p class="stat-value">${parsed.totalWasteMm.toLocaleString()} mm</p>
                        <p class="stat-label">Total Waste</p>
                    </div>
                    <div class="stat-card">
                        <p class="stat-value">${parsed.wastePct.toFixed(2)}%</p>
                        <p class="stat-label">Waste Percentage</p>
                    </div>
                </div>
            `);

            detailSection.insertAdjacentHTML('beforeend', window.batchDetailHelpers.buildBeamLayout(parsed.beams, batchName));
            const dlLayoutBtn = document.getElementById('btn-download-layout');
            if (dlLayoutBtn) dlLayoutBtn.addEventListener('click', () => window.batchDetailHelpers.downloadLayoutAsPdf(batchName));

            detailSection.insertAdjacentHTML('beforeend', window.batchDetailHelpers.buildCsvViewer(csvContent, batchName));
            const dlCsvBtn = detailSection.querySelector('#btn-download-csv');
            if (dlCsvBtn) {
                dlCsvBtn.addEventListener('click', () => downloadCsv(csvContent, batchName));
            }

            detailSection.insertAdjacentHTML('beforeend', `
                <div class="card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <h3 style="margin:0;">Waste Comparison</h3>
                        <button class="secondary-btn" id="btn-dl-chart-bar">Download Chart</button>
                    </div>
                    <div class="chart-container" style="height:360px;">
                        <canvas id="chart-bar"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <h3 style="margin:0;">Material Utilisation</h3>
                        <button class="secondary-btn" id="btn-dl-chart-pie">Download Chart</button>
                    </div>
                    <div class="chart-container" style="height:360px;">
                        <canvas id="chart-pie"></canvas>
                    </div>
                </div>
            `);

            buildSingleChart(chartData, 'chart-bar', 'overview-bar');
            buildSingleChart(chartData, 'chart-pie', 'overview-pie');

            document.getElementById('btn-dl-chart-bar').addEventListener('click', () => downloadChartAsPng('chart-bar', `${safeBatch}_waste_comparison.png`));
            document.getElementById('btn-dl-chart-pie').addEventListener('click', () => downloadChartAsPng('chart-pie', `${safeBatch}_utilisation_pie.png`));

            addCloseButton();
        } catch (err) {
            console.error('Detail load error:', err);
            alert('Error loading batch details.');
        }
    }

    function addCloseButton() {
        detailSection.insertAdjacentHTML('beforeend', '<button class="secondary-btn" id="detail-close" style="margin-top:8px;">Back to history</button>');
        document.getElementById('detail-close').addEventListener('click', () => {
            detailSection.style.display = 'none';
            detailSection.innerHTML = '';
            historyTable.style.display = 'table';
        });
    }

    // ============================================================
  
    // Charts - same setup as dashboard, just with data from saved CSV

    function parseChartData(csvContent, parsed) {
        const data = {
            optimisedWasteMm: parsed.totalWasteMm,
            totalStockMm: parsed.totalStockMm,
            totalWasteMm: parsed.totalWasteMm,
            totalCutMm: parsed.totalCutMm,
            oldWasteMm: null
        };

        // grab old waste from the CSV if it exists
        const lines = csvContent.split('\n').filter(l => l.trim());
        if (lines.length > 1) {
            const headers = lines[0].split(',');
            const oldWasteIdx = headers.indexOf('OldWaste_mm');
            const beamIndexIdx = headers.indexOf('BeamIndex');

            if (oldWasteIdx >= 0) {
                let totalOldWaste = 0;
                let hasAnyOld = false;
                const oldWastePerBeam = {};

                for (let i = 1; i < lines.length; i++) {
                    const cells = lines[i].split(',');
                    const bi = cells[beamIndexIdx];
                    const oldW = parseFloat(cells[oldWasteIdx]) || 0;
                    if (oldW > 0) {
                        hasAnyOld = true;
                        if (!(bi in oldWastePerBeam) || oldW > oldWastePerBeam[bi]) {
                            oldWastePerBeam[bi] = oldW;
                        }
                    }
                }

                if (hasAnyOld) {
                    for (const v of Object.values(oldWastePerBeam)) totalOldWaste += v;
                    data.oldWasteMm = totalOldWaste;
                }
            }
        }

        return data;
    }

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

    function buildSingleChart(chartData, canvasId, chartType) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        let config;

        if (chartType === 'overview-bar') {
            const labels = ['Waste (mm)'];
            const datasets = [{
                label: 'Optimised Waste',
                data: [chartData.optimisedWasteMm],
                backgroundColor: 'rgba(0, 120, 212, 0.75)',
                borderColor: 'rgba(0, 120, 212, 1)',
                borderWidth: 1, barPercentage: 0.5
            }];
            if (chartData.oldWasteMm !== null) {
                datasets.push({
                    label: 'Previous Waste',
                    data: [chartData.oldWasteMm],
                    backgroundColor: 'rgba(220, 38, 38, 0.6)',
                    borderColor: 'rgba(220, 38, 38, 1)',
                    borderWidth: 1, barPercentage: 0.5
                });
            }
            config = {
                type: 'bar',
                data: { labels, datasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top' }, title: { display: true, text: 'Waste Comparison' } },
                    scales: { y: { beginAtZero: true, title: { display: true, text: 'mm' } } }
                }
            };

        } else if (chartType === 'overview-pie') {
            const total = chartData.totalCutMm + chartData.totalWasteMm;
            const usedPct = total > 0 ? ((chartData.totalCutMm / total) * 100).toFixed(1) : '0';
            const wastePct = total > 0 ? ((chartData.totalWasteMm / total) * 100).toFixed(1) : '0';
            config = {
                type: 'pie',
                data: {
                    labels: [`Material Used (${usedPct}%)`, `Waste (${wastePct}%)`],
                    datasets: [{ data: [chartData.totalCutMm, chartData.totalWasteMm],
                        backgroundColor: ['rgba(0, 120, 212, 0.75)', 'rgba(220, 38, 38, 0.6)'],
                        borderColor: ['rgba(0, 120, 212, 1)', 'rgba(220, 38, 38, 1)'], borderWidth: 1
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' },
                        title: { display: true, text: 'Material Utilisation' },
                        tooltip: { callbacks: { label: (ctx) => {
                            const t = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            return `${ctx.label}: ${formatMm(ctx.raw)} (${((ctx.raw / t) * 100).toFixed(1)}%)`;
                        }}}
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
        } else if (chartType === 'trend-line') {
            config = {
                type: 'line',
                data: {
                    labels: chartData.trend.map((p) => {
                        const dt = new Date(p.created_at);
                        return Number.isNaN(dt.getTime()) ? String(p.batch_name || p.id) : dt.toLocaleDateString();
                    }),
                    datasets: [{
                        label: 'Waste % Over Time',
                        data: chartData.trend.map((p) => Number(p.waste || 0).toFixed(2)),
                        fill: false,
                        borderColor: 'rgba(0, 120, 212, 1)',
                        backgroundColor: 'rgba(0, 120, 212, 0.2)',
                        tension: 0.25,
                        pointRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' },
                        title: { display: true, text: 'Run History Waste Trend' }
                    },
                    scales: {
                        y: { beginAtZero: true, title: { display: true, text: 'Waste %' } }
                    }
                }
            };
        }

        if (config) new Chart(canvas.getContext('2d'), config);
    }

    // ============================================================
  
    // Helpers

    function formatMm(mm) {
        return `${Number(mm).toFixed(0)} mm`;
    }

    async function downloadChartAsPng(canvasId, defaultName) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png', 1.0);
        await window.fileAPI.savePng(defaultName, dataUrl);
    }

    async function downloadCsv(csvContent, batchName) {
        const defaultName = `${batchName.replace(/[^a-zA-Z0-9_-]/g, '_')}_output.csv`;
        await window.fileAPI.saveCsv(defaultName, csvContent);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
});
