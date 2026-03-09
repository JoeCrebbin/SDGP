from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, PositiveInt


class Component(BaseModel):
    model_config = ConfigDict(frozen=True)

    item_number: str = Field(..., min_length=1)
    length_mm: PositiveInt


class Batch(BaseModel):
    model_config = ConfigDict(frozen=True)

    nest_id: str = Field(..., min_length=1)
    components: list[Component]


class StockConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    stock_lengths_mm: list[PositiveInt] = Field(..., min_length=1)
    kerf_mm: int = Field(0, ge=0)

    def pick_stock_length(self, required_mm: int) -> int:
        """Pick the smallest stock length that can fit required_mm."""
        for L in sorted(self.stock_lengths_mm):
            if L >= required_mm:
                return L
        raise ValueError(
            f"Required {required_mm}mm exceeds max stock length {max(self.stock_lengths_mm)}mm"
        )


class BeamCut(BaseModel):
    stock_length_mm: PositiveInt
    components: list[Component] = Field(default_factory=list)
    used_mm: int = Field(0, ge=0)
    waste_mm: int = Field(0, ge=0)

    def remaining_mm(self) -> int:
        return self.stock_length_mm - self.used_mm


class BatchResult(BaseModel):
    nest_id: str
    solver_used: str = "heuristic"  # NEW
    beams: list[BeamCut]
    total_stock_mm: int
    total_cut_mm: int
    total_waste_mm: int
    waste_pct: float

    def stock_beam_counts(self) -> dict[int, int]:
        counts: dict[int, int] = {}
        for beam in self.beams:
            counts[beam.stock_length_mm] = counts.get(beam.stock_length_mm, 0) + 1
        return dict(sorted(counts.items()))

    def stock_beam_mix_label(self) -> str:
        counts = self.stock_beam_counts()
        if not counts:
            return "-"
        return ", ".join(f"{length}x{count}" for length, count in counts.items())


class RunResult(BaseModel):
    mode: Literal["independent"] = "independent"
    results: list[BatchResult]
    grand_total_stock_mm: int
    grand_total_cut_mm: int
    grand_total_waste_mm: int
    grand_waste_pct: float
