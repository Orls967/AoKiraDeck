from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.main import app

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_FIXTURE_PATH = REPO_ROOT / "data" / "fixtures" / "baseline-3cycles.golden.json"
SCENARIOS_DIR = REPO_ROOT / "data" / "scenarios"

client = TestClient(app)


def _load_golden() -> dict[str, Any]:
    return json.loads(GOLDEN_FIXTURE_PATH.read_text(encoding="utf-8"))


def _load_scenarios() -> list[dict[str, Any]]:
    names = ["scenario-a.json", "scenario-b.json", "scenario-c.json", "scenario-d.json"]
    return [json.loads((SCENARIOS_DIR / name).read_text(encoding="utf-8")) for name in names]


def _pct_delta(actual: float, expected: float) -> float:
    return abs(actual - expected) / max(abs(expected), 1e-12) * 100.0


def test_api_01_health_and_cors_headers() -> None:
    res = client.get(
        "/api/v1/health",
        headers={"Origin": "http://localhost:5173"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["service"] == "aokira-api"
    assert body["apiVersion"] == "1.0.0"
    assert body["engineContractVersion"] == "1.0.0"
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"

    preflight = client.options(
        "/api/v1/analytics/evaluate",
        headers={
            "Origin": "https://orls967.github.io",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == "https://orls967.github.io"


def test_api_02_analytics_evaluate_golden_parity() -> None:
    golden = _load_golden()
    metrics = golden["metrics"]

    res = client.post(
        "/api/v1/analytics/evaluate",
        json={
            "scenario": golden["scenario"],
            "events": golden["events"],
            "clientMetrics": metrics,
            "totalSimTimeMs": metrics["totalSimTimeMs"],
            "cumulativeEnergyWh": metrics["estimatedEnergyWh"],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    computed = body["computedMetrics"]

    assert _pct_delta(computed["unitsPerHour"], metrics["unitsPerHour"]) < 0.01
    assert _pct_delta(computed["averageCycleTimeMs"], metrics["averageCycleTimeMs"]) < 0.01
    assert _pct_delta(computed["robotUtilizationPct"], metrics["robotUtilizationPct"]) < 0.01
    assert (
        _pct_delta(body["energyBreakdown"]["perUnitWh"], metrics["energyPerUnitWh"]) < 0.01
    )

    eb = body["energyBreakdown"]
    component_sum = (
        eb["robotMotionWh"]
        + eb["processingStationWh"]
        + eb["conveyorWh"]
        + eb["idleStandbyWh"]
    )
    assert abs(component_sum - eb["totalWh"]) < 1e-9
    assert eb["disclaimer"] == "Synthetic engineering estimate only; not real electrical metering."
    assert body["validation"]["isValid"] is True
    assert body["validation"]["monotonicEventsOk"] is True
    assert body["validation"]["clientServerDeltaPct"] is not None
    assert body["validation"]["clientServerDeltaPct"] < 0.01


def test_api_03_analytics_invalid_inputs_rejected() -> None:
    golden = _load_golden()
    metrics = golden["metrics"]

    # 1. Non-monotonic timestamp
    bad_events = json.loads(json.dumps(golden["events"]))
    bad_events[5]["simTimeMs"] = bad_events[4]["simTimeMs"] - 20
    res_mono = client.post(
        "/api/v1/analytics/evaluate",
        json={
            "scenario": golden["scenario"],
            "events": bad_events,
            "totalSimTimeMs": metrics["totalSimTimeMs"],
            "cumulativeEnergyWh": metrics["estimatedEnergyWh"],
        },
    )
    assert res_mono.status_code == 422
    assert res_mono.json()["error"]["code"] == "INVALID_EVENT_SEQUENCE"

    # 2. Out-of-bounds scenario parameter
    bad_scenario = dict(golden["scenario"])
    bad_scenario["robotSpeedScale"] = 2.50
    res_bounds = client.post(
        "/api/v1/analytics/evaluate",
        json={
            "scenario": bad_scenario,
            "events": golden["events"],
            "totalSimTimeMs": metrics["totalSimTimeMs"],
            "cumulativeEnergyWh": metrics["estimatedEnergyWh"],
        },
    )
    assert res_bounds.status_code == 422
    assert res_bounds.json()["error"]["code"] == "VALIDATION_ERROR"

    # 3. Non-finite JSON NaN rejection
    raw_nan = json.dumps(
        {
            "scenario": golden["scenario"],
            "events": golden["events"],
            "totalSimTimeMs": metrics["totalSimTimeMs"],
            "cumulativeEnergyWh": 1.0,
        }
    ).replace('"cumulativeEnergyWh": 1.0', '"cumulativeEnergyWh": NaN')
    res_nan = client.post(
        "/api/v1/analytics/evaluate",
        content=raw_nan,
        headers={"Content-Type": "application/json"},
    )
    assert res_nan.status_code == 422
    assert res_nan.json()["error"]["code"] == "VALIDATION_ERROR"

    # 4. Payload > 5 MB rejected with 413
    oversized = b'{"padding":"' + (b"x" * (5 * 1024 * 1024 + 64)) + b'"}'
    res_large = client.post(
        "/api/v1/analytics/evaluate",
        content=oversized,
        headers={"Content-Type": "application/json"},
    )
    assert res_large.status_code == 413
    assert res_large.json()["error"]["code"] == "VALIDATION_ERROR"


def test_api_04_scenarios_compare_ranking_and_observed_preference() -> None:
    scenarios = _load_scenarios()
    golden = _load_golden()

    items = [
        {"scenario": scenarios[0], "observedMetrics": golden["metrics"]},
        {"scenario": scenarios[1]},
        {"scenario": scenarios[2]},
        {"scenario": scenarios[3]},
    ]

    res_fast = client.post(
        "/api/v1/scenarios/compare",
        json={"items": items, "rankingObjective": "MIN_CYCLE_TIME"},
    )
    assert res_fast.status_code == 200, res_fast.text
    body_fast = res_fast.json()
    assert len(body_fast["comparisons"]) == 4
    by_id_fast = {c["scenarioId"]: c for c in body_fast["comparisons"]}
    assert by_id_fast["baseline-a"]["source"] == "WASM_OBSERVED"
    assert by_id_fast["faster-robot-b"]["source"] == "ANALYTICAL_ESTIMATE"
    assert body_fast["bestScenarioId"] == "optimized-traj-c"
    assert by_id_fast["optimized-traj-c"]["rank"] == 1

    res_energy = client.post(
        "/api/v1/scenarios/compare",
        json={"items": items, "rankingObjective": "MIN_ENERGY"},
    )
    assert res_energy.status_code == 200
    body_energy = res_energy.json()
    assert body_energy["comparisons"][0]["rank"] == 1
    # Faster dwell & tuned speed beats slow baseline energy
    by_id_e = {c["scenarioId"]: c for c in body_energy["comparisons"]}
    assert (
        by_id_e["optimized-traj-c"]["estimatedEnergyPerUnitWh"]
        < by_id_e["faster-robot-b"]["estimatedEnergyPerUnitWh"]
    )


def test_api_05_optimization_run_improves_within_bounds() -> None:
    base = _load_scenarios()[0]
    res = client.post(
        "/api/v1/optimization/run",
        json={
            "baseScenario": base,
            "bounds": {
                "robotSpeedScale": [0.50, 1.50],
                "robotAccelScale": [0.50, 1.50],
                "inputConveyorSpeedMps": [0.10, 0.55],
                "outputConveyorSpeedMps": [0.10, 0.55],
                "processingDwellMs": [1000, 3500],
            },
            "objective": "MIN_CYCLE_TIME",
            "constraints": {
                "minThroughputUnitsPerHour": 320.0,
                "requireZeroCollisions": True,
            },
            "maxEvaluations": 90,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["feasible"] is True
    assert 1 <= body["evaluationsRun"] <= 90
    rec = body["recommendedScenario"]
    assert 0.50 <= rec["robotSpeedScale"] <= 1.50
    assert 0.50 <= rec["robotAccelScale"] <= 1.50
    assert 0.10 <= rec["inputConveyorSpeedMps"] <= 0.55
    assert 0.10 <= rec["outputConveyorSpeedMps"] <= 0.55
    assert 1000 <= rec["processingDwellMs"] <= 3500
    assert body["recommendedProjected"]["throughputUnitsPerHour"] >= 320.0
    assert body["deltas"]["cycleTimePct"] < 0.0
    assert body["deltas"]["throughputPct"] > 0.0
    assert len(body["topCandidates"]) >= 1


def test_api_06_optimization_infeasible_returns_domain_error() -> None:
    base = _load_scenarios()[0]
    res = client.post(
        "/api/v1/optimization/run",
        json={
            "baseScenario": base,
            "bounds": {
                "robotSpeedScale": [0.50, 1.00],
                "robotAccelScale": [0.50, 1.00],
                "inputConveyorSpeedMps": [0.15, 0.30],
                "outputConveyorSpeedMps": [0.15, 0.30],
                "processingDwellMs": [2000, 3000],
            },
            "objective": "MIN_CYCLE_TIME",
            "constraints": {
                "minThroughputUnitsPerHour": 9999.0,
                "requireZeroCollisions": True,
            },
            "maxEvaluations": 40,
        },
    )
    assert res.status_code == 422
    body = res.json()
    assert body["error"]["code"] == "INFEASIBLE_OPTIMIZATION"
    assert len(body["error"]["details"]) >= 1


def test_api_07_statelessness_and_determinism_across_repeated_calls() -> None:
    golden = _load_golden()
    base = _load_scenarios()[0]
    eval_payload = {
        "scenario": golden["scenario"],
        "events": golden["events"],
        "totalSimTimeMs": golden["metrics"]["totalSimTimeMs"],
        "cumulativeEnergyWh": golden["metrics"]["estimatedEnergyWh"],
    }
    opt_payload = {
        "baseScenario": base,
        "bounds": {
            "robotSpeedScale": [0.70, 1.35],
            "robotAccelScale": [0.70, 1.35],
            "inputConveyorSpeedMps": [0.15, 0.45],
            "outputConveyorSpeedMps": [0.15, 0.45],
            "processingDwellMs": [1200, 3000],
        },
        "objective": "BALANCED",
        "constraints": {
            "minThroughputUnitsPerHour": 220.0,
            "requireZeroCollisions": True,
        },
        "maxEvaluations": 60,
    }

    eval_snapshots = [
        client.post("/api/v1/analytics/evaluate", json=eval_payload).json()
        for _ in range(5)
    ]
    opt_snapshots = [
        client.post("/api/v1/optimization/run", json=opt_payload).json()
        for _ in range(5)
    ]

    for item in eval_snapshots[1:]:
        assert item == eval_snapshots[0]
    for item in opt_snapshots[1:]:
        assert item == opt_snapshots[0]
