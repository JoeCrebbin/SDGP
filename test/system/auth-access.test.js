const test = require('node:test');
const assert = require('node:assert/strict');
const { bootScript, tick } = require('../helpers/ui-test-utils');

function loginHtml() {
  return `<input id="email" /><input id="password" /><p id="message"></p>`;
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

test('Admin Login Success', async () => {
  const { window, document, cleanup } = await bootScript({
    html: loginHtml(),
    scriptRelPath: 'src/js/pages/auth.js',
    windowMocks: {
      authAPI: {
        login: async () => ({ success: true })
      }
    }
  });

  document.getElementById('email').value = 'admin@grantvessels.com';
  document.getElementById('password').value = 'Password1!';
  await window.handleLogin();
  assert.match(document.getElementById('message').textContent, /Login successful/i);
  cleanup();
});

test('Non-Admin Access Block', async () => {
  const { window, cleanup } = await bootScript({
    html: '<div id="sidenav-container"></div>',
    scriptRelPath: 'src/js/components/sidenav.js',
    windowMocks: {
      authAPI: { checkAuth: async () => ({ authenticated: false }) }
    }
  });

  assert.match(window.location.href, /index\.html$/);
  cleanup();
});

test('Prevent Admin Self-Deletion via User Flow', async () => {
  const { document, cleanup } = await bootScript({
    html: settingsHtml(),
    scriptRelPath: 'src/js/pages/settings.js',
    windowMocks: {
      confirm: () => true,
      userAPI: {
        changePassword: async () => ({ success: true }),
        deleteAccount: async () => ({ success: false, message: 'Admin or manager accounts cannot be deleted this way' })
      }
    }
  });

  document.getElementById('delete-password').value = 'Password1!';
  document.getElementById('btn-delete-account').click();
  await tick();

  assert.match(document.getElementById('delete-message').textContent, /cannot be deleted/i);
  cleanup();
});
