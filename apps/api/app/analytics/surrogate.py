from __future__ import annotations

import math
from dataclasses import dataclass

from app.schemas.common import ScenarioConfig

# Canonical AoKira 6-DOF joint kinematics constants (matching data/workcell/aokira-workcell.v1.json)
JOINT_MAX_VEL = (3.141593, 2.617994, 3.141593, 4.188790, 3.665191, 5.235988)
JOINT_MAX_ACC = (9.0, 8.0, 10.0, 14.0, 12.0, 18.0)
JOINT_RATED_TORQUE = (160.0, 140.0, 90.0, 45.0, 35.0, 20.0)
WORKCELL_HOME_Q = (0.0, 0.174532925, 0.349065850, 0.0, 1.047197551, 0.0)

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

# Calibrated scale factor aligning approximate waypoint deltas to exact Rust IK move time
_CALIBRATED_MOVE_SCALE = 8200.0 / 9240.0


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
) -> SurrogateEstimate:
    smoothness = scenario.trajectory_smoothness_factor
    v_scale = max(0.16, min(1.50, scenario.robot_speed_scale / smoothness))
    a_scale = max(0.16, min(1.50, scenario.robot_accel_scale / smoothness))

    total_motion_sec = 0.0
    weighted_motion_energy_ws = 0.0
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
            seg_sec = max(0.100, math.ceil(t_min * 1000.0 / 20.0) * 0.020)
        else:
            seg_sec = t_min

        # Exact closed-form quintic integral of |dq| and |ddq|
        for i in range(6):
            tau_r = JOINT_RATED_TORQUE[i]
            weighted_motion_energy_ws += (0.35 * tau_r) * dqs[i] + (0.04 * tau_r) * (
                3.75 * dqs[i] / seg_sec
            )
        dq_l2 = math.sqrt(sum(d * d for d in dqs))
        is_loaded = (src_key, dst_key) in {
            ("in_pick", "in_app"),
            ("in_app", "st_app"),
            ("st_app", "st_place"),
            ("st_place", "st_app"),
            ("st_app", "out_app"),
            ("out_app", "out_place"),
        }
        if is_loaded:
            payload_energy_ws += 18.0 * scenario.workpiece_mass_kg * max(dq_l2, 0.1 * seg_sec)

        total_motion_sec += seg_sec

    robot_move_sec = total_motion_sec * _CALIBRATED_MOVE_SCALE + 4.0 * 0.160  # 4 gripper actuations
    dwell_sec = float(scenario.processing_dwell_ms) / 1000.0

    # Input conveyor starvation occurs only when feed cadence (0.220m / v_in) exceeds cycle work
    feed_period_sec = 0.220 / scenario.input_conveyor_speed_mps
    out_clear_period_sec = 0.220 / scenario.output_conveyor_speed_mps
    mechanical_cycle_sec = robot_move_sec + dwell_sec
    wait_sec = max(0.020 if not continuous else 0.0, feed_period_sec - mechanical_cycle_sec)
    out_wait_sec = max(0.0, out_clear_period_sec - mechanical_cycle_sec) * 0.35
    total_wait_sec = wait_sec + out_wait_sec

    cycle_sec = mechanical_cycle_sec + total_wait_sec
    cycle_ms = cycle_sec * 1000.0
    throughput_uph = 3600.0 / cycle_sec
    idle_ratio_pct = min(100.0, (total_wait_sec / cycle_sec) * 100.0)

    in_feed_time = min(cycle_sec, 0.220 / scenario.input_conveyor_speed_mps)
    out_feed_time = min(cycle_sec, 0.840 / scenario.output_conveyor_speed_mps)
    idle_ws = 120.0 * cycle_sec
    aux_ws = 65.0 * (in_feed_time + out_feed_time) + 180.0 * dwell_sec
    energy_per_unit_wh = (
        idle_ws + aux_ws + weighted_motion_energy_ws * _CALIBRATED_MOVE_SCALE + payload_energy_ws
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
        collision_count=0,
        bottleneck_stage=bottleneck,
    )
