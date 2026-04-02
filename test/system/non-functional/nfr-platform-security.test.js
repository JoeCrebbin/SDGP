const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..', '..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

test('[NFR Source Contract] Electron desktop build targets include Windows, macOS, and Linux', () => {
  const pkg = JSON.parse(read('package.json'));

  assert.equal(pkg.main, 'main.js');
  assert.match(pkg.scripts.start, /^electron\s+\./);
  assert.ok(pkg.build);
  assert.ok(pkg.build.win, 'Windows target should be configured');
  assert.ok(pkg.build.mac, 'macOS target should be configured');
  assert.ok(pkg.build.linux, 'Linux target should be configured');
});

test('[NFR Source Contract] Passwords are hashed using bcrypt with 10 salt rounds', () => {
  const mainJs = read('main.js');

  assert.match(mainJs, /bcrypt\.hash\(password,\s*10\)/);
  assert.match(mainJs, /bcrypt\.hash\(newPassword,\s*10\)/);
});

test('[NFR Source Contract] User-supplied strings are HTML-escaped before DOM insertion', () => {
  const targets = [
    'src/js/pages/dashboard.js',
    'src/js/pages/history.js',
    'src/js/admin/users.js',
    'src/js/admin/logs.js',
    'src/js/admin/batches.js',
    'src/js/components/batch-detail.js'
  ];

  for (const file of targets) {
    const content = read(file);
    assert.match(content, /function escapeHtml\(str\)/, `${file} should define escapeHtml`);
    assert.match(content, /\$\{escapeHtml\(/, `${file} should use escapeHtml in template insertion`);
  }
});

test('[NFR Source Contract] Optimisation runs in a worker thread', () => {
  const mainJs = read('main.js');
  const workerJs = read('src/js/core/optimiser_worker.js');

  assert.match(mainJs, /const\s*\{\s*Worker\s*\}\s*=\s*require\('worker_threads'\)/);
  assert.match(mainJs, /new\s+Worker\(/);
  assert.match(mainJs, /optimiser_worker\.js/);
  assert.match(workerJs, /parentPort/);
  assert.match(workerJs, /workerData/);
  assert.match(workerJs, /runOptimisation\(workerData\)/);
});
