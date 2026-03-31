const test = require('node:test');
const assert = require('node:assert/strict');

const { runOptimisation } = require('../src/js/core/optimiser.js');
const { buildEncryptedExport, decryptEncryptedExport } = require('../src/js/core/secure_export.js');
const { ALGORITHM_VERSION, PERF_TARGETS_MS_P95, bucketByRows } = require('../src/js/core/nfr_contracts.js');

test('deterministic optimisation output for identical input', () => {
  const input = {
    batchName: 'deterministic',
    kerfMm: 3,
    minRemnantMm: 500,
    priority: 'waste',
    components: [
      { itemNumber: 'A-1', lengthMm: 2000, beamType: 6000, nestId: 'N1' },
      { itemNumber: 'A-2', lengthMm: 1500, beamType: 6000, nestId: 'N1' },
      { itemNumber: 'A-3', lengthMm: 1500, beamType: 6000, nestId: 'N1' },
      { itemNumber: 'B-1', lengthMm: 1200, beamType: 8000, nestId: 'N2' }
    ]
  };

  const r1 = runOptimisation(input);
  const r2 = runOptimisation(input);
  assert.deepEqual(r1, r2);
});

test('priority mode changes selected solver', () => {
  const base = {
    batchName: 'priority-check',
    kerfMm: 3,
    minRemnantMm: 500,
    components: [
      { itemNumber: 'A', lengthMm: 2500, beamType: 6000, nestId: 'N1' },
      { itemNumber: 'B', lengthMm: 2490, beamType: 6000, nestId: 'N1' },
      { itemNumber: 'C', lengthMm: 1200, beamType: 6000, nestId: 'N1' }
    ]
  };

  const waste = runOptimisation({ ...base, priority: 'waste' });
  const speed = runOptimisation({ ...base, priority: 'speed' });

  assert.equal(waste.priority, 'waste');
  assert.equal(speed.priority, 'speed');
  assert.notEqual(waste.solver, speed.solver);
});

test('secure export roundtrip works and wrong password fails', () => {
  const payload = {
    batchName: 'secure',
    cleanedCsv: 'ItemNumber,Length\nA,1000',
    optimisationSummary: { wastePct: 12.5 }
  };

  const encrypted = buildEncryptedExport(payload, 'correct horse battery staple');
  const decrypted = decryptEncryptedExport(encrypted, 'correct horse battery staple');
  assert.deepEqual(decrypted, payload);

  assert.throws(() => {
    decryptEncryptedExport(encrypted, 'wrong-password');
  });
});

test('performance targets and buckets are defined', () => {
  assert.equal(typeof ALGORITHM_VERSION, 'string');
  assert.ok(PERF_TARGETS_MS_P95.validation.small > 0);
  assert.equal(bucketByRows(100), 'small');
  assert.equal(bucketByRows(1000), 'medium');
  assert.equal(bucketByRows(10000), 'large');
});
