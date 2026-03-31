const test = require('node:test');
const assert = require('node:assert/strict');
const { bootScript, tick } = require('../helpers/ui-test-utils');

function registerHtml() {
  return `
  <input id="email" />
  <input id="password" />
  <input id="confirm-password" />
  <select id="location">
    <option value="">Select your location</option>
    <option value="Bristol">Bristol</option>
    <option value="Leeds">Leeds</option>
  </select>
  <p id="message"></p>
  `;
}

function historyHtml() {
  return `
  <input id="history-search" />
  <button id="history-search-btn">Search</button>
  <table id="history-table"><tbody id="history-body"></tbody></table>
  <section id="detail-section" style="display:none;"></section>
  `;
}

test('Registration requires company location', async () => {
  let calls = 0;
  const { window, document, cleanup } = await bootScript({
    html: registerHtml(),
    scriptRelPath: 'src/js/pages/auth.js',
    windowMocks: {
      authAPI: {
        register: async () => {
          calls += 1;
          return { success: true };
        }
      }
    }
  });

  document.getElementById('email').value = 'new.user@grantvessels.com';
  document.getElementById('password').value = 'Password1!';
  document.getElementById('confirm-password').value = 'Password1!';
  document.getElementById('location').value = '';

  await window.handleRegister();

  assert.equal(calls, 0);
  assert.match(document.getElementById('message').textContent, /select your company location/i);
  cleanup();
});

test('Registration sends selected company location', async () => {
  let received = null;
  const { window, document, cleanup } = await bootScript({
    html: registerHtml(),
    scriptRelPath: 'src/js/pages/auth.js',
    windowMocks: {
      authAPI: {
        register: async (email, password, location) => {
          received = { email, password, location };
          return { success: true };
        }
      }
    }
  });

  document.getElementById('email').value = 'new.user@grantvessels.com';
  document.getElementById('password').value = 'Password1!';
  document.getElementById('confirm-password').value = 'Password1!';
  document.getElementById('location').value = 'Leeds';

  await window.handleRegister();

  assert.deepEqual(received, {
    email: 'new.user@grantvessels.com',
    password: 'Password1!',
    location: 'Leeds'
  });
  assert.match(document.getElementById('message').textContent, /registration successful/i);
  cleanup();
});

test('History table includes same-location colleague batches', async () => {
  const now = new Date().toISOString();
  const { document, cleanup } = await bootScript({
    html: historyHtml(),
    scriptRelPath: 'src/js/pages/history.js',
    windowMocks: {
      historyAPI: {
        list: async () => ({
          success: true,
          batches: [
            { id: 1, batch_name: 'Own Batch', owner_email: 'me@grantvessels.com', is_own: 1, total_wastage_percent: 10.5, created_at: now },
            { id: 2, batch_name: 'Colleague Batch', owner_email: 'teammate@grantvessels.com', is_own: 0, total_wastage_percent: 12.1, created_at: now }
          ]
        }),
        search: async () => ({ success: true, batches: [] }),
        detail: async () => ({ success: false })
      }
    }
  });

  await tick();

  const rows = document.querySelectorAll('#history-body tr');
  assert.equal(rows.length, 2);
  assert.match(rows[0].children[1].textContent, /me@grantvessels.com \(You\)/i);
  assert.match(rows[1].children[1].textContent, /teammate@grantvessels.com/i);
  cleanup();
});
