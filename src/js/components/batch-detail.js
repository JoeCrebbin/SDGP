/*
 * batch-detail.js - Shared batch detail rendering helpers
 * SDGP 2025/26
 *
 * Provides UI rendering for: batch summary cards, beam layout view, and CSV viewer.
 * Used by dashboard, history, and admin batch pages.
 */

(function () {
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function parseSavedCsv(csvContent) {
    const lines = csvContent.split('\n').filter(l => l.trim());
    const result = { beams: [], totalStockMm: 0, totalCutMm: 0, totalWasteMm: 0, totalBeams: 0, wastePct: 0 };
    if (lines.length < 2) return result;

    const headers = lines[0].split(',');
    const col = {};
    headers.forEach((h, i) => { col[h.trim()] = i; });

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

    for (const beam of beamMap.values()) {
      result.beams.push(beam);
      result.totalStockMm += beam.stockLengthMm;
      result.totalWasteMm += beam.wasteMm;
    }

    result.totalBeams = result.beams.length;
    result.wastePct = result.totalStockMm > 0 ? (result.totalWasteMm / result.totalStockMm) * 100 : 0;
    return result;
  }

  function renderBeams(beams) {
    if (!beams.length) return '<p style="color:var(--muted); font-size:13px;">No beams available.</p>';

    let html = '';
    const maxStock = Math.max(...beams.map(b => b.stockLengthMm));

    for (let i = 0; i < beams.length; i++) {
      const beam = beams[i];
      let segments = '';
      beam.components.forEach((comp, ci) => {
        const widthPct = beam.stockLengthMm ? (comp.lengthMm / beam.stockLengthMm) * 100 : 0;
        const colClass = `seg-c${ci % 10}`;
        const label = widthPct > 5 ? escapeHtml(comp.itemNumber) : '';
        segments += `<div class="beam-segment ${colClass}" style="width:${widthPct}%" title="${escapeHtml(comp.itemNumber)}: ${comp.lengthMm}mm">${label}</div>`;
      });

      if (beam.wasteMm > 0) {
        const wastePct = beam.stockLengthMm ? (beam.wasteMm / beam.stockLengthMm) * 100 : 0;
        segments += `<div class="beam-segment beam-segment-waste" style="width:${wastePct}%" title="Waste: ${beam.wasteMm}mm">${wastePct > 5 ? 'waste' : ''}</div>`;
      }

      const barWidthPct = maxStock ? (beam.stockLengthMm / maxStock) * 100 : 0;
      html += `
        <div class="beam-row">
          <div class="beam-label">#${i + 1}</div>
          <div class="beam-bar" style="width:${barWidthPct}%">${segments}</div>
          <div class="beam-length-label">${beam.stockLengthMm}mm</div>
        </div>
      `;
    }

    return html;
  }

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

  async function downloadLayoutAsPdf(batchName) {
    const container = document.getElementById('beam-layout-container');
    if (!container) return;
    const html = container.innerHTML;
    const safeName = String(batchName || 'layout').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (window.fileAPI && typeof window.fileAPI.saveLayoutPdf === 'function') {
      const result = await window.fileAPI.saveLayoutPdf(
        `${safeName}_layout.pdf`,
        `Cutting Layout - ${batchName}`,
        html
      );
      if (!result?.success && result?.message !== 'Cancelled') {
        window.alert(result?.message || 'Failed to save PDF layout.');
      }
      return;
    }

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
</body></html>`);
    pw.document.close();
    pw.onload = () => {
      pw.focus();
      pw.print();
    };
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

  window.batchDetailHelpers = {
    parseSavedCsv,
    buildBeamLayout,
    downloadLayoutAsPdf,
    buildCsvViewer
  };
})();