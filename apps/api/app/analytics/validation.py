from __future__ import annotations

from app.errors import DomainError
from app.schemas.analytics import ConsistencyValidation
from app.schemas.common import ApiErrorDetail, ProductionMetrics, SimulationEvent


def validate_event_sequence(
    events: list[SimulationEvent],
    total_sim_time_ms: int,
) -> tuple[str, bool, list[str]]:
    """Verify strictly increasing seq and non-decreasing timestamps."""
    warnings: list[str] = []
    run_id = events[0].run_id
    prev_seq = 0
    prev_time = -1

    for idx, ev in enumerate(events):
        if ev.run_id != run_id:
            raise DomainError(
                code="INVALID_EVENT_SEQUENCE",
                status_code=422,
                message=f"Inconsistent runId at events[{idx}]: expected {run_id}, got {ev.run_id}",
                details=[
                    ApiErrorDetail(
                        field=f"events[{idx}].runId",
                        issue=f"Expected {run_id}, got {ev.run_id}",
                    )
                ],
            )
        if ev.seq <= prev_seq:
            raise DomainError(
                code="INVALID_EVENT_SEQUENCE",
                status_code=422,
                message=(
                    f"Event seq must be strictly increasing "
                    f"(events[{idx}].seq={ev.seq} <= {prev_seq})"
                ),
                details=[
                    ApiErrorDetail(
                        field=f"events[{idx}].seq",
                        issue=f"seq {ev.seq} is not strictly greater than previous seq {prev_seq}",
                    )
                ],
            )
        if ev.sim_time_ms < prev_time:
            raise DomainError(
                code="INVALID_EVENT_SEQUENCE",
                status_code=422,
                message=(
                    f"Event simTimeMs must be monotonically non-decreasing "
                    f"(events[{idx}].simTimeMs={ev.sim_time_ms} < {prev_time})"
                ),
                details=[
                    ApiErrorDetail(
                        field=f"events[{idx}].simTimeMs",
                        issue=f"simTimeMs {ev.sim_time_ms} precedes previous timestamp {prev_time}",
                    )
                ],
            )
        if ev.sim_time_ms > total_sim_time_ms:
            raise DomainError(
                code="INVALID_EVENT_SEQUENCE",
                status_code=422,
                message=(
                    f"Event timestamp {ev.sim_time_ms} ms exceeds "
                    f"totalSimTimeMs {total_sim_time_ms} ms"
                ),
                details=[
                    ApiErrorDetail(
                        field=f"events[{idx}].simTimeMs",
                        issue="Event timestamp exceeds totalSimTimeMs",
                    )
                ],
            )
        prev_seq = ev.seq
        prev_time = ev.sim_time_ms

    return run_id, True, warnings


def build_consistency_validation(
    computed: ProductionMetrics,
    client_metrics: ProductionMetrics | None,
    monotonic_ok: bool,
    warnings: list[str],
) -> ConsistencyValidation:
    delta_pct: float | None = None
    is_valid = monotonic_ok

    if client_metrics is not None:
        deltas: list[float] = []
        pairs = [
            (computed.units_per_hour, client_metrics.units_per_hour),
            (computed.average_cycle_time_ms, client_metrics.average_cycle_time_ms),
            (computed.robot_utilization_pct, client_metrics.robot_utilization_pct),
            (computed.energy_per_unit_wh, client_metrics.energy_per_unit_wh),
        ]
        for server_v, client_v in pairs:
            denom = max(abs(server_v), abs(client_v), 1e-9)
            if abs(server_v - client_v) > 1e-9:
                deltas.append(abs(server_v - client_v) / denom * 100.0)
            else:
                deltas.append(0.0)
        delta_pct = round(max(deltas) if deltas else 0.0, 6)
        if delta_pct > 1.0:
            is_valid = False
            warnings.append(
                f"Client vs server KPI delta {delta_pct:.3f}% exceeds 1.0% consistency tolerance."
            )

    return ConsistencyValidation(
        is_valid=is_valid,
        monotonic_events_ok=monotonic_ok,
        client_server_delta_pct=delta_pct,
        warnings=warnings,
    )
