use std::collections::BTreeMap;

use crate::collision::evaluate_workcell_collisions;
use crate::kinematics::{forward_kinematics, inverse_kinematics};
use crate::production::{PrecomputedWaypoints, ProductionMachine};
use crate::robot::validate_joint_angles;
use crate::types::{
    validate_scenario_config, validate_workcell_config, CollisionSeverity, EventSeverity,
    FaultCode, GripperActuationState, IkSolveResponse, Pose3D, ProductionMetrics, ScenarioConfig,
    SimulationEvent, SimulationEventType, SimulationRunStatus, SimulationSnapshot, TickStepOutput,
    WorkcellConfig,
};
use crate::CANONICAL_WORKCELL_JSON;

pub struct SimulationEngine {
    pub machine: ProductionMachine,
}

impl SimulationEngine {
    pub fn new(workcell_json: Option<&str>) -> Result<Self, String> {
        let raw = workcell_json.unwrap_or(CANONICAL_WORKCELL_JSON);
        let config: WorkcellConfig =
            serde_json::from_str(raw).map_err(|e| format!("Invalid workcell JSON: {e}"))?;
        validate_workcell_config(&config)?;
        let waypoints = PrecomputedWaypoints::compute(&config)
            .map_err(|(_, msg)| format!("Failed to solve canonical workcell waypoints: {msg}"))?;
        let scenario = ScenarioConfig::default();
        Ok(Self {
            machine: ProductionMachine::new(config, scenario, waypoints),
        })
    }

    pub fn load_scenario(&mut self, scenario: ScenarioConfig) -> Result<TickStepOutput, String> {
        validate_scenario_config(&scenario)?;
        let cfg = self.machine.config.clone();
        let wps = self.machine.waypoints.clone();
        self.machine = ProductionMachine::new(cfg, scenario, wps);
        let mut events = Vec::new();
        self.machine.emit_event(
            SimulationEventType::SimReset,
            EventSeverity::Info,
            None,
            None,
            format!("Loaded scenario {}", self.machine.scenario.name),
            BTreeMap::new(),
            &mut events,
        );
        Ok(self.output_with_events(events))
    }

    pub fn command(&mut self, action: &str) -> Result<TickStepOutput, String> {
        let mut events = Vec::new();
        match action {
            "START" => self.machine.start(&mut events),
            "PAUSE" => self.machine.pause(&mut events),
            "RESUME" => self.machine.resume(&mut events),
            "STOP" => self.machine.stop(&mut events),
            "RESET" => self.machine.reset(&mut events),
            "ESTOP" => self.machine.estop(&mut events),
            other => return Err(format!("Unknown simulation command: {other}")),
        }
        Ok(self.output_with_events(events))
    }

    pub fn step_ticks(&mut self, tick_count: u32) -> TickStepOutput {
        let mut new_events = Vec::new();
        let count = tick_count.min(10_000);
        for _ in 0..count {
            self.machine.step_one_tick(&mut new_events);
        }
        self.output_with_events(new_events)
    }

    pub fn set_joints(&mut self, angles: &[f64]) -> Result<TickStepOutput, String> {
        if !matches!(
            self.machine.run_status,
            SimulationRunStatus::Ready
                | SimulationRunStatus::Stopped
                | SimulationRunStatus::Completed
        ) {
            return Err(
                "Manual joint jog is permitted only when simulation is READY, STOPPED, or COMPLETED"
                    .to_string(),
            );
        }
        let mut events = Vec::new();
        match validate_joint_angles(&self.machine.config, angles) {
            Ok(valid) => {
                self.machine.q = valid;
                self.machine.dq = [0.0; 6];
                self.machine.ddq = [0.0; 6];
                let fk = forward_kinematics(&self.machine.config, &valid);
                let held_wp = self
                    .machine
                    .gripper
                    .state
                    .held_workpiece_id
                    .as_deref()
                    .and_then(|id| self.machine.workpieces.iter().find(|w| w.id == id));
                self.machine.collision = evaluate_workcell_collisions(
                    &self.machine.config,
                    &fk.frames_base,
                    &fk.tcp_world_pose,
                    held_wp,
                    &self.machine.workpieces,
                );
                if self.machine.collision.severity == CollisionSeverity::Collision {
                    let msg = format!(
                        "Manual jog collision: {} vs {}",
                        self.machine.collision.pair_a, self.machine.collision.pair_b
                    );
                    self.machine.trigger_fault(
                        FaultCode::Collision,
                        Some(self.machine.collision.pair_b.clone()),
                        msg,
                        SimulationEventType::CollisionDetected,
                        &mut events,
                    );
                } else if self.machine.collision.severity == CollisionSeverity::NearCollision {
                    let msg = format!(
                        "Manual jog near collision: {} vs {} ({:.1} mm)",
                        self.machine.collision.pair_a,
                        self.machine.collision.pair_b,
                        self.machine.collision.min_clearance_meters * 1000.0
                    );
                    self.machine.emit_event(
                        SimulationEventType::NearCollisionWarning,
                        EventSeverity::Warning,
                        None,
                        Some(self.machine.collision.pair_b.clone()),
                        msg,
                        BTreeMap::new(),
                        &mut events,
                    );
                }
                Ok(self.output_with_events(events))
            }
            Err((_code, msg)) => {
                self.machine.emit_event(
                    SimulationEventType::JointLimitViolated,
                    EventSeverity::Error,
                    None,
                    Some("robot-arm".to_string()),
                    msg.clone(),
                    BTreeMap::new(),
                    &mut events,
                );
                Err(msg)
            }
        }
    }

    pub fn solve_ik(&mut self, target_pose: &Pose3D, apply: bool) -> IkSolveResponse {
        match inverse_kinematics(&self.machine.config, target_pose, &self.machine.q) {
            Ok(angles) => {
                if apply
                    && matches!(
                        self.machine.run_status,
                        SimulationRunStatus::Ready
                            | SimulationRunStatus::Stopped
                            | SimulationRunStatus::Completed
                    )
                {
                    let _ = self.set_joints(&angles);
                }
                IkSolveResponse {
                    ok: true,
                    angles_rad: Some(angles),
                    fault: None,
                    message: None,
                    snapshot: Some(self.machine.snapshot()),
                }
            }
            Err((fault, msg)) => {
                let mut events = Vec::new();
                let ev_type = match fault {
                    FaultCode::JointLimitViolation => SimulationEventType::JointLimitViolated,
                    _ => SimulationEventType::IkTargetUnreachable,
                };
                self.machine.emit_event(
                    ev_type,
                    EventSeverity::Error,
                    None,
                    Some("robot-arm".to_string()),
                    msg.clone(),
                    BTreeMap::new(),
                    &mut events,
                );
                IkSolveResponse {
                    ok: false,
                    angles_rad: None,
                    fault: Some(fault),
                    message: Some(msg),
                    snapshot: None,
                }
            }
        }
    }

    pub fn set_gripper(&mut self, open: bool) -> TickStepOutput {
        if open {
            self.machine.gripper.release();
            self.machine.gripper.state.actuation_state = GripperActuationState::Open;
            self.machine.gripper.state.jaw_opening_meters =
                self.machine.config.gripper.max_opening_meters;
            self.machine.gripper.state.clamp_force_normalized = 0.0;
        } else {
            self.machine.gripper.state.actuation_state = GripperActuationState::Closed;
            self.machine.gripper.state.jaw_opening_meters =
                self.machine.config.gripper.min_opening_meters;
            self.machine.gripper.state.clamp_force_normalized = 1.0;
        }
        self.output_with_events(Vec::new())
    }

    pub fn snapshot(&self) -> SimulationSnapshot {
        self.machine.snapshot()
    }

    pub fn metrics(&self) -> ProductionMetrics {
        self.machine
            .metrics
            .build_metrics(&self.machine.scenario, &self.machine.all_events)
    }

    fn output_with_events(&self, new_events: Vec<SimulationEvent>) -> TickStepOutput {
        TickStepOutput {
            snapshot: self.machine.snapshot(),
            new_events,
            metrics: self.metrics(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{CycleMode, ProductionStage, SimulationEventType, WorkpieceStatus};

    #[test]
    fn rust_prod_01_single_cycle_complete() {
        let mut engine = SimulationEngine::new(None).unwrap();
        let scenario = ScenarioConfig {
            cycle_mode: CycleMode::Single,
            target_quantity: Some(1),
            ..ScenarioConfig::default()
        };
        engine.load_scenario(scenario).unwrap();

        let start_out = engine.command("START").unwrap();
        let mut seen_stages = Vec::new();
        for ev in start_out.new_events {
            if ev.event_type == SimulationEventType::StageEntered {
                seen_stages.push(ev.stage);
            }
        }
        for _ in 0..2000 {
            let out = engine.step_ticks(1);
            for ev in out.new_events {
                if ev.event_type == SimulationEventType::StageEntered {
                    seen_stages.push(ev.stage);
                }
            }
            if out.snapshot.run_status == SimulationRunStatus::Completed {
                break;
            }
        }

        let snap = engine.snapshot();
        assert_eq!(
            snap.run_status,
            SimulationRunStatus::Completed,
            "unexpected status at stage {:?}, fault: {:?}, sim_time={}",
            snap.stage,
            snap.active_fault,
            snap.sim_time_ms
        );
        assert_eq!(snap.completed_units, 1);
        assert_eq!(
            seen_stages,
            vec![
                ProductionStage::DetectObject,
                ProductionStage::ApproachPick,
                ProductionStage::PickWorkpiece,
                ProductionStage::TransferToStation,
                ProductionStage::ProcessWorkpiece,
                ProductionStage::PickFinished,
                ProductionStage::TransferToOutput,
                ProductionStage::PlaceWorkpiece,
                ProductionStage::CycleComplete,
                ProductionStage::Idle,
            ]
        );
        assert!(snap
            .workpieces
            .iter()
            .any(|w| w.status == WorkpieceStatus::OnOutputConveyor));
    }

    #[test]
    fn rust_prod_02_multi_cycle_determinism() {
        let run = |batch: u32| -> (SimulationSnapshot, Vec<SimulationEvent>, ProductionMetrics) {
            let mut engine = SimulationEngine::new(None).unwrap();
            let scenario = ScenarioConfig {
                cycle_mode: CycleMode::FixedCount,
                target_quantity: Some(3),
                ..ScenarioConfig::default()
            };
            engine.load_scenario(scenario).unwrap();
            engine.command("START").unwrap();
            let mut steps = 0;
            while steps < 4000 {
                let out = engine.step_ticks(batch);
                steps += batch;
                if out.snapshot.run_status == SimulationRunStatus::Completed {
                    break;
                }
            }
            assert_eq!(engine.snapshot().completed_units, 3);
            (
                engine.snapshot(),
                engine.machine.all_events.clone(),
                engine.metrics(),
            )
        };

        let (s1, e1, m1) = run(1);
        let (s5, e5, m5) = run(5);
        assert_eq!(s1, s5);
        assert_eq!(e1, e5);
        assert_eq!(m1, m5);
    }

    #[test]
    fn rust_prod_03_transport_pause_resume_stop_reset() {
        let mut engine = SimulationEngine::new(None).unwrap();
        engine.command("START").unwrap();
        engine.step_ticks(20);
        let t_before_pause = engine.snapshot().sim_time_ms;
        assert_eq!(t_before_pause, 400);

        engine.command("PAUSE").unwrap();
        assert_eq!(engine.snapshot().run_status, SimulationRunStatus::Paused);
        engine.step_ticks(25);
        assert_eq!(engine.snapshot().sim_time_ms, t_before_pause);

        engine.command("RESUME").unwrap();
        assert_eq!(engine.snapshot().run_status, SimulationRunStatus::Running);
        engine.step_ticks(10);
        assert_eq!(engine.snapshot().sim_time_ms, 600);

        engine.command("STOP").unwrap();
        assert_eq!(engine.snapshot().run_status, SimulationRunStatus::Stopped);

        engine.command("RESET").unwrap();
        let snap = engine.snapshot();
        assert_eq!(snap.run_status, SimulationRunStatus::Ready);
        assert_eq!(snap.sim_time_ms, 0);
        assert_eq!(snap.completed_units, 0);
        assert!(snap.workpieces.is_empty());
    }

    #[test]
    fn rust_prod_04_fault_injection_and_recovery() {
        let mut engine = SimulationEngine::new(None).unwrap();
        engine.command("START").unwrap();
        engine.step_ticks(5);
        engine.command("ESTOP").unwrap();
        assert_eq!(engine.snapshot().run_status, SimulationRunStatus::Faulted);
        assert_eq!(
            engine.snapshot().active_fault.as_ref().unwrap().code,
            FaultCode::EstopActive
        );
        let t_fault = engine.snapshot().sim_time_ms;
        engine.step_ticks(10);
        assert_eq!(engine.snapshot().sim_time_ms, t_fault);
        engine.command("RESET").unwrap();
        assert_eq!(engine.snapshot().run_status, SimulationRunStatus::Ready);
        assert!(engine.snapshot().active_fault.is_none());

        let mut engine2 = SimulationEngine::new(None).unwrap();
        engine2.machine.inject_object_unavailable = true;
        engine2.command("START").unwrap();
        engine2.step_ticks(1300);
        assert_eq!(engine2.snapshot().run_status, SimulationRunStatus::Faulted);
        assert_eq!(
            engine2.snapshot().active_fault.as_ref().unwrap().code,
            FaultCode::ObjectUnavailable
        );

        let mut engine3 = SimulationEngine::new(None).unwrap();
        engine3.machine.scenario.workpiece_mass_kg = 5.5;
        engine3.command("START").unwrap();
        engine3.step_ticks(600);
        assert_eq!(engine3.snapshot().run_status, SimulationRunStatus::Faulted);
        assert_eq!(
            engine3.snapshot().active_fault.as_ref().unwrap().code,
            FaultCode::PayloadExceeded
        );
    }

    #[test]
    fn rust_prod_05_energy_monotonic_and_scales_with_speed_and_mass() {
        let run_energy = |speed_scale: f64, mass_kg: f64| -> f64 {
            let mut engine = SimulationEngine::new(None).unwrap();
            let scenario = ScenarioConfig {
                cycle_mode: CycleMode::Single,
                target_quantity: Some(1),
                robot_speed_scale: speed_scale,
                workpiece_mass_kg: mass_kg,
                ..ScenarioConfig::default()
            };
            engine.load_scenario(scenario).unwrap();
            engine.command("START").unwrap();
            let mut prev_e = 0.0;
            for _ in 0..2000 {
                let out = engine.step_ticks(1);
                assert!(out.snapshot.cumulative_energy_wh >= prev_e);
                prev_e = out.snapshot.cumulative_energy_wh;
                if out.snapshot.run_status == SimulationRunStatus::Completed {
                    break;
                }
            }
            prev_e
        };

        let e_base = run_energy(1.0, 1.2);
        let e_heavy = run_energy(1.0, 4.5);
        assert!(e_heavy > e_base);
    }

    #[derive(serde::Serialize, serde::Deserialize, PartialEq, Debug)]
    #[serde(rename_all = "camelCase")]
    struct GoldenFixture {
        scenario: ScenarioConfig,
        events: Vec<SimulationEvent>,
        metrics: ProductionMetrics,
        final_snapshot: SimulationSnapshot,
    }

    #[test]
    fn rust_prod_06_golden_fixture_regression() {
        let mut engine = SimulationEngine::new(None).unwrap();
        let scenario = ScenarioConfig {
            scenario_id: "baseline-a".to_string(),
            name: "Scenario A: Baseline".to_string(),
            description: "Canonical default workcell operating parameters (1.0x robot speed, 0.20 m/s conveyors, 2500 ms process dwell).".to_string(),
            cycle_mode: CycleMode::FixedCount,
            target_quantity: Some(3),
            ..ScenarioConfig::default()
        };
        engine.load_scenario(scenario.clone()).unwrap();
        engine.command("START").unwrap();

        for _ in 0..4000 {
            let out = engine.step_ticks(5);
            if out.snapshot.run_status == SimulationRunStatus::Completed {
                break;
            }
        }
        assert_eq!(engine.snapshot().run_status, SimulationRunStatus::Completed);
        assert_eq!(engine.snapshot().completed_units, 3);

        let fixture = GoldenFixture {
            scenario,
            events: engine.machine.all_events.clone(),
            metrics: engine.metrics(),
            final_snapshot: engine.snapshot(),
        };

        let actual_json = format!("{}\n", serde_json::to_string_pretty(&fixture).unwrap());
        let fixture_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/fixtures/baseline-3cycles.golden.json");
        let update = std::env::var("AOKIRA_UPDATE_GOLDEN").as_deref() == Ok("1");
        if update || !fixture_path.exists() {
            if let Some(parent) = fixture_path.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&fixture_path, &actual_json).unwrap();
        }

        let disk_raw = std::fs::read_to_string(&fixture_path).expect("golden fixture exists");
        assert_eq!(
            actual_json, disk_raw,
            "golden fixture JSON regression mismatch"
        );
        let parsed: GoldenFixture =
            serde_json::from_str(&disk_raw).expect("golden fixture parses cleanly");
        assert_eq!(parsed.events.len(), fixture.events.len());
        assert_eq!(parsed.final_snapshot.completed_units, 3);
    }
}
