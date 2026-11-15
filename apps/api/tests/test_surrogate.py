"""Surrogate model and optimizer regression tests (API-08 .. API-10)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.optimize import differential_evolution

from app.analytics import surrogate
from app.analytics.optimization import run_constrained_optimization
from app.analytics.surrogate import evaluate_scenario_surrogate
from app.schemas.common import ScenarioConfig
from app.schemas.optimization import OptimizationRunRequest

ROOT = Path(__file__).resolve().parents[3]
WORKCELL = json.loads((ROOT / "data/workcell/aokira-workcell.v1.json").read_text())
SCENARIO_A = json.loads((ROOT / "data/scenarios/scenario-a.json").read_text())
GOLDEN = json.loads((ROOT / "data/fixtures/baseline-3cycles.golden.json").read_text())

DEFAULT_BOUNDS = {
    "robotSpeedScale": [0.5, 1.4],
    "robotAccelScale": [0.5, 1.4],
    "inputConveyorSpeedMps": [0.15, 0.5],
    "outputConveyorSpeedMps": [0.15, 0.5],
    "processingDwellMs": [1200, 3500],
}


def _optimize(objective: str, bounds: dict | None = None):
    req = OptimizationRunRequest.model_validate(
        {
            "baseScenario": SCENARIO_A,
            "objective": objective,
            "bounds": bounds or DEFAULT_BOUNDS,
            "constraints": {"minThroughputUnitsPerHour": 240},
        }
    )
    return run_constrained_optimization(req)


def test_api_08_surrogate_constants_match_canonical_workcell() -> None:
    joints = WORKCELL["robot"]["joints"]
    assert surrogate.JOINT_MAX_VEL == tuple(j["maxVelocityRadPerSec"] for j in joints)
    assert surrogate.JOINT_MAX_ACC == tuple(j["maxAccelerationRadPerSec2"] for j in joints)
    assert surrogate.JOINT_RATED_TORQUE == tuple(j["ratedTorqueNm"] for j in joints)
    assert surrogate.WORKCELL_HOME_Q == tuple(j["homeAngleRad"] for j in joints)


def test_api_09_surrogate_tracks_rust_engine_golden_fixture() -> None:
    est = evaluate_scenario_surrogate(ScenarioConfig.model_validate(SCENARIO_A))
    steady = GOLDEN["metrics"]["perCycleHistory"][1:]  # skip warm-up cycle
    cycle_ms = sum(c["cycleTimeMs"] for c in steady) / len(steady)
    energy_wh = sum(c["energyWh"] for c in steady) / len(steady)
    assert abs(est.cycle_time_ms - cycle_ms) / cycle_ms < 0.02
    assert abs(est.energy_per_unit_wh - energy_wh) / energy_wh < 0.02


def test_api_10_objectives_are_distinct_and_balanced_is_a_compromise() -> None:
    fast = _optimize("MIN_CYCLE_TIME").recommended_projected
    lean = _optimize("MIN_ENERGY_PER_UNIT").recommended_projected
    bal = _optimize("BALANCED").recommended_projected

    # Each single objective wins on its own metric ...
    assert fast.cycle_time_ms < lean.cycle_time_ms
    assert lean.energy_per_unit_wh < fast.energy_per_unit_wh
    # ... and BALANCED sits strictly between the two anchors on both metrics.
    assert fast.cycle_time_ms < bal.cycle_time_ms < lean.cycle_time_ms
    assert lean.energy_per_unit_wh < bal.energy_per_unit_wh < fast.energy_per_unit_wh


def test_api_10b_min_energy_reaches_global_optimum() -> None:
    lean = _optimize("MIN_ENERGY_PER_UNIT").recommended_projected
    base = ScenarioConfig.model_validate(SCENARIO_A)
    lo = np.array([0.5, 0.5, 0.15, 0.15, 1200.0])
    hi = np.array([1.4, 1.4, 0.5, 0.5, 3500.0])

    def energy(x: np.ndarray) -> float:
        sc = base.model_copy(
            update={
                "robot_speed_scale": float(x[0]),
                "robot_accel_scale": float(x[1]),
                "input_conveyor_speed_mps": float(x[2]),
                "output_conveyor_speed_mps": float(x[3]),
            }
        )
        est = evaluate_scenario_surrogate(sc, continuous=True, dwell_ms=float(x[4]))
        return est.energy_per_unit_wh

    bounds = list(zip(lo, hi, strict=True))
    ref = differential_evolution(energy, bounds, seed=1, tol=1e-10, maxiter=200)
    assert lean.energy_per_unit_wh <= ref.fun * 1.005


def test_api_10c_locked_dwell_is_respected() -> None:
    bounds = {**DEFAULT_BOUNDS, "processingDwellMs": [2500, 2500]}
    for objective in ("MIN_CYCLE_TIME", "MIN_ENERGY_PER_UNIT", "BALANCED"):
        res = _optimize(objective, bounds)
        assert res.recommended_scenario.processing_dwell_ms == 2500
