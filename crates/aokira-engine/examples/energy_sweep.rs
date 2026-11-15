//! Sweeps robot speed/accel scale through the real engine and prints steady-state cycle
//! time, robot motion time and energy per unit. Used to calibrate and sanity-check the
//! Python analytical surrogate (`apps/api/app/analytics/surrogate.py`).
//!
//!     cargo run --release --example energy_sweep
use aokira_engine::scheduler::SimulationEngine;
use aokira_engine::types::{CycleMode, ScenarioConfig, SimulationRunStatus};

fn run(speed: f64, belt: f64, dwell_ms: u64) -> (f64, f64, f64, f64) {
    run_split(speed, belt, belt, dwell_ms)
}

fn run_split(speed: f64, belt_in: f64, belt_out: f64, dwell_ms: u64) -> (f64, f64, f64, f64) {
    let belt = belt_in;
    let mut engine = SimulationEngine::new(None).expect("workcell loads");
    let mut scenario: ScenarioConfig =
        serde_json::from_str(include_str!("../../../data/scenarios/scenario-a.json"))
            .expect("scenario parses");
    scenario.cycle_mode = CycleMode::FixedCount;
    scenario.target_quantity = Some(6);
    scenario.robot_speed_scale = speed;
    scenario.robot_accel_scale = speed;
    scenario.input_conveyor_speed_mps = belt_in;
    scenario.output_conveyor_speed_mps = belt_out;
    scenario.processing_dwell_ms = dwell_ms;
    engine.load_scenario(scenario).expect("load");
    engine.command("START").expect("start");
    for _ in 0..20_000 {
        if engine.step_ticks(10).snapshot.run_status == SimulationRunStatus::Completed {
            break;
        }
    }
    let snap = engine.snapshot();
    if snap.run_status != SimulationRunStatus::Completed {
        eprintln!(
            "  [speed {speed} belt {belt} dwell {dwell_ms}] status {:?} fault {:?}",
            snap.run_status, snap.active_fault
        );
    }
    let m = engine.metrics();
    // Skip the first (warm-up) cycle: steady-state averages only.
    let steady: Vec<_> = m.per_cycle_history.iter().skip(1).collect();
    let n = steady.len().max(1) as f64;
    let cycle = steady.iter().map(|c| c.cycle_time_ms as f64).sum::<f64>() / n;
    let mv = steady.iter().map(|c| c.robot_move_ms as f64).sum::<f64>() / n;
    let wait = steady.iter().map(|c| c.wait_time_ms as f64).sum::<f64>() / n;
    let wh = steady.iter().map(|c| c.energy_wh).sum::<f64>() / n;
    (cycle, mv, wait, wh)
}

fn main() {
    if std::env::args().any(|a| a == "--grid") {
        // Machine-readable grid for surrogate calibration: speed, belt, dwell, cycle, move, wait, wh
        for s in [0.5, 0.75, 1.0, 1.2, 1.4] {
            for b in [0.15, 0.2, 0.35, 0.5] {
                for d in [1200_u64, 2500, 3500] {
                    let (c, mv, w, wh) = run(s, b, d);
                    println!("{s},{b},{d},{c},{mv},{w},{wh}");
                }
            }
        }
        for (bi, bo) in [(0.15, 0.5), (0.5, 0.15), (0.2, 0.45), (0.45, 0.2)] {
            let (c, mv, w, wh) = run_split(1.0, bi, bo, 2500);
            println!("split,{bi},{bo},2500,{c},{mv},{w},{wh}");
        }
        return;
    }
    println!("speed | cycle ms | move ms | wait ms | Wh/unit   (belts 0.50 m/s, dwell 1200 ms)");
    for s in [0.5, 0.6, 0.8, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5] {
        let (c, mv, w, wh) = run(s, 0.5, 1200);
        println!("{s:5.2} | {c:8.0} | {mv:7.0} | {w:7.0} | {wh:.4}");
    }
    println!("\nScenario A baseline (1.0x, 0.20 m/s, 2500 ms):");
    let (c, mv, w, wh) = run(1.0, 0.2, 2500);
    println!("cycle {c:.0} ms | move {mv:.0} ms | wait {w:.0} ms | {wh:.4} Wh/unit");
}
