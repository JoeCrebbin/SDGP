const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { bootScript, tick } = require('../../helpers/ui-test-utils');
const { runOptimisation } = require('../../../src/js/core/optimiser.js');

const repoRoot = path.join(__dirname, '..', '..', '..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

test('[NFR Source Contract] CSS variables provide consistent colour, spacing, and typography tokens across pages', () => {
  const styles = read('src/css/styles.css');
  const htmlDir = path.join(repoRoot, 'src/html');
  const htmlFiles = fs.readdirSync(htmlDir).filter((name) => name.endsWith('.html'));

  assert.match(styles, /:root\s*\{/);
  assert.match(styles, /--bg:/);
  assert.match(styles, /--fg:/);
  assert.match(styles, /--accent:/);
  assert.match(styles, /--space-4:/);
  assert.match(styles, /--font-family-base:/);
  assert.match(styles, /font-family:\s*var\(--font-family-base\)/);

  for (const htmlFile of htmlFiles) {
    const html = fs.readFileSync(path.join(htmlDir, htmlFile), 'utf8');
    assert.match(html, /\.\.\/css\/styles\.css/, `${htmlFile} should include shared styles.css`);
  }
});

test('[NFR Performance] Handles at least 50,000 CSV rows without crash or excessive delay', () => {
  const rowCount = 50000;
  const components = Array.from({ length: rowCount }, (_, i) => ({
    itemNumber: `C-${i}`,
    lengthMm: 1000 + (i % 7),
    beamType: 6000,
    nestId: 'N1'
  }));

  const start = Date.now();
  const result = runOptimisation({
    batchName: 'nfr-50k',
    components,
    kerfMm: 3,
    minRemnantMm: 500,
    priority: 'waste'
  });
  const durationMs = Date.now() - start;

  assert.ok(result.grandTotalBeams > 0);
  assert.ok(result.results[0].beams.length > 0);
  assert.ok(durationMs < 10000, `Expected under 10s for 50k rows, got ${durationMs}ms`);
});

test('[NFR System UI] High-contrast mode toggle updates UI state and persistence', async () => {
  const { document, window, cleanup } = await bootScript({
    html: '<div id="sidenav-container"></div>',
    scriptRelPath: 'src/js/components/sidenav.js',
    windowMocks: {
      authAPI: {
        checkAuth: async () => ({ authenticated: true, isAdmin: false }),
        logout: async () => ({ success: true })
      }
    },
    beforeEval: (win) => {
      win.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
    }
  });

  const btn = document.getElementById('contrast-toggle-btn');
  assert.ok(btn);
  assert.equal(btn.textContent, 'Off');
  assert.equal(btn.getAttribute('aria-pressed'), 'false');

  btn.click();
  await tick();

  assert.ok(document.documentElement.classList.contains('high-contrast'));
  assert.equal(btn.textContent, 'On');
  assert.equal(btn.getAttribute('aria-pressed'), 'true');
  assert.equal(window.localStorage.getItem('highContrast'), 'true');

  cleanup();
});

test('[NFR System UI] Admin role changes require password verification', async () => {
  const updateCalls = [];
  const { document, cleanup } = await bootScript({
    html: `
      <table><tbody id="pending-body"></tbody></table>
      <table><tbody id="users-body"></tbody></table>
      <p id="admin-message"></p>
      <h3 id="all-users-title"></h3>
      <section id="user-batches-section" style="display:none;"><table><tbody id="user-batches-body"></tbody></table></section>
      <h3 id="user-batches-title"></h3>
      <button id="close-user-batches">Close</button>
      <section id="batch-detail-section" style="display:none;"></section>
    `,
    scriptRelPath: 'src/js/admin/users.js',
    beforeEval: (win) => {
      win.HTMLElement.prototype.scrollIntoView = () => {};
    },
    windowMocks: {
      authAPI: { checkAuth: async () => ({ isManager: true, userId: 77 }) },
      confirm: () => true,
      adminAPI: {
        listUsers: async () => ({
          success: true,
          users: [{ id: 10, email: 'worker@example.com', location: 'Leeds', role: 'user', is_admin: 0, is_approved: 1 }]
        }),
        approveUser: async () => ({ success: true }),
        rejectUser: async () => ({ success: true }),
        deleteUser: async () => ({ success: true }),
        userBatches: async () => ({ success: true, batches: [] }),
        batchDetail: async () => ({ success: false }),
        updateUserRole: async (userId, role, actingPassword) => {
          updateCalls.push([userId, role, actingPassword]);
          return { success: true };
        }
      },
      batchDetailHelpers: {
        parseSavedCsv: () => ({ beams: [], totalBeams: 0, totalStockMm: 0, totalCutMm: 0, totalWasteMm: 0, wastePct: 0 }),
        buildBeamLayout: () => '<div></div>',
        buildCsvViewer: () => '<div></div>',
        downloadLayoutAsPdf: () => {}
      },
      fileAPI: {
        saveCsv: async () => {},
        savePng: async () => {}
      }
    }
  });

  const roleSelect = document.querySelector('.role-select');
  roleSelect.value = 'manager';

  document.querySelector('.update-role-btn').click();
  await tick();
  document.getElementById('role-verify-confirm').click();
  await tick();

  assert.equal(updateCalls.length, 0);
  assert.match(document.getElementById('admin-message').textContent, /password confirmation required/i);

  document.querySelector('.update-role-btn').click();
  await tick();
  document.getElementById('role-verify-password').value = 'Password1!';
  document.getElementById('role-verify-confirm').click();
  await tick();

  assert.deepEqual(updateCalls[0], [10, 'manager', 'Password1!']);

  cleanup();
});
