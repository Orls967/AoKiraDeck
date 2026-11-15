from __future__ import annotations

import math
from dataclasses import dataclass

from app.schemas.common import ScenarioConfig

# Canonical AoKira 6-DOF joint limits, copied from data/workcell/aokira-workcell.v1.json
# (the API container does not ship /data). tests/test_surrogate.py asserts they stay in sync.
JOINT_MAX_VEL = (
    3.141592653589793,
    2.6179938779914944,
    3.141592653589793,
    4.1887902047863905,
    4.1887902047863905,
    6.283185307179586,
)
JOINT_MAX_ACC = (
    7.853981633974483,
    6.283185307179586,
    7.853981633974483,
    10.471975511965978,
    10.471975511965978,
    15.707963267948966,
)
JOINT_RATED_TORQUE = (120.0, 140.0, 90.0, 45.0, 35.0, 25.0)
WORKCELL_HOME_Q = (0.0, 0.17453292519943295, 0.3490658503988659, 0.0, 1.0471975511965979, 0.0)

# SIMULATION_SPEC.md Section 7.2 power coefficients (per joint, scaled by rated torque).
K_VEL = 0.35
K_ACC = 0.04
K_RES = 0.010  # resistive (copper / I^2R) loss, W per (rad/s^2)^2 per Nm of rated torque
P_IDLE_W = 120.0
P_CONVEYOR_W = 65.0
P_STATION_W = 180.0
PAYLOAD_W_PER_KG = 18.0
# Quintic time scaling s(t) = 10t^3 - 15t^4 + 6t^5 on [0, 1]:
QUINTIC_ABS_ACC_INTEGRAL = 3.75  # integral of |s''| = 2 * peak(s') = 2 * 1.875
QUINTIC_SQ_ACC_INTEGRAL = 120.0 / 7.0  # integral of (s'')^2

# Fixed per-cycle overheads, calibrated against the Rust engine
# (`cargo run --release --example energy_sweep -- --grid`).
GRIPPER_AND_SETTLE_SEC = 4 * 0.300 + 0.100  # 4 gripper actuations (300 ms each) + settle
HANDOFF_OVERHEAD_SEC = 0.220  # sensor confirmation + stage hand-off ticks
MIN_WAIT_SEC = 0.020
INPUT_INDEX_TRAVEL_M = 0.18  # effective input-belt travel per part (accumulating queue)
OUTPUT_TRAVEL_M = 0.84  # drop zone (x = 0.56) to despawn (x = 1.40)
CYCLE_RESIDUAL_WS = 58.0  # held-part floor power, gripper and discretisation residual

# Steady-state joint waypoint loop for 1 complete pick-process-place cycle:
# (input_approach -> input_pick -> input_approach -> station_approach -> station_place
#  -> station_approach -> station_place -> station_approach -> output_approach
#  -> output_place -> output_approach -> input_approach)
_WAYPOINT_Q = {
    "in_app": (1.7127, 0.2784, 0.2512, 0.0, 1.0412, -1.7127),
    "in_pick": (1.7127, 0.4420, 0.3650, 0.0, 0.7638, -1.7127),
    "st_app": (0.0, 0.2784, 0.2512, 0.0, 1.0412, 0.0),
    "st_place": (0.0, 0.4420, 0.3650, 0.0, 0.7638, 0.0),
    "out_app": (-1.7127, 0.2784, 0.2512, 0.0, 1.0412, 1.7127),
    "out_place": (-1.7127, 0.4420, 0.3650, 0.0, 0.7638, 1.7127),
}

_CYCLE_SEGMENTS = [
    ("out_app", "in_app"),
    ("in_app", "in_pick"),
    ("in_pick", "in_app"),
    ("in_app", "st_app"),
    ("st_app", "st_place"),
    ("st_place", "st_app"),
    ("st_app", "st_place"),
    ("st_place", "st_app"),
    ("st_app", "out_app"),
    ("out_app", "out_place"),
    ("out_place", "out_app"),
]

_LOADED_SEGMENTS = {
    ("in_pick", "in_app"),
    ("in_app", "st_app"),
    ("st_app", "st_place"),
    ("st_place", "st_app"),
    ("st_app", "out_app"),
    ("out_app", "out_place"),
}

@dataclass
class SurrogateEstimate:
    cycle_time_ms: float
    robot_move_ms: float
    wait_ms: float
    throughput_units_per_hour: float
    idle_time_ratio_pct: float
    energy_per_unit_wh: float
    collision_count: int
    bottleneck_stage: str


def evaluate_scenario_surrogate(
    scenario: ScenarioConfig,
    *,
    continuous: bool = False,
    dwell_ms: float | None = None,
) -> SurrogateEstimate:
    """Closed-form steady-state estimate of one pick-process-place cycle.

    Mirrors the Rust engine's quintic segment planner and SIMULATION_SPEC.md Section 7.2 power
    model (including the resistive I^2R term). `continuous=True` skips the 20 ms tick
    quantisation so SciPy SLSQP sees a smooth objective; `dwell_ms` lets the optimizer pass a
    non-integer dwell for the same reason (ScenarioConfig stores whole milliseconds).
    """
    smoothness = scenario.trajectory_smoothness_factor
    v_scale = max(0.16, min(1.50, scenario.robot_speed_scale / smoothness))
    a_scale = max(0.16, min(1.50, scenario.robot_accel_scale / smoothness))

    total_motion_sec = 0.0
    joint_energy_ws = 0.0
    payload_energy_ws = 0.0

    for src_key, dst_key in _CYCLE_SEGMENTS:
        q0 = _WAYPOINT_Q[src_key]
        q1 = _WAYPOINT_Q[dst_key]
        dqs = [abs(q1[i] - q0[i]) for i in range(6)]
        t_min = 0.100
        for i in range(6):
            if dqs[i] <= 1e-12:
                continue
            v_eff = JOINT_MAX_VEL[i] * v_scale
            a_eff = JOINT_MAX_ACC[i] * a_scale
            tv = (1.875 * dqs[i]) / v_eff
            ta = math.sqrt((10.0 / math.sqrt(3.0) * dqs[i]) / a_eff)
            t_min = max(t_min, tv, ta)

        if not continuous:
            seg_sec = max(0.100, math.ceil(t_min * 1000.0 / 20.0 - 1e-9) * 0.020)
        else:
            seg_sec = t_min

        # Closed-form quintic integrals of |dq|, |ddq| and ddq^2 over the segment
        for i in range(6):
            tau_r = JOINT_RATED_TORQUE[i]
            joint_energy_ws += (
                K_VEL * tau_r * dqs[i]
                + K_ACC * tau_r * QUINTIC_ABS_ACC_INTEGRAL * dqs[i] / seg_sec
                + K_RES * tau_r * QUINTIC_SQ_ACC_INTEGRAL * dqs[i] ** 2 / seg_sec**3
            )
        if (src_key, dst_key) in _LOADED_SEGMENTS:
            dq_l2 = math.sqrt(sum(d * d for d in dqs))
            payload_energy_ws += (
                PAYLOAD_W_PER_KG * scenario.workpiece_mass_kg * max(dq_l2, 0.1 * seg_sec)
            )

        total_motion_sec += seg_sec

    robot_move_sec = total_motion_sec + GRIPPER_AND_SETTLE_SEC
    dwell_sec = float(scenario.processing_dwell_ms if dwell_ms is None else dwell_ms) / 1000.0
    mechanical_cycle_sec = robot_move_sec + dwell_sec + HANDOFF_OVERHEAD_SEC

    # Input starvation only when the belt cannot index the next part within one robot cycle
    feed_period_sec = INPUT_INDEX_TRAVEL_M / scenario.input_conveyor_speed_mps
    floor_wait = 0.0 if continuous else MIN_WAIT_SEC
    total_wait_sec = max(floor_wait, feed_period_sec - mechanical_cycle_sec)

    cycle_sec = mechanical_cycle_sec + total_wait_sec
    cycle_ms = cycle_sec * 1000.0
    throughput_uph = 3600.0 / cycle_sec
    idle_ratio_pct = min(100.0, (total_wait_sec / cycle_sec) * 100.0)

    conveyor_ws = P_CONVEYOR_W * (
        min(cycle_sec, INPUT_INDEX_TRAVEL_M / scenario.input_conveyor_speed_mps)
        + min(cycle_sec, OUTPUT_TRAVEL_M / scenario.output_conveyor_speed_mps)
    )
    energy_per_unit_wh = (
        P_IDLE_W * cycle_sec
        + P_STATION_W * dwell_sec
        + conveyor_ws
        + joint_energy_ws
        + payload_energy_ws
        + CYCLE_RESIDUAL_WS
    ) / 3600.0

    if total_wait_sec >= max(dwell_sec, robot_move_sec):
        bottleneck = "DETECT_OBJECT"
    elif dwell_sec >= robot_move_sec * 0.40:
        bottleneck = "PROCESS_WORKPIECE"
    else:
        bottleneck = "ROBOT_TRANSIT"

    return SurrogateEstimate(
        cycle_time_ms=round(cycle_ms, 2) if not continuous else cycle_ms,
        robot_move_ms=robot_move_sec * 1000.0,
        wait_ms=total_wait_sec * 1000.0,
        throughput_units_per_hour=round(throughput_uph, 4) if not continuous else throughput_uph,
        idle_time_ratio_pct=round(idle_ratio_pct, 2) if not continuous else idle_ratio_pct,
        energy_per_unit_wh=round(energy_per_unit_wh, 6) if not continuous else energy_per_unit_wh,
        # The engine's PLC interlocks keep every corner of the allowed parameter box
        # collision-free (verified by RUST-PROD-07), so the surrogate reports zero.
        collision_count=0,
        bottleneck_stage=bottleneck,
    )
