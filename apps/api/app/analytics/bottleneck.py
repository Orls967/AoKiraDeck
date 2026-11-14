from __future__ import annotations

from app.schemas.analytics import BottleneckSummary


def classify_bottleneck(
    *,
    avg_cycle_time_ms: float,
    total_sim_time_ms: int,
    total_wait_ms: int,
    total_dwell_ms: int,
    total_robot_move_ms: int,
    cycle_count: int,
) -> BottleneckSummary:
    denom_cycle = max(avg_cycle_time_ms * max(cycle_count, 1), float(total_sim_time_ms), 1.0)
    dwell_share_pct = (float(total_dwell_ms) / denom_cycle) * 100.0
    wait_share_pct = (float(total_wait_ms) / denom_cycle) * 100.0
    robot_share_pct = (float(total_robot_move_ms) / denom_cycle) * 100.0

    idle_wait_ratio_pct = min(
        100.0,
        (float(total_wait_ms) / max(float(total_sim_time_ms), 1.0)) * 100.0,
    )

    if wait_share_pct >= max(dwell_share_pct, robot_share_pct) or idle_wait_ratio_pct >= 30.0:
        primary_stage = "DETECT_OBJECT"
        share_pct = min(100.0, max(wait_share_pct, idle_wait_ratio_pct))
        explanation = (
            f"Input feed starvation (DETECT_OBJECT wait) accounts for {share_pct:.1f}% of cycle "
            "time. Increase input conveyor speed or stagger feed to keep the pick zone supplied."
        )
    elif dwell_share_pct >= robot_share_pct:
        primary_stage = "PROCESS_WORKPIECE"
        share_pct = min(100.0, dwell_share_pct)
        explanation = (
            f"Station processing dwell dominates at {share_pct:.1f}% of total cycle duration. "
            "Reducing processingDwellMs yields the largest direct throughput gain."
        )
    else:
        primary_stage = "ROBOT_TRANSIT"
        share_pct = min(100.0, robot_share_pct)
        explanation = (
            f"6-axis robot transit & handling account for {share_pct:.1f}% of cycle time. "
            "Increasing robotSpeedScale and robotAccelScale shortens pick-place transfer arcs."
        )

    if share_pct >= 55.0 or idle_wait_ratio_pct >= 30.0:
        severity = "HIGH"
    elif share_pct >= 28.0 or idle_wait_ratio_pct >= 12.0:
        severity = "MODERATE"
    else:
        severity = "LOW"

    return BottleneckSummary(
        primary_stage=primary_stage,
        share_of_cycle_pct=round(share_pct, 2),
        idle_wait_ratio_pct=round(idle_wait_ratio_pct, 2),
        explanation=explanation,
        severity=severity,
    )
