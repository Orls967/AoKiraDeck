from __future__ import annotations

import numpy as np
from scipy.optimize import minimize

from app.analytics.bottleneck import classify_bottleneck
from app.analytics.surrogate import SurrogateEstimate, evaluate_scenario_surrogate
from app.errors import DomainError
from app.schemas.common import ApiErrorDetail, ScenarioConfig
from app.schemas.optimization import (
    BaselineProjectedSummary,
    OptimizationCandidate,
    OptimizationDeltas,
    OptimizationRunRequest,
    OptimizationRunResponse,
    OptimizationWeights,
    RecommendedProjectedSummary,
    ScenarioComparisonResult,
    ScenariosCompareRequest,
    ScenariosCompareResponse,
)


def _normalize_scores(values: list[float], *, lower_is_better: bool) -> list[float]:
    if not values:
        return []
    v_min = min(values)
    v_max = max(values)
    span = v_max - v_min
    if span <= 1e-12:
        return [1.0 for _ in values]
    if lower_is_better:
        return [(v_max - v) / span for v in values]
    return [(v - v_min) / span for v in values]


def compare_scenarios(req: ScenariosCompareRequest) -> ScenariosCompareResponse:
    raw_rows: list[dict[str, object]] = []

    for item in req.items:
        sc = item.scenario
        if item.observed_metrics is not None and item.observed_metrics.total_units_produced > 0:
            obs = item.observed_metrics
            total_dwell = sum(c.process_dwell_ms for c in obs.per_cycle_history)
            total_wait = sum(c.wait_time_ms for c in obs.per_cycle_history)
            total_move = sum(c.robot_move_ms for c in obs.per_cycle_history)
            bn = classify_bottleneck(
                avg_cycle_time_ms=obs.average_cycle_time_ms,
                total_sim_time_ms=obs.total_sim_time_ms,
                total_wait_ms=total_wait or obs.idle_time_ms,
                total_dwell_ms=total_dwell,
                total_robot_move_ms=total_move or obs.robot_active_time_ms,
                cycle_count=len(obs.per_cycle_history) or obs.total_units_produced,
            )
            idle_ratio = (
                float(obs.idle_time_ms) / float(max(obs.total_sim_time_ms, 1)) * 100.0
            )
            raw_rows.append(
                {
                    "scenario_id": sc.scenario_id,
                    "name": sc.name,
                    "source": "WASM_OBSERVED",
                    "cycle_time_ms": obs.average_cycle_time_ms,
                    "throughput_uph": obs.units_per_hour,
                    "idle_ratio": max(0.0, min(100.0, idle_ratio)),
                    "energy_per_unit": obs.energy_per_unit_wh,
                    "collision_count": obs.collision_event_count,
                    "bottleneck_stage": bn.primary_stage,
                }
            )
        else:
            est = evaluate_scenario_surrogate(sc, continuous=False)
            raw_rows.append(
                {
                    "scenario_id": sc.scenario_id,
                    "name": sc.name,
                    "source": "ANALYTICAL_ESTIMATE",
                    "cycle_time_ms": est.cycle_time_ms,
                    "throughput_uph": est.throughput_units_per_hour,
                    "idle_ratio": est.idle_time_ratio_pct,
                    "energy_per_unit": est.energy_per_unit_wh,
                    "collision_count": est.collision_count,
                    "bottleneck_stage": est.bottleneck_stage,
                }
            )

    cycle_vals = [float(r["cycle_time_ms"]) for r in raw_rows]
    tp_vals = [float(r["throughput_uph"]) for r in raw_rows]
    energy_vals = [float(r["energy_per_unit"]) for r in raw_rows]
    idle_vals = [float(r["idle_ratio"]) for r in raw_rows]

    cycle_scores = _normalize_scores(cycle_vals, lower_is_better=True)
    tp_scores = _normalize_scores(tp_vals, lower_is_better=False)
    energy_scores = _normalize_scores(energy_vals, lower_is_better=True)
    idle_scores = _normalize_scores(idle_vals, lower_is_better=True)

    results: list[ScenarioComparisonResult] = []
    for i, r in enumerate(raw_rows):
        if req.ranking_objective == "MIN_CYCLE_TIME":
            score = cycle_scores[i]
        elif req.ranking_objective == "MAX_THROUGHPUT":
            score = tp_scores[i]
        elif req.ranking_objective == "MIN_ENERGY":
            score = energy_scores[i]
        else:
            score = 0.45 * tp_scores[i] + 0.30 * energy_scores[i] + 0.25 * idle_scores[i]

        results.append(
            ScenarioComparisonResult(
                scenario_id=str(r["scenario_id"]),
                name=str(r["name"]),
                source=str(r["source"]),  # type: ignore[arg-type]
                cycle_time_ms=round(float(r["cycle_time_ms"]), 2),
                throughput_units_per_hour=round(float(r["throughput_uph"]), 2),
                idle_time_ratio_pct=round(float(r["idle_ratio"]), 2),
                estimated_energy_per_unit_wh=round(float(r["energy_per_unit"]), 4),
                collision_count=int(r["collision_count"]),
                bottleneck_stage=str(r["bottleneck_stage"]),
                composite_score=round(score * 100.0, 2),
                rank=1,
            )
        )

    results.sort(key=lambda c: (-c.composite_score, c.cycle_time_ms, c.scenario_id))
    for rank_idx, entry in enumerate(results, start=1):
        entry.rank = rank_idx

    best = results[0]
    summary = (
        f"Ranked {len(results)} scenarios for {req.ranking_objective}. "
        f"Best performer: {best.name} ({best.throughput_units_per_hour:.1f} units/h, "
        f"{best.estimated_energy_per_unit_wh:.3f} Wh/unit)."
    )

    return ScenariosCompareResponse(
        ranking_objective=req.ranking_objective,
        best_scenario_id=best.scenario_id,
        comparisons=results,
        summary_note=summary,
    )


def _scenario_from_vec(base: ScenarioConfig, vec: np.ndarray, idx_label: str) -> ScenarioConfig:
    dwell_int = int(round(float(vec[4]) / 20.0) * 20)
    dwell_int = max(500, min(10000, dwell_int))
    return base.model_copy(
        update={
            "scenario_id": f"{base.scenario_id}-opt-{idx_label}",
            "name": f"{base.name} (Optimized)",
            "robot_speed_scale": round(float(vec[0]), 4),
            "robot_accel_scale": round(float(vec[1]), 4),
            "input_conveyor_speed_mps": round(float(vec[2]), 4),
            "output_conveyor_speed_mps": round(float(vec[3]), 4),
            "processing_dwell_ms": dwell_int,
        }
    )


def run_constrained_optimization(req: OptimizationRunRequest) -> OptimizationRunResponse:
    base = req.base_scenario
    weights = req.weights or OptimizationWeights()
    baseline_est = evaluate_scenario_surrogate(base, continuous=False)

    bounds_tuples = [
        req.bounds.robot_speed_scale,
        req.bounds.robot_accel_scale,
        req.bounds.input_conveyor_speed_mps,
        req.bounds.output_conveyor_speed_mps,
        (float(req.bounds.processing_dwell_ms[0]), float(req.bounds.processing_dwell_ms[1])),
    ]
    lo = np.array([b[0] for b in bounds_tuples], dtype=float)
    hi = np.array([b[1] for b in bounds_tuples], dtype=float)

    base_vec = np.clip(
        np.array(
            [
                base.robot_speed_scale,
                base.robot_accel_scale,
                base.input_conveyor_speed_mps,
                base.output_conveyor_speed_mps,
                float(base.processing_dwell_ms),
            ],
            dtype=float,
        ),
        lo,
        hi,
    )

    eval_count = 0
    evaluated: list[tuple[np.ndarray, SurrogateEstimate, float, bool]] = []

    def score_raw(est: SurrogateEstimate) -> float:
        norm_c = est.cycle_time_ms / max(baseline_est.cycle_time_ms, 1.0)
        norm_e = est.energy_per_unit_wh / max(baseline_est.energy_per_unit_wh, 1e-6)
        norm_idle = est.idle_time_ratio_pct / 100.0
        if req.objective == "MIN_CYCLE_TIME":
            return norm_c
        if req.objective == "MIN_ENERGY_PER_UNIT":
            return norm_e
        w_sum = max(
            weights.cycle_time_weight + weights.energy_weight + weights.idle_ratio_weight,
            1e-9,
        )
        return (
            weights.cycle_time_weight * norm_c
            + weights.energy_weight * norm_e
            + weights.idle_ratio_weight * norm_idle
        ) / w_sum

    def is_feasible(est: SurrogateEstimate) -> bool:
        if est.throughput_units_per_hour < req.constraints.min_throughput_units_per_hour - 1e-6:
            return False
        if (
            req.constraints.max_energy_per_unit_wh is not None
            and est.energy_per_unit_wh > req.constraints.max_energy_per_unit_wh + 1e-9
        ):
            return False
        if req.constraints.require_zero_collisions and est.collision_count > 0:
            return False
        return True

    def eval_point(vec: np.ndarray, *, continuous: bool) -> tuple[float, SurrogateEstimate, bool]:
        nonlocal eval_count
        clipped = np.clip(vec, lo, hi)
        eval_count += 1
        sc = _scenario_from_vec(base, clipped, str(eval_count))
        est = evaluate_scenario_surrogate(sc, continuous=continuous)
        sc_score = score_raw(est)
        feas = is_feasible(est)
        evaluated.append((clipped, est, sc_score, feas))
        return sc_score, est, feas

    # Deterministic seeded start points: baseline clamped, corner extremes, LHS samples
    rng = np.random.default_rng(seed=base.seed)
    mid_vec = 0.5 * (lo + hi)
    fast_vec = np.array([hi[0], hi[1], hi[2], hi[3], lo[4]], dtype=float)
    eco_vec = np.array(
        [
            lo[0] + 0.35 * (hi[0] - lo[0]),
            lo[1] + 0.35 * (hi[1] - lo[1]),
            mid_vec[2],
            mid_vec[3],
            lo[4],
        ],
        dtype=float,
    )

    seeds: list[np.ndarray] = [base_vec, mid_vec, fast_vec, eco_vec]
    sample_budget = max(4, min(req.max_evaluations // 2, 24))
    while len(seeds) < sample_budget and eval_count < req.max_evaluations:
        seeds.append(rng.uniform(lo, hi))

    for seed_vec in seeds:
        if eval_count >= req.max_evaluations:
            break
        eval_point(seed_vec, continuous=False)

    # Polish best points using SciPy SLSQP with explicit inequality constraints
    best_seeds = sorted(
        evaluated,
        key=lambda item: (0 if item[3] else 1, item[2]),
    )[:3]

    scipy_bounds = [(float(lo[i]), float(hi[i])) for i in range(5)]

    def slsqp_objective(x: np.ndarray) -> float:
        nonlocal eval_count
        if eval_count >= req.max_evaluations:
            est = evaluate_scenario_surrogate(
                _scenario_from_vec(base, np.clip(x, lo, hi), "cap"),
                continuous=True,
            )
            return score_raw(est)
        val, _, _ = eval_point(x, continuous=True)
        return val

    def slsqp_throughput_con(x: np.ndarray) -> float:
        est = evaluate_scenario_surrogate(
            _scenario_from_vec(base, np.clip(x, lo, hi), "con"),
            continuous=True,
        )
        return est.throughput_units_per_hour - req.constraints.min_throughput_units_per_hour

    slsqp_constraints = [{"type": "ineq", "fun": slsqp_throughput_con}]
    if req.constraints.max_energy_per_unit_wh is not None:
        max_e = req.constraints.max_energy_per_unit_wh

        def slsqp_energy_con(x: np.ndarray) -> float:
            est = evaluate_scenario_surrogate(
                _scenario_from_vec(base, np.clip(x, lo, hi), "econ"),
                continuous=True,
            )
            return max_e - est.energy_per_unit_wh

        slsqp_constraints.append({"type": "ineq", "fun": slsqp_energy_con})

    for seed_vec, _, _, _ in best_seeds:
        if eval_count >= req.max_evaluations:
            break
        rem = max(5, req.max_evaluations - eval_count)
        minimize(
            slsqp_objective,
            seed_vec,
            method="SLSQP",
            bounds=scipy_bounds,
            constraints=slsqp_constraints,
            options={"maxiter": max(2, rem // 7), "ftol": 1e-4},
        )

    # Quantize top unique points deterministically on integer 20 ms dwells
    feasible_items: list[tuple[ScenarioConfig, SurrogateEstimate, float]] = []
    seen_keys: set[tuple[float, float, float, float, int]] = set()
    best_tp_seen = 0.0
    min_energy_seen = float("inf")

    for vec, _, _, _ in evaluated:
        sc = _scenario_from_vec(base, vec, f"cand-{len(feasible_items) + 1}")
        key = (
            sc.robot_speed_scale,
            sc.robot_accel_scale,
            sc.input_conveyor_speed_mps,
            sc.output_conveyor_speed_mps,
            sc.processing_dwell_ms,
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
        est = evaluate_scenario_surrogate(sc, continuous=False)
        best_tp_seen = max(best_tp_seen, est.throughput_units_per_hour)
        min_energy_seen = min(min_energy_seen, est.energy_per_unit_wh)
        if is_feasible(est):
            feasible_items.append((sc, est, score_raw(est)))

    if not feasible_items:
        reasons: list[ApiErrorDetail] = []
        if best_tp_seen < req.constraints.min_throughput_units_per_hour:
            reasons.append(
                ApiErrorDetail(
                    field="constraints.minThroughputUnitsPerHour",
                    issue=(
                        f"Max achievable throughput in bounds is {best_tp_seen:.2f} units/h "
                        f"(< requested {req.constraints.min_throughput_units_per_hour:.2f})."
                    ),
                )
            )
        if (
            req.constraints.max_energy_per_unit_wh is not None
            and min_energy_seen > req.constraints.max_energy_per_unit_wh
        ):
            reasons.append(
                ApiErrorDetail(
                    field="constraints.maxEnergyPerUnitWh",
                    issue=(
                        f"Min achievable energy in bounds is {min_energy_seen:.4f} Wh/unit "
                        f"(> cap {req.constraints.max_energy_per_unit_wh:.4f} Wh/unit)."
                    ),
                )
            )
        raise DomainError(
            code="INFEASIBLE_OPTIMIZATION",
            status_code=422,
            message=(
                "No candidate configuration satisfies all throughput and energy constraints "
                "within the specified bounds."
            ),
            details=reasons,
        )

    feasible_items.sort(
        key=lambda item: (item[2], item[1].cycle_time_ms, -item[1].throughput_units_per_hour)
    )
    top = feasible_items[:5]
    best_sc, best_est, _ = top[0]
    best_sc = best_sc.model_copy(
        update={
            "scenario_id": f"{base.scenario_id}-optimized",
            "name": f"{base.name} — Recommended",
            "description": f"Optimized under {req.objective} ({eval_count} surrogate evaluations).",
        }
    )

    candidates = [
        OptimizationCandidate(
            rank=idx,
            scenario=sc,
            cycle_time_ms=round(est.cycle_time_ms, 2),
            throughput_units_per_hour=round(est.throughput_units_per_hour, 2),
            energy_per_unit_wh=round(est.energy_per_unit_wh, 4),
            score=round(sc_score, 4),
        )
        for idx, (sc, est, sc_score) in enumerate(top, start=1)
    ]

    cycle_delta = (
        (best_est.cycle_time_ms - baseline_est.cycle_time_ms) / max(baseline_est.cycle_time_ms, 1.0)
    ) * 100.0
    tp_delta = (
        (best_est.throughput_units_per_hour - baseline_est.throughput_units_per_hour)
        / max(baseline_est.throughput_units_per_hour, 1e-6)
    ) * 100.0
    energy_delta = (
        (best_est.energy_per_unit_wh - baseline_est.energy_per_unit_wh)
        / max(baseline_est.energy_per_unit_wh, 1e-9)
    ) * 100.0

    return OptimizationRunResponse(
        feasible=True,
        evaluations_run=eval_count,
        baseline_projected=BaselineProjectedSummary(
            cycle_time_ms=round(baseline_est.cycle_time_ms, 2),
            throughput_units_per_hour=round(baseline_est.throughput_units_per_hour, 2),
            energy_per_unit_wh=round(baseline_est.energy_per_unit_wh, 4),
            idle_ratio_pct=round(baseline_est.idle_time_ratio_pct, 2),
        ),
        recommended_scenario=best_sc,
        recommended_projected=RecommendedProjectedSummary(
            cycle_time_ms=round(best_est.cycle_time_ms, 2),
            throughput_units_per_hour=round(best_est.throughput_units_per_hour, 2),
            energy_per_unit_wh=round(best_est.energy_per_unit_wh, 4),
            idle_ratio_pct=round(best_est.idle_time_ratio_pct, 2),
            bottleneck_stage=best_est.bottleneck_stage,
        ),
        deltas=OptimizationDeltas(
            cycle_time_pct=round(cycle_delta, 2),
            throughput_pct=round(tp_delta, 2),
            energy_per_unit_pct=round(energy_delta, 2),
        ),
        top_candidates=candidates,
        note=(
            f"Evaluated {eval_count} points via SLSQP + multi-start search; "
            f"projected throughput change {tp_delta:+.1f}% vs baseline."
        ),
    )
