from __future__ import annotations

import math
from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel


def _reject_non_finite(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("Numeric value must be finite")
    return value


FiniteFloat = Annotated[float, Field()]


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        allow_inf_nan=False,
    )


class CycleMode(StrEnum):
    SINGLE = "SINGLE"
    FIXED_COUNT = "FIXED_COUNT"
    CONTINUOUS = "CONTINUOUS"


class ProductionStage(StrEnum):
    IDLE = "IDLE"
    DETECT_OBJECT = "DETECT_OBJECT"
    APPROACH_PICK = "APPROACH_PICK"
    PICK_WORKPIECE = "PICK_WORKPIECE"
    TRANSFER_TO_STATION = "TRANSFER_TO_STATION"
    PROCESS_WORKPIECE = "PROCESS_WORKPIECE"
    PICK_FINISHED = "PICK_FINISHED"
    TRANSFER_TO_OUTPUT = "TRANSFER_TO_OUTPUT"
    PLACE_WORKPIECE = "PLACE_WORKPIECE"
    CYCLE_COMPLETE = "CYCLE_COMPLETE"
    FAULT = "FAULT"


class SimulationEventType(StrEnum):
    SIM_STARTED = "SIM_STARTED"
    SIM_PAUSED = "SIM_PAUSED"
    SIM_RESUMED = "SIM_RESUMED"
    SIM_STOPPED = "SIM_STOPPED"
    SIM_RESET = "SIM_RESET"
    STAGE_ENTERED = "STAGE_ENTERED"
    CYCLE_STARTED = "CYCLE_STARTED"
    CYCLE_COMPLETED = "CYCLE_COMPLETED"
    WORKPIECE_SPAWNED = "WORKPIECE_SPAWNED"
    GRIPPER_GRASPED = "GRIPPER_GRASPED"
    GRIPPER_RELEASED = "GRIPPER_RELEASED"
    NEAR_COLLISION_WARNING = "NEAR_COLLISION_WARNING"
    COLLISION_DETECTED = "COLLISION_DETECTED"
    IK_TARGET_UNREACHABLE = "IK_TARGET_UNREACHABLE"
    JOINT_LIMIT_VIOLATED = "JOINT_LIMIT_VIOLATED"
    GRIPPER_FAULT = "GRIPPER_FAULT"
    OBJECT_UNAVAILABLE = "OBJECT_UNAVAILABLE"


class EventSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


class ScenarioConfig(CamelModel):
    scenario_id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=256)
    description: str = Field(default="", max_length=1024)
    seed: int = Field(ge=0)
    timestep_ms: int
    cycle_mode: CycleMode
    target_quantity: int | None = None
    target_production_rate_per_hour: float = Field(gt=0.0, le=5000.0)
    robot_speed_scale: float = Field(ge=0.20, le=1.50)
    robot_accel_scale: float = Field(ge=0.20, le=1.50)
    input_conveyor_speed_mps: float = Field(ge=0.05, le=0.60)
    output_conveyor_speed_mps: float = Field(ge=0.05, le=0.60)
    processing_dwell_ms: int = Field(ge=500, le=10000)
    workpiece_mass_kg: float = Field(ge=0.10, le=5.00)
    trajectory_smoothness_factor: float = Field(ge=0.80, le=1.25)

    @field_validator("timestep_ms")
    @classmethod
    def check_timestep_ms(cls, v: int) -> int:
        if v != 20:
            raise ValueError("timestepMs must equal 20")
        return v

    @model_validator(mode="after")
    def check_target_quantity(self) -> ScenarioConfig:
        if self.cycle_mode == CycleMode.FIXED_COUNT and (
            self.target_quantity is None or self.target_quantity < 1
        ):
            raise ValueError("targetQuantity must be >= 1 when cycleMode is FIXED_COUNT")
        return self


class SimulationEvent(CamelModel):
    seq: int = Field(ge=1)
    run_id: str = Field(min_length=1, max_length=128)
    sim_time_ms: int = Field(ge=0)
    event_type: SimulationEventType
    stage: ProductionStage
    cycle_index: int = Field(ge=0)
    workpiece_id: str | None = None
    component_id: str | None = None
    severity: EventSeverity
    message: str
    payload: dict[str, Any] = Field(default_factory=dict)


class PerCycleHistoryEntry(CamelModel):
    cycle_index: int = Field(ge=1)
    cycle_time_ms: int = Field(ge=0)
    robot_move_ms: int = Field(ge=0)
    process_dwell_ms: int = Field(ge=0)
    wait_time_ms: int = Field(ge=0)
    energy_wh: float = Field(ge=0.0)
    had_near_collision: bool
    had_fault: bool


class ProductionMetrics(CamelModel):
    run_id: str
    scenario_id: str
    total_sim_time_ms: int = Field(ge=0)
    total_units_produced: int = Field(ge=0)
    units_per_hour: float = Field(ge=0.0)
    average_cycle_time_ms: float = Field(ge=0.0)
    min_cycle_time_ms: int = Field(ge=0)
    max_cycle_time_ms: int = Field(ge=0)
    robot_active_time_ms: int = Field(ge=0)
    robot_utilization_pct: float = Field(ge=0.0, le=100.0)
    conveyor_active_time_ms: int = Field(ge=0)
    conveyor_utilization_pct: float = Field(ge=0.0, le=100.0)
    idle_time_ms: int = Field(ge=0)
    downtime_ms: int = Field(ge=0)
    collision_event_count: int = Field(ge=0)
    near_collision_event_count: int = Field(ge=0)
    estimated_energy_wh: float = Field(ge=0.0)
    energy_per_unit_wh: float = Field(ge=0.0)
    production_efficiency_pct: float = Field(ge=0.0, le=100.0)
    per_cycle_history: list[PerCycleHistoryEntry] = Field(default_factory=list)


class ApiErrorDetail(CamelModel):
    field: str
    issue: str


class ApiErrorBody(CamelModel):
    code: str
    message: str
    request_id: str
    details: list[ApiErrorDetail] = Field(default_factory=list)


class ApiErrorResponse(CamelModel):
    error: ApiErrorBody
