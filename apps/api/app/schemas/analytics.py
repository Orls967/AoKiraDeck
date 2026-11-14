from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import (
    CamelModel,
    ProductionMetrics,
    ScenarioConfig,
    SimulationEvent,
)


class AnalyticsEvaluateRequest(CamelModel):
    scenario: ScenarioConfig
    events: list[SimulationEvent] = Field(min_length=1)
    client_metrics: ProductionMetrics | None = None
    total_sim_time_ms: int = Field(gt=0)
    cumulative_energy_wh: float = Field(ge=0.0)


class BottleneckSummary(CamelModel):
    primary_stage: str
    share_of_cycle_pct: float = Field(ge=0.0, le=100.0)
    idle_wait_ratio_pct: float = Field(ge=0.0, le=100.0)
    explanation: str
    severity: Literal["LOW", "MODERATE", "HIGH"]


class EnergyBreakdown(CamelModel):
    total_wh: float = Field(ge=0.0)
    per_unit_wh: float = Field(ge=0.0)
    robot_motion_wh: float = Field(ge=0.0)
    processing_station_wh: float = Field(ge=0.0)
    conveyor_wh: float = Field(ge=0.0)
    idle_standby_wh: float = Field(ge=0.0)
    disclaimer: Literal[
        "Synthetic engineering estimate only; not real electrical metering."
    ] = "Synthetic engineering estimate only; not real electrical metering."


class ConsistencyValidation(CamelModel):
    is_valid: bool
    monotonic_events_ok: bool
    client_server_delta_pct: float | None = None
    warnings: list[str] = Field(default_factory=list)


class ForecastSummary(CamelModel):
    projected_units_per_hour: float = Field(ge=0.0)
    projected_units_per8h_shift: float = Field(ge=0.0)
    target_attainment_pct: float = Field(ge=0.0)


class AnalyticsEvaluateResponse(CamelModel):
    run_id: str
    computed_metrics: ProductionMetrics
    bottleneck: BottleneckSummary
    energy_breakdown: EnergyBreakdown
    forecast: ForecastSummary
    validation: ConsistencyValidation
