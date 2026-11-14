from __future__ import annotations

from dataclasses import dataclass

from app.analytics.bottleneck import classify_bottleneck
from app.analytics.energy import compute_energy_breakdown
from app.analytics.forecasting import compute_forecast
from app.analytics.validation import build_consistency_validation, validate_event_sequence
from app.schemas.analytics import AnalyticsEvaluateRequest, AnalyticsEvaluateResponse
from app.schemas.common import (
    PerCycleHistoryEntry,
    ProductionMetrics,
    ProductionStage,
    SimulationEventType,
)

MOTION_STAGES = {
    ProductionStage.APPROACH_PICK,
    ProductionStage.PICK_WORKPIECE,
    ProductionStage.TRANSFER_TO_STATION,
    ProductionStage.PROCESS_WORKPIECE,
    ProductionStage.PICK_FINISHED,
    ProductionStage.TRANSFER_TO_OUTPUT,
    ProductionStage.PLACE_WORKPIECE,
}


@dataclass
class _CycleWork:
    cycle_index: int
    start_time_ms: int
    robot_move_ms: int = 0
    dwell_ms: int = 0
    wait_ms: int = 0
    energy_wh: float = 0.0
    had_near_collision: bool = False
    had_fault: bool = False
    completed: bool = False
    end_time_ms: int = 0


def _merge_intervals(intervals: list[tuple[int, int]]) -> int:
    if not intervals:
        return 0
    sorted_iv = sorted((a, b) for a, b in intervals if b > a)
    if not sorted_iv:
        return 0
    total = 0
    cur_start, cur_end = sorted_iv[0]
    for start, end in sorted_iv[1:]:
        if start <= cur_end:
            cur_end = max(cur_end, end)
        else:
            total += cur_end - cur_start
            cur_start, cur_end = start, end
    total += cur_end - cur_start
    return total


def evaluate_run_analytics(req: AnalyticsEvaluateRequest) -> AnalyticsEvaluateResponse:
    run_id, monotonic_ok, warnings = validate_event_sequence(req.events, req.total_sim_time_ms)
    events = req.events
    timestep = req.scenario.timestep_ms
    dwell_target = req.scenario.processing_dwell_ms

    # Collect per-stage spans between consecutive STAGE_ENTERED markers
    stage_entries: list[tuple[int, ProductionStage, int]] = []
    for ev in events:
        if ev.event_type == SimulationEventType.STAGE_ENTERED:
            stage_entries.append((ev.sim_time_ms, ev.stage, ev.cycle_index))

    cycles: dict[int, _CycleWork] = {}
    collision_count = 0
    near_collision_count = 0
    total_units = 0
    downtime_ms = 0

    spawn_times: list[int] = []
    input_pick_times: list[int] = []
    output_release_times: list[int] = []

    for ev in events:
        if ev.event_type == SimulationEventType.CYCLE_STARTED and ev.cycle_index >= 1:
            cycles.setdefault(
                ev.cycle_index,
                _CycleWork(cycle_index=ev.cycle_index, start_time_ms=ev.sim_time_ms),
            )
        elif ev.event_type == SimulationEventType.CYCLE_COMPLETED:
            total_units += 1
            if ev.cycle_index >= 1:
                c = cycles.setdefault(
                    ev.cycle_index,
                    _CycleWork(cycle_index=ev.cycle_index, start_time_ms=ev.sim_time_ms),
                )
                c.completed = True
                c.end_time_ms = ev.sim_time_ms
        elif ev.event_type == SimulationEventType.WORKPIECE_SPAWNED:
            spawn_times.append(ev.sim_time_ms)
        elif (
            ev.event_type == SimulationEventType.STAGE_ENTERED
            and ev.stage == ProductionStage.APPROACH_PICK
        ):
            input_pick_times.append(ev.sim_time_ms)
        elif (
            ev.event_type == SimulationEventType.GRIPPER_RELEASED
            and ev.stage == ProductionStage.PLACE_WORKPIECE
        ):
            output_release_times.append(ev.sim_time_ms)
        elif ev.event_type == SimulationEventType.COLLISION_DETECTED:
            collision_count += 1
            if ev.cycle_index in cycles:
                cycles[ev.cycle_index].had_fault = True
        elif ev.event_type == SimulationEventType.NEAR_COLLISION_WARNING:
            near_collision_count += 1
            if ev.cycle_index in cycles:
                cycles[ev.cycle_index].had_near_collision = True
        elif ev.event_type in (
            SimulationEventType.GRIPPER_FAULT,
            SimulationEventType.OBJECT_UNAVAILABLE,
            SimulationEventType.JOINT_LIMIT_VIOLATED,
            SimulationEventType.IK_TARGET_UNREACHABLE,
        ):
            if ev.cycle_index in cycles:
                cycles[ev.cycle_index].had_fault = True

    total_robot_active_ms = 0
    total_dwell_ms = 0
    total_wait_ms = 0

    for idx, (start_t, stage, cycle_idx) in enumerate(stage_entries):
        end_t = (
            stage_entries[idx + 1][0]
            if idx + 1 < len(stage_entries)
            else req.total_sim_time_ms
        )
        span = max(0, end_t - start_t)
        cyc = cycles.get(cycle_idx)

        if stage == ProductionStage.DETECT_OBJECT:
            total_wait_ms += span
            if cyc is not None:
                cyc.wait_ms += span
            continue

        if stage == ProductionStage.CYCLE_COMPLETE:
            if (
                idx + 1 < len(stage_entries)
                and stage_entries[idx + 1][1] == ProductionStage.IDLE
                and span >= timestep
            ):
                # Final return-to-home quintic segment ends with 1 zero-velocity tick at tau=1.0
                total_robot_active_ms += span - timestep
            elif idx + 1 == len(stage_entries) and span > 0:
                # Snapshot captured mid-return-to-home before reaching IDLE
                total_robot_active_ms += span
            continue

        if stage not in MOTION_STAGES:
            continue

        # Count how many quintic segment endpoints (tau=1.0, dq=0) occur within this stage
        exited = idx + 1 < len(stage_entries)
        has_actuation_inside = any(
            start_t <= ev.sim_time_ms < end_t
            and ev.event_type
            in (SimulationEventType.GRIPPER_GRASPED, SimulationEventType.GRIPPER_RELEASED)
            for ev in events
        )
        completed_segments = (1 if exited else 0) + (1 if has_actuation_inside else 0)
        zero_vel_ticks_ms = completed_segments * timestep

        if stage == ProductionStage.PROCESS_WORKPIECE:
            if exited:
                stage_dwell = dwell_target
            else:
                # Partial dwell estimate if interrupted mid-station
                release_t = next(
                    (
                        ev.sim_time_ms
                        for ev in events
                        if start_t <= ev.sim_time_ms <= end_t
                        and ev.event_type == SimulationEventType.GRIPPER_RELEASED
                    ),
                    None,
                )
                if release_t is not None and end_t > release_t + 300:
                    stage_dwell = min(dwell_target, end_t - release_t - 300)
                else:
                    stage_dwell = 0
            total_dwell_ms += stage_dwell
            stage_move = max(0, span - stage_dwell - zero_vel_ticks_ms)
            total_robot_active_ms += stage_move
            if cyc is not None:
                cyc.dwell_ms += stage_dwell
                cyc.robot_move_ms += stage_move
        else:
            stage_move = max(0, span - zero_vel_ticks_ms)
            total_robot_active_ms += stage_move
            if cyc is not None:
                cyc.robot_move_ms += stage_move

    # Estimate union of conveyor belt running intervals from spawn->pick and release->exit windows
    conv_intervals: list[tuple[int, int]] = []
    in_travel_ms = int(round(0.820 / req.scenario.input_conveyor_speed_mps * 1000.0))
    for i, sp_t in enumerate(spawn_times):
        pick_t = input_pick_times[i] if i < len(input_pick_times) else req.total_sim_time_ms
        conv_intervals.append((sp_t, min(req.total_sim_time_ms, min(pick_t, sp_t + in_travel_ms))))

    out_travel_ms = int(round(0.840 / req.scenario.output_conveyor_speed_mps * 1000.0))
    for rel_t in output_release_times:
        conv_intervals.append((rel_t, min(req.total_sim_time_ms, rel_t + out_travel_ms)))

    conveyor_active_ms = min(req.total_sim_time_ms, _merge_intervals(conv_intervals))

    idle_time_ms = max(
        0,
        req.total_sim_time_ms - total_robot_active_ms - total_dwell_ms - downtime_ms,
    )

    completed_cycles = sorted(
        (c for c in cycles.values() if c.completed),
        key=lambda c: c.cycle_index,
    )

    total_sim = req.total_sim_time_ms
    units_per_hour = (
        (float(total_units) * 3_600_000.0 / float(total_sim))
        if (total_sim > 0 and total_units > 0)
        else 0.0
    )

    cycle_times = [max(0, c.end_time_ms - c.start_time_ms) for c in completed_cycles]
    if cycle_times:
        avg_cycle_ms = sum(cycle_times) / float(len(cycle_times))
        min_cycle_ms = min(cycle_times)
        max_cycle_ms = max(cycle_times)
    else:
        avg_cycle_ms = 0.0
        min_cycle_ms = 0
        max_cycle_ms = 0

    denom = float(max(total_sim, 1))
    robot_util_pct = max(0.0, min(100.0, float(total_robot_active_ms) / denom * 100.0))
    conv_util_pct = max(0.0, min(100.0, float(conveyor_active_ms) / denom * 100.0))

    energy_per_unit_wh = (
        req.cumulative_energy_wh / float(total_units) if total_units > 0 else 0.0
    )

    uptime_ratio = float(max(0, total_sim - downtime_ms)) / denom
    target_ratio = (
        max(0.0, min(1.0, units_per_hour / req.scenario.target_production_rate_per_hour))
        if (req.scenario.target_production_rate_per_hour > 0.0 and total_units > 0)
        else 0.0
    )
    efficiency_pct = (
        max(
            0.0,
            min(
                100.0,
                (0.6 * target_ratio + 0.4 * uptime_ratio) * 100.0 - float(collision_count) * 15.0,
            ),
        )
        if (total_sim > 0 and total_units > 0)
        else 0.0
    )

    # Allocate cycle energy proportionally to cycle active duration
    total_active_weighted = sum(
        max(1, c.end_time_ms - c.start_time_ms) for c in completed_cycles
    )
    per_cycle_history = []
    for c in completed_cycles:
        c_time = max(0, c.end_time_ms - c.start_time_ms)
        c_energy = (
            req.cumulative_energy_wh * (float(c_time) / float(total_active_weighted))
            if total_active_weighted > 0
            else 0.0
        )
        per_cycle_history.append(
            PerCycleHistoryEntry(
                cycle_index=c.cycle_index,
                cycle_time_ms=c_time,
                robot_move_ms=c.robot_move_ms,
                process_dwell_ms=c.dwell_ms,
                wait_time_ms=c.wait_ms,
                energy_wh=c_energy,
                had_near_collision=c.had_near_collision,
                had_fault=c.had_fault,
            )
        )

    computed_metrics = ProductionMetrics(
        run_id=run_id,
        scenario_id=req.scenario.scenario_id,
        total_sim_time_ms=total_sim,
        total_units_produced=total_units,
        units_per_hour=units_per_hour,
        average_cycle_time_ms=avg_cycle_ms,
        min_cycle_time_ms=min_cycle_ms,
        max_cycle_time_ms=max_cycle_ms,
        robot_active_time_ms=total_robot_active_ms,
        robot_utilization_pct=robot_util_pct,
        conveyor_active_time_ms=conveyor_active_ms,
        conveyor_utilization_pct=conv_util_pct,
        idle_time_ms=idle_time_ms,
        downtime_ms=downtime_ms,
        collision_event_count=collision_count,
        near_collision_event_count=near_collision_count,
        estimated_energy_wh=req.cumulative_energy_wh,
        energy_per_unit_wh=energy_per_unit_wh,
        production_efficiency_pct=efficiency_pct,
        per_cycle_history=per_cycle_history,
    )

    energy_breakdown = compute_energy_breakdown(
        total_wh=req.cumulative_energy_wh,
        total_units_produced=total_units,
        total_sim_time_ms=total_sim,
        total_dwell_ms=total_dwell_ms,
        conveyor_active_time_ms=conveyor_active_ms,
    )

    bottleneck = classify_bottleneck(
        avg_cycle_time_ms=avg_cycle_ms,
        total_sim_time_ms=total_sim,
        total_wait_ms=total_wait_ms,
        total_dwell_ms=total_dwell_ms,
        total_robot_move_ms=sum(c.robot_move_ms for c in completed_cycles) or total_robot_active_ms,
        cycle_count=len(completed_cycles),
    )

    forecast = compute_forecast(
        units_per_hour=units_per_hour,
        target_rate_per_hour=req.scenario.target_production_rate_per_hour,
    )

    validation = build_consistency_validation(
        computed=computed_metrics,
        client_metrics=req.client_metrics,
        monotonic_ok=monotonic_ok,
        warnings=warnings,
    )

    return AnalyticsEvaluateResponse(
        run_id=run_id,
        computed_metrics=computed_metrics,
        bottleneck=bottleneck,
        energy_breakdown=energy_breakdown,
        forecast=forecast,
        validation=validation,
    )
