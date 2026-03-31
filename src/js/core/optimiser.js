/*
 * optimiser.js - Cutting Stock Optimisation Algorithms
 *
 * This is the core algorithm file that solves the 1D cutting stock problem.
 * Given a list of component lengths that need to be cut, and available beam
 * stock lengths, it figures out the best way to arrange cuts on beams to
 * minimise waste (or minimise the number of beams used).
 *
 * Two strategies are implemented:
 *   - Best-Fit Decreasing (BFD): for each component, searches ALL existing beams
 *     and picks the one with the LEAST remaining space (tightest fit).
 *     This careful placement minimises leftover waste.
 *   - First-Fit Decreasing (FFD): for each component, takes the FIRST beam that
 *     fits without searching further. Faster to compute, slightly more waste.
 *
 * Both algorithms:
 *   - Sort components largest-first (decreasing order) before packing
 *   - Use the largest available stock length when opening new beams
 *   - Account for kerf (saw blade width) on each cut
 */

/**
 * Pick the SMALLEST stock length that can fit the required length.
 * Used by BFD to minimise leftover material on each beam.
 *
 * @param {number[]} stockLengths - Available beam lengths (e.g. [6000, 8000, 13000])
 * @param {number} requiredMm - The minimum length needed (component + kerf)
 * @returns {number} The smallest stock length that fits
 * @throws {Error} If no stock length is large enough
 */
function pickStockLength(stockLengths, requiredMm) {
  const sorted = [...stockLengths].sort((a, b) => a - b); // Sort smallest first
  for (const L of sorted) {
    if (L >= requiredMm) return L;
  }
  throw new Error(
    `Required ${requiredMm}mm exceeds max stock length ${Math.max(...stockLengths)}mm`
  );
}

/**
 * Pick the LARGEST available stock length that fits.
 * Used by FFD because bigger beams = fewer total beams = faster cutting setup.
 *
 * @param {number[]} stockLengths - Available beam lengths
 * @param {number} requiredMm - The minimum length needed
 * @returns {number} The largest stock length that fits
 */
function pickLargestStockLength(stockLengths, requiredMm) {
  const sorted = [...stockLengths].sort((a, b) => b - a); // Sort largest first
  for (const L of sorted) {
    if (L >= requiredMm) return L;
  }
  throw new Error(
    `Required ${requiredMm}mm exceeds max stock length ${Math.max(...stockLengths)}mm`
  );
}

/**
 * Best-Fit Decreasing (BFD) - Minimises waste.
 *
 * For each component (sorted largest first):
 *   1. Look through ALL existing beams
 *   2. Find the one with the LEAST remaining space that still fits the component
 *   3. If no beam fits, open a new beam using the largest available stock length
 *
 * The key difference from FFD is the placement strategy: BFD searches every beam
 * to find the tightest fit, which packs beams more efficiently and reduces waste.
 *
 * @param {Object[]} components - Array of {itemNumber, lengthMm, nestId, ...}
 * @param {number[]} stockLengths - Available beam lengths in mm
 * @param {number} kerfMm - Saw blade width in mm (added to each cut)
 * @returns {Object[]} Array of beam objects with components and waste info
 */
function packBestFitDecreasing(components, stockLengths, kerfMm) {
  // Sort components longest-first for better packing
  const sorted = [...components].sort((a, b) => {
    if (b.lengthMm !== a.lengthMm) return b.lengthMm - a.lengthMm;
    return String(a.itemNumber).localeCompare(String(b.itemNumber));
  });
  const beams = [];

  for (const comp of sorted) {
    let bestIdx = -1;
    let bestRemaining = null;

    // Search ALL existing beams for the tightest fit
    for (let i = 0; i < beams.length; i++) {
      const beam = beams[i];
      const additional = comp.lengthMm + kerfMm; // Component length + saw blade width
      if (beam.usedMm + additional <= beam.stockLengthMm) {
        const remaining = beam.stockLengthMm - (beam.usedMm + additional);
        // Keep track of the beam with the least remaining space (tightest fit)
        if (bestRemaining === null || remaining < bestRemaining) {
          bestRemaining = remaining;
          bestIdx = i;
        }
      }
    }

    // No existing beam fits - open a new one with the largest available stock
    // (both BFD and FFD use large beams; the difference is in placement strategy)
    if (bestIdx === -1) {
      const required = comp.lengthMm + kerfMm;
      const L = pickLargestStockLength(stockLengths, required);
      beams.push({ stockLengthMm: L, components: [], usedMm: 0, wasteMm: 0 });
      bestIdx = beams.length - 1;
    }

    // Place the component on the chosen beam
    const beam = beams[bestIdx];
    beam.components.push(comp);
    beam.usedMm += comp.lengthMm + kerfMm;
  }

  // Calculate waste on each beam (stock length minus what was used)
  for (const beam of beams) {
    beam.wasteMm = Math.max(0, beam.stockLengthMm - beam.usedMm);
  }

  return beams;
}

/**
 * First-Fit Decreasing (FFD) - Minimises cutting time.
 *
 * For each component (sorted largest first):
 *   1. Try each existing beam in order
 *   2. Place the component in the FIRST beam that fits (don't look for best fit)
 *   3. If none fit, open a new beam using the LARGEST stock length
 *
 * Using larger beams and first-fit means fewer total beams are needed,
 * which means less setup time for the cutting machine.
 *
 * @param {Object[]} components - Array of component objects
 * @param {number[]} stockLengths - Available beam lengths in mm
 * @param {number} kerfMm - Saw blade width in mm
 * @returns {Object[]} Array of beam objects
 */
function packFirstFitDecreasing(components, stockLengths, kerfMm) {
  const sorted = [...components].sort((a, b) => {
    if (b.lengthMm !== a.lengthMm) return b.lengthMm - a.lengthMm;
    return String(a.itemNumber).localeCompare(String(b.itemNumber));
  });
  const beams = [];

  for (const comp of sorted) {
    let placed = false;

    // Try each beam in order - take the first one that fits
    for (let i = 0; i < beams.length; i++) {
      const beam = beams[i];
      const additional = comp.lengthMm + kerfMm;
      if (beam.usedMm + additional <= beam.stockLengthMm) {
        beam.components.push(comp);
        beam.usedMm += additional;
        placed = true;
        break; // First fit - stop searching as soon as we find a fit
      }
    }

    // No existing beam fits - open a new one with the LARGEST stock
    if (!placed) {
      const required = comp.lengthMm + kerfMm;
      const L = pickLargestStockLength(stockLengths, required);
      const newBeam = { stockLengthMm: L, components: [], usedMm: 0, wasteMm: 0 };
      newBeam.components.push(comp);
      newBeam.usedMm = comp.lengthMm + kerfMm;
      beams.push(newBeam);
    }
  }

  // Calculate waste
  for (const beam of beams) {
    beam.wasteMm = Math.max(0, beam.stockLengthMm - beam.usedMm);
  }

  return beams;
}

/**
 * Main entry point - runs the full optimisation across all nest groups.
 *
 * Components are grouped by their nestId (material type), and each group
 * is optimised independently. This is because you can't mix different
 * material types on the same beam.
 *
 * @param {Object} params
 * @param {string} params.batchName - User-given name for this optimisation run
 * @param {Object[]} params.components - All components from the CSV
 * @param {number} params.kerfMm - Saw blade width
 * @param {number} params.minRemnantMm - Minimum usable remnant (not currently used in algo)
 * @param {string} params.priority - 'waste' for BFD or 'speed' for FFD
 * @returns {Object} Full results including per-nest breakdowns and grand totals
 */
function runOptimisation({ batchName, components, kerfMm, minRemnantMm, priority }) {
  const priorityMode = priority === 'speed' ? 'speed' : 'waste';
  const packFn = priorityMode === 'speed' ? packFirstFitDecreasing : packBestFitDecreasing;
  const solverName = priorityMode === 'speed'
    ? 'First-Fit Decreasing (Fastest)'
    : 'Best-Fit Decreasing (Min Waste)';

  // Group components by nestId (material type)
  const groups = {};
  for (const comp of components) {
    const key = String(comp.nestId);
    if (!groups[key]) groups[key] = [];
    groups[key].push(comp);
  }

  // Collect available stock lengths from the data.
  // The CSV's "TotalLength" column often contains the actual used length on
  // each beam (e.g. 5916, 7872), not the standard stock sizes. We snap each
  // value to the nearest standard size to avoid having thousands of "custom"
  // beam lengths that give unrealistically low waste.
  const STANDARD_SIZES = [6000, 8000, 13000];
  const stockLengthsSet = new Set();
  for (const comp of components) {
    if (comp.beamType && comp.beamType > 0) {
      // Snap to the smallest standard size that could contain this value
      const snapped = STANDARD_SIZES.find(s => s >= comp.beamType);
      stockLengthsSet.add(snapped || comp.beamType); // Keep original if larger than all standards
    }
  }
  // Fallback to standard beam sizes if none specified in the data
  const stockLengths = stockLengthsSet.size > 0
    ? [...stockLengthsSet].sort((a, b) => a - b)
    : STANDARD_SIZES;

  // Run the packing algorithm for each nest group and accumulate totals
  const batchResults = [];
  let grandTotalStock = 0;
  let grandTotalCut = 0;
  let grandTotalWaste = 0;
  let grandTotalBeams = 0;
  let grandReusableRemnantMm = 0;
  let grandDiscardedWasteMm = 0;

  for (const [nestId, nestComponents] of Object.entries(groups)) {
    const beams = packFn(nestComponents, stockLengths, kerfMm);

    let totalStock = 0;
    let totalCut = 0;
    let totalWaste = 0;

    for (const beam of beams) {
      totalStock += beam.stockLengthMm;
      totalCut += beam.components.reduce((sum, c) => sum + c.lengthMm, 0);
      totalWaste += beam.wasteMm;

      if (beam.wasteMm >= minRemnantMm) {
        grandReusableRemnantMm += beam.wasteMm;
      } else {
        grandDiscardedWasteMm += beam.wasteMm;
      }
    }

    batchResults.push({
      nestId,
      beams,
      totalStockMm: totalStock,
      totalCutMm: totalCut,
      totalWasteMm: totalWaste,
      wastePct: totalStock > 0 ? (totalWaste / totalStock) * 100 : 0
    });

    grandTotalStock += totalStock;
    grandTotalCut += totalCut;
    grandTotalWaste += totalWaste;
    grandTotalBeams += beams.length;
  }

  return {
    batchName,
    solver: solverName,
    priority: priorityMode,
    results: batchResults,
    grandTotalStockMm: grandTotalStock,
    grandTotalCutMm: grandTotalCut,
    grandTotalWasteMm: grandTotalWaste,
    grandReusableRemnantMm,
    grandDiscardedWasteMm,
    grandTotalBeams,
    grandWastePct: grandTotalStock > 0 ? (grandTotalWaste / grandTotalStock) * 100 : 0
  };
}

module.exports = { pickStockLength, pickLargestStockLength, packBestFitDecreasing, packFirstFitDecreasing, runOptimisation };
