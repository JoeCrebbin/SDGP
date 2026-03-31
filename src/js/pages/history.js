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
                historyBody.innerHTML = '<tr><td colspan="4">Failed to load history.</td></tr>';
                return;
            }

            if (response.batches.length === 0) {
                historyBody.innerHTML = '<tr><td colspan="4">No past optimisations found.</td></tr>';
                trendPoints = [];
                return;
            }

<<<<<<< HEAD
            trendPoints = [...response.batches]
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .map((b) => ({ id: b.id, batch_name: b.batch_name, created_at: b.created_at, waste: b.total_wastage_percent }));

            // Build table rows for each batch
=======
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043
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

            historyBody.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', () => loadDetail(parseInt(btn.dataset.id)));
            });
        } catch (err) {
            console.error('History load error:', err);
            historyBody.innerHTML = '<tr><td colspan="4">Error loading history.</td></tr>';
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
            detailSection.style.display = 'block';
            detailSection.innerHTML = '';

            if (!csvContent || !csvContent.trim()) {
                detailSection.insertAdjacentHTML('beforeend', '<div class="card"><p>No CSV data available for this batch.</p></div>');
                addCloseButton();
                return;
            }

            // reconstruct the beam data from the saved CSV
            const parsed = parseSavedCsv(csvContent);

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

<<<<<<< HEAD
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
                            <select id="chart-type" style="width:auto;" aria-label="History chart type">
                                <option value="overview-bar">Overall Comparison</option>
                                <option value="overview-pie">Material Utilisation (Pie)</option>
                                <option value="overview-doughnut">Material Utilisation (Doughnut)</option>
                                <option value="nest-bar">Per-Nest Waste (Top 15)</option>
                                <option value="trend-line">Run History Trend</option>
                            </select>
                            <button class="secondary-btn" id="btn-download-chart-pdf" aria-label="Download history chart as PDF">Download Chart as PDF</button>
                            <button class="secondary-btn" id="btn-secure-export-history" aria-label="Create secure encrypted export package">Secure Export Package</button>
                        </div>
                        <div class="chart-container" style="height:360px;">
                            <canvas id="history-chart"></canvas>
                        </div>
                    </div>
                `);

                buildChart(chartData, 'history-chart');
                document.getElementById('chart-type').addEventListener('change', () => buildChart(chartData, 'history-chart'));
                document.getElementById('btn-download-chart-pdf').addEventListener('click', () => downloadChartAsPdf('history-chart'));

                const secureBtn = document.getElementById('btn-secure-export-history');
                if (secureBtn) {
                    secureBtn.addEventListener('click', async () => {
                        if (!window.exportAPI || !window.exportAPI.securePackage) {
                            alert('Secure export API is not available.');
                            return;
                        }
                        const pw1 = window.prompt('Enter export password (min 8 chars):');
                        if (!pw1) return;
                        const pw2 = window.prompt('Confirm export password:');
                        if (pw1 !== pw2) return alert('Passwords do not match.');
                        if (pw1.length < 8) return alert('Password must be at least 8 characters.');

                        const chartCanvas = document.getElementById('history-chart');
                        const chartImageBase64 = chartCanvas ? chartCanvas.toDataURL('image/png', 1.0) : null;

                        const exportRes = await window.exportAPI.securePackage({
                            batchName: batch.batch_name || 'batch',
                            password: pw1,
                            cleanedCsv: csvContent,
                            validationReport: null,
                            optimisationSummary: {
                                wastePct: batch.total_wastage_percent,
                                createdAt: batch.created_at
                            },
                            chartImageBase64
                        });

                        if (!exportRes.success) return alert(exportRes.message || 'Secure export failed.');
                        alert(`Secure export created: ${exportRes.filename}`);
                    });
                }
            } else {
                detailSection.insertAdjacentHTML('beforeend', '<div class="card"><p>No CSV data available for this batch.</p></div>');
=======
            // cutting layout
            if (parsed.beams.length > 0) {
                detailSection.insertAdjacentHTML('beforeend', buildBeamLayout(parsed.beams, batchName));
                wireLayoutDownload(batchName);
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043
            }

            // CSV table with download
            detailSection.insertAdjacentHTML('beforeend', buildCsvViewer(csvContent, batchName));
            const dlCsvBtn = detailSection.querySelector('#btn-download-csv');
            if (dlCsvBtn) {
                dlCsvBtn.addEventListener('click', () => downloadCsv(csvContent, batchName));
            }

            // charts with download buttons
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

<<<<<<< HEAD
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
            nests: [],
            trend: trendPoints
        };
=======
    function addCloseButton() {
        detailSection.insertAdjacentHTML('beforeend', '<button class="secondary-btn" id="detail-close" style="margin-top:8px;">Close Details</button>');
        document.getElementById('detail-close').addEventListener('click', () => {
            detailSection.style.display = 'none';
        });
    }
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043

    // ============================================================
  
    // CSV parsing - rebuilds beam objects from the saved output CSV
    // This was probably the trickiest bit - we group rows by BeamIndex
    // to figure out which components ended up on which beam

    function parseSavedCsv(csvContent) {
        const lines = csvContent.split('\n').filter(l => l.trim());
        const result = { beams: [], totalStockMm: 0, totalCutMm: 0, totalWasteMm: 0, totalBeams: 0, wastePct: 0 };
        if (lines.length < 2) return result;

        const headers = lines[0].split(',');
        const col = {};
        headers.forEach((h, i) => { col[h.trim()] = i; });

        // group CSV rows by beam index to reconstruct the beams
        const beamMap = new Map();
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(',');
            const bi = cells[col['BeamIndex']];
            if (!bi) continue;

            if (!beamMap.has(bi)) {
                beamMap.set(bi, {
                    stockLengthMm: parseFloat(cells[col['AssignedBeam_mm']]) || 0,
                    wasteMm: parseFloat(cells[col['WasteOnBeam_mm']]) || 0,
                    components: []
                });
            }

            beamMap.get(bi).components.push({
                itemNumber: cells[col['ItemNumber']] || '',
                lengthMm: parseFloat(cells[col['Length_mm']]) || 0
            });

            result.totalCutMm += parseFloat(cells[col['Length_mm']]) || 0;
        }

        // add up totals
        for (const beam of beamMap.values()) {
            result.beams.push(beam);
            result.totalStockMm += beam.stockLengthMm;
            result.totalWasteMm += beam.wasteMm;
        }

        result.totalBeams = result.beams.length;
        result.wastePct = result.totalStockMm > 0 ? (result.totalWasteMm / result.totalStockMm) * 100 : 0;

        return result;
    }

    // ============================================================
  
    // Cutting layout - same visual as the dashboard

    function buildBeamLayout(beams, batchName) {
        if (beams.length === 0) return '';

        return `
            <div class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <h3 style="margin:0;">Cutting Layout <small style="font-weight:400;">(${beams.length} beams)</small></h3>
                    <button class="secondary-btn" id="btn-download-layout">Download Layout as PDF</button>
                </div>
                <div class="beam-layout" id="beam-layout-container">
                    ${renderBeams(beams)}
                </div>
            </div>
        `;
    }

    function renderBeams(beams) {
        let html = '';
        const maxStock = Math.max(...beams.map(b => b.stockLengthMm));

        for (let i = 0; i < beams.length; i++) {
            const beam = beams[i];

            let segments = '';
            beam.components.forEach((comp, ci) => {
                const widthPct = (comp.lengthMm / beam.stockLengthMm) * 100;
                const colClass = `seg-c${ci % 10}`;
                const label = widthPct > 5 ? escapeHtml(comp.itemNumber) : '';
                segments += `<div class="beam-segment ${colClass}" style="width:${widthPct}%" title="${escapeHtml(comp.itemNumber)}: ${comp.lengthMm}mm">${label}</div>`;
            });

            if (beam.wasteMm > 0) {
                const wastePct = (beam.wasteMm / beam.stockLengthMm) * 100;
                segments += `<div class="beam-segment beam-segment-waste" style="width:${wastePct}%" title="Waste: ${beam.wasteMm}mm">${wastePct > 5 ? 'waste' : ''}</div>`;
            }

            const barWidthPct = (beam.stockLengthMm / maxStock) * 100;

            html += `
                <div class="beam-row">
                    <div class="beam-label">#${i + 1}</div>
                    <div class="beam-bar" style="width:${barWidthPct}%">${segments}</div>
                    <div class="beam-length-label">${beam.stockLengthMm}mm</div>
                </div>
            `;
        }

        if (html === '') html = '<p style="color:var(--muted); font-size:13px;">No beams to display.</p>';
        return html;
    }

    function wireLayoutDownload(batchName) {
        const btn = document.getElementById('btn-download-layout');
        if (btn) {
            btn.addEventListener('click', () => {
                const container = document.getElementById('beam-layout-container');
                if (!container) return;
                const html = container.innerHTML;
                const pw = window.open('', '_blank');
                if (!pw) { alert('Pop-up blocked.'); return; }
                pw.document.write(`<!DOCTYPE html><html><head><title>Cutting Layout - ${escapeHtml(batchName)}</title>
<style>
body{margin:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;background:#fff;color:#111}
.beam-row{display:flex;align-items:center;margin-bottom:6px;gap:8px}
.beam-label{flex-shrink:0;width:50px;font-size:11px;color:#666;text-align:right}
.beam-bar{flex:1;height:28px;display:flex;border-radius:3px;overflow:hidden;border:1px solid #d0d0d0;background:#f0f0f0}
.beam-segment{height:100%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:#fff;overflow:hidden;white-space:nowrap;padding:0 2px;border-right:1px solid rgba(0,0,0,0.15)}
.beam-segment:last-child{border-right:none}
.beam-segment-waste{background:repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 3px,#d1d5db 3px,#d1d5db 6px);color:#666;font-style:italic}
.beam-length-label{flex-shrink:0;width:65px;font-size:11px;color:#666}
.seg-c0{background:#3b82f6}.seg-c1{background:#10b981}.seg-c2{background:#f59e0b}.seg-c3{background:#ef4444}.seg-c4{background:#8b5cf6}
.seg-c5{background:#ec4899}.seg-c6{background:#06b6d4}.seg-c7{background:#84cc16}.seg-c8{background:#f97316}.seg-c9{background:#6366f1}
@media print{button{display:none}}
</style></head><body>
<h2>Cutting Layout - ${escapeHtml(batchName)}</h2>
${html}
<br><button onclick="window.print()">Print / Save as PDF</button>
</body></html>`);
                pw.document.close();
            });
        }
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
<<<<<<< HEAD
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
=======
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043
        }

        if (config) new Chart(canvas.getContext('2d'), config);
    }

    // ============================================================
  
    // Helpers

    function formatMm(mm) {
        if (mm >= 1000000) return (mm / 1000000).toFixed(2) + ' km';
        if (mm >= 1000) return (mm / 1000).toFixed(1) + ' m';
        return mm.toFixed(0) + ' mm';
    }

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
