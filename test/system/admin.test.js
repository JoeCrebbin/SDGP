const test = require('node:test');
const assert = require('node:assert/strict');
const { bootScript, tick } = require('../helpers/ui-test-utils');

function adminUsersHtml() {
  return `
  <table><thead><tr><th>Email</th><th>Location</th><th>Role</th><th>Actions</th></tr></thead><tbody id="pending-body"></tbody></table>
  <table><thead><tr><th>ID</th><th>Email</th><th>Location</th><th>Role</th><th>Status</th><th>Actions</th><th>Role Management</th></tr></thead><tbody id="users-body"></tbody></table>
  <p id="admin-message"></p>
  <h3 id="all-users-title"></h3>
  <section id="user-batches-section" style="display:none;"><tbody id="user-batches-body"></tbody></section>
  <h3 id="user-batches-title"></h3>
  <button id="close-user-batches">Close</button>
  <section id="batch-detail-section" style="display:none;"></section>
  `;
}

function adminLogsHtml() {
  return `<input id="log-search" /><button id="log-search-btn">Search</button><table><tbody id="logs-body"></tbody></table>`;
}

function adminSettingsHtml() {
  return `
  <input id="setting-kerf" />
  <input id="setting-remnant" />
  <input id="setting-max-beams" />
  <button id="save-settings-btn">Save</button>
  <p id="settings-message"></p>
  `;
}

function adminBatchesHtml() {
  return `
  <div id="batches-table" style="display:table;"><input id="batch-search" /><button id="batch-search-btn">Search</button><table><tbody id="batches-body"></tbody></table></div>
  <section id="batch-detail-section" style="display:none;"></section>
  `;
}

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

test('List Pending Users', async () => {
  const { document, cleanup } = await bootScript({
    html: adminUsersHtml(),
    scriptRelPath: 'src/js/admin/users.js',
    windowMocks: {
      authAPI: { checkAuth: async () => ({ isManager: true }) },
      adminAPI: {
        listUsers: async () => ({
          success: true,
          users: [
            { id: 1, email: 'pending@example.com', location: 'Leeds', role: 'user', is_admin: 0, is_approved: 0 },
            { id: 2, email: 'approved@example.com', location: 'London', role: 'user', is_admin: 0, is_approved: 1 }
          ]
        }),
        approveUser: async () => ({ success: true }),
        rejectUser: async () => ({ success: true }),
        deleteUser: async () => ({ success: true }),
        userBatches: async () => ({ success: true, batches: [] }),
        batchDetail: async () => ({ success: false }),
        updateUserRole: async () => ({ success: true })
      }
    }
  });

  assert.equal(document.querySelectorAll('#pending-body tr').length, 1);
  assert.match(document.querySelector('#pending-body tr td:nth-child(2)').textContent, /Leeds/i);
  cleanup();
});

test('All Users Table Shows Location', async () => {
  const { document, cleanup } = await bootScript({
    html: adminUsersHtml(),
    scriptRelPath: 'src/js/admin/users.js',
    windowMocks: {
      authAPI: { checkAuth: async () => ({ isManager: true, userId: 99 }) },
      adminAPI: {
        listUsers: async () => ({
          success: true,
          users: [
            { id: 11, email: 'worker@example.com', location: 'Bristol', role: 'user', is_admin: 0, is_approved: 1 }
          ]
        }),
        approveUser: async () => ({ success: true }),
        rejectUser: async () => ({ success: true }),
        deleteUser: async () => ({ success: true }),
        userBatches: async () => ({ success: true, batches: [] }),
        batchDetail: async () => ({ success: false }),
        updateUserRole: async () => ({ success: true })
      }
    }
  });

  const userRow = document.querySelector('#users-body tr');
  assert.ok(userRow);
  assert.match(userRow.children[2].textContent, /Bristol/i);
  cleanup();
});

test('Approve User', async () => {
  const calls = [];
  const { document, cleanup } = await bootScript({
    html: adminUsersHtml(),
    scriptRelPath: 'src/js/admin/users.js',
    windowMocks: {
      confirm: () => true,
      authAPI: { checkAuth: async () => ({ isManager: true }) },
      adminAPI: {
        listUsers: async () => ({ success: true, users: [{ id: 3, email: 'p@example.com', location: 'Leeds', role: 'user', is_admin: 0, is_approved: 0 }] }),
        approveUser: async (id, role, actingPassword) => {
          calls.push([id, role, actingPassword]);
          return { success: true };
        },
        rejectUser: async () => ({ success: true }),
        deleteUser: async () => ({ success: true }),
        userBatches: async () => ({ success: true, batches: [] }),
        batchDetail: async () => ({ success: false }),
        updateUserRole: async () => ({ success: true })
      }
    }
  });

  document.querySelector('.pending-role-select').value = 'admin';
  document.querySelector('.approve-btn').click();
  document.getElementById('role-verify-password').value = 'Password1!';
  document.getElementById('role-verify-confirm').click();
  await tick();

  assert.deepEqual(calls[0], [3, 'admin', 'Password1!']);
  cleanup();
});

test('Reject User', async () => {
  const calls = [];
  const { document, cleanup } = await bootScript({
    html: adminUsersHtml(),
    scriptRelPath: 'src/js/admin/users.js',
    windowMocks: {
      confirm: () => true,
      authAPI: { checkAuth: async () => ({ isManager: true }) },
      adminAPI: {
        listUsers: async () => ({ success: true, users: [{ id: 4, email: 'p@example.com', role: 'user', is_admin: 0, is_approved: 0 }] }),
        approveUser: async () => ({ success: true }),
        rejectUser: async (id) => {
          calls.push(id);
          return { success: true };
        },
        deleteUser: async () => ({ success: true }),
        userBatches: async () => ({ success: true, batches: [] }),
        batchDetail: async () => ({ success: false }),
        updateUserRole: async () => ({ success: true })
      }
    }
  });

  document.querySelector('.reject-btn').click();
  await tick();
  assert.equal(calls[0], 4);
  cleanup();
});

test('Delete User', async () => {
  const calls = [];
  const { document, cleanup } = await bootScript({
    html: adminUsersHtml(),
    scriptRelPath: 'src/js/admin/users.js',
    windowMocks: {
      confirm: () => true,
      authAPI: { checkAuth: async () => ({ isManager: true }) },
      adminAPI: {
        listUsers: async () => ({ success: true, users: [{ id: 5, email: 'u@example.com', role: 'user', is_admin: 0, is_approved: 1 }] }),
        approveUser: async () => ({ success: true }),
        rejectUser: async () => ({ success: true }),
        deleteUser: async (id) => {
          calls.push(id);
          return { success: true };
        },
        userBatches: async () => ({ success: true, batches: [] }),
        batchDetail: async () => ({ success: false }),
        updateUserRole: async () => ({ success: true })
      }
    }
  });

  document.querySelector('.delete-user-btn').click();
  await tick();
  assert.equal(calls[0], 5);
  cleanup();
});

test('Admin Logs Load', async () => {
  const { document, cleanup } = await bootScript({
    html: adminLogsHtml(),
    scriptRelPath: 'src/js/admin/logs.js',
    windowMocks: {
      adminAPI: {
        listLogs: async () => ({ success: true, logs: [{ created_at: new Date().toISOString(), user_email: 'a@b.com', action: 'login', detail: 'ok' }] })
      }
    }
  });

  assert.equal(document.querySelectorAll('#logs-body tr').length, 1);
  cleanup();
});

test('Admin Logs Search', async () => {
  const calls = [];
  const { document, cleanup } = await bootScript({
    html: adminLogsHtml(),
    scriptRelPath: 'src/js/admin/logs.js',
    windowMocks: {
      adminAPI: {
        listLogs: async (search) => {
          calls.push(search);
          return { success: true, logs: [] };
        }
      }
    }
  });

  document.getElementById('log-search').value = 'approve_user';
  document.getElementById('log-search-btn').click();
  await tick();
  assert.equal(calls[calls.length - 1], 'approve_user');
  cleanup();
});

test('Global Settings Load', async () => {
  const { document, cleanup } = await bootScript({
    html: adminSettingsHtml(),
    scriptRelPath: 'src/js/admin/settings.js',
    windowMocks: {
      adminAPI: {
        getSettings: async () => ({ success: true, settings: { default_kerf_mm: '3.5', default_min_remnant_mm: '600', max_beams_display: '40' } }),
        updateSettings: async () => ({ success: true })
      }
    }
  });

  assert.equal(document.getElementById('setting-kerf').value, '3.5');
  assert.equal(document.getElementById('setting-remnant').value, '600');
  assert.equal(document.getElementById('setting-max-beams').value, '40');
  cleanup();
});

test('Update Global Settings', async () => {
  const calls = [];
  const { document, cleanup } = await bootScript({
    html: adminSettingsHtml(),
    scriptRelPath: 'src/js/admin/settings.js',
    windowMocks: {
      adminAPI: {
        getSettings: async () => ({ success: true, settings: {} }),
        updateSettings: async (payload) => {
          calls.push(payload);
          return { success: true };
        }
      }
    }
  });

  document.getElementById('setting-kerf').value = '4';
  document.getElementById('setting-remnant').value = '600';
  document.getElementById('setting-max-beams').value = '60';
  document.getElementById('save-settings-btn').click();
  await tick();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].default_kerf_mm, '4');
  cleanup();
});

test('Settings Reflected on Dashboard', async () => {
  const { document, cleanup } = await bootScript({
    html: dashboardHtml(),
    scriptRelPath: 'src/js/pages/dashboard.js',
    windowMocks: {
      settingsAPI: {
        getDefaults: async () => ({ success: true, settings: { default_kerf_mm: '4.2', default_min_remnant_mm: '650' } })
      },
      optimiseAPI: { run: async () => ({ success: false }) },
      fileAPI: { savePng: async () => {}, saveCsv: async () => {} },
      batchDetailHelpers: {
        buildCsvViewer: () => '<div></div>',
        downloadLayoutAsPdf: () => {}
      }
    }
  });

  await tick();
  assert.equal(document.getElementById('kerf').value, '4.2');
  assert.equal(document.getElementById('min-remnant').value, '650');
  cleanup();
});

test('List All Batches', async () => {
  const { document, cleanup } = await bootScript({
    html: adminBatchesHtml(),
    scriptRelPath: 'src/js/admin/batches.js',
    windowMocks: {
      adminAPI: {
        listAllBatches: async () => ({
          success: true,
          batches: [{ id: 1, batch_name: 'A', user_email: 'u@x.com', total_wastage_percent: 10, created_at: new Date().toISOString() }]
        }),
        batchDetail: async () => ({ success: false })
      },
      batchDetailHelpers: {
        parseSavedCsv: () => ({ beams: [], totalBeams: 0, totalStockMm: 0, totalCutMm: 0, totalWasteMm: 0, wastePct: 0 }),
        buildBeamLayout: () => '<div></div>',
        downloadLayoutAsPdf: () => {},
        buildCsvViewer: () => '<div><button id="btn-download-csv"></button></div>'
      },
      fileAPI: { saveCsv: async () => {}, savePng: async () => {} }
    }
  });

  assert.equal(document.querySelectorAll('#batches-body tr').length, 1);
  cleanup();
});

test('Search All Batches', async () => {
  const calls = [];
  const { document, cleanup } = await bootScript({
    html: adminBatchesHtml(),
    scriptRelPath: 'src/js/admin/batches.js',
    windowMocks: {
      adminAPI: {
        listAllBatches: async (q) => {
          calls.push(q);
          return { success: true, batches: [] };
        },
        batchDetail: async () => ({ success: false })
      },
      batchDetailHelpers: {
        parseSavedCsv: () => ({ beams: [], totalBeams: 0, totalStockMm: 0, totalCutMm: 0, totalWasteMm: 0, wastePct: 0 }),
        buildBeamLayout: () => '<div></div>',
        downloadLayoutAsPdf: () => {},
        buildCsvViewer: () => '<div></div>'
      },
      fileAPI: { saveCsv: async () => {}, savePng: async () => {} }
    }
  });

  document.getElementById('batch-search').value = 'Hull_A';
  document.getElementById('batch-search-btn').click();
  await tick();
  assert.equal(calls[calls.length - 1], 'Hull_A');
  cleanup();
});

test('View Batch Detail as Admin', async () => {
  const detailCalls = [];
  const { document, cleanup } = await bootScript({
    html: adminBatchesHtml(),
    scriptRelPath: 'src/js/admin/batches.js',
    windowMocks: {
      adminAPI: {
        listAllBatches: async () => ({
          success: true,
          batches: [{ id: 99, batch_name: 'A', user_email: 'u@x.com', total_wastage_percent: 10, created_at: new Date().toISOString() }]
        }),
        batchDetail: async (id) => {
          detailCalls.push(id);
          return {
            success: true,
            batch: { batch_name: 'A', created_at: new Date().toISOString(), total_wastage_percent: 10 },
            csvContent: 'ItemNumber,BeamIndex,AssignedBeam_mm,WasteOnBeam_mm,Length_mm\\nA1,1,6000,5000,1000'
          };
        }
      },
      batchDetailHelpers: {
        parseSavedCsv: () => ({ beams: [], totalBeams: 1, totalStockMm: 6000, totalCutMm: 1000, totalWasteMm: 5000, wastePct: 83.33 }),
        buildBeamLayout: () => '<div></div>',
        downloadLayoutAsPdf: () => {},
        buildCsvViewer: () => '<div><button id="btn-download-csv"></button></div>'
      },
      fileAPI: { saveCsv: async () => {}, savePng: async () => {} }
    }
  });

  document.querySelector('.view-btn').click();
  await tick();

  assert.equal(detailCalls[0], 99);
  assert.equal(document.getElementById('batch-detail-section').style.display, 'block');
  cleanup();
});

test('Unauthorized Admin IPC Attempt', async () => {
  const { document, cleanup } = await bootScript({
    html: adminLogsHtml(),
    scriptRelPath: 'src/js/admin/logs.js',
    windowMocks: {
      adminAPI: {
        listLogs: async () => ({ success: false, message: 'Unauthorized' })
      }
    }
  });

  assert.match(document.getElementById('logs-body').textContent, /Failed to load logs/i);
  cleanup();
});
