use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quat {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pose3D {
    pub position: Vec3,
    pub orientation: Quat,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapsuleVolume {
    pub kind: String,
    pub owner_id: String,
    pub local_start: Vec3,
    pub local_end: Vec3,
    pub radius: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoxVolume {
    pub kind: String,
    pub owner_id: String,
    pub center: Vec3,
    pub half_extents: Vec3,
    pub orientation: Quat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum JointId {
    J1,
    J2,
    J3,
    J4,
    J5,
    J6,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DhParameters {
    pub theta_offset_rad: f64,
    pub d_meters: f64,
    pub a_meters: f64,
    pub alpha_rad: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JointConfig {
    pub id: JointId,
    pub index: usize,
    pub name: String,
    pub axis_local: [f64; 3],
    pub dh: DhParameters,
    pub min_angle_rad: f64,
    pub max_angle_rad: f64,
    pub max_velocity_rad_per_sec: f64,
    pub max_acceleration_rad_per_sec2: f64,
    pub home_angle_rad: f64,
    pub rated_torque_nm: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RobotConfig {
    pub model_id: String,
    pub dof: usize,
    pub payload_limit_kg: f64,
    pub base_mount_pose: Pose3D,
    pub tool_tcp_offset_meters: Vec3,
    pub joints: [JointConfig; 6],
    pub collision_capsules: Vec<CapsuleVolume>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConveyorConfig {
    pub id: String,
    pub origin_world: Vec3,
    pub direction_unit: Vec3,
    pub length_meters: f64,
    pub width_meters: f64,
    pub belt_top_y: f64,
    pub default_speed_meters_per_sec: f64,
    pub min_speed_meters_per_sec: f64,
    pub max_speed_meters_per_sec: f64,
    pub target_zone_world: Vec3,
    pub collision_box: BoxVolume,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingStationConfig {
    pub id: String,
    pub origin_world: Vec3,
    pub fixture_top_y: f64,
    pub target_pose_world: Pose3D,
    pub default_process_time_ms: u64,
    pub collision_boxes: Vec<BoxVolume>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GripperConfig {
    pub id: String,
    pub max_opening_meters: f64,
    pub min_opening_meters: f64,
    pub closed_width_for_part_meters: f64,
    pub actuation_time_ms: u64,
    pub mass_kg: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkpieceTemplate {
    pub dimensions_meters: Vec3,
    pub default_mass_kg: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkcellConfig {
    pub schema_version: String,
    pub workcell_id: String,
    pub robot: RobotConfig,
    pub gripper: GripperConfig,
    pub input_conveyor: ConveyorConfig,
    pub output_conveyor: ConveyorConfig,
    pub processing_station: ProcessingStationConfig,
    pub workpiece_template: WorkpieceTemplate,
    pub static_obstacles: Vec<BoxVolume>,
    pub near_collision_threshold_meters: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JointState {
    pub id: JointId,
    pub angle_rad: f64,
    pub velocity_rad_per_sec: f64,
    pub acceleration_rad_per_sec2: f64,
    pub at_limit: bool,
    pub utilization_ratio: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WorkpieceStatus {
    SpawnedOnInput,
    ReadyForPick,
    Grasped,
    AtStation,
    Processing,
    ProcessedReady,
    OnOutputConveyor,
    Completed,
    Faulted,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkpieceState {
    pub id: String,
    pub mass_kg: f64,
    pub dimensions_meters: Vec3,
    pub pose_world: Pose3D,
    pub status: WorkpieceStatus,
    pub spawn_time_ms: u64,
    pub completed_time_ms: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GripperActuationState {
    Open,
    Closing,
    Closed,
    Opening,
    Fault,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GripperState {
    pub actuation_state: GripperActuationState,
    pub jaw_opening_meters: f64,
    pub held_workpiece_id: Option<String>,
    pub clamp_force_normalized: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConveyorRuntimeState {
    pub id: String,
    pub running: bool,
    pub speed_meters_per_sec: f64,
    pub sensor_triggered: bool,
    pub workpiece_count_on_belt: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StationRuntimeState {
    pub occupied: bool,
    pub active_workpiece_id: Option<String>,
    pub processing_progress: f64,
    pub clamp_engaged: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProductionStage {
    Idle,
    DetectObject,
    ApproachPick,
    PickWorkpiece,
    TransferToStation,
    ProcessWorkpiece,
    PickFinished,
    TransferToOutput,
    PlaceWorkpiece,
    CycleComplete,
    Fault,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SimulationRunStatus {
    Ready,
    Running,
    Paused,
    Stopped,
    Completed,
    Faulted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FaultCode {
    Collision,
    UnreachableTarget,
    JointLimitViolation,
    ObjectUnavailable,
    GripperFailure,
    PayloadExceeded,
    EstopActive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CollisionSeverity {
    None,
    NearCollision,
    Collision,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollisionReport {
    pub severity: CollisionSeverity,
    pub min_clearance_meters: f64,
    pub pair_a: String,
    pub pair_b: String,
    pub contact_point_world: Option<Vec3>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveFault {
    pub code: FaultCode,
    pub message: String,
    pub component_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationSnapshot {
    pub run_id: String,
    pub sim_time_ms: u64,
    pub tick_index: u64,
    pub run_status: SimulationRunStatus,
    pub stage: ProductionStage,
    pub active_cycle_index: u64,
    pub completed_units: u64,
    pub target_units: Option<u64>,
    pub joints: [JointState; 6],
    pub link_world_poses: Vec<Pose3D>,
    pub tcp_world_pose: Pose3D,
    pub gripper: GripperState,
    pub input_conveyor: ConveyorRuntimeState,
    pub output_conveyor: ConveyorRuntimeState,
    pub station: StationRuntimeState,
    pub workpieces: Vec<WorkpieceState>,
    pub collision: CollisionReport,
    pub active_fault: Option<ActiveFault>,
    pub cumulative_energy_wh: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SimulationEventType {
    SimStarted,
    SimPaused,
    SimResumed,
    SimStopped,
    SimReset,
    StageEntered,
    CycleStarted,
    CycleCompleted,
    WorkpieceSpawned,
    GripperGrasped,
    GripperReleased,
    NearCollisionWarning,
    CollisionDetected,
    IkTargetUnreachable,
    JointLimitViolated,
    GripperFault,
    ObjectUnavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EventSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PayloadValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    String(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulationEvent {
    pub seq: u64,
    pub run_id: String,
    pub sim_time_ms: u64,
    pub event_type: SimulationEventType,
    pub stage: ProductionStage,
    pub cycle_index: u64,
    pub workpiece_id: Option<String>,
    pub component_id: Option<String>,
    pub severity: EventSeverity,
    pub message: String,
    pub payload: BTreeMap<String, PayloadValue>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CycleMode {
    Single,
    FixedCount,
    Continuous,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioConfig {
    pub scenario_id: String,
    pub name: String,
    pub description: String,
    pub seed: u64,
    pub timestep_ms: u64,
    pub cycle_mode: CycleMode,
    pub target_quantity: Option<u64>,
    pub target_production_rate_per_hour: f64,
    pub robot_speed_scale: f64,
    pub robot_accel_scale: f64,
    pub input_conveyor_speed_mps: f64,
    pub output_conveyor_speed_mps: f64,
    pub processing_dwell_ms: u64,
    pub workpiece_mass_kg: f64,
    pub trajectory_smoothness_factor: f64,
}

impl Default for ScenarioConfig {
    fn default() -> Self {
        Self {
            scenario_id: "baseline-a".to_string(),
            name: "Scenario A: Baseline".to_string(),
            description: "Default workcell operating parameters".to_string(),
            seed: 42,
            timestep_ms: 20,
            cycle_mode: CycleMode::FixedCount,
            target_quantity: Some(5),
            target_production_rate_per_hour: 60.0,
            robot_speed_scale: 1.0,
            robot_accel_scale: 1.0,
            input_conveyor_speed_mps: 0.20,
            output_conveyor_speed_mps: 0.20,
            processing_dwell_ms: 2500,
            workpiece_mass_kg: 1.20,
            trajectory_smoothness_factor: 1.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerCycleHistoryEntry {
    pub cycle_index: u64,
    pub cycle_time_ms: u64,
    pub robot_move_ms: u64,
    pub process_dwell_ms: u64,
    pub wait_time_ms: u64,
    pub energy_wh: f64,
    pub had_near_collision: bool,
    pub had_fault: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductionMetrics {
    pub run_id: String,
    pub scenario_id: String,
    pub total_sim_time_ms: u64,
    pub total_units_produced: u64,
    pub units_per_hour: f64,
    pub average_cycle_time_ms: f64,
    pub min_cycle_time_ms: u64,
    pub max_cycle_time_ms: u64,
    pub robot_active_time_ms: u64,
    pub robot_utilization_pct: f64,
    pub conveyor_active_time_ms: u64,
    pub conveyor_utilization_pct: f64,
    pub idle_time_ms: u64,
    pub downtime_ms: u64,
    pub collision_event_count: u64,
    pub near_collision_event_count: u64,
    pub estimated_energy_wh: f64,
    pub energy_per_unit_wh: f64,
    pub production_efficiency_pct: f64,
    pub per_cycle_history: Vec<PerCycleHistoryEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TickStepOutput {
    pub snapshot: SimulationSnapshot,
    pub new_events: Vec<SimulationEvent>,
    pub metrics: ProductionMetrics,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IkSolveResponse {
    pub ok: bool,
    pub angles_rad: Option<[f64; 6]>,
    pub fault: Option<FaultCode>,
    pub message: Option<String>,
    pub snapshot: Option<SimulationSnapshot>,
}

pub fn validate_workcell_config(config: &WorkcellConfig) -> Result<(), String> {
    if config.robot.dof != 6 {
        return Err("robot.dof must equal 6".to_string());
    }
    if !(config.robot.payload_limit_kg.is_finite() && config.robot.payload_limit_kg > 0.0) {
        return Err("robot.payloadLimitKg must be finite and > 0".to_string());
    }
    if !(config.near_collision_threshold_meters.is_finite()
        && config.near_collision_threshold_meters > 0.0)
    {
        return Err("nearCollisionThresholdMeters must be finite and > 0".to_string());
    }
    for j in &config.robot.joints {
        if !(j.min_angle_rad.is_finite()
            && j.max_angle_rad.is_finite()
            && j.min_angle_rad < j.max_angle_rad)
        {
            return Err(format!("invalid angle bounds for joint {:?}", j.id));
        }
        if j.home_angle_rad < j.min_angle_rad || j.home_angle_rad > j.max_angle_rad {
            return Err(format!("home angle outside bounds for joint {:?}", j.id));
        }
        if !(j.max_velocity_rad_per_sec > 0.0 && j.max_acceleration_rad_per_sec2 > 0.0) {
            return Err(format!(
                "velocity/acceleration limits must be positive for joint {:?}",
                j.id
            ));
        }
    }
    Ok(())
}

pub fn validate_scenario_config(scenario: &ScenarioConfig) -> Result<(), String> {
    if scenario.timestep_ms != 20 {
        return Err("timestepMs must equal 20".to_string());
    }
    if !(scenario.robot_speed_scale.is_finite()
        && (0.20..=1.50).contains(&scenario.robot_speed_scale))
    {
        return Err("robotSpeedScale must be within [0.20, 1.50]".to_string());
    }
    if !(scenario.robot_accel_scale.is_finite()
        && (0.20..=1.50).contains(&scenario.robot_accel_scale))
    {
        return Err("robotAccelScale must be within [0.20, 1.50]".to_string());
    }
    if !(scenario.input_conveyor_speed_mps.is_finite()
        && (0.05..=0.60).contains(&scenario.input_conveyor_speed_mps))
    {
        return Err("inputConveyorSpeedMps must be within [0.05, 0.60]".to_string());
    }
    if !(scenario.output_conveyor_speed_mps.is_finite()
        && (0.05..=0.60).contains(&scenario.output_conveyor_speed_mps))
    {
        return Err("outputConveyorSpeedMps must be within [0.05, 0.60]".to_string());
    }
    if !(500..=10000).contains(&scenario.processing_dwell_ms) {
        return Err("processingDwellMs must be within [500, 10000]".to_string());
    }
    if !(scenario.workpiece_mass_kg.is_finite()
        && (0.10..=5.00).contains(&scenario.workpiece_mass_kg))
    {
        return Err("workpieceMassKg must be within [0.10, 5.00]".to_string());
    }
    if !(scenario.trajectory_smoothness_factor.is_finite()
        && (0.80..=1.25).contains(&scenario.trajectory_smoothness_factor))
    {
        return Err("trajectorySmoothnessFactor must be within [0.80, 1.25]".to_string());
    }
    if scenario.cycle_mode == CycleMode::FixedCount {
        match scenario.target_quantity {
            Some(q) if q >= 1 => {}
            _ => {
                return Err("targetQuantity must be >= 1 when cycleMode is FIXED_COUNT".to_string())
            }
        }
    }
    Ok(())
}
