/*
 * dashboard.js - Main Dashboard Page Handler
 *
 * This is the largest page handler. It manages:
 *   1. CSV file upload and column mapping
 *   2. Running the optimisation algorithm
 *   3. Displaying results: summary stats, cutting layout, CSV viewer, and charts
 *
 * The flow is: Upload CSV -> Inspect headers -> Map columns -> Run optimisation -> Show results
 */

document.addEventListener('DOMContentLoaded', () => {
    // Get references to key DOM elements
    const fileInput = document.getElementById('csv-file');
    const inspectBtn = document.getElementById('inspect-btn');
    const settingsSection = document.getElementById('optimisation-settings');
    const mappingSelects = document.querySelectorAll('.csv-mapping');
    const msg = document.getElementById('message');
    const submitBtn = document.getElementById('btn-submit');
    const resultsSection = document.getElementById('results-section');
    const validationReportEl = document.getElementById('validation-report');

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

    // ---- Load Global Settings Defaults ----
    // Pre-fill kerf and min remnant from admin-configured global settings
    (async () => {
        try {
            const res = await window.settingsAPI.getDefaults();
            if (res.success && res.settings) {
                const kerfInput = document.getElementById('kerf');
                const remnantInput = document.getElementById('min-remnant');
                if (res.settings.default_kerf_mm) kerfInput.value = res.settings.default_kerf_mm;
                if (res.settings.default_min_remnant_mm) remnantInput.value = res.settings.default_min_remnant_mm;
            }
        } catch (e) { /* If settings fail to load, just use the HTML default values */ }
    })();

    // ---- File Selection ----
    // Enable the inspect button when a file is chosen
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            inspectBtn.disabled = false;
            msg.textContent = `File selected: ${fileInput.files[0].name}`;
            msg.style.color = '';
        }
    });

    // ---- CSV Inspection ----
    // Read the file, extract column headers, and populate the mapping dropdowns
    inspectBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            csvContent = e.target.result;
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
            mappingSelects.forEach(select => {
                select.innerHTML = '<option value="">-- Select Column --</option>';
                columns.forEach((col, index) => {
                    const option = document.createElement('option');
                    option.value = index;
                    option.textContent = col || `Column ${index + 1}`;
                    select.appendChild(option);
                });
            });
            settingsSection.style.display = 'block'; // Show the settings panel
            msg.textContent = 'File inspected. Configure settings below.';
            msg.style.color = 'var(--success)';
            validationReportEl.innerHTML = '';
        };
        inspectBtn.disabled = true;
        reader.readAsText(file);
    });

    // ---- Run Optimisation ----
    submitBtn.addEventListener('click', async () => {
        if (!csvContent) { msg.textContent = 'Please inspect a file first.'; msg.style.color = 'var(--danger)'; return; }
        const validationStart = performance.now();

        // Gather all user inputs
        const batchName = document.getElementById('batch-name').value.trim();
        const hasHeaders = document.getElementById('has-headers').checked;
        const units = document.getElementById('units').value;
        const kerfMm = parseFloat(document.getElementById('kerf').value) || 3.0;
        const minRemnantMm = parseFloat(document.getElementById('min-remnant').value) || 500;

        // Get the column index mappings (which CSV column maps to which field)
        const mapId = document.getElementById('map-id').value;
        const mapLength = document.getElementById('map-length').value;
        const mapTotalLength = document.getElementById('map-total-length').value;
        const mapMaterial = document.getElementById('map-material').value;
        const mapOldWaste = document.getElementById('map-old-waste').value;
        const priority = document.getElementById('priority').value;

        // Validate required mappings (material group is optional)
        if (!mapId || !mapLength || !mapTotalLength) { msg.textContent = 'Please map Component ID, Length, and Raw Beam Size.'; msg.style.color = 'var(--danger)'; return; }
        if (!batchName) { msg.textContent = 'Please enter a batch name.'; msg.style.color = 'var(--danger)'; return; }

        // Min remnant must be at least the kerf width - a remnant shorter than the
        // saw blade is physically unusable
        if (minRemnantMm < kerfMm) {
            msg.textContent = `Minimum reusable length (${minRemnantMm}mm) cannot be shorter than the saw blade width (${kerfMm}mm).`;
            msg.style.color = 'var(--danger)';
            return;
        }

        // Convert units to mm (all internal calculations use millimetres)
        const toMm = { mm: 1, cm: 10, m: 1000 };
        const multiplier = toMm[units] || 1;

        // Parse CSV rows into component objects
        const lines = csvContent.split('\n').filter(line => line.trim() !== '');
        const startRow = hasHeaders ? 1 : 0; // Skip header row if present
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
        msg.textContent = `Running optimisation on ${components.length} components...`;
        msg.style.color = '';
        submitBtn.disabled = true;

        try {
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
    // Results Display
    // Called after a successful optimisation. Renders all result sections.
    // ============================================================

    function displayResults(result) {
        resultsSection.style.display = 'block';
        resultsSection.innerHTML = '';

        // Summary stats cards (beams used, total stock, waste, etc.)
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

        // Visual cutting layout (coloured bars showing components on beams)
        resultsSection.insertAdjacentHTML('beforeend', buildBeamLayout(result));
        wireBeamLayoutControls(result);

        // Scrollable CSV data table with download button
        if (result.csvContent) {
            resultsSection.insertAdjacentHTML('beforeend', buildCsvViewer(result.csvContent, result.batchName));
        }

        // Waste comparison charts (bar, pie, doughnut, per-nest)
        const chartData = parseChartData(result);
        resultsSection.insertAdjacentHTML('beforeend', `
            <div class="card">
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
                </div>
                <div class="chart-container" style="height:360px;">
                    <canvas id="waste-chart"></canvas>
                </div>
            </div>
        `);

        // Build the initial chart and wire up chart type switching
        buildChart(chartData, 'waste-chart');
        document.getElementById('chart-type').addEventListener('change', () => buildChart(chartData, 'waste-chart'));
        document.getElementById('btn-download-chart-pdf').addEventListener('click', () => downloadChartAsPdf('waste-chart'));

        // Wire up CSV download button
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
    // Cutting Layout Visualisation
    // Renders coloured bars representing components packed on beams,
    // similar to classic cutting stock diagrams.
    // ============================================================

    function buildBeamLayout(result) {
        // Flatten all beams from all nests into a single array
        const allBeams = [];
        const nestIds = [];
        for (const nest of result.results) {
            for (const beam of nest.beams) {
                allBeams.push(beam);
                nestIds.push(nest.nestId);
            }
        }
        if (allBeams.length === 0) return '';

        // Build dropdown options for filtering by nest (material type)
        const uniqueNests = [...new Set(nestIds)].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
        let nestOptions = '<option value="all">All Nests</option>';
        for (const n of uniqueNests) {
            nestOptions += `<option value="${escapeHtml(String(n))}">Nest ${escapeHtml(String(n))}</option>`;
        }

        return `
            <div class="card">
                <h3 style="margin-top:0;">Cutting Layout</h3>
                <div class="beam-layout-controls">
                    <label style="font-size:13px; font-weight:500;">Nest:</label>
                    <select id="layout-nest-filter" style="width:auto;">${nestOptions}</select>
                    <button class="secondary-btn" id="btn-download-layout">Download Layout as PDF</button>
                    <small>Showing first 50 beams. ${allBeams.length} total.</small>
                </div>
                <div class="beam-layout" id="beam-layout-container">
                    ${renderBeams(allBeams, nestIds, 'all', 50)}
                </div>
            </div>
        `;
    }

    /**
     * Renders individual beam rows as coloured segments.
     * Each component gets a colour from a 10-colour palette (cycles for >10 components).
     * Waste is shown as a diagonal-striped segment at the end.
     * Bar widths are proportional to the beam's stock length relative to the largest beam.
     */
    function renderBeams(allBeams, nestIds, filterNest, limit) {
        let html = '';
        let count = 0;
        const maxStock = Math.max(...allBeams.map(b => b.stockLengthMm));

        for (let i = 0; i < allBeams.length && count < limit; i++) {
            if (filterNest !== 'all' && String(nestIds[i]) !== filterNest) continue;
            const beam = allBeams[i];
            count++;

            // Build coloured segments for each component on this beam
            let segments = '';
            beam.components.forEach((comp, ci) => {
                const widthPct = (comp.lengthMm / beam.stockLengthMm) * 100;
                const colClass = `seg-c${ci % 10}`; // Cycle through 10 colours
                const label = widthPct > 5 ? escapeHtml(comp.itemNumber) : ''; // Only show label if segment is wide enough
                segments += `<div class="beam-segment ${colClass}" style="width:${widthPct}%" title="${escapeHtml(comp.itemNumber)}: ${comp.lengthMm}mm">${label}</div>`;
            });

            // Add waste segment at the end (diagonal stripe pattern)
            if (beam.wasteMm > 0) {
                const wastePct = (beam.wasteMm / beam.stockLengthMm) * 100;
                segments += `<div class="beam-segment beam-segment-waste" style="width:${wastePct}%" title="Waste: ${beam.wasteMm}mm">${wastePct > 5 ? 'waste' : ''}</div>`;
            }

            // Scale bar width so the longest beam fills the full width
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

    // Wire up nest filter dropdown and layout download button
    function wireBeamLayoutControls(result) {
        const filter = document.getElementById('layout-nest-filter');
        if (!filter) return;

        // Rebuild the flat beam arrays for filtering
        const allBeams = [];
        const nestIds = [];
        for (const nest of result.results) {
            for (const beam of nest.beams) {
                allBeams.push(beam);
                nestIds.push(nest.nestId);
            }
        }

        // Re-render beams when nest filter changes
        filter.addEventListener('change', () => {
            const container = document.getElementById('beam-layout-container');
            if (container) container.innerHTML = renderBeams(allBeams, nestIds, filter.value, 50);
        });

        const dlLayoutBtn = document.getElementById('btn-download-layout');
        if (dlLayoutBtn) {
            dlLayoutBtn.addEventListener('click', () => downloadLayoutAsPng());
        }
    }

    /**
     * Opens the cutting layout in a new print-ready window.
     * The user can then use their browser's print dialog to save as PDF.
     * We duplicate the CSS needed for the beam layout so it renders correctly.
     */
    function downloadLayoutAsPng() {
        const container = document.getElementById('beam-layout-container');
        if (!container) return;
        const html = container.innerHTML;
        const pw = window.open('', '_blank');
        if (!pw) { alert('Pop-up blocked.'); return; }
        pw.document.write(`<!DOCTYPE html><html><head><title>Cutting Layout</title>
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
<h2>Cutting Layout</h2>
${html}
<br><button onclick="window.print()">Print / Save as PDF</button>
</body></html>`);
        pw.document.close();
    }

    // ============================================================
    // Chart Data & Rendering
    // Uses Chart.js to display waste comparison in different formats.
    // ============================================================

    /**
     * Parse the optimisation result into a format suitable for Chart.js.
     * Extracts waste totals, per-nest breakdowns, and old waste data from the CSV.
     */
    function parseChartData(result) {
        const data = {
            optimisedWasteMm: result.grandTotalWasteMm,
            optimisedWastePct: result.grandWastePct,
            totalStockMm: result.grandTotalStockMm,
            totalWasteMm: result.grandTotalWasteMm,
            totalCutMm: result.grandTotalCutMm,
            oldWasteMm: null, // Will be filled from CSV if old waste data exists
            nests: []
        };

        // Parse old waste from the CSV output (one entry per unique beam, not per component)
        if (result.csvContent) {
            const lines = result.csvContent.split('\n').filter(l => l.trim());
            if (lines.length > 1) {
                const headers = parseCsvLine(lines[0]);
                const oldWasteIdx = headers.indexOf('OldWaste_mm');
                const beamIndexIdx = headers.indexOf('BeamIndex');
                const nestIdx = headers.indexOf('NestID');
                const wasteIdx = headers.indexOf('WasteOnBeam_mm');
                const beamIdx = headers.indexOf('AssignedBeam_mm');

                let totalOldWaste = 0;
                let hasAnyOld = false;
                const oldWastePerBeam = {}; // Track max old waste per beam index

                const nestMap = {};

                for (let i = 1; i < lines.length; i++) {
                    const cells = parseCsvLine(lines[i]);
                    const bi = cells[beamIndexIdx];
                    const beamLen = parseFloat(cells[beamIdx]) || 0;
                    const waste = parseFloat(cells[wasteIdx]) || 0;
                    const oldW = parseFloat(cells[oldWasteIdx]) || 0;
                    const nid = cells[nestIdx] || '';

                    // For old waste: take the max value per beam (avoids double-counting)
                    if (oldW > 0) {
                        hasAnyOld = true;
                        if (!(bi in oldWastePerBeam) || oldW > oldWastePerBeam[bi]) {
                            oldWastePerBeam[bi] = oldW;
                        }
                    }

                    // Aggregate per-nest statistics (only count each beam once)
                    if (!nestMap[nid]) nestMap[nid] = { stock: 0, waste: 0, beamsSeen: new Set() };
                    if (!nestMap[nid].beamsSeen.has(bi)) {
                        nestMap[nid].beamsSeen.add(bi);
                        nestMap[nid].stock += beamLen;
                        nestMap[nid].waste += waste;
                    }
                }

                if (hasAnyOld) {
                    for (const v of Object.values(oldWastePerBeam)) totalOldWaste += v;
                    data.oldWasteMm = totalOldWaste;
                }

                // Build per-nest waste percentages for the nest bar chart
                for (const [nid, nd] of Object.entries(nestMap)) {
                    data.nests.push({ id: nid, wastePct: nd.stock > 0 ? (nd.waste / nd.stock) * 100 : 0 });
                }
                data.nests.sort((a, b) => b.wastePct - a.wastePct); // Sort by worst waste first
            }
        }

        // Fallback: use nest data directly from the result if CSV parsing didn't produce any
        if (data.nests.length === 0 && result.results) {
            for (const nest of result.results) data.nests.push({ id: nest.nestId, wastePct: nest.wastePct });
            data.nests.sort((a, b) => b.wastePct - a.wastePct);
        }

        return data;
    }

    let currentChart = null; // Track the current chart so we can destroy it before creating a new one

    /**
     * Custom Chart.js plugin to draw percentage labels outside pie/doughnut slices.
     * This solves the problem of tiny waste segments being impossible to hover over.
     * Calculates the position using polar coordinates (mid-angle of each arc).
     */
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
                // Calculate label position outside the slice
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
     * Build a Chart.js chart based on the selected chart type.
     * Destroys any existing chart first to avoid canvas reuse errors.
     */
    function buildChart(chartData, canvasId) {
        const typeSelect = document.getElementById('chart-type');
        const chartType = typeSelect ? typeSelect.value : 'overview-bar';
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        if (currentChart) { currentChart.destroy(); currentChart = null; }

        let config;

        if (chartType === 'overview-bar') {
            // Bar chart comparing optimised waste vs previous waste in absolute mm
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

        } else if (chartType === 'overview-pie' || chartType === 'overview-doughnut') {
            // Pie/doughnut showing material used vs wasted
            const total = chartData.totalCutMm + chartData.totalWasteMm;
            const usedPct = total > 0 ? ((chartData.totalCutMm / total) * 100).toFixed(1) : '0';
            const wastePct = total > 0 ? ((chartData.totalWasteMm / total) * 100).toFixed(1) : '0';
            config = {
                type: chartType === 'overview-pie' ? 'pie' : 'doughnut',
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
                plugins: [pieDataLabelsPlugin] // Adds external percentage labels
            };

        } else if (chartType === 'nest-bar') {
            // Horizontal bar chart showing waste % per nest (top 15 worst)
            const top = chartData.nests.slice(0, 15);
            config = {
                type: 'bar',
                data: {
                    labels: top.map(n => `Nest ${n.id}`),
                    datasets: [{ label: 'Waste %', data: top.map(n => parseFloat(n.wastePct.toFixed(2))),
                        backgroundColor: top.map(n => n.wastePct > 20 ? 'rgba(220, 38, 38, 0.6)' : 'rgba(0, 120, 212, 0.75)'), borderWidth: 1
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                    plugins: { legend: { display: false }, title: { display: true, text: 'Top 15 Nests by Waste %' } },
                    scales: { x: { beginAtZero: true, title: { display: true, text: 'Waste %' } } }
                }
            };
        }

        if (config) currentChart = new Chart(canvas.getContext('2d'), config);
    }

    // ============================================================
    // Helper Functions
    // ============================================================

    // Format millimetres into a human-readable string (km/m/mm)
    function formatMm(mm) {
        if (mm >= 1000000) return (mm / 1000000).toFixed(2) + ' km';
        if (mm >= 1000) return (mm / 1000).toFixed(1) + ' m';
        return mm.toFixed(0) + ' mm';
    }

    // Build a scrollable HTML table from CSV content with a download button
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

    // Trigger a CSV file download using a temporary Blob URL
    function downloadCsv(csvContent, batchName) {
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `${batchName.replace(/[^a-zA-Z0-9_-]/g, '_')}_output.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Open a chart as an image in a new window for printing/saving as PDF
    function downloadChartAsPdf(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const imgData = canvas.toDataURL('image/png', 1.0);
        const pw = window.open('', '_blank');
        if (!pw) { alert('Pop-up blocked.'); return; }
        pw.document.write(`<!DOCTYPE html><html><head><title>Chart</title><style>body{margin:40px;font-family:sans-serif;text-align:center}img{max-width:100%}@media print{button{display:none}}</style></head><body><h2>Waste Chart</h2><img src="${imgData}"><br><br><button onclick="window.print()">Print / Save as PDF</button></body></html>`);
        pw.document.close();
    }

    // Safely escape HTML to prevent XSS when inserting user-provided strings
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }
});
