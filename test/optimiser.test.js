const { pickStockLength, pickLargestStockLength, packBestFitDecreasing, packFirstFitDecreasing, runOptimisation } = require('../src/js/core/optimiser.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) { passed++; console.log(`  PASS: ${message}`); }
    else { failed++; console.error(`  FAIL: ${message}`); }
}

function assertThrows(fn, message) {
    try { fn(); failed++; console.error(`  FAIL: ${message} (did not throw)`); }
    catch (e) { passed++; console.log(`  PASS: ${message}`); }
}

// --- pickStockLength tests ---
console.log('\npickStockLength:');
assert(pickStockLength([6000, 12000], 5000) === 6000, 'picks smallest fitting stock');
assert(pickStockLength([6000, 12000], 6000) === 6000, 'exact fit returns that length');
assert(pickStockLength([6000, 12000], 7000) === 12000, 'picks next size when first is too small');
assertThrows(() => pickStockLength([6000, 12000], 13000), 'throws when nothing fits');

// --- pickLargestStockLength tests ---
console.log('\npickLargestStockLength:');
assert(pickLargestStockLength([3000, 6000, 12000], 2000) === 12000, 'picks largest fitting stock');
assert(pickLargestStockLength([3000, 6000, 12000], 7000) === 12000, 'picks largest when smaller dont fit');
assert(pickLargestStockLength([3000, 6000], 5000) === 6000, 'picks only option that fits');
assertThrows(() => pickLargestStockLength([3000, 6000], 7000), 'throws when nothing fits');

// --- packBestFitDecreasing tests ---
console.log('\npackBestFitDecreasing (min waste):');
{
    const components = [{ itemNumber: 'A1', lengthMm: 3000, nestId: '1' }];
    const beams = packBestFitDecreasing(components, [6000], 3);
    assert(beams.length === 1, 'single component -> 1 beam');
    assert(beams[0].usedMm === 3003, 'used includes kerf');
    assert(beams[0].wasteMm === 2997, 'waste = 6000 - 3003');
}
{
    const components = [
        { itemNumber: 'A1', lengthMm: 4000, nestId: '1' },
        { itemNumber: 'A2', lengthMm: 3000, nestId: '1' },
        { itemNumber: 'A3', lengthMm: 1500, nestId: '1' }
    ];
    const beams = packBestFitDecreasing(components, [6000], 0);
    assert(beams.length === 2, 'BFD: 2 beams');
    assert(beams[0].components.length === 2, 'BFD: first beam gets 2 (best fit packs A3 with A1)');
}

// --- packFirstFitDecreasing tests ---
console.log('\npackFirstFitDecreasing (speed):');
{
    const components = [{ itemNumber: 'A1', lengthMm: 3000, nestId: '1' }];
    const beams = packFirstFitDecreasing(components, [6000, 12000], 3);
    assert(beams.length === 1, 'single component -> 1 beam');
    assert(beams[0].stockLengthMm === 12000, 'FFD picks LARGEST stock (12000)');
}
{
    const components = [
        { itemNumber: 'A1', lengthMm: 4000, nestId: '1' },
        { itemNumber: 'A2', lengthMm: 3000, nestId: '1' },
        { itemNumber: 'A3', lengthMm: 1500, nestId: '1' }
    ];
    const beams = packFirstFitDecreasing(components, [6000, 12000], 0);
    // FFD with 12000mm beams: A1(4000) -> beam1, A2(3000) fits in beam1, A3(1500) fits in beam1
    assert(beams.length === 1, 'FFD: all fit in 1 large beam');
    assert(beams[0].stockLengthMm === 12000, 'FFD uses largest stock');
}

// --- BFD vs FFD produce different results ---
console.log('\nBFD vs FFD comparison:');
{
    const components = [
        { itemNumber: 'A1', lengthMm: 5500, nestId: '1' },
        { itemNumber: 'A2', lengthMm: 5500, nestId: '1' },
        { itemNumber: 'A3', lengthMm: 2000, nestId: '1' }
    ];
    const bfd = packBestFitDecreasing(components, [6000, 12000], 0);
    const ffd = packFirstFitDecreasing(components, [6000, 12000], 0);

    // BFD: picks smallest stock -> 6000 for each 5500 component, 6000 for 2000
    // or fits 5500+2000 into a 12000? No, BFD picks smallest: 5500 fits in 6000.
    // Then 2000 tries to fit: beam0 has 500 remaining (6000-5500=500), doesn't fit.
    // beam1 has 500 remaining, doesn't fit. New beam: 6000.
    // BFD: 3 beams of 6000
    assert(bfd.length === 3, 'BFD: 3 beams (small stock)');
    assert(bfd[0].stockLengthMm === 6000, 'BFD: uses 6000mm stock');

    // FFD: picks largest stock -> 12000 for first 5500, second 5500 fits (11000 used), 2000 doesn't fit (13000>12000) -> new beam
    assert(ffd.length === 2, 'FFD: 2 beams (large stock, fewer than BFD)');
    assert(ffd[0].stockLengthMm === 12000, 'FFD: uses 12000mm stock');

    // FFD has more waste but fewer beams
    const bfdWaste = bfd.reduce((s, b) => s + b.wasteMm, 0);
    const ffdWaste = ffd.reduce((s, b) => s + b.wasteMm, 0);
    assert(bfdWaste < ffdWaste, 'BFD produces less waste than FFD');
    assert(bfd.length > ffd.length, 'FFD uses fewer beams than BFD');
}

// --- runOptimisation with priority ---
console.log('\nrunOptimisation with priority:');
{
    const comps = [
        { itemNumber: 'A1', lengthMm: 5500, nestId: '1', beamType: 6000 },
        { itemNumber: 'A2', lengthMm: 5500, nestId: '1', beamType: 12000 }
    ];

    const rWaste = runOptimisation({ batchName: 'W', components: comps, kerfMm: 0, minRemnantMm: 0, priority: 'waste' });
    const rSpeed = runOptimisation({ batchName: 'S', components: comps, kerfMm: 0, minRemnantMm: 0, priority: 'speed' });

    assert(rWaste.solver.includes('Best-Fit'), 'waste mode uses BFD');
    assert(rSpeed.solver.includes('First-Fit'), 'speed mode uses FFD');
    assert(rWaste.grandTotalBeams >= rSpeed.grandTotalBeams, 'speed mode uses <= beams');
    assert(rWaste.grandWastePct <= rSpeed.grandWastePct || rWaste.grandTotalBeams > rSpeed.grandTotalBeams, 'trade-off: waste vs beams');
}

// --- Case study beam sizes (6000, 8000, 13000) ---
console.log('\nCase study beam sizes:');
{
    const components = [
        { itemNumber: 'C1', lengthMm: 7500, nestId: '1', beamType: 8000 },
        { itemNumber: 'C2', lengthMm: 5000, nestId: '1', beamType: 6000 },
        { itemNumber: 'C3', lengthMm: 12000, nestId: '1', beamType: 13000 }
    ];
    const result = runOptimisation({ batchName: 'CaseStudy', components, kerfMm: 3, minRemnantMm: 500, priority: 'waste' });
    assert(result.results.length === 1, 'single nest group');
    assert(result.grandTotalBeams === 3, '3 beams for 3 components of different sizes');
    assert(result.grandWastePct < 20, 'waste under 20% with correct beam sizes');
}
{
    // Default fallback should use 6000, 8000, 13000 per case study
    const components = [
        { itemNumber: 'D1', lengthMm: 7000, nestId: '1' },
        { itemNumber: 'D2', lengthMm: 5000, nestId: '1' }
    ];
    const bfd = packBestFitDecreasing(components, [6000, 8000, 13000], 0);
    assert(bfd[0].stockLengthMm === 8000, 'BFD picks 8000 for 7000mm component (case study sizes)');
    assert(bfd[1].stockLengthMm === 6000, 'BFD picks 6000 for 5000mm component');
}

// --- Edge cases ---
console.log('\nEdge cases:');
{
    const result = runOptimisation({ batchName: 'Empty', components: [], kerfMm: 3, minRemnantMm: 500 });
    assert(result.results.length === 0, 'empty input -> no results');
    assert(result.grandWastePct === 0, '0% waste for empty');
}
{
    const result = runOptimisation({
        batchName: 'Check', components: [{ itemNumber: 'W1', lengthMm: 3000, nestId: 'n1', beamType: 6000 }],
        kerfMm: 0, minRemnantMm: 500
    });
    assert(Math.abs(result.grandWastePct - 50) < 0.01, '50% waste for half-used beam');
}

console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
process.exit(failed > 0 ? 1 : 0);
