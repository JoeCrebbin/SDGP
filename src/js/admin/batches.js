/*
 * admin/batches.js - All Batches Page (Admin)
 * SDGP 2025/26
 *
 * This is the admin version of the history page - shows every batch
 * across all users. Click View to see the full results with stats,
 * cutting layout, CSV table and charts. Same output as dashboard
 * and history pages.
 */

document.addEventListener('DOMContentLoaded', async () => {
    const batchesTable = document.getElementById('batches-table');
    const batchesBody = document.getElementById('batches-body');
    const detailSection = document.getElementById('batch-detail-section');
    const searchInput = document.getElementById('batch-search');
    const searchBtn = document.getElementById('batch-search-btn');

    // load all batches and render the table
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

            batchesBody.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', () => loadDetail(parseInt(btn.dataset.id)));
            });
        } catch (err) {
            console.error('Load batches error:', err);
            batchesBody.innerHTML = '<tr><td colspan="5">Error loading batches.</td></tr>';
        }
    }

    // ============================================================
  
    // Detail view - full results same as dashboard/history

    async function loadDetail(batchId) {
        try {
            const response = await window.adminAPI.batchDetail(batchId);
            if (!response.success) {
                alert(response.message || 'Failed to load details.');
                return;
            }

            const { batch, csvContent } = response;
            const batchName = batch.batch_name || 'Unnamed';
            batchesTable.style.display = 'none';
            detailSection.style.display = 'block';
            detailSection.innerHTML = '';

            if (!csvContent || !csvContent.trim()) {
                detailSection.insertAdjacentHTML('beforeend', '<div class="card"><p>No CSV data available for this batch.</p></div>');
                addCloseButton();
                return;
            }

            // reconstruct beams from the saved CSV
            const parsed = window.batchDetailHelpers.parseSavedCsv(csvContent);

            // stat cards
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

            // cutting layout
            if (parsed.beams.length > 0) {
                detailSection.insertAdjacentHTML('beforeend', window.batchDetailHelpers.buildBeamLayout(parsed.beams, batchName));
                const dlLayoutBtn = document.getElementById('btn-download-layout');
                if (dlLayoutBtn) dlLayoutBtn.addEventListener('click', () => window.batchDetailHelpers.downloadLayoutAsPdf(batchName));
            }

            // CSV table
            detailSection.insertAdjacentHTML('beforeend', window.batchDetailHelpers.buildCsvViewer(csvContent, batchName));
            const dlCsvBtn = detailSection.querySelector('#btn-download-csv');
            if (dlCsvBtn) {
                dlCsvBtn.addEventListener('click', () => downloadCsv(csvContent, batchName));
            }

            // charts
            const chartData = parseChartData(csvContent, parsed);
            const safeBatch = batchName.replace(/[^a-zA-Z0-9_-]/g, '_');
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
        detailSection.insertAdjacentHTML('beforeend', '<button class="secondary-btn" id="detail-close" style="margin-top:8px;">Back to batch list</button>');
        document.getElementById('detail-close').addEventListener('click', () => {
            detailSection.style.display = 'none';
            detailSection.innerHTML = '';
            batchesTable.style.display = 'table';
        });
    }

    // load everything on page load
    await loadBatches();

    searchBtn.addEventListener('click', () => loadBatches(searchInput.value.trim()));
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadBatches(searchInput.value.trim());
    });

    // ============================================================
  
    // Charts

    function parseChartData(csvContent, parsed) {
        const data = {
            optimisedWasteMm: parsed.totalWasteMm,
            totalStockMm: parsed.totalStockMm,
            totalWasteMm: parsed.totalWasteMm,
            totalCutMm: parsed.totalCutMm,
            oldWasteMm: null
        };

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
