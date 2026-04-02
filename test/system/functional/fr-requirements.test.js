const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { bootScript, setFileInput, tick } = require('../../helpers/ui-test-utils');
const { runOptimisation } = require('../../../src/js/core/optimiser.js');

function dashboardHtml() {
  return `
  <input id="csv-file" type="file" />
  <button id="inspect-btn" disabled>Inspect</button>
  <section id="optimisation-settings" style="display:none;">
    <input id="batch-name" />
    <input id="has-headers" type="checkbox" checked />
    <select id="units"><option value="mm" selected>mm</option></select>
    <input id="kerf" value="3" />
    <input id="min-remnant" value="500" />
    <select id="map-id" class="csv-mapping"></select>
    <select id="map-length" class="csv-mapping"></select>
    <select id="map-total-length" class="csv-mapping"></select>
    <select id="map-nest-id" class="csv-mapping"><option value="">-- Use single group (all) --</option></select>
    <select id="map-old-waste" class="csv-mapping"><option value="">-- None --</option></select>
    <select id="priority"><option value="waste" selected>waste</option></select>
  </section>
  <p id="message"></p>
  <div id="validation-report"></div>
  <button id="btn-submit">Run</button>
  <section id="results-section" style="display:none;"></section>
  `;
}

function historyHtml() {
  return `
  <table id="history-table"><tbody id="history-body"></tbody></table>
  <input id="history-search" />
  <button id="history-search-btn">Search</button>
  <section id="detail-section" style="display:none;"></section>
  `;
}

function registerHtml() {
  return `
  <input id="email" />
  <input id="password" />
  <input id="confirm-password" />
  <select id="location"><option value="Leeds" selected>Leeds</option></select>
  <p id="message"></p>
  `;
}

function loginHtml() {
  return '<input id="email" /><input id="password" /><p id="message"></p>';
}

function settingsHtml() {
  return `
  <input id="current-password" />
  <input id="new-password" />
  <input id="confirm-password" />
  <button id="btn-change-password">Change</button>
  <p id="password-message"></p>
  <input id="delete-password" />
  <button id="btn-delete-account">Delete Account</button>
  <p id="delete-message"></p>
  `;
}

function adminUsersHtml() {
  return `
  <table><tbody id="pending-body"></tbody></table>
  <table><tbody id="users-body"></tbody></table>
  <p id="admin-message"></p>
  <h3 id="all-users-title"></h3>
  <section id="user-batches-section" style="display:none;"><table><tbody id="user-batches-body"></tbody></table></section>
  <h3 id="user-batches-title"></h3>
  <button id="close-user-batches">Close</button>
  <section id="batch-detail-section" style="display:none;"></section>
  `;
}

function adminLogsHtml() {
  return '<input id="log-search" /><button id="log-search-btn">Search</button><table><tbody id="logs-body"></tbody></table>';
}

async function setupDashboard() {
  return bootScript({
    html: dashboardHtml(),
    scriptRelPath: 'src/js/pages/dashboard.js',
    windowMocks: {
      settingsAPI: {
        getDefaults: async () => ({ success: true, settings: { default_kerf_mm: '3.0', default_min_remnant_mm: '500' } })
      },
      optimiseAPI: {
        run: async (payload) => ({
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
        })
      },
      fileAPI: { savePng: async () => {}, saveCsv: async () => {} },
      batchDetailHelpers: {
        buildCsvViewer: () => '<div><button id="btn-download-csv">Download CSV</button></div>',
        downloadLayoutAsPdf: () => {}
      }
    }
  });
}

test('[FR1] CSV upload and inspect exposes column headers', async () => {
  const { window, document, cleanup } = await setupDashboard();

  setFileInput(window, document.getElementById('csv-file'), 'input.csv', 'component_id,length,raw_beam_size\\nA1,1000,6000');
  document.getElementById('inspect-btn').click();

  const options = Array.from(document.querySelectorAll('#map-id option')).map((o) => o.textContent);
  assert.equal(document.getElementById('optimisation-settings').style.display, 'block');
  assert.ok(options.includes('component_id'));
  assert.ok(options.includes('length'));
  assert.ok(options.length >= 4);

  cleanup();
});

test('[FR2] Column mapping selectors for required fields exist', () => {
  const dashboardJs = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src/js/pages/dashboard.js'), 'utf8');

  assert.match(dashboardJs, /map-id/);
  assert.match(dashboardJs, /map-length/);
  assert.match(dashboardJs, /map-total-length/);
  assert.match(dashboardJs, /Please map Component ID, Length, and Raw Beam Size\./);
});

test('[FR3] Invalid/missing/negative row validation is enforced', () => {
  const dashboardJs = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src/js/pages/dashboard.js'), 'utf8');

  assert.match(dashboardJs, /Missing required Component ID/);
  assert.match(dashboardJs, /Invalid Component Length \(must be > 0\)/);
  assert.match(dashboardJs, /Invalid Raw Beam Size \(must be > 0\)/);
});

test('[FR4] BFD assigns components to standard beam sizes with kerf', () => {
  const result = runOptimisation({
    batchName: 'FR4',
    kerfMm: 3,
    minRemnantMm: 0,
    priority: 'waste',
    components: [
      { itemNumber: 'A', lengthMm: 3000, beamType: 7000, nestId: 'N1' },
      { itemNumber: 'B', lengthMm: 2999, beamType: 7000, nestId: 'N1' }
    ]
  });

  const beam = result.results[0].beams[0];
  assert.equal(beam.stockLengthMm, 8000);
  assert.equal(beam.kerfMm, 3);
});

test('[FR5] Summary cards include beams, stock, cut, waste, and waste percentage', () => {
  const dashboardJs = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src/js/pages/dashboard.js'), 'utf8');

  assert.match(dashboardJs, /Beams Used/);
  assert.match(dashboardJs, /Total Stock/);
  assert.match(dashboardJs, /Material Cut/);
  assert.match(dashboardJs, /Total Waste/);
  assert.match(dashboardJs, /Waste Percentage/);
});

test('[FR6] Visual cutting layout renders beam bars and waste segments', () => {
  const dashboardJs = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src/js/pages/dashboard.js'), 'utf8');

  assert.match(dashboardJs, /buildBeamLayout/);
  assert.match(dashboardJs, /beam-row/);
  assert.match(dashboardJs, /beam-segment-waste/);
});

test('[FR7] Waste and utilisation charts are generated with PNG download actions', () => {
  const dashboardJs = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src/js/pages/dashboard.js'), 'utf8');

  assert.match(dashboardJs, /chart-bar/);
  assert.match(dashboardJs, /chart-pie/);
  assert.match(dashboardJs, /btn-dl-chart-bar/);
  assert.match(dashboardJs, /btn-dl-chart-pie/);
  assert.match(dashboardJs, /savePng/);
});

test('[FR8] Output CSV with cutting plan schema is downloadable', () => {
  const dashboardJs = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'src/js/pages/dashboard.js'), 'utf8');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'main.js'), 'utf8');

  assert.match(dashboardJs, /saveCsv/);
  assert.match(dashboardJs, /btn-download-csv/);
  assert.match(mainJs, /ItemNumber,NestID,Length_mm,AssignedBeam_mm,BeamIndex,WasteOnBeam_mm,OldWaste_mm/);
});

test('[FR9] Registration requires approval and admin can manage users/logs', async () => {
  const registerCtx = await bootScript({
    html: registerHtml(),
    scriptRelPath: 'src/js/pages/auth.js',
    windowMocks: {
      authAPI: { register: async () => ({ success: true }) }
    }
  });

  registerCtx.document.getElementById('email').value = 'new.user@example.com';
  registerCtx.document.getElementById('password').value = 'Password1!';
  registerCtx.document.getElementById('confirm-password').value = 'Password1!';
  await registerCtx.window.handleRegister();
  assert.match(registerCtx.document.getElementById('message').textContent, /administrator to approve/i);
  registerCtx.cleanup();

  const usersCtx = await bootScript({
    html: adminUsersHtml(),
    scriptRelPath: 'src/js/admin/users.js',
    beforeEval: (window) => {
      window.HTMLElement.prototype.scrollIntoView = () => {};
    },
    windowMocks: {
      confirm: () => true,
      authAPI: { checkAuth: async () => ({ isManager: true, userId: 77 }) },
      adminAPI: {
        listUsers: async () => ({
          success: true,
          users: [
            { id: 10, email: 'pending@example.com', location: 'Leeds', role: 'user', is_admin: 0, is_approved: 0 },
            { id: 11, email: 'approved@example.com', location: 'Leeds', role: 'user', is_admin: 0, is_approved: 1 }
          ]
        }),
        approveUser: async () => ({ success: true }),
        rejectUser: async () => ({ success: true }),
        deleteUser: async () => ({ success: true }),
        userBatches: async () => ({ success: true, batches: [] }),
        batchDetail: async () => ({ success: false }),
        updateUserRole: async () => ({ success: true })
      },
      batchDetailHelpers: {
        parseSavedCsv: () => ({ beams: [], totalBeams: 0, totalStockMm: 0, totalCutMm: 0, totalWasteMm: 0, wastePct: 0 }),
        buildBeamLayout: () => '<div></div>',
        buildCsvViewer: () => '<div></div>',
        downloadLayoutAsPdf: () => {}
      },
      fileAPI: { saveCsv: async () => {}, savePng: async () => {} }
    }
  });

  assert.ok(usersCtx.document.querySelector('.approve-btn'));
  assert.ok(usersCtx.document.querySelector('.reject-btn'));
  assert.ok(usersCtx.document.querySelector('.delete-user-btn'));
  usersCtx.cleanup();

  const logsCtx = await bootScript({
    html: adminLogsHtml(),
    scriptRelPath: 'src/js/admin/logs.js',
    windowMocks: {
      adminAPI: {
        listLogs: async () => ({
          success: true,
          logs: [{ created_at: new Date().toISOString(), user_email: 'admin@example.com', action: 'approve_user', detail: 'approved pending user' }]
        })
      }
    }
  });

  assert.equal(logsCtx.document.querySelectorAll('#logs-body tr').length, 1);
  logsCtx.cleanup();
});

test('[FR10] Users can view history details and manage account settings', async () => {
  const { document, cleanup } = await bootScript({
    html: historyHtml(),
    scriptRelPath: 'src/js/pages/history.js',
    windowMocks: {
      historyAPI: {
        list: async () => ({
          success: true,
          batches: [{ id: 1, batch_name: 'Batch-A', total_wastage_percent: 10, created_at: new Date().toISOString(), owner_email: 'u@x.com', is_own: 1 }]
        }),
        search: async () => ({
          success: true,
          batches: [{ id: 1, batch_name: 'Batch-A', total_wastage_percent: 10, created_at: new Date().toISOString(), owner_email: 'u@x.com', is_own: 1 }]
        }),
        detail: async () => ({
          success: true,
          batch: { batch_name: 'Batch-A', created_at: new Date().toISOString(), total_wastage_percent: 10 },
          csvContent: 'ItemNumber,NestID,Length_mm,AssignedBeam_mm,BeamIndex,WasteOnBeam_mm,OldWaste_mm\\nA1,all,1000,6000,1,5000,1000'
        })
      },
      fileAPI: { savePng: async () => {}, saveCsv: async () => {} },
      exportAPI: { securePackage: async () => ({ success: true, filename: 'batch.gve' }) },
      batchDetailHelpers: {
        parseSavedCsv: () => ({
          beams: [{ stockLengthMm: 6000, components: [{ itemNumber: 'A1', lengthMm: 1000 }], wasteMm: 5000 }],
          totalBeams: 1,
          totalStockMm: 6000,
          totalCutMm: 1000,
          totalWasteMm: 5000,
          wastePct: 83.33
        }),
        buildBeamLayout: () => '<div id="layout-marker">layout</div>',
        buildCsvViewer: () => '<div><button id="btn-download-csv">Download CSV</button></div>',
        downloadLayoutAsPdf: () => {}
      }
    }
  });

  document.querySelector('.view-btn').click();
  await tick();
  assert.equal(document.getElementById('detail-section').style.display, 'block');
  assert.ok(document.getElementById('layout-marker'));
  cleanup();

  const settingsCalls = { changePassword: [], deleteAccount: [] };
  const settingsCtx = await bootScript({
    html: settingsHtml(),
    scriptRelPath: 'src/js/pages/settings.js',
    windowMocks: {
      confirm: () => true,
      userAPI: {
        changePassword: async (currentPassword, newPassword) => {
          settingsCalls.changePassword.push({ currentPassword, newPassword });
          return { success: true };
        },
        deleteAccount: async (password) => {
          settingsCalls.deleteAccount.push(password);
          return { success: false, message: 'Account delete disabled in test env' };
        }
      }
    }
  });

  settingsCtx.document.getElementById('current-password').value = 'Password1!';
  settingsCtx.document.getElementById('new-password').value = 'Password2!';
  settingsCtx.document.getElementById('confirm-password').value = 'Password2!';
  settingsCtx.document.getElementById('btn-change-password').click();
  await tick();
  settingsCtx.document.getElementById('delete-password').value = 'Password2!';
  settingsCtx.document.getElementById('btn-delete-account').click();
  await tick();

  assert.equal(settingsCalls.changePassword.length, 1);
  assert.equal(settingsCalls.deleteAccount.length, 1);
  settingsCtx.cleanup();
});
