/**
  * optimiser.js - Core Cutting Stock Algorithm
  * SDGP Module 2025/26
  * This is where the magic happens basically. We take a list of components
  * that need cutting and figure out how to fit them onto beams with
  * minimal waste. Its a 1D bin packing problem which we learned about
  * in the algorithms module.
  *
  * We implemented the strategy:
  * BFD (Best-Fit Decreasing): checks every beam to find the tightest fit.
  * It sorts components biggest-first before packing because that
  * gives better results.
  *
  * Important: kerf (the width the saw blade eats up) is NOT added to the
  * first component on each beam because theres no cut needed to place it.
  * We spent ages debugging this.
*/

// Picks the smallest beam that fits - used by BFD to keep waste down

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

/*
 * Best-Fit Decreasing
 * For each component we look through ALL the beams and find the one
 * with the least space left that still fits. Packs everything really
 * tightly which is what the shipyard wants.
 */
function pickStockLengthWithLookahead(stockLengths, requiredMm, remainingComponents, kerfMm) {
  const sorted = [...stockLengths].sort((a, b) => a - b);

  // Prefer the smallest stock that can fit this component and at least one future component.
  for (const L of sorted) {
    if (L < requiredMm) continue;

    const availableAfterFirst = L - requiredMm - kerfMm;
    if (availableAfterFirst >= 0 && remainingComponents.some(c => c.lengthMm <= availableAfterFirst)) {
      return L;
    }
  }

  // Fallback to the smallest stock that fits if no lookahead candidate found.
  for (const L of sorted) {
    if (L >= requiredMm) return L;
  }

  throw new Error(
    `Required ${requiredMm}mm exceeds max stock length ${Math.max(...stockLengths)}mm`
  );
}

function packBestFitDecreasing(components, stockLengths, kerfMm) {
  // Sort components longest-first for better packing
  const sorted = [...components].sort((a, b) => {
    if (b.lengthMm !== a.lengthMm) return b.lengthMm - a.lengthMm;
    return String(a.itemNumber).localeCompare(String(b.itemNumber));
  });
  const beams = [];

  for (let i = 0; i < sorted.length; i++) {
    const comp = sorted[i];
    let bestIdx = -1;
    let bestRemaining = null;

    // Try every existing beam to find the tightest fit
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

    // Nothing fits - grab a new beam (no kerf on first piece)
    if (bestIdx === -1) {
      const required = comp.lengthMm;
      const remainingComponents = sorted.slice(i + 1);
      const L = pickStockLengthWithLookahead(stockLengths, required, remainingComponents, kerfMm);
      beams.push({ stockLengthMm: L, components: [], usedMm: 0, wasteMm: 0 });
      bestIdx = beams.length - 1;
    }

    // Place it - no kerf for the first component on a beam
    const beam = beams[bestIdx];
    const isFirst = beam.components.length === 0;
    beam.components.push(comp);
    beam.usedMm += comp.lengthMm + (isFirst ? 0 : kerfMm);
  }

  // Calculate kerf and waste on each beam
  for (const beam of beams) {
    const sumComponents = beam.components.reduce((s, c) => s + c.lengthMm, 0);
    beam.kerfMm = Math.max(0, (beam.components.length - 1) * kerfMm);
    beam.wasteMm = Math.max(0, beam.stockLengthMm - sumComponents - beam.kerfMm);
    beam.totalWasteMm = beam.kerfMm + beam.wasteMm;
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
      const required = comp.lengthMm;
      const L = pickLargestStockLength(stockLengths, required);
      const newBeam = { stockLengthMm: L, components: [], usedMm: 0, wasteMm: 0 };
      newBeam.components.push(comp);
      newBeam.usedMm = comp.lengthMm;
      beams.push(newBeam);
    }
  }

  // Calculate kerf and waste on each beam
  for (const beam of beams) {
    const sumComponents = beam.components.reduce((s, c) => s + c.lengthMm, 0);
    beam.kerfMm = Math.max(0, (beam.components.length - 1) * kerfMm);
    beam.wasteMm = Math.max(0, beam.stockLengthMm - sumComponents - beam.kerfMm);
    beam.totalWasteMm = beam.kerfMm + beam.wasteMm;
  }

  return beams;
}

/*
 * Main entry point - runs the whole optimisation.
 * Groups components by nest/material type first since you obviously
 * cant mix different materials on the same beam. Then runs BFD on
 * each group separately and totals everything up.
 */
function runOptimisation({ batchName, components, kerfMm, minRemnantMm, priority }) {
  const priorityMode = priority === 'speed' ? 'speed' : 'waste';
  const packFn = priorityMode === 'speed' ? packFirstFitDecreasing : packBestFitDecreasing;
  const solverName = priorityMode === 'speed'
    ? 'First-Fit Decreasing (Fastest)'
    : 'Best-Fit Decreasing (Min Waste)';

  // Group by material type
  const groups = {};
  for (const comp of components) {
    const key = String(comp.nestId);
    if (!groups[key]) groups[key] = [];
    groups[key].push(comp);
  }

  // Figure out what stock sizes are available from the CSV data.
  // The CSV gives us actual used lengths like 5916mm which arent real stock sizes,
  // so we snap them to the nearest standard size (6m, 8m, 13m) to get realistic results

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

  // Run the algorithm on each group and add up the totals
  const batchResults = [];
  let grandTotalStock = 0;
  let grandTotalCut = 0;
  let grandTotalWaste = 0;
  let grandTotalKerf = 0;
  let grandTotalBeams = 0;
  let grandReusableRemnantMm = 0;
  let grandDiscardedWasteMm = 0;

  for (const [nestId, nestComponents] of Object.entries(groups)) {
    const beams = packFn(nestComponents, stockLengths, kerfMm);

    let totalStock = 0;
    let totalCut = 0;
    let totalWaste = 0;
    let totalKerf = 0;

    for (const beam of beams) {
      totalStock += beam.stockLengthMm;
      totalCut += beam.components.reduce((sum, c) => sum + c.lengthMm, 0);
      totalKerf += beam.kerfMm || 0;
      totalWaste += (beam.totalWasteMm != null ? beam.totalWasteMm : beam.wasteMm);

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
    grandTotalKerf += totalKerf;
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
    grandTotalKerfMm: grandTotalKerf,
    grandReusableRemnantMm,
    grandDiscardedWasteMm,
    grandTotalBeams,
    grandWastePct: grandTotalStock > 0 ? (grandTotalWaste / grandTotalStock) * 100 : 0
  };
}

module.exports = { pickStockLength, pickLargestStockLength, packBestFitDecreasing, packFirstFitDecreasing, runOptimisation };
