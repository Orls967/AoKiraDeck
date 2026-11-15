use std::collections::BTreeMap;

use crate::collision::evaluate_workcell_collisions;
use crate::conveyor::advance_conveyors;
use crate::gripper::GripperController;
use crate::kinematics::{forward_kinematics, home_joints, inverse_kinematics};
use crate::metrics::{compute_tick_energy_wh, CycleAccumulator, MetricsTracker};
use crate::robot::build_joint_states;
use crate::trajectory::QuinticSegment;
use crate::types::{
    ActiveFault, CollisionReport, CollisionSeverity, ConveyorRuntimeState, CycleMode,
    EventSeverity, FaultCode, PerCycleHistoryEntry, Pose3D, ProductionStage, Quat, ScenarioConfig,
    SimulationEvent, SimulationEventType, SimulationRunStatus, SimulationSnapshot,
    StationRuntimeState, Vec3, WorkcellConfig, WorkpieceState, WorkpieceStatus,
};

const OBJECT_UNAVAILABLE_TIMEOUT_MS: u64 = 25_000;

#[derive(Debug, Clone)]
pub struct PrecomputedWaypoints {
    pub q_home: [f64; 6],
    pub q_input_approach: [f64; 6],
    pub q_input_pick: [f64; 6],
    pub q_station_approach: [f64; 6],
    pub q_station_place: [f64; 6],
    pub q_output_approach: [f64; 6],
    pub q_output_place: [f64; 6],
}

impl PrecomputedWaypoints {
    pub fn compute(config: &WorkcellConfig) -> Result<Self, (FaultCode, String)> {
        let q_home = home_joints(config);
        let orient = config.processing_station.target_pose_world.orientation;

        let input_pick_pos = config.input_conveyor.target_zone_world;
        let input_approach_pos =
            Vec3::new(input_pick_pos.x, input_pick_pos.y + 0.140, input_pick_pos.z);

        let station_place_pos = config.processing_station.target_pose_world.position;
        let station_approach_pos = Vec3::new(
            station_place_pos.x,
            station_place_pos.y + 0.140,
            station_place_pos.z,
        );

        let output_place_pos = config.output_conveyor.target_zone_world;
        let output_approach_pos = Vec3::new(
            output_place_pos.x,
            output_place_pos.y + 0.140,
            output_place_pos.z,
        );

        let q_input_approach = inverse_kinematics(
            config,
            &Pose3D {
                position: input_approach_pos,
                orientation: orient,
            },
            &q_home,
        )?;
        let q_input_pick = inverse_kinematics(
            config,
            &Pose3D {
                position: input_pick_pos,
                orientation: orient,
            },
            &q_input_approach,
        )?;
        let q_station_approach = inverse_kinematics(
            config,
            &Pose3D {
                position: station_approach_pos,
                orientation: orient,
            },
            &q_home,
        )?;
        let q_station_place = inverse_kinematics(
            config,
            &Pose3D {
                position: station_place_pos,
                orientation: orient,
            },
            &q_station_approach,
        )?;
        let q_output_approach = inverse_kinematics(
            config,
            &Pose3D {
                position: output_approach_pos,
                orientation: orient,
            },
            &q_home,
        )?;
        let q_output_place = inverse_kinematics(
            config,
            &Pose3D {
                position: output_place_pos,
                orientation: orient,
            },
            &q_output_approach,
        )?;

        Ok(Self {
            q_home,
            q_input_approach,
            q_input_pick,
            q_station_approach,
            q_station_place,
            q_output_approach,
            q_output_place,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StageSubphase {
    None,
    DetectWait,
    Moving,
    GripperActuating,
    Retracting,
    ProcessingDwell,
    ReturningHome,
}

pub struct ProductionMachine {
    pub config: WorkcellConfig,
    pub scenario: ScenarioConfig,
    pub waypoints: PrecomputedWaypoints,

    pub run_id: String,
    pub sim_time_ms: u64,
    pub tick_index: u64,
    pub run_status: SimulationRunStatus,
    pub stage: ProductionStage,
    subphase: StageSubphase,

    pub active_cycle_index: u64,
    pub completed_units: u64,

    pub q: [f64; 6],
    pub dq: [f64; 6],
    pub ddq: [f64; 6],
    active_segment: Option<QuinticSegment>,

    pub gripper: GripperController,
    pub input_conveyor: ConveyorRuntimeState,
    pub output_conveyor: ConveyorRuntimeState,
    pub station: StationRuntimeState,
    pub workpieces: Vec<WorkpieceState>,
    pub collision: CollisionReport,
    prev_collision_severity: CollisionSeverity,
    pub active_fault: Option<ActiveFault>,

    pub metrics: MetricsTracker,
    cycle_acc: Option<CycleAccumulator>,
    pub all_events: Vec<SimulationEvent>,
    next_event_seq: u64,
    next_wp_seq: u64,
    active_workpiece_id: Option<String>,
    detect_wait_ms: u64,
    dwell_elapsed_ms: u64,

    pub inject_object_unavailable: bool,
}

impl ProductionMachine {
    pub fn new(
        config: WorkcellConfig,
        scenario: ScenarioConfig,
        waypoints: PrecomputedWaypoints,
    ) -> Self {
        let run_id = format!("run-{}-s{}", scenario.scenario_id, scenario.seed);
        let q = waypoints.q_home;
        let dq = [0.0; 6];
        let ddq = [0.0; 6];
        let fk = forward_kinematics(&config, &q);
        let collision =
            evaluate_workcell_collisions(&config, &fk.frames_base, &fk.tcp_world_pose, None, &[]);

        Self {
            run_id: run_id.clone(),
            sim_time_ms: 0,
            tick_index: 0,
            run_status: SimulationRunStatus::Ready,
            stage: ProductionStage::Idle,
            subphase: StageSubphase::None,
            active_cycle_index: 0,
            completed_units: 0,
            q,
            dq,
            ddq,
            active_segment: None,
            gripper: GripperController::new(&config),
            input_conveyor: ConveyorRuntimeState {
                id: config.input_conveyor.id.clone(),
                running: false,
                speed_meters_per_sec: scenario.input_conveyor_speed_mps,
                sensor_triggered: false,
                workpiece_count_on_belt: 0,
            },
            output_conveyor: ConveyorRuntimeState {
                id: config.output_conveyor.id.clone(),
                running: false,
                speed_meters_per_sec: scenario.output_conveyor_speed_mps,
                sensor_triggered: false,
                workpiece_count_on_belt: 0,
            },
            station: StationRuntimeState {
                occupied: false,
                active_workpiece_id: None,
                processing_progress: 0.0,
                clamp_engaged: false,
            },
            workpieces: Vec::new(),
            collision,
            prev_collision_severity: CollisionSeverity::None,
            active_fault: None,
            metrics: MetricsTracker::new(run_id, scenario.scenario_id.clone()),
            cycle_acc: None,
            all_events: Vec::new(),
            next_event_seq: 0,
            next_wp_seq: 0,
            active_workpiece_id: None,
            detect_wait_ms: 0,
            dwell_elapsed_ms: 0,
            inject_object_unavailable: false,
            config,
            scenario,
            waypoints,
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn emit_event(
        &mut self,
        event_type: SimulationEventType,
        severity: EventSeverity,
        workpiece_id: Option<String>,
        component_id: Option<String>,
        message: String,
        payload: BTreeMap<String, crate::types::PayloadValue>,
        out_events: &mut Vec<SimulationEvent>,
    ) {
        self.next_event_seq += 1;
        let ev = SimulationEvent {
            seq: self.next_event_seq,
            run_id: self.run_id.clone(),
            sim_time_ms: self.sim_time_ms,
            event_type,
            stage: self.stage,
            cycle_index: self.active_cycle_index,
            workpiece_id,
            component_id,
            severity,
            message,
            payload,
        };
        self.all_events.push(ev.clone());
        out_events.push(ev);
    }

    pub fn trigger_fault(
        &mut self,
        code: FaultCode,
        component_id: Option<String>,
        message: String,
        event_type: SimulationEventType,
        out_events: &mut Vec<SimulationEvent>,
    ) {
        self.run_status = SimulationRunStatus::Faulted;
        self.stage = ProductionStage::Fault;
        self.subphase = StageSubphase::None;
        self.dq = [0.0; 6];
        self.ddq = [0.0; 6];
        self.active_segment = None;
        self.input_conveyor.running = false;
        self.output_conveyor.running = false;
        self.active_fault = Some(ActiveFault {
            code,
            message: message.clone(),
            component_id: component_id.clone(),
        });
        if let Some(acc) = self.cycle_acc.as_mut() {
            acc.had_fault = true;
        }
        self.emit_event(
            event_type,
            EventSeverity::Error,
            self.active_workpiece_id.clone(),
            component_id,
            message,
            BTreeMap::new(),
            out_events,
        );
    }

    fn transition_stage(
        &mut self,
        next_stage: ProductionStage,
        next_subphase: StageSubphase,
        component_id: Option<String>,
        msg: &str,
        out_events: &mut Vec<SimulationEvent>,
    ) {
        self.stage = next_stage;
        self.subphase = next_subphase;
        self.emit_event(
            SimulationEventType::StageEntered,
            EventSeverity::Info,
            self.active_workpiece_id.clone(),
            component_id,
            msg.to_string(),
            BTreeMap::new(),
            out_events,
        );
    }

    fn plan_segment_to(&mut self, q_end: [f64; 6]) -> Result<(), (FaultCode, String)> {
        let smoothness = self.scenario.trajectory_smoothness_factor;
        let speed_scale = (self.scenario.robot_speed_scale / smoothness).clamp(0.16, 1.50);
        let accel_scale = (self.scenario.robot_accel_scale / smoothness).clamp(0.16, 1.50);
        let seg = QuinticSegment::plan(
            &self.config,
            self.q,
            q_end,
            speed_scale,
            accel_scale,
            self.scenario.timestep_ms,
        )?;
        self.active_segment = Some(seg);
        Ok(())
    }

    fn begin_next_cycle(&mut self, out_events: &mut Vec<SimulationEvent>) {
        self.active_cycle_index += 1;
        self.cycle_acc = Some(CycleAccumulator::new(
            self.active_cycle_index,
            self.sim_time_ms,
        ));
        self.detect_wait_ms = 0;
        self.active_workpiece_id = None;
        self.emit_event(
            SimulationEventType::CycleStarted,
            EventSeverity::Info,
            None,
            None,
            format!("Cycle {} started", self.active_cycle_index),
            BTreeMap::new(),
            out_events,
        );
        self.transition_stage(
            ProductionStage::DetectObject,
            StageSubphase::DetectWait,
            Some("input-conveyor".to_string()),
            "Waiting for workpiece at input pick zone",
            out_events,
        );
    }

    pub fn start(&mut self, out_events: &mut Vec<SimulationEvent>) {
        match self.run_status {
            SimulationRunStatus::Ready => {
                self.run_status = SimulationRunStatus::Running;
                self.emit_event(
                    SimulationEventType::SimStarted,
                    EventSeverity::Info,
                    None,
                    None,
                    format!("Simulation started ({})", self.scenario.name),
                    BTreeMap::new(),
                    out_events,
                );
                self.begin_next_cycle(out_events);
            }
            SimulationRunStatus::Paused => {
                self.resume(out_events);
            }
            SimulationRunStatus::Stopped | SimulationRunStatus::Completed => {
                self.reset_state_preserving_injection();
                self.run_status = SimulationRunStatus::Running;
                self.emit_event(
                    SimulationEventType::SimStarted,
                    EventSeverity::Info,
                    None,
                    None,
                    format!("Simulation restarted ({})", self.scenario.name),
                    BTreeMap::new(),
                    out_events,
                );
                self.begin_next_cycle(out_events);
            }
            SimulationRunStatus::Running | SimulationRunStatus::Faulted => {}
        }
    }

    pub fn pause(&mut self, out_events: &mut Vec<SimulationEvent>) {
        if self.run_status == SimulationRunStatus::Running {
            self.run_status = SimulationRunStatus::Paused;
            self.dq = [0.0; 6];
            self.ddq = [0.0; 6];
            self.input_conveyor.running = false;
            self.output_conveyor.running = false;
            self.emit_event(
                SimulationEventType::SimPaused,
                EventSeverity::Info,
                self.active_workpiece_id.clone(),
                None,
                "Simulation paused".to_string(),
                BTreeMap::new(),
                out_events,
            );
        }
    }

    pub fn resume(&mut self, out_events: &mut Vec<SimulationEvent>) {
        if self.run_status == SimulationRunStatus::Paused {
            self.run_status = SimulationRunStatus::Running;
            self.emit_event(
                SimulationEventType::SimResumed,
                EventSeverity::Info,
                self.active_workpiece_id.clone(),
                None,
                "Simulation resumed".to_string(),
                BTreeMap::new(),
                out_events,
            );
        }
    }

    pub fn stop(&mut self, out_events: &mut Vec<SimulationEvent>) {
        if matches!(
            self.run_status,
            SimulationRunStatus::Running | SimulationRunStatus::Paused
        ) {
            self.run_status = SimulationRunStatus::Stopped;
            self.dq = [0.0; 6];
            self.ddq = [0.0; 6];
            self.active_segment = None;
            self.input_conveyor.running = false;
            self.output_conveyor.running = false;
            self.emit_event(
                SimulationEventType::SimStopped,
                EventSeverity::Info,
                self.active_workpiece_id.clone(),
                None,
                "Simulation stopped".to_string(),
                BTreeMap::new(),
                out_events,
            );
        }
    }

    fn reset_state_preserving_injection(&mut self) {
        let inject = self.inject_object_unavailable;
        let fresh = Self::new(
            self.config.clone(),
            self.scenario.clone(),
            self.waypoints.clone(),
        );
        *self = fresh;
        self.inject_object_unavailable = inject;
    }

    pub fn reset(&mut self, out_events: &mut Vec<SimulationEvent>) {
        self.inject_object_unavailable = false;
        self.reset_state_preserving_injection();
        self.emit_event(
            SimulationEventType::SimReset,
            EventSeverity::Info,
            None,
            None,
            "Simulation reset to READY state".to_string(),
            BTreeMap::new(),
            out_events,
        );
    }

    pub fn estop(&mut self, out_events: &mut Vec<SimulationEvent>) {
        self.trigger_fault(
            FaultCode::EstopActive,
            Some("e-stop-button".to_string()),
            "Emergency stop actuated".to_string(),
            SimulationEventType::SimStopped,
            out_events,
        );
    }

    fn can_spawn_more(&self) -> bool {
        if self.inject_object_unavailable {
            return false;
        }
        match self.scenario.cycle_mode {
            CycleMode::Single => self.next_wp_seq < 1,
            CycleMode::FixedCount => {
                let target = self.scenario.target_quantity.unwrap_or(1);
                self.next_wp_seq < target
            }
            CycleMode::Continuous => true,
        }
    }

    pub fn step_one_tick(&mut self, out_events: &mut Vec<SimulationEvent>) {
        if self.run_status != SimulationRunStatus::Running {
            return;
        }

        let dt_ms = self.scenario.timestep_ms;
        self.sim_time_ms += dt_ms;
        self.tick_index += 1;
        self.metrics.total_sim_time_ms = self.sim_time_ms;

        // 1. Advance input & output conveyors deterministically (PLC interlocks hold the output belt while
        //    the robot releases/retracts in the drop zone, and the input belt while it grasps/lifts)
        let can_spawn = self.can_spawn_more();
        let output_belt_speed = if self.stage == ProductionStage::PlaceWorkpiece
            && matches!(
                self.subphase,
                StageSubphase::GripperActuating | StageSubphase::Retracting
            ) {
            0.0
        } else {
            self.scenario.output_conveyor_speed_mps
        };
        // Symmetric input interlock: hold the input belt while the gripper clamps and lifts the
        // part out of the pick zone, so a fast belt cannot drive the next part into the held one.
        let input_belt_speed = if self.stage == ProductionStage::PickWorkpiece
            && matches!(
                self.subphase,
                StageSubphase::GripperActuating | StageSubphase::Retracting
            ) {
            0.0
        } else {
            self.scenario.input_conveyor_speed_mps
        };
        let (input_state, output_state, spawned_opt, _exited_count) = advance_conveyors(
            &self.config,
            &mut self.workpieces,
            input_belt_speed,
            output_belt_speed,
            dt_ms,
            self.sim_time_ms,
            can_spawn,
            &mut self.next_wp_seq,
        );
        self.input_conveyor = input_state;
        self.output_conveyor = output_state;

        if let Some(spawned) = spawned_opt {
            if let Some(wp) = self.workpieces.iter_mut().find(|w| w.id == spawned.id) {
                wp.mass_kg = self.scenario.workpiece_mass_kg;
            }
            self.emit_event(
                SimulationEventType::WorkpieceSpawned,
                EventSeverity::Info,
                Some(spawned.id.clone()),
                Some("input-conveyor".to_string()),
                format!("Spawned workpiece {} on input conveyor", spawned.id),
                BTreeMap::new(),
                out_events,
            );
        }

        if self.input_conveyor.running || self.output_conveyor.running {
            self.metrics.conveyor_active_time_ms += dt_ms;
        }

        // 2. Step active quintic trajectory segment if any
        self.dq = [0.0; 6];
        self.ddq = [0.0; 6];
        let mut segment_just_finished = false;
        if let Some(seg) = self.active_segment.as_mut() {
            seg.elapsed_ms = (seg.elapsed_ms + dt_ms).min(seg.duration_ms);
            let (q, dq, ddq) = seg.sample(seg.elapsed_ms);
            self.q = q;
            self.dq = dq;
            self.ddq = ddq;
            if seg.is_complete() {
                segment_just_finished = true;
                self.active_segment = None;
            }
        }

        // 3. Forward kinematics & update grasped workpiece pose
        let fk = forward_kinematics(&self.config, &self.q);
        if let Some(held_id) = self.gripper.state.held_workpiece_id.clone() {
            if let Some(wp) = self.workpieces.iter_mut().find(|w| w.id == held_id) {
                wp.pose_world = fk.tcp_world_pose;
            }
        }

        // 4. Collision evaluation on robot links, static geometry & workpieces
        let held_wp = self
            .gripper
            .state
            .held_workpiece_id
            .as_deref()
            .and_then(|id| self.workpieces.iter().find(|w| w.id == id));
        self.collision = evaluate_workcell_collisions(
            &self.config,
            &fk.frames_base,
            &fk.tcp_world_pose,
            held_wp,
            &self.workpieces,
        );

        if self.collision.severity == CollisionSeverity::Collision {
            let msg = format!(
                "Collision detected: {} vs {}",
                self.collision.pair_a, self.collision.pair_b
            );
            let comp = self.collision.pair_b.clone();
            self.trigger_fault(
                FaultCode::Collision,
                Some(comp),
                msg,
                SimulationEventType::CollisionDetected,
                out_events,
            );
            return;
        }

        if self.collision.severity == CollisionSeverity::NearCollision {
            if let Some(acc) = self.cycle_acc.as_mut() {
                acc.had_near_collision = true;
            }
            if self.prev_collision_severity != CollisionSeverity::NearCollision {
                let msg = format!(
                    "Near collision ({:.1} mm): {} vs {}",
                    self.collision.min_clearance_meters * 1000.0,
                    self.collision.pair_a,
                    self.collision.pair_b
                );
                let comp = self.collision.pair_b.clone();
                self.emit_event(
                    SimulationEventType::NearCollisionWarning,
                    EventSeverity::Warning,
                    self.active_workpiece_id.clone(),
                    Some(comp),
                    msg,
                    BTreeMap::new(),
                    out_events,
                );
            }
        }
        self.prev_collision_severity = self.collision.severity;

        // 5. Compute tick energy & accumulate KPIs BEFORE stage advance
        let held_mass = self
            .gripper
            .state
            .held_workpiece_id
            .as_deref()
            .and_then(|id| self.workpieces.iter().find(|w| w.id == id))
            .map(|w| w.mass_kg);
        let is_dwelling = self.stage == ProductionStage::ProcessWorkpiece
            && self.subphase == StageSubphase::ProcessingDwell;

        let tick_energy_wh = compute_tick_energy_wh(
            &self.config,
            &self.dq,
            &self.ddq,
            held_mass,
            &self.input_conveyor,
            &self.output_conveyor,
            self.stage,
            is_dwelling,
            dt_ms,
        );
        self.metrics.cumulative_energy_wh += tick_energy_wh;
        if let Some(acc) = self.cycle_acc.as_mut() {
            acc.energy_wh += tick_energy_wh;
        }

        let is_robot_moving = self.dq.iter().any(|v| v.abs() > 1e-6)
            || self.subphase == StageSubphase::GripperActuating;
        if is_robot_moving {
            self.metrics.robot_active_time_ms += dt_ms;
        } else if !is_dwelling {
            self.metrics.idle_time_ms += dt_ms;
        }

        if let Some(acc) = self.cycle_acc.as_mut() {
            if is_dwelling {
                acc.process_dwell_ms += dt_ms;
            } else if matches!(self.stage, ProductionStage::DetectObject) {
                acc.wait_time_ms += dt_ms;
            } else if is_robot_moving {
                acc.robot_move_ms += dt_ms;
            }
        }

        // 6. Advance Production State Machine
        self.advance_state_machine(dt_ms, segment_just_finished, &fk.tcp_world_pose, out_events);
    }

    fn advance_state_machine(
        &mut self,
        dt_ms: u64,
        segment_just_finished: bool,
        tcp_world_pose: &Pose3D,
        out_events: &mut Vec<SimulationEvent>,
    ) {
        match self.stage {
            ProductionStage::DetectObject => {
                if let Some(wp) = self
                    .workpieces
                    .iter()
                    .find(|w| w.status == WorkpieceStatus::ReadyForPick)
                {
                    let wp_id = wp.id.clone();
                    self.active_workpiece_id = Some(wp_id.clone());
                    let q_target = self.waypoints.q_input_approach;
                    if let Err((code, msg)) = self.plan_segment_to(q_target) {
                        self.trigger_fault(
                            code,
                            Some("robot-arm".to_string()),
                            msg,
                            SimulationEventType::JointLimitViolated,
                            out_events,
                        );
                        return;
                    }
                    self.transition_stage(
                        ProductionStage::ApproachPick,
                        StageSubphase::Moving,
                        Some("robot-arm".to_string()),
                        &format!("Workpiece {wp_id} ready; approaching pick hover"),
                        out_events,
                    );
                } else {
                    self.detect_wait_ms += dt_ms;
                    if self.detect_wait_ms >= OBJECT_UNAVAILABLE_TIMEOUT_MS {
                        self.trigger_fault(
                            FaultCode::ObjectUnavailable,
                            Some("input-conveyor".to_string()),
                            format!(
                                "No workpiece detected at input pick zone within {} ms",
                                OBJECT_UNAVAILABLE_TIMEOUT_MS
                            ),
                            SimulationEventType::ObjectUnavailable,
                            out_events,
                        );
                    }
                }
            }

            ProductionStage::ApproachPick => {
                if segment_just_finished {
                    let q_target = self.waypoints.q_input_pick;
                    if let Err((code, msg)) = self.plan_segment_to(q_target) {
                        self.trigger_fault(
                            code,
                            Some("robot-arm".to_string()),
                            msg,
                            SimulationEventType::JointLimitViolated,
                            out_events,
                        );
                        return;
                    }
                    self.transition_stage(
                        ProductionStage::PickWorkpiece,
                        StageSubphase::Moving,
                        Some("gripper".to_string()),
                        "Descending to grasp workpiece from input belt",
                        out_events,
                    );
                }
            }

            ProductionStage::PickWorkpiece => match self.subphase {
                StageSubphase::Moving => {
                    if segment_just_finished {
                        let wp_id = match self.active_workpiece_id.clone() {
                            Some(id) => id,
                            None => {
                                self.trigger_fault(
                                    FaultCode::ObjectUnavailable,
                                    Some("input-conveyor".to_string()),
                                    "Missing active workpiece ID at grasp point".to_string(),
                                    SimulationEventType::ObjectUnavailable,
                                    out_events,
                                );
                                return;
                            }
                        };
                        let wp_opt = self.workpieces.iter().find(|w| w.id == wp_id).cloned();
                        let Some(wp) = wp_opt else {
                            self.trigger_fault(
                                FaultCode::ObjectUnavailable,
                                Some("input-conveyor".to_string()),
                                format!("Workpiece {wp_id} vanished prior to grasp"),
                                SimulationEventType::ObjectUnavailable,
                                out_events,
                            );
                            return;
                        };
                        if let Err((fault_code, msg)) =
                            self.gripper
                                .validate_and_grasp(&self.config, tcp_world_pose, &wp)
                        {
                            self.trigger_fault(
                                fault_code,
                                Some("gripper".to_string()),
                                msg,
                                SimulationEventType::GripperFault,
                                out_events,
                            );
                            return;
                        }
                        if let Some(wp_mut) = self.workpieces.iter_mut().find(|w| w.id == wp_id) {
                            wp_mut.status = WorkpieceStatus::Grasped;
                        }
                        self.gripper.begin_close();
                        self.subphase = StageSubphase::GripperActuating;
                    }
                }
                StageSubphase::GripperActuating => {
                    if self.gripper.tick(&self.config, dt_ms) {
                        let wp_id = self.active_workpiece_id.clone();
                        self.emit_event(
                            SimulationEventType::GripperGrasped,
                            EventSeverity::Info,
                            wp_id.clone(),
                            Some("gripper".to_string()),
                            format!(
                                "Gripper clamped {}",
                                wp_id.as_deref().unwrap_or("workpiece")
                            ),
                            BTreeMap::new(),
                            out_events,
                        );
                        let q_target = self.waypoints.q_input_approach;
                        if let Err((code, msg)) = self.plan_segment_to(q_target) {
                            self.trigger_fault(
                                code,
                                Some("robot-arm".to_string()),
                                msg,
                                SimulationEventType::JointLimitViolated,
                                out_events,
                            );
                            return;
                        }
                        self.subphase = StageSubphase::Retracting;
                    }
                }
                StageSubphase::Retracting if segment_just_finished => {
                    let q_target = self.waypoints.q_station_approach;
                    if let Err((code, msg)) = self.plan_segment_to(q_target) {
                        self.trigger_fault(
                            code,
                            Some("robot-arm".to_string()),
                            msg,
                            SimulationEventType::JointLimitViolated,
                            out_events,
                        );
                        return;
                    }
                    self.transition_stage(
                        ProductionStage::TransferToStation,
                        StageSubphase::Moving,
                        Some("robot-arm".to_string()),
                        "Transferring workpiece to processing station approach",
                        out_events,
                    );
                }
                _ => {}
            },

            ProductionStage::TransferToStation => {
                if segment_just_finished {
                    let q_target = self.waypoints.q_station_place;
                    if let Err((code, msg)) = self.plan_segment_to(q_target) {
                        self.trigger_fault(
                            code,
                            Some("robot-arm".to_string()),
                            msg,
                            SimulationEventType::JointLimitViolated,
                            out_events,
                        );
                        return;
                    }
                    self.transition_stage(
                        ProductionStage::ProcessWorkpiece,
                        StageSubphase::Moving,
                        Some("processing-station".to_string()),
                        "Placing workpiece into processing station fixture",
                        out_events,
                    );
                }
            }

            ProductionStage::ProcessWorkpiece => match self.subphase {
                StageSubphase::Moving => {
                    if segment_just_finished {
                        if let Some(wp_id) = self.gripper.release() {
                            if let Some(wp) = self.workpieces.iter_mut().find(|w| w.id == wp_id) {
                                wp.status = WorkpieceStatus::AtStation;
                                wp.pose_world = Pose3D {
                                    position: self
                                        .config
                                        .processing_station
                                        .target_pose_world
                                        .position,
                                    orientation: Quat::IDENTITY,
                                };
                            }
                            self.station.occupied = true;
                            self.station.active_workpiece_id = Some(wp_id);
                            self.station.processing_progress = 0.0;
                            self.station.clamp_engaged = false;
                        }
                        self.gripper.begin_open();
                        self.subphase = StageSubphase::GripperActuating;
                    }
                }
                StageSubphase::GripperActuating => {
                    if self.gripper.tick(&self.config, dt_ms) {
                        self.emit_event(
                            SimulationEventType::GripperReleased,
                            EventSeverity::Info,
                            self.active_workpiece_id.clone(),
                            Some("gripper".to_string()),
                            "Released workpiece at processing station".to_string(),
                            BTreeMap::new(),
                            out_events,
                        );
                        let q_target = self.waypoints.q_station_approach;
                        if let Err((code, msg)) = self.plan_segment_to(q_target) {
                            self.trigger_fault(
                                code,
                                Some("robot-arm".to_string()),
                                msg,
                                SimulationEventType::JointLimitViolated,
                                out_events,
                            );
                            return;
                        }
                        self.subphase = StageSubphase::Retracting;
                    }
                }
                StageSubphase::Retracting => {
                    if segment_just_finished {
                        self.station.clamp_engaged = true;
                        self.station.processing_progress = 0.0;
                        self.dwell_elapsed_ms = 0;
                        if let Some(wp_id) = self.station.active_workpiece_id.clone() {
                            if let Some(wp) = self.workpieces.iter_mut().find(|w| w.id == wp_id) {
                                wp.status = WorkpieceStatus::Processing;
                            }
                        }
                        self.subphase = StageSubphase::ProcessingDwell;
                    }
                }
                StageSubphase::ProcessingDwell => {
                    self.dwell_elapsed_ms += dt_ms;
                    let total = self.scenario.processing_dwell_ms.max(dt_ms);
                    self.station.processing_progress =
                        ((self.dwell_elapsed_ms as f64) / (total as f64)).clamp(0.0, 1.0);
                    if self.dwell_elapsed_ms >= self.scenario.processing_dwell_ms {
                        self.station.clamp_engaged = false;
                        self.station.processing_progress = 1.0;
                        if let Some(wp_id) = self.station.active_workpiece_id.clone() {
                            if let Some(wp) = self.workpieces.iter_mut().find(|w| w.id == wp_id) {
                                wp.status = WorkpieceStatus::ProcessedReady;
                            }
                        }
                        let q_target = self.waypoints.q_station_place;
                        if let Err((code, msg)) = self.plan_segment_to(q_target) {
                            self.trigger_fault(
                                code,
                                Some("robot-arm".to_string()),
                                msg,
                                SimulationEventType::JointLimitViolated,
                                out_events,
                            );
                            return;
                        }
                        self.transition_stage(
                            ProductionStage::PickFinished,
                            StageSubphase::Moving,
                            Some("gripper".to_string()),
                            "Processing finished; descending to pick finished part",
                            out_events,
                        );
                    }
                }
                _ => {}
            },

            ProductionStage::PickFinished => match self.subphase {
                StageSubphase::Moving => {
                    if segment_just_finished {
                        let wp_id = self
                            .station
                            .active_workpiece_id
                            .clone()
                            .or_else(|| self.active_workpiece_id.clone());
                        let Some(id) = wp_id else {
                            self.trigger_fault(
                                FaultCode::ObjectUnavailable,
                                Some("processing-station".to_string()),
                                "No processed workpiece found at station".to_string(),
                                SimulationEventType::ObjectUnavailable,
                                out_events,
                            );
                            return;
                        };
                        let Some(wp) = self.workpieces.iter().find(|w| w.id == id).cloned() else {
                            self.trigger_fault(
                                FaultCode::ObjectUnavailable,
                                Some("processing-station".to_string()),
                                format!("Processed workpiece {id} missing"),
                                SimulationEventType::ObjectUnavailable,
                                out_events,
                            );
                            return;
                        };
                        if let Err((fault_code, msg)) =
                            self.gripper
                                .validate_and_grasp(&self.config, tcp_world_pose, &wp)
                        {
                            self.trigger_fault(
                                fault_code,
                                Some("gripper".to_string()),
                                msg,
                                SimulationEventType::GripperFault,
                                out_events,
                            );
                            return;
                        }
                        if let Some(wp_mut) = self.workpieces.iter_mut().find(|w| w.id == id) {
                            wp_mut.status = WorkpieceStatus::Grasped;
                        }
                        self.station.occupied = false;
                        self.station.active_workpiece_id = None;
                        self.station.processing_progress = 0.0;
                        self.gripper.begin_close();
                        self.subphase = StageSubphase::GripperActuating;
                    }
                }
                StageSubphase::GripperActuating => {
                    if self.gripper.tick(&self.config, dt_ms) {
                        self.emit_event(
                            SimulationEventType::GripperGrasped,
                            EventSeverity::Info,
                            self.active_workpiece_id.clone(),
                            Some("gripper".to_string()),
                            "Clamped finished workpiece from station".to_string(),
                            BTreeMap::new(),
                            out_events,
                        );
                        let q_target = self.waypoints.q_station_approach;
                        if let Err((code, msg)) = self.plan_segment_to(q_target) {
                            self.trigger_fault(
                                code,
                                Some("robot-arm".to_string()),
                                msg,
                                SimulationEventType::JointLimitViolated,
                                out_events,
                            );
                            return;
                        }
                        self.subphase = StageSubphase::Retracting;
                    }
                }
                StageSubphase::Retracting if segment_just_finished => {
                    let q_target = self.waypoints.q_output_approach;
                    if let Err((code, msg)) = self.plan_segment_to(q_target) {
                        self.trigger_fault(
                            code,
                            Some("robot-arm".to_string()),
                            msg,
                            SimulationEventType::JointLimitViolated,
                            out_events,
                        );
                        return;
                    }
                    self.transition_stage(
                        ProductionStage::TransferToOutput,
                        StageSubphase::Moving,
                        Some("robot-arm".to_string()),
                        "Transferring finished workpiece toward output conveyor",
                        out_events,
                    );
                }
                _ => {}
            },

            ProductionStage::TransferToOutput => {
                if segment_just_finished {
                    let q_target = self.waypoints.q_output_place;
                    if let Err((code, msg)) = self.plan_segment_to(q_target) {
                        self.trigger_fault(
                            code,
                            Some("robot-arm".to_string()),
                            msg,
                            SimulationEventType::JointLimitViolated,
                            out_events,
                        );
                        return;
                    }
                    self.transition_stage(
                        ProductionStage::PlaceWorkpiece,
                        StageSubphase::Moving,
                        Some("output-conveyor".to_string()),
                        "Descending to place finished workpiece on output belt",
                        out_events,
                    );
                }
            }

            ProductionStage::PlaceWorkpiece => match self.subphase {
                StageSubphase::Moving => {
                    if segment_just_finished {
                        if let Some(wp_id) = self.gripper.release() {
                            if let Some(wp) = self.workpieces.iter_mut().find(|w| w.id == wp_id) {
                                wp.status = WorkpieceStatus::OnOutputConveyor;
                                wp.pose_world = Pose3D {
                                    position: self.config.output_conveyor.target_zone_world,
                                    orientation: Quat::IDENTITY,
                                };
                            }
                        }
                        self.gripper.begin_open();
                        self.subphase = StageSubphase::GripperActuating;
                    }
                }
                StageSubphase::GripperActuating => {
                    if self.gripper.tick(&self.config, dt_ms) {
                        self.emit_event(
                            SimulationEventType::GripperReleased,
                            EventSeverity::Info,
                            self.active_workpiece_id.clone(),
                            Some("gripper".to_string()),
                            "Released finished workpiece onto output conveyor".to_string(),
                            BTreeMap::new(),
                            out_events,
                        );
                        let q_target = self.waypoints.q_output_approach;
                        if let Err((code, msg)) = self.plan_segment_to(q_target) {
                            self.trigger_fault(
                                code,
                                Some("robot-arm".to_string()),
                                msg,
                                SimulationEventType::JointLimitViolated,
                                out_events,
                            );
                            return;
                        }
                        self.subphase = StageSubphase::Retracting;
                    }
                }
                StageSubphase::Retracting if segment_just_finished => {
                    self.complete_active_cycle(out_events);
                }
                _ => {}
            },

            ProductionStage::CycleComplete => {
                if self.subphase == StageSubphase::ReturningHome && segment_just_finished {
                    self.transition_stage(
                        ProductionStage::Idle,
                        StageSubphase::None,
                        None,
                        "Production target reached; robot returned home",
                        out_events,
                    );
                    self.run_status = SimulationRunStatus::Completed;
                }
            }

            ProductionStage::Idle | ProductionStage::Fault => {}
        }
    }

    fn complete_active_cycle(&mut self, out_events: &mut Vec<SimulationEvent>) {
        self.completed_units += 1;
        if let Some(acc) = self.cycle_acc.take() {
            let cycle_time = self.sim_time_ms.saturating_sub(acc.start_time_ms);
            self.metrics.per_cycle_history.push(PerCycleHistoryEntry {
                cycle_index: acc.cycle_index,
                cycle_time_ms: cycle_time,
                robot_move_ms: acc.robot_move_ms,
                process_dwell_ms: acc.process_dwell_ms,
                wait_time_ms: acc.wait_time_ms,
                energy_wh: acc.energy_wh,
                had_near_collision: acc.had_near_collision,
                had_fault: acc.had_fault,
            });
        }

        self.transition_stage(
            ProductionStage::CycleComplete,
            StageSubphase::None,
            None,
            &format!("Cycle {} complete", self.active_cycle_index),
            out_events,
        );

        let completed_wp = self.active_workpiece_id.take();
        self.emit_event(
            SimulationEventType::CycleCompleted,
            EventSeverity::Info,
            completed_wp,
            None,
            format!("Completed production unit #{}", self.completed_units),
            BTreeMap::new(),
            out_events,
        );

        let finished_run = match self.scenario.cycle_mode {
            CycleMode::Single => self.completed_units >= 1,
            CycleMode::FixedCount => {
                let target = self.scenario.target_quantity.unwrap_or(1);
                self.completed_units >= target
            }
            CycleMode::Continuous => false,
        };

        if finished_run {
            let q_home = self.waypoints.q_home;
            if let Err((code, msg)) = self.plan_segment_to(q_home) {
                self.trigger_fault(
                    code,
                    Some("robot-arm".to_string()),
                    msg,
                    SimulationEventType::JointLimitViolated,
                    out_events,
                );
                return;
            }
            self.subphase = StageSubphase::ReturningHome;
        } else {
            self.begin_next_cycle(out_events);
        }
    }

    pub fn snapshot(&self) -> SimulationSnapshot {
        let fk = forward_kinematics(&self.config, &self.q);
        SimulationSnapshot {
            run_id: self.run_id.clone(),
            sim_time_ms: self.sim_time_ms,
            tick_index: self.tick_index,
            run_status: self.run_status,
            stage: self.stage,
            active_cycle_index: self.active_cycle_index,
            completed_units: self.completed_units,
            target_units: match self.scenario.cycle_mode {
                CycleMode::Single => Some(1),
                CycleMode::FixedCount => self.scenario.target_quantity,
                CycleMode::Continuous => None,
            },
            joints: build_joint_states(&self.config, &self.q, &self.dq, &self.ddq),
            link_world_poses: fk.link_world_poses.to_vec(),
            tcp_world_pose: fk.tcp_world_pose,
            gripper: self.gripper.state.clone(),
            input_conveyor: self.input_conveyor.clone(),
            output_conveyor: self.output_conveyor.clone(),
            station: self.station.clone(),
            workpieces: self.workpieces.clone(),
            collision: self.collision.clone(),
            active_fault: self.active_fault.clone(),
            cumulative_energy_wh: self.metrics.cumulative_energy_wh,
        }
    }
}
