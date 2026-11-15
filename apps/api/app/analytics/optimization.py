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


_SearchPoint = tuple[np.ndarray, SurrogateEstimate, float, bool]


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
    span = hi - lo

    def to_x(u: np.ndarray) -> np.ndarray:
        return lo + np.clip(u, 0.0, 1.0) * span

    def to_u(x: np.ndarray) -> np.ndarray:
        safe = np.where(span > 0.0, span, 1.0)
        return np.where(span > 0.0, (np.clip(x, lo, hi) - lo) / safe, 0.0)

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
    evaluated: list[_SearchPoint] = []

    def estimate(x: np.ndarray, label: str) -> SurrogateEstimate:
        # Unrounded, unquantised evaluation so finite-difference gradients are non-zero;
        # candidates are snapped to 4 decimals / 20 ms dwell only when ranked at the end.
        xc = np.clip(x, lo, hi)
        sc = base.model_copy(
            update={
                "robot_speed_scale": float(xc[0]),
                "robot_accel_scale": float(xc[1]),
                "input_conveyor_speed_mps": float(xc[2]),
                "output_conveyor_speed_mps": float(xc[3]),
            }
        )
        return evaluate_scenario_surrogate(sc, continuous=True, dwell_ms=float(xc[4]))

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

    def search(score_fn, budget: int, record: bool) -> SurrogateEstimate | None:
        """Seeded multi-start + SLSQP polish in normalised [0, 1]^5 coordinates.

        Returns the best feasible continuous estimate found (or None)."""
        nonlocal eval_count
        local: list[_SearchPoint] = []
        spent = 0

        def ev(u: np.ndarray) -> float:
            nonlocal eval_count, spent
            x = to_x(u)
            est = estimate(x, "eval")
            sc = score_fn(est)
            feas = is_feasible(est)
            spent += 1
            eval_count += 1
            local.append((x, est, sc, feas))
            if record:
                evaluated.append((x, est, sc, feas))
            return sc

        rng = np.random.default_rng(seed=base.seed)
        seeds = [
            to_u(base_vec),
            np.full(5, 0.5),
            np.array([1.0, 1.0, 1.0, 1.0, 0.0]),  # fast corner
            np.array([0.35, 0.35, 0.5, 0.5, 0.0]),  # gentle motion
        ]
        n_seeds = max(4, min(12, budget // 4))
        while len(seeds) < n_seeds:
            seeds.append(rng.uniform(0.0, 1.0, 5))
        for u in seeds:
            if spent >= budget:
                break
            ev(u)

        def throughput_con(u: np.ndarray) -> float:
            return (
                estimate(to_x(u), "con").throughput_units_per_hour
                - req.constraints.min_throughput_units_per_hour
            )

        constraints = [{"type": "ineq", "fun": throughput_con}]
        if req.constraints.max_energy_per_unit_wh is not None:
            max_e = req.constraints.max_energy_per_unit_wh
            constraints.append(
                {
                    "type": "ineq",
                    "fun": lambda u: max_e - estimate(to_x(u), "econ").energy_per_unit_wh,
                }
            )

        starts = sorted(local, key=lambda item: (0 if item[3] else 1, item[2]))[:2]
        for x0, _, _, _ in starts:
            remaining = budget - spent
            if remaining < 8:
                break
            res = minimize(
                lambda u: ev(u) if spent < budget else score_fn(estimate(to_x(u), "cap")),
                to_u(x0),
                method="SLSQP",
                bounds=[(0.0, 1.0)] * 5,
                constraints=constraints,
                options={"maxiter": max(3, remaining // 6), "ftol": 1e-9, "eps": 1e-4},
            )
            # Always keep SLSQP's final iterate, even if the evaluation budget ran out.
            x_final = to_x(res.x)
            est = estimate(x_final, "final")
            item = (x_final, est, score_fn(est), is_feasible(est))
            local.append(item)
            if record:
                evaluated.append(item)

        feasible = [it for it in local if it[3]]
        if not feasible:
            return None
        return min(feasible, key=lambda it: it[2])[1]

    def norm_cycle(est: SurrogateEstimate) -> float:
        return est.cycle_time_ms / max(baseline_est.cycle_time_ms, 1.0)

    def norm_energy(est: SurrogateEstimate) -> float:
        return est.energy_per_unit_wh / max(baseline_est.energy_per_unit_wh, 1e-6)

    if req.objective == "MIN_CYCLE_TIME":
        score_raw = norm_cycle
        search(score_raw, req.max_evaluations, record=True)
    elif req.objective == "MIN_ENERGY_PER_UNIT":
        score_raw = norm_energy
        search(score_raw, req.max_evaluations, record=True)
    else:
        # Compromise programming: locate both single-objective anchors, then minimise a
        # weighted sum of cycle time and energy normalised by the actual trade-off range
        # between those anchors (utopia/nadir scaling), so BALANCED lands between them.
        anchor_budget = max(10, req.max_evaluations // 4)
        fastest = search(norm_cycle, anchor_budget, record=True)
        leanest = search(norm_energy, anchor_budget, record=True)
        w_c, w_e, w_i = weights.cycle_time_weight, weights.energy_weight, weights.idle_ratio_weight
        w_sum = max(w_c + w_e + w_i, 1e-9)
        if fastest is not None and leanest is not None:
            c_lo, c_hi = fastest.cycle_time_ms, leanest.cycle_time_ms
            e_lo, e_hi = leanest.energy_per_unit_wh, fastest.energy_per_unit_wh
        else:
            c_lo = c_hi = e_lo = e_hi = 0.0
        c_range = c_hi - c_lo
        e_range = e_hi - e_lo
        conflict = c_range > 1e-3 * max(c_hi, 1.0) and e_range > 1e-4 * max(e_hi, 1e-6)

        def score_raw(est: SurrogateEstimate) -> float:
            idle = est.idle_time_ratio_pct / 100.0
            if conflict:
                nc = (est.cycle_time_ms - c_lo) / c_range
                ne = (est.energy_per_unit_wh - e_lo) / e_range
            else:
                nc, ne = norm_cycle(est), norm_energy(est)
            return (w_c * nc + w_e * ne + w_i * idle) / w_sum

        remaining = max(10, req.max_evaluations - eval_count)
        search(score_raw, remaining, record=True)

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
            f"{req.objective}: evaluated {eval_count} surrogate points via seeded multi-start "
            "+ SciPy SLSQP"
            + (
                " (BALANCED = compromise between the MIN_CYCLE_TIME and MIN_ENERGY_PER_UNIT "
                "anchors, weights applied to the normalised trade-off range)."
                if req.objective == "BALANCED"
                else "."
            )
        ),
    )
