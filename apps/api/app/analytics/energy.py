from __future__ import annotations

from app.schemas.analytics import EnergyBreakdown


def compute_energy_breakdown(
    *,
    total_wh: float,
    total_units_produced: int,
    total_sim_time_ms: int,
    total_dwell_ms: int,
    conveyor_active_time_ms: int,
) -> EnergyBreakdown:
    """Decompose total synthetic energy matching SIMULATION_SPEC.md Section 7.2 power terms."""
    sim_sec = max(0.0, float(total_sim_time_ms) / 1000.0)
    dwell_sec = max(0.0, float(total_dwell_ms) / 1000.0)
    conv_sec = max(0.0, float(conveyor_active_time_ms) / 1000.0)

    idle_standby_wh = (120.0 * sim_sec) / 3600.0
    processing_station_wh = (180.0 * dwell_sec) / 3600.0
    conveyor_wh = (65.0 * conv_sec) / 3600.0

    fixed_components = idle_standby_wh + processing_station_wh + conveyor_wh
    if fixed_components > total_wh and fixed_components > 0.0:
        # Preserve exact conservation if a partial run reports lower cumulative energy
        scale = total_wh / fixed_components
        idle_standby_wh *= scale
        processing_station_wh *= scale
        conveyor_wh *= scale
        robot_motion_wh = 0.0
    else:
        robot_motion_wh = max(0.0, total_wh - fixed_components)

    per_unit_wh = (total_wh / float(total_units_produced)) if total_units_produced > 0 else 0.0

    return EnergyBreakdown(
        total_wh=total_wh,
        per_unit_wh=per_unit_wh,
        robot_motion_wh=robot_motion_wh,
        processing_station_wh=processing_station_wh,
        conveyor_wh=conveyor_wh,
        idle_standby_wh=idle_standby_wh,
    )
