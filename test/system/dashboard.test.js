const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bootScript, setFileInput, tick } = require('../helpers/ui-test-utils');

function dashboardHtml() {
  return `
  <input id="csv-file" type="file" />
  <button id="inspect-btn" disabled>Inspect</button>
  <section id="optimisation-settings" style="display:none;">
    <input id="batch-name" />
    <input id="has-headers" type="checkbox" checked />
    <select id="units"><option value="mm" selected>mm</option><option value="cm">cm</option><option value="m">m</option></select>
    <input id="kerf" value="3" />
    <input id="min-remnant" value="500" />
    <select id="map-id" class="csv-mapping"></select>
    <select id="map-length" class="csv-mapping"></select>
    <select id="map-total-length" class="csv-mapping"></select>
    <select id="map-nest-id" class="csv-mapping"><option value="">-- Use single group (all) --</option></select>
    <select id="map-old-waste" class="csv-mapping"><option value="">-- None --</option></select>
    <select id="priority"><option value="waste" selected>waste</option><option value="speed">speed</option></select>
  </section>
  <p id="message"></p>
  <div id="validation-report"></div>
  <button id="btn-submit">Run</button>
  <section id="results-section" style="display:none;"></section>
  `;
}

async function setupDashboard(overrides = {}) {
  const optimiseCalls = [];

  const ctx = await bootScript({
    html: dashboardHtml(),
    scriptRelPath: 'src/js/pages/dashboard.js',
    windowMocks: {
      settingsAPI: {
        getDefaults: async () => ({ success: true, settings: { default_kerf_mm: '3.0', default_min_remnant_mm: '500' } })
      },
      optimiseAPI: {
        run: async (payload) => {
          optimiseCalls.push(payload);
          return {
            success: true,
            result: {
              batchName: payload.batchName,
              solver: 'Best-Fit Decreasing (Min Waste)',
              grandTotalBeams: 1,
              grandTotalStockMm: 6000,
              grandTotalCutMm: 1000,
              grandTotalWasteMm: 5000,
              grandWastePct: 83.33,
              kerfMm: payload.kerfMm,
              results: [
                {
                  nestId: 'all',
                  beams: [
                    {
                      stockLengthMm: 6000,
                      components: [{ itemNumber: 'A1', lengthMm: 1000 }],
                      wasteMm: 5000,
                      kerfMm: 3
                    }
                  ]
                }
              ],
              csvContent: 'ItemNumber,NestID,Length_mm,AssignedBeam_mm,BeamIndex,WasteOnBeam_mm,OldWaste_mm\\nA1,all,1000,6000,1,5000,'
            }
          };
        }
      },
      fileAPI: {
        savePng: async () => {},
        saveCsv: async () => {}
      },
      batchDetailHelpers: {
        buildCsvViewer: () => '<div><button id="btn-download-csv">Download CSV</button></div>',
        downloadLayoutAsPdf: () => {}
      },
      confirm: () => true,
      ...overrides
    }
  });

  return { ...ctx, optimiseCalls };
}

test('CSV Inspect Without File', async () => {
  const { document, cleanup } = await setupDashboard();
  document.getElementById('inspect-btn').click();
  assert.equal(document.getElementById('optimisation-settings').style.display, 'none');
  cleanup();
});

test('Required Mapping Validation', async () => {
  const { window, document, cleanup } = await setupDashboard();
  setFileInput(window, document.getElementById('csv-file'), 'ok.csv', 'id,len,beam\\nA,1000,6000');
  document.getElementById('inspect-btn').click();
  document.getElementById('batch-name').value = 'B-1';
  document.getElementById('btn-submit').click();
  assert.match(document.getElementById('message').textContent, /Please map Component ID, Length, and Raw Beam Size/i);
  cleanup();
});

test('Batch Name Validation', async () => {
  const { window, document, cleanup } = await setupDashboard();
  setFileInput(window, document.getElementById('csv-file'), 'ok.csv', 'id,x,len,beam\\nA,0,1000,6000');
  document.getElementById('inspect-btn').click();
  document.getElementById('map-id').value = '1';
  document.getElementById('map-length').value = '2';
  document.getElementById('map-total-length').value = '3';
  document.getElementById('btn-submit').click();
  assert.match(document.getElementById('message').textContent, /Please enter a batch name/i);
  cleanup();
});

test('Kerf/Remnant Validation', async () => {
  const { window, document, cleanup } = await setupDashboard();
  setFileInput(window, document.getElementById('csv-file'), 'ok.csv', 'id,x,len,beam\\nA,0,1000,6000');
  document.getElementById('inspect-btn').click();
  document.getElementById('map-id').value = '1';
  document.getElementById('map-length').value = '2';
  document.getElementById('map-total-length').value = '3';
  document.getElementById('batch-name').value = 'B-1';
  document.getElementById('kerf').value = '5';
  document.getElementById('min-remnant').value = '3';
  document.getElementById('btn-submit').click();
  assert.match(document.getElementById('message').textContent, /cannot be shorter than the saw blade width/i);
  cleanup();
});

test('Happy Path Optimisation', async () => {
  const { window, document, optimiseCalls, cleanup } = await setupDashboard();
  setFileInput(window, document.getElementById('csv-file'), 'ok.csv', 'id,x,len,beam\\nA,0,1000,6000');
  document.getElementById('inspect-btn').click();
  document.getElementById('map-id').value = '1';
  document.getElementById('map-length').value = '2';
  document.getElementById('map-total-length').value = '3';
  document.getElementById('batch-name').value = 'B-1';

  document.getElementById('btn-submit').click();
  await tick();

  assert.equal(optimiseCalls.length, 1);
  assert.match(document.getElementById('message').textContent, /Optimisation complete/i);
  cleanup();
});

test('Invalid Rows Skipped, CSV includes mixed valid/invalid rows', async () => {
  let confirmCalled = false;
  const { window, document, optimiseCalls, cleanup } = await setupDashboard({
    confirm: () => {
      confirmCalled = true;
      return true;
    }
  });

  setFileInput(
    window,
    document.getElementById('csv-file'),
    'mixed.csv',
    'id,x,len,beam\\nA,0,1000,6000\\nB,0,abc,6000'
  );
  document.getElementById('inspect-btn').click();
  document.getElementById('map-id').value = '1';
  document.getElementById('map-length').value = '2';
  document.getElementById('map-total-length').value = '3';
  document.getElementById('batch-name').value = 'B-1';

  document.getElementById('btn-submit').click();
  await tick();

  assert.equal(confirmCalled, true);
  assert.equal(optimiseCalls.length, 1);
  assert.equal(optimiseCalls[0].components.length, 1);
  assert.equal(optimiseCalls[0].validationReport.rejectedRows, 1);
  cleanup();
});

test('Duplicate Rows Skipped', async () => {
  const { window, document, optimiseCalls, cleanup } = await setupDashboard();

  setFileInput(
    window,
    document.getElementById('csv-file'),
    'dupes.csv',
    'id,x,len,beam\\nA1,0,1000,6000\\nA1,0,1000,6000'
  );
  document.getElementById('inspect-btn').click();
  document.getElementById('map-id').value = '1';
  document.getElementById('map-length').value = '2';
  document.getElementById('map-total-length').value = '3';
  document.getElementById('batch-name').value = 'B-dup';

  document.getElementById('btn-submit').click();
  await tick();

  assert.equal(optimiseCalls.length, 1);
  assert.equal(optimiseCalls[0].components.length, 1);
  assert.equal(optimiseCalls[0].validationReport.rejectedRows, 1);
  cleanup();
});

test('No Valid Components in CSV', async () => {
  const { window, document, optimiseCalls, cleanup } = await setupDashboard();
  setFileInput(window, document.getElementById('csv-file'), 'bad.csv', 'id,x,len,beam\\nA,0,abc,0');
  document.getElementById('inspect-btn').click();
  document.getElementById('map-id').value = '1';
  document.getElementById('map-length').value = '2';
  document.getElementById('map-total-length').value = '3';
  document.getElementById('batch-name').value = 'B-1';

  document.getElementById('btn-submit').click();
  assert.match(document.getElementById('message').textContent, /No valid components found/i);
  assert.equal(optimiseCalls.length, 0);
  cleanup();
});

test('Output CSV Schema', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', '..', 'main.js'), 'utf8');
  assert.match(mainJs, /ItemNumber,NestID,Length_mm,AssignedBeam_mm,BeamIndex,WasteOnBeam_mm,OldWaste_mm/);
});
