/*
 * optimiser.js - Core Cutting Stock Algorithm
 * SDGP Module 2025/26
 *
 * This is where the magic happens basically. We take a list of components
 * that need cutting and figure out how to fit them onto beams with
 * minimal waste. Its a 1D bin packing problem which we learned about
 * in the algorithms module.
 *
 * We implemented the strategy:
 * BFD (Best-Fit Decreasing): checks every beam to find the tightest fit.
 * Itsorts components biggest-first before packing because that
 * gives better results.
 *
 * Important: kerf (the width the saw blade eats up) is NOT added to the
 * first component on each beam because theres no cut needed to place it.
 * We spent ages debugging this lol.
 */

// Picks the smallest beam that fits - used by BFD to keep waste down
function pickStockLength(stockLengths, requiredMm) {
  const sorted = [...stockLengths].sort((a, b) => a - b);
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
function packBestFitDecreasing(components, stockLengths, kerfMm) {
  // Sort biggest first - packing large items first gives better results
  const sorted = [...components].sort((a, b) => b.lengthMm - a.lengthMm);
  const beams = [];

  for (const comp of sorted) {
    let bestIdx = -1;
    let bestRemaining = null;

    // Try every existing beam to find the tightest fit
    for (let i = 0; i < beams.length; i++) {
      const beam = beams[i];
      // First piece on a beam doesnt need a cut so no kerf
      const isFirstItem = (beam.components.length === 0);
      const additional = isFirstItem ? comp.lengthMm : (comp.lengthMm + kerfMm);
      if (beam.usedMm + additional <= beam.stockLengthMm) {
        const remaining = beam.stockLengthMm - (beam.usedMm + additional);
        if (bestRemaining === null || remaining < bestRemaining) {
          bestRemaining = remaining;
          bestIdx = i;
        }
      }
    }

    // Nothing fits - grab a new beam (no kerf on first piece)
    if (bestIdx === -1) {
      const required = comp.lengthMm;
      const L = pickLargestStockLength(stockLengths, required);
      beams.push({ stockLengthMm: L, components: [], usedMm: 0, wasteMm: 0 });
      bestIdx = beams.length - 1;
    }

    // Place it
    const beam = beams[bestIdx];
    const isFirstOnBeam = (beam.components.length === 0);
    beam.components.push(comp);
    beam.usedMm += isFirstOnBeam ? comp.lengthMm : (comp.lengthMm + kerfMm);
  }

  // Work out waste - we count kerf as waste too since its sawdust not usable material
  for (const beam of beams) {
    const pureComponentsLength = beam.components.reduce((sum, c) => sum + c.lengthMm, 0);
    beam.wasteMm = Math.max(0, beam.stockLengthMm - pureComponentsLength);
  }

  return beams;
}

/*
 * Main entry point - runs the whole optimisation.
 * Groups components by nest/material type first since you obviously
 * cant mix different materials on the same beam. Then runs BFD on
 * each group separately and totals everything up.
 */
function runOptimisation({ batchName, components, kerfMm, minRemnantMm }) {
  const packFn = packBestFitDecreasing;
  const solverName = 'Best-Fit Decreasing (Min Waste)';

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
      const snapped = STANDARD_SIZES.find(s => s >= comp.beamType);
      stockLengthsSet.add(snapped || comp.beamType);
    }
  }
  const stockLengths = stockLengthsSet.size > 0
    ? [...stockLengthsSet].sort((a, b) => a - b)
    : STANDARD_SIZES;

  // Run the algorithm on each group and add up the totals
  const batchResults = [];
  let grandTotalStock = 0;
  let grandTotalCut = 0;
  let grandTotalWaste = 0;
  let grandTotalBeams = 0;

  for (const [nestId, nestComponents] of Object.entries(groups)) {
    const beams = packFn(nestComponents, stockLengths, kerfMm);

    let totalStock = 0;
    let totalCut = 0;
    let totalWaste = 0;

    for (const beam of beams) {
      totalStock += beam.stockLengthMm;
      totalCut += beam.components.reduce((sum, c) => sum + c.lengthMm, 0);
      totalWaste += beam.wasteMm;
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
    results: batchResults,
    grandTotalStockMm: grandTotalStock,
    grandTotalCutMm: grandTotalCut,
    grandTotalWasteMm: grandTotalWaste,
    grandTotalBeams,
    grandWastePct: grandTotalStock > 0 ? (grandTotalWaste / grandTotalStock) * 100 : 0
  };
}

module.exports = { pickStockLength, pickLargestStockLength, packBestFitDecreasing, packFirstFitDecreasing, runOptimisation };
