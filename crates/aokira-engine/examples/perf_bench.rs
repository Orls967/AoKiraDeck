use std::time::Instant;

use aokira_engine::scheduler::SimulationEngine;
use aokira_engine::types::Pose3D;

fn main() {
    let mut engine = SimulationEngine::new(None).expect("workcell loads");
    let baseline_json = include_str!("../../../data/scenarios/scenario-a.json");
    let mut scenario: aokira_engine::types::ScenarioConfig =
        serde_json::from_str(baseline_json).expect("scenario parses");
    scenario.cycle_mode = aokira_engine::types::CycleMode::Continuous;
    scenario.target_quantity = None;

    engine.load_scenario(scenario).expect("load scenario");
    engine.command("START").expect("start sim");

    // Measure 1,000 individual 20 ms ticks (full FK + trajectory + exact collision + conveyors + energy)
    let t_start = Instant::now();
    for _ in 0..1000 {
        let _ = engine.step_ticks(1);
    }
    let tick_elapsed_ms = t_start.elapsed().as_secs_f64() * 1000.0;
    let avg_tick_ms = tick_elapsed_ms / 1000.0;

    // Measure 3-seed DLS IK solves across reachable & boundary/unreachable targets
    let mut ik_engine = SimulationEngine::new(None).expect("workcell loads");
    let reachable_target: Pose3D = serde_json::from_str(
        r#"{"position":{"x":-0.65,"y":0.79,"z":0.0},"orientation":{"x":0.0,"y":1.0,"z":0.0,"w":0.0}}"#,
    )
    .expect("target parses");
    let unreachable_target: Pose3D = serde_json::from_str(
        r#"{"position":{"x":2.5,"y":1.5,"z":2.5},"orientation":{"x":0.0,"y":0.0,"z":0.0,"w":1.0}}"#,
    )
    .expect("target parses");

    let mut worst_reachable_ms = 0.0_f64;
    let mut sum_reachable_ms = 0.0_f64;
    for _ in 0..50 {
        let t0 = Instant::now();
        let res = ik_engine.solve_ik(&reachable_target, false);
        let dt_ms = t0.elapsed().as_secs_f64() * 1000.0;
        assert!(res.ok);
        worst_reachable_ms = worst_reachable_ms.max(dt_ms);
        sum_reachable_ms += dt_ms;
    }

    let t0_unreach = Instant::now();
    let res_unreach = ik_engine.solve_ik(&unreachable_target, false);
    let unreach_ms = t0_unreach.elapsed().as_secs_f64() * 1000.0;
    assert!(!res_unreach.ok);

    println!(
        "[PERF] Rust 1,000 ticks total: {tick_elapsed_ms:.3} ms (avg {avg_tick_ms:.4} ms / tick)"
    );
    println!(
        "[PERF] Rust 3-seed DLS IK reachable avg: {:.4} ms | worst: {worst_reachable_ms:.4} ms",
        sum_reachable_ms / 50.0
    );
    println!("[PERF] Rust 3-seed DLS IK unreachable rejection: {unreach_ms:.4} ms");
}
