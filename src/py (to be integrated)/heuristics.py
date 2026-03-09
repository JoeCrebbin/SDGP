from __future__ import annotations

from . import Batch, BeamCut, StockConfig


def _kerf_cost(kerf_mm: int, num_pieces: int) -> int:
    """
    Kerf approximation:
    - If a beam yields N pieces, assume N cuts -> N * kerf_mm.
    - If your marking machine behaves differently, adjust here.
    """
    return kerf_mm * max(0, num_pieces)


def pack_batch_best_fit_decreasing(batch: Batch, stock: StockConfig) -> list[BeamCut]:
    """
    Packs components into stock beams using Best-Fit Decreasing (BFD).
    - Opens a new beam using the smallest stock length that fits the current piece.
    - Places a piece into the existing beam that would have the least remaining space after placement.
    """
    comps = sorted(batch.components, key=lambda c: c.length_mm, reverse=True)
    beams: list[BeamCut] = []

    for comp in comps:
        best_i = -1
        best_remaining_after = None

        for i, beam in enumerate(beams):
            # required additional mm includes piece length + kerf for this cut
            additional = comp.length_mm + stock.kerf_mm
            if beam.used_mm + additional <= beam.stock_length_mm:
                remaining_after = beam.stock_length_mm - (beam.used_mm + additional)
                if best_remaining_after is None or remaining_after < best_remaining_after:
                    best_remaining_after = remaining_after
                    best_i = i

        if best_i == -1:
            # open new beam (need piece + kerf)
            required = comp.length_mm + stock.kerf_mm
            L = stock.pick_stock_length(required)
            new_beam = BeamCut(stock_length_mm=L, components=[], used_mm=0, waste_mm=0)
            beams.append(new_beam)
            best_i = len(beams) - 1

        # place in chosen beam
        beam = beams[best_i]
        beam.components.append(comp)
        beam.used_mm += comp.length_mm + stock.kerf_mm

    # Finalize waste per beam
    for beam in beams:
        beam.waste_mm = max(0, beam.stock_length_mm - beam.used_mm)

    return beams
