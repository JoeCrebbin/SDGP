const test = require('node:test');
const assert = require('node:assert/strict');
const { bootScript, tick } = require('../helpers/ui-test-utils');

function historyHtml() {
  return `
  <input id="history-search" />
  <button id="history-search-btn">Search</button>
  <table><tbody id="history-body"></tbody></table>
  <section id="detail-section" style="display:none;"></section>
  `;
}

test('History List Update', async () => {
  const calls = [];
  const { document, cleanup } = await bootScript({
    html: historyHtml(),
    scriptRelPath: 'src/js/pages/history.js',
    windowMocks: {
      historyAPI: {
        list: async () => ({
          success: true,
          batches: [{ id: 1, batch_name: 'A', total_wastage_percent: 10, created_at: new Date().toISOString() }]
        }),
        search: async (q) => {
          calls.push(q);
          return {
            success: true,
            batches: [
              { id: 1, batch_name: 'A', total_wastage_percent: 10, created_at: new Date().toISOString() },
              { id: 2, batch_name: 'B', total_wastage_percent: 12, created_at: new Date().toISOString() }
            ]
          };
        },
        detail: async () => ({ success: false })
      },
      fileAPI: { savePng: async () => {}, saveCsv: async () => {} },
      exportAPI: { securePackage: async () => ({ success: true, filename: 'x.gve' }) }
    }
  });

  assert.equal(document.querySelectorAll('#history-body tr').length, 1);
  document.getElementById('history-search').value = 'abc';
  document.getElementById('history-search-btn').click();
  await tick();
  assert.equal(calls[0], 'abc');
  assert.equal(document.querySelectorAll('#history-body tr').length, 2);
  cleanup();
});

test('Chart Type Switching', async () => {
  const { document, cleanup } = await bootScript({
    html: historyHtml(),
    scriptRelPath: 'src/js/pages/history.js',
    windowMocks: {
      historyAPI: {
        list: async () => ({ success: true, batches: [{ id: 1, batch_name: 'A', total_wastage_percent: 10, created_at: new Date().toISOString() }] }),
        search: async () => ({ success: true, batches: [] }),
        detail: async () => ({
          success: true,
          batch: { batch_name: 'A', total_wastage_percent: 10, created_at: new Date().toISOString() },
          csvContent: 'ItemNumber,BeamIndex,AssignedBeam_mm,WasteOnBeam_mm,Length_mm\\nA,1,6000,5000,1000'
        })
      },
      fileAPI: { savePng: async () => {}, saveCsv: async () => {} },
      exportAPI: { securePackage: async () => ({ success: true, filename: 'x.gve' }) }
    }
  });

  document.querySelector('.view-btn').click();
  await tick();

  assert.ok(document.getElementById('chart-type'), 'Expected chart type selector to exist for switching');
  cleanup();
});
