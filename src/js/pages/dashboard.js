/*
 * dashboard.js - Main Dashboard Page
 * SDGP 2025/26
 *
 * This is the biggest page handler in the app. Handles everything from
 * uploading the CSV to showing the results. The flow goes:
 * Upload CSV -> Inspect headers -> Map columns -> Run optimiser -> Show results
 *
 * The results section shows stat cards, a visual cutting layout with
 * coloured bars for each beam, a CSV data table, and charts.
 * We were pretty proud of how the cutting layout turned out tbh.
 */

document.addEventListener('DOMContentLoaded', () => {
    // grab all the DOM elements we need
    const fileInput = document.getElementById('csv-file');
    const inspectBtn = document.getElementById('inspect-btn');
    const settingsSection = document.getElementById('optimisation-settings');
    const mappingSelects = document.querySelectorAll('.csv-mapping');
    const msg = document.getElementById('message');
    const submitBtn = document.getElementById('btn-submit');
    const resultsSection = document.getElementById('results-section');
    const validationReportEl = document.getElementById('validation-report');

<<<<<<< HEAD
    let csvContent = null; // Stores the raw CSV text after file is read
    let lastValidationReport = null;
    let lastCleanedCsv = '';

    function parseCsvLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (ch === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
                continue;
            }

            current += ch;
        }

        if (inQuotes) {
            throw new Error('Malformed CSV row: unmatched quote detected');
        }

        values.push(current.trim());
        return values;
    }

    function buildValidationReportHtml(report) {
        if (!report) return '';
        const head = `<strong>Validation:</strong> ${report.acceptedRows} accepted, ${report.rejectedRows} rejected (total ${report.totalRows}).`;
        if (!report.rejections.length) return head;

        const rows = report.rejections.slice(0, 12)
            .map((r) => `<li>Row ${r.row}: ${escapeHtml(r.reason)}</li>`)
            .join('');
        const more = report.rejections.length > 12 ? `<li>...and ${report.rejections.length - 12} more</li>` : '';
        return `${head}<ul style="margin:6px 0 0 16px;">${rows}${more}</ul>`;
    }
=======
    let csvContent = null; // raw CSV text after file is read
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043

    // prefill kerf and min remnant from global settings if they exist
    (async () => {
        try {
            const res = await window.settingsAPI.getDefaults();
            if (res.success && res.settings) {
                const kerfInput = document.getElementById('kerf');
                const remnantInput = document.getElementById('min-remnant');
                if (res.settings.default_kerf_mm) kerfInput.value = res.settings.default_kerf_mm;
                if (res.settings.default_min_remnant_mm) remnantInput.value = res.settings.default_min_remnant_mm;
            }
        } catch (e) { /* just use the defaults from the HTML if this fails */ }
    })();

    // enable inspect button when a file is picked
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            inspectBtn.disabled = false;
            msg.textContent = `File selected: ${fileInput.files[0].name}`;
            msg.style.color = '';
        }
    });

    // read the CSV, pull out the headers, and fill in the mapping dropdowns
    inspectBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            csvContent = e.target.result;
<<<<<<< HEAD
            if (!csvContent || !csvContent.trim()) {
                msg.textContent = 'CSV is empty. Please upload a valid file.';
                msg.style.color = 'var(--danger)';
                return;
            }

            // Parse the first line to get column names
            const firstline = csvContent.split('\n')[0];
            let columns = [];
            try {
                columns = parseCsvLine(firstline);
            } catch (err) {
                msg.textContent = err.message || 'Malformed CSV header row.';
                msg.style.color = 'var(--danger)';
                return;
            }

            // Populate each mapping dropdown with the CSV column names
=======
            const firstline = csvContent.split('\n')[0];
            const columns = firstline.split(',').map(col => col.trim());
            // fill each dropdown with the column names from the CSV
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043
            mappingSelects.forEach(select => {
                select.innerHTML = '<option value="">-- Select Column --</option>';
                columns.forEach((col, index) => {
                    const option = document.createElement('option');
                    option.value = index;
                    option.textContent = col || `Column ${index + 1}`;
                    select.appendChild(option);
                });
            });
            settingsSection.style.display = 'block';
            msg.textContent = 'File inspected. Configure settings below.';
            msg.style.color = 'var(--success)';
            validationReportEl.innerHTML = '';
        };
        inspectBtn.disabled = true;
        reader.readAsText(file);
    });

    // run the optimisation when they click the button
    submitBtn.addEventListener('click', async () => {
        if (!csvContent) { msg.textContent = 'Please inspect a file first.'; msg.style.color = 'var(--danger)'; return; }
        const validationStart = performance.now();

        // gather all the user inputs
        const batchName = document.getElementById('batch-name').value.trim();
        const hasHeaders = document.getElementById('has-headers').checked;
        const units = document.getElementById('units').value;
        const kerfMm = parseFloat(document.getElementById('kerf').value) || 3.0;
        const minRemnantMm = parseFloat(document.getElementById('min-remnant').value) || 500;

        // which CSV columns map to which fields
        const mapId = document.getElementById('map-id').value;
        const mapLength = document.getElementById('map-length').value;
        const mapTotalLength = document.getElementById('map-total-length').value;
        const mapOldWaste = document.getElementById('map-old-waste').value;
        const priority = document.getElementById('priority').value;

        if (!mapId || !mapLength || !mapTotalLength) { msg.textContent = 'Please map Component ID, Length, and Raw Beam Size.'; msg.style.color = 'var(--danger)'; return; }
        if (!batchName) { msg.textContent = 'Please enter a batch name.'; msg.style.color = 'var(--danger)'; return; }

        // cant have a remnant shorter than the saw blade - makes no sense physically
        if (minRemnantMm < kerfMm) {
            msg.textContent = `Minimum reusable length (${minRemnantMm}mm) cannot be shorter than the saw blade width (${kerfMm}mm).`;
            msg.style.color = 'var(--danger)';
            return;
        }

        // convert everything to mm internally
        const toMm = { mm: 1, cm: 10, m: 1000 };
        const multiplier = toMm[units] || 1;

        // parse the CSV rows into component objects
        const lines = csvContent.split('\n').filter(line => line.trim() !== '');
        const startRow = hasHeaders ? 1 : 0;
        const components = [];
        const oldWasteData = {};
        const rejections = [];
        const seenKeys = new Set();
        const maxBeamMm = 13000;
        let headerColCount = null;
        if (hasHeaders) {
            try {
                headerColCount = parseCsvLine(lines[0]).length;
            } catch (err) {
                msg.textContent = err.message || 'Malformed CSV header row.';
                msg.style.color = 'var(--danger)';
                return;
            }
        }

        for (let i = startRow; i < lines.length; i++) {
            let cols;
            try {
                cols = parseCsvLine(lines[i]);
            } catch (err) {
                rejections.push({ row: i + 1, reason: 'Malformed CSV row (quote/comma parsing error)' });
                continue;
            }

            if (headerColCount !== null && cols.length !== headerColCount) {
                rejections.push({ row: i + 1, reason: `Malformed row: expected ${headerColCount} columns but found ${cols.length}` });
                continue;
            }

            const itemNumber = cols[parseInt(mapId)] || '';
            const rawLength = parseFloat(cols[parseInt(mapLength)]);
            const rawBeamType = parseFloat(cols[parseInt(mapTotalLength)]);
<<<<<<< HEAD
            // If material group is mapped, use it to group components; otherwise all go in one group
            const nestId = mapMaterial ? (cols[parseInt(mapMaterial)] || 'default') : 'all';

            if (!itemNumber) {
                rejections.push({ row: i + 1, reason: 'Missing required Component ID' });
                continue;
            }

            if (isNaN(rawLength) || rawLength <= 0) {
                rejections.push({ row: i + 1, reason: 'Invalid Component Length (must be > 0)' });
                continue;
            }

            if (isNaN(rawBeamType) || rawBeamType <= 0) {
                rejections.push({ row: i + 1, reason: 'Invalid Raw Beam Size (must be > 0)' });
                continue;
            }

            const lengthMm = rawLength * multiplier;
            const beamTypeMm = rawBeamType * multiplier;
            if (lengthMm > maxBeamMm || beamTypeMm > maxBeamMm) {
                rejections.push({ row: i + 1, reason: `Range check failed (max supported beam length is ${maxBeamMm}mm)` });
                continue;
            }

            const duplicateKey = `${itemNumber}::${nestId}::${lengthMm}`;
            if (seenKeys.has(duplicateKey)) {
                rejections.push({ row: i + 1, reason: 'Duplicate component row detected' });
                continue;
            }
            seenKeys.add(duplicateKey);

            components.push({ itemNumber, lengthMm, beamType: beamTypeMm, nestId });
            // If an old waste column is mapped, store it for comparison charts
=======
            const nestId = 'all';
            if (!itemNumber || isNaN(rawLength) || rawLength <= 0) continue;
            components.push({ itemNumber, lengthMm: rawLength * multiplier, beamType: isNaN(rawBeamType) ? 0 : rawBeamType * multiplier, nestId });
            // store old waste values if that column was mapped (for comparison charts)
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043
            if (mapOldWaste !== '') {
                const oldVal = parseFloat(cols[parseInt(mapOldWaste)]);
                if (!isNaN(oldVal)) oldWasteData[itemNumber] = oldVal * multiplier;
            }
        }

        lastValidationReport = {
            totalRows: Math.max(0, lines.length - startRow),
            acceptedRows: components.length,
            rejectedRows: rejections.length,
            rejections,
            validationDurationMs: Number((performance.now() - validationStart).toFixed(2))
        };
        validationReportEl.innerHTML = buildValidationReportHtml(lastValidationReport);

        if (components.length === 0) { msg.textContent = 'No valid components found. Check your column mappings.'; msg.style.color = 'var(--danger)'; return; }

<<<<<<< HEAD
        if (rejections.length > 0) {
            const proceed = window.confirm(`Validation found ${rejections.length} rejected rows. Continue with ${components.length} accepted rows?`);
            if (!proceed) {
                msg.textContent = 'Optimisation cancelled. Fix CSV issues and try again.';
                msg.style.color = 'var(--danger)';
                return;
            }
        }

        const cleanedHeaders = ['ItemNumber', 'NestID', 'Length_mm', 'BeamType_mm'];
        const cleanedRows = components.map((c) => `${c.itemNumber},${c.nestId},${c.lengthMm},${c.beamType}`);
        lastCleanedCsv = [cleanedHeaders.join(','), ...cleanedRows].join('\n');

        // Show loading state and disable the button to prevent double-clicks
=======
        // show loading state and disable button so they dont click twice
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043
        msg.textContent = `Running optimisation on ${components.length} components...`;
        msg.style.color = '';
        submitBtn.disabled = true;

        try {
<<<<<<< HEAD
            // Call the main process to run the algorithm in a worker thread
            const response = await window.optimiseAPI.run({
                batchName,
                components,
                kerfMm,
                minRemnantMm,
                priority,
                oldWasteData,
                validationReport: lastValidationReport
            });
=======
            // send it to main.js which runs the algorithm in a worker thread
            const response = await window.optimiseAPI.run({ batchName, components, kerfMm, minRemnantMm, oldWasteData });
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043
            if (response.success) {
                displayResults(response.result);
                msg.textContent = `Optimisation complete! Solver: ${response.result.solver}`;
                msg.style.color = 'var(--success)';
            } else {
                msg.textContent = response.message || 'Optimisation failed.';
                msg.style.color = 'var(--danger)';
            }
        } catch (err) {
            console.error('Optimisation Error:', err);
            msg.textContent = 'An error occurred during optimisation.';
            msg.style.color = 'var(--danger)';
        } finally {
            submitBtn.disabled = false;
        }
    });

    // ============================================================
  
    // Results display - renders everything after a successful run

    function displayResults(result) {
        resultsSection.style.display = 'block';
        resultsSection.innerHTML = '';

        // summary stat cards at the top
        resultsSection.insertAdjacentHTML('beforeend', `
            <h3>Results: ${escapeHtml(result.batchName)} <small style="font-weight:400;">(${escapeHtml(result.solver || '')})</small></h3>
            <div class="stats-row">
                <div class="stat-card">
                    <p class="stat-value">${result.grandTotalBeams}</p>
                    <p class="stat-label">Beams Used</p>
                </div>
                <div class="stat-card">
                    <p class="stat-value">${result.grandTotalStockMm.toLocaleString()} mm</p>
                    <p class="stat-label">Total Stock</p>
                </div>
                <div class="stat-card">
                    <p class="stat-value">${result.grandTotalCutMm.toLocaleString()} mm</p>
                    <p class="stat-label">Material Cut</p>
                </div>
                <div class="stat-card">
                    <p class="stat-value">${result.grandTotalWasteMm.toLocaleString()} mm</p>
                    <p class="stat-label">Total Waste</p>
                </div>
                <div class="stat-card">
                    <p class="stat-value">${result.grandWastePct.toFixed(2)}%</p>
                    <p class="stat-label">Waste Percentage</p>
                </div>
            </div>
            <div style="margin: 8px 0 14px; display:flex; gap:8px; flex-wrap:wrap;">
                <button class="secondary-btn" id="btn-secure-export">Secure Export Package</button>
            </div>
        `);

        // visual cutting layout - the coloured bars showing whats on each beam
        resultsSection.insertAdjacentHTML('beforeend', buildBeamLayout(result));
        wireBeamLayoutControls(result);

        // scrollable CSV table
        if (result.csvContent) {
            resultsSection.insertAdjacentHTML('beforeend', buildCsvViewer(result.csvContent, result.batchName));
        }

        // charts - bar chart for waste comparison and pie for utilisation
        const chartData = parseChartData(result);
        const safeBatch = result.batchName.replace(/[^a-zA-Z0-9_-]/g, '_');
        resultsSection.insertAdjacentHTML('beforeend', `
            <div class="card">
<<<<<<< HEAD
                <h3 style="margin-top:0;">Waste Comparison</h3>
                <div class="chart-controls">
                    <label for="chart-type" style="font-size:13px; font-weight:500;">Chart type:</label>
                    <select id="chart-type" style="width:auto;" aria-label="Waste chart type">
                        <option value="overview-bar">Overall Comparison (mm)</option>
                        <option value="overview-pie">Material Utilisation (Pie)</option>
                        <option value="overview-doughnut">Material Utilisation (Doughnut)</option>
                        <option value="nest-bar">Per-Nest Waste (Top 15)</option>
                    </select>
                    <button class="secondary-btn" id="btn-download-chart-pdf" aria-label="Download waste chart as PDF">Download Chart as PDF</button>
=======
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <h3 style="margin:0;">Waste Comparison</h3>
                    <button class="secondary-btn" id="btn-dl-chart-bar">Download Chart</button>
>>>>>>> d5f9ac16cdf2d28d49b94f354c24cb54e7305043
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

        // chart download buttons - saves as PNG through native dialog
        document.getElementById('btn-dl-chart-bar').addEventListener('click', () => downloadChartAsPng('chart-bar', `${safeBatch}_waste_comparison.png`));
        document.getElementById('btn-dl-chart-pie').addEventListener('click', () => downloadChartAsPng('chart-pie', `${safeBatch}_utilisation_pie.png`));

        // CSV download button - also uses native save dialog
        const dlBtn = document.getElementById('btn-download-csv');
        if (dlBtn) dlBtn.addEventListener('click', () => downloadCsv(result.csvContent, result.batchName));

        const exportBtn = document.getElementById('btn-secure-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                if (!window.exportAPI || !window.exportAPI.securePackage) {
                    alert('Secure export API is not available.');
                    return;
                }

                const pw1 = window.prompt('Enter export password (min 8 chars):');
                if (!pw1) return;
                const pw2 = window.prompt('Confirm export password:');
                if (pw1 !== pw2) {
                    alert('Passwords do not match.');
                    return;
                }

                if (pw1.length < 8) {
                    alert('Password must be at least 8 characters.');
                    return;
                }

                const chartCanvas = document.getElementById('waste-chart');
                const chartImageBase64 = chartCanvas ? chartCanvas.toDataURL('image/png', 1.0) : null;

                const response = await window.exportAPI.securePackage({
                    batchName: result.batchName,
                    password: pw1,
                    cleanedCsv: lastCleanedCsv,
                    validationReport: lastValidationReport,
                    optimisationSummary: {
                        solver: result.solver,
                        priority: result.priority,
                        grandWastePct: result.grandWastePct,
                        grandTotalWasteMm: result.grandTotalWasteMm,
                        grandTotalBeams: result.grandTotalBeams
                    },
                    chartImageBase64
                });

                if (!response.success) {
                    alert(response.message || 'Secure export failed.');
                    return;
                }

                alert(`Secure export created: ${response.filename}\nIntegrity SHA-256: ${response.integritySha256}`);
            });
        }
    }

    // ============================================================
  
    // Cutting layout - coloured bars showing components on beams
    // This is the bit that looks like a proper cutting stock diagram

    function buildBeamLayout(result) {
        // flatten all beams from all nests into one array
        const allBeams = [];
        const nestIds = [];
        for (const nest of result.results) {
            for (const beam of nest.beams) {
                allBeams.push(beam);
                nestIds.push(nest.nestId);
            }
        }
        if (allBeams.length === 0) return '';

        return `
            <div class="card">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <h3 style="margin:0;">Cutting Layout <small style="font-weight:400;">(${allBeams.length} beams)</small></h3>
                    <button class="secondary-btn" id="btn-download-layout">Download Layout as PDF</button>
                </div>
                <div class="beam-layout" id="beam-layout-container">
                    ${renderBeams(allBeams, nestIds, 'all', allBeams.length)}
                </div>
            </div>
        `;
    }

    // renders each beam as a row of coloured segments
    // uses a 10-colour palette that cycles for beams with loads of components
    // waste shows up as a stripy segment at the end
    function renderBeams(allBeams, nestIds, filterNest, limit) {
        let html = '';
        let count = 0;
        const maxStock = Math.max(...allBeams.map(b => b.stockLengthMm));

        for (let i = 0; i < allBeams.length && count < limit; i++) {
            if (filterNest !== 'all' && String(nestIds[i]) !== filterNest) continue;
            const beam = allBeams[i];
            count++;

            let segments = '';
            beam.components.forEach((comp, ci) => {
                const widthPct = (comp.lengthMm / beam.stockLengthMm) * 100;
                const colClass = `seg-c${ci % 10}`;
                const label = widthPct > 5 ? escapeHtml(comp.itemNumber) : '';
                segments += `<div class="beam-segment ${colClass}" style="width:${widthPct}%" title="${escapeHtml(comp.itemNumber)}: ${comp.lengthMm}mm">${label}</div>`;
            });

            // waste segment with diagonal stripes
            if (beam.wasteMm > 0) {
                const wastePct = (beam.wasteMm / beam.stockLengthMm) * 100;
                segments += `<div class="beam-segment beam-segment-waste" style="width:${wastePct}%" title="Waste: ${beam.wasteMm}mm">${wastePct > 5 ? 'waste' : ''}</div>`;
            }

            // scale bar width so the longest beam fills the whole row
            const barWidthPct = (beam.stockLengthMm / maxStock) * 100;

            html += `
                <div class="beam-row">
                    <div class="beam-label">#${i + 1}</div>
                    <div class="beam-bar" style="width:${barWidthPct}%">${segments}</div>
                    <div class="beam-length-label">${beam.stockLengthMm}mm</div>
                </div>
            `;
        }

        if (count === 0) html = '<p style="color:var(--muted); font-size:13px;">No beams for this nest.</p>';

        return html;
    }

    // hook up the PDF download button for the cutting layout
    function wireBeamLayoutControls(result) {
        const dlLayoutBtn = document.getElementById('btn-download-layout');
        if (dlLayoutBtn) {
            dlLayoutBtn.addEventListener('click', () => downloadLayoutAsPdf(result.batchName));
        }
    }

    // opens all the beams in a new print-friendly window for PDF export
    function downloadLayoutAsPdf(batchName) {
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
    }

    // ============================================================
  
    // Charts - uses Chart.js for the waste comparison visuals

    // pull the data we need for charts out of the result object
    function parseChartData(result) {
        const data = {
            optimisedWasteMm: result.grandTotalWasteMm,
            optimisedWastePct: result.grandWastePct,
            totalStockMm: result.grandTotalStockMm,
            totalWasteMm: result.grandTotalWasteMm,
            totalCutMm: result.grandTotalCutMm,
            oldWasteMm: null
        };

        // try to get old waste from the CSV (for comparing against the previous cutting plan)
        if (result.csvContent) {
            const lines = result.csvContent.split('\n').filter(l => l.trim());
            if (lines.length > 1) {
                const headers = parseCsvLine(lines[0]);
                const oldWasteIdx = headers.indexOf('OldWaste_mm');
                const beamIndexIdx = headers.indexOf('BeamIndex');
                let totalOldWaste = 0;
                let hasAnyOld = false;
                const oldWastePerBeam = {};

                for (let i = 1; i < lines.length; i++) {
                    const cells = parseCsvLine(lines[i]);
                    const bi = cells[beamIndexIdx];
                    const oldW = parseFloat(cells[oldWasteIdx]) || 0;

                    // take the max per beam so we dont double count
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

    // custom plugin to draw percentage labels outside pie slices
    // took us a while to figure this out from the Chart.js docs
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

    // builds a Chart.js chart on a given canvas element
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
  
    // Helper functions

    // makes mm values look nicer (converts to m or km if big enough)
    function formatMm(mm) {
        if (mm >= 1000000) return (mm / 1000000).toFixed(2) + ' km';
        if (mm >= 1000) return (mm / 1000).toFixed(1) + ' m';
        return mm.toFixed(0) + ' mm';
    }

    // builds a scrollable HTML table from CSV content
    function buildCsvViewer(csvContent, batchName) {
        const lines = csvContent.split('\n').filter(l => l.trim());
        if (lines.length === 0) return '';
        const headers = parseCsvLine(lines[0]);
        let tableHtml = '<thead><tr>';
        for (const h of headers) tableHtml += `<th>${escapeHtml(h)}</th>`;
        tableHtml += '</tr></thead><tbody>';
        for (let i = 1; i < lines.length; i++) {
            const cells = parseCsvLine(lines[i]);
            tableHtml += '<tr>';
            for (const c of cells) tableHtml += `<td>${escapeHtml(c)}</td>`;
            tableHtml += '</tr>';
        }
        tableHtml += '</tbody>';
        return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><h3 style="margin:0;">Output CSV</h3><button class="secondary-btn" id="btn-download-csv">Download CSV</button></div><div class="csv-viewer"><table>${tableHtml}</table></div></div>`;
    }

    // save chart as PNG through the native save dialog
    async function downloadChartAsPng(canvasId, defaultName) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png', 1.0);
        await window.fileAPI.savePng(defaultName, dataUrl);
    }

    // save CSV through native save dialog
    async function downloadCsv(csvContent, batchName) {
        const defaultName = `${batchName.replace(/[^a-zA-Z0-9_-]/g, '_')}_output.csv`;
        await window.fileAPI.saveCsv(defaultName, csvContent);
    }

    // escapes HTML to stop XSS when we insert user-provided strings
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
});
