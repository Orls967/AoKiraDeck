from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import CamelModel, ProductionMetrics, ScenarioConfig


class ScenarioComparisonItem(CamelModel):
    scenario: ScenarioConfig
    observed_metrics: ProductionMetrics | None = None


RankingObjective = Literal[
    "MIN_CYCLE_TIME",
    "MAX_THROUGHPUT",
    "MIN_ENERGY",
    "BALANCED",
]


class ScenariosCompareRequest(CamelModel):
    items: list[ScenarioComparisonItem] = Field(min_length=1, max_length=25)
    ranking_objective: RankingObjective


class ScenarioComparisonResult(CamelModel):
    scenario_id: str
    name: str
    source: Literal["WASM_OBSERVED", "ANALYTICAL_ESTIMATE"]
    cycle_time_ms: float = Field(ge=0.0)
    throughput_units_per_hour: float = Field(ge=0.0)
    idle_time_ratio_pct: float = Field(ge=0.0, le=100.0)
    estimated_energy_per_unit_wh: float = Field(ge=0.0)
    collision_count: int = Field(ge=0)
    bottleneck_stage: str
    composite_score: float
    rank: int = Field(ge=1)


class ScenariosCompareResponse(CamelModel):
    ranking_objective: str
    best_scenario_id: str
    comparisons: list[ScenarioComparisonResult]
    summary_note: str


class OptimizationBounds(CamelModel):
    robot_speed_scale: tuple[float, float]
    robot_accel_scale: tuple[float, float]
    input_conveyor_speed_mps: tuple[float, float]
    output_conveyor_speed_mps: tuple[float, float]
    processing_dwell_ms: tuple[int, int]

    @model_validator(mode="after")
    def validate_intervals(self) -> OptimizationBounds:
        checks: list[tuple[str, float, float, float, float]] = [
            ("robotSpeedScale", *self.robot_speed_scale, 0.20, 1.50),
            ("robotAccelScale", *self.robot_accel_scale, 0.20, 1.50),
            ("inputConveyorSpeedMps", *self.input_conveyor_speed_mps, 0.05, 0.60),
            ("outputConveyorSpeedMps", *self.output_conveyor_speed_mps, 0.05, 0.60),
            (
                "processingDwellMs",
                float(self.processing_dwell_ms[0]),
                float(self.processing_dwell_ms[1]),
                500.0,
                10000.0,
            ),
        ]
        for name, lo, hi, abs_min, abs_max in checks:
            if lo > hi:
                raise ValueError(f"{name} lower bound {lo} must be <= upper bound {hi}")
            if lo < abs_min or hi > abs_max:
                raise ValueError(f"{name} interval [{lo}, {hi}] outside [{abs_min}, {abs_max}]")
        return self


class OptimizationWeights(CamelModel):
    cycle_time_weight: float = Field(default=0.50, ge=0.0)
    energy_weight: float = Field(default=0.30, ge=0.0)
    idle_ratio_weight: float = Field(default=0.20, ge=0.0)


class OptimizationConstraints(CamelModel):
    min_throughput_units_per_hour: float = Field(ge=0.0)
    require_zero_collisions: bool = True
    max_energy_per_unit_wh: float | None = Field(default=None, gt=0.0)

    @model_validator(mode="after")
    def validate_collision_constraint(self) -> OptimizationConstraints:
        if not self.require_zero_collisions:
            raise ValueError("requireZeroCollisions must be true in AoKira v1")
        return self


OptimizationObjective = Literal["MIN_CYCLE_TIME", "MIN_ENERGY_PER_UNIT", "BALANCED"]


class OptimizationRunRequest(CamelModel):
    base_scenario: ScenarioConfig
    bounds: OptimizationBounds
    objective: OptimizationObjective
    weights: OptimizationWeights | None = None
    constraints: OptimizationConstraints
    max_evaluations: int = Field(default=120, ge=10, le=500)


class OptimizationCandidate(CamelModel):
    rank: int = Field(ge=1)
    scenario: ScenarioConfig
    cycle_time_ms: float = Field(ge=0.0)
    throughput_units_per_hour: float = Field(ge=0.0)
    energy_per_unit_wh: float = Field(ge=0.0)
    score: float


class BaselineProjectedSummary(CamelModel):
    cycle_time_ms: float = Field(ge=0.0)
    throughput_units_per_hour: float = Field(ge=0.0)
    energy_per_unit_wh: float = Field(ge=0.0)
    idle_ratio_pct: float = Field(ge=0.0, le=100.0)


class RecommendedProjectedSummary(BaselineProjectedSummary):
    bottleneck_stage: str


class OptimizationDeltas(CamelModel):
    cycle_time_pct: float
    throughput_pct: float
    energy_per_unit_pct: float


class OptimizationRunResponse(CamelModel):
    feasible: bool
    evaluations_run: int = Field(ge=1)
    baseline_projected: BaselineProjectedSummary
    recommended_scenario: ScenarioConfig
    recommended_projected: RecommendedProjectedSummary
    deltas: OptimizationDeltas
    top_candidates: list[OptimizationCandidate]
    note: str
