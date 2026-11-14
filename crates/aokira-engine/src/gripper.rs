use crate::types::{
    FaultCode, GripperActuationState, GripperState, Pose3D, WorkcellConfig, WorkpieceState,
};

#[derive(Debug, Clone)]
pub struct GripperController {
    pub state: GripperState,
    actuation_elapsed_ms: u64,
    target_close: bool,
}

impl GripperController {
    pub fn new(config: &WorkcellConfig) -> Self {
        Self {
            state: GripperState {
                actuation_state: GripperActuationState::Open,
                jaw_opening_meters: config.gripper.max_opening_meters,
                held_workpiece_id: None,
                clamp_force_normalized: 0.0,
            },
            actuation_elapsed_ms: 0,
            target_close: false,
        }
    }

    pub fn begin_close(&mut self) {
        self.target_close = true;
        self.actuation_elapsed_ms = 0;
        self.state.actuation_state = GripperActuationState::Closing;
    }

    pub fn begin_open(&mut self) {
        self.target_close = false;
        self.actuation_elapsed_ms = 0;
        self.state.actuation_state = GripperActuationState::Opening;
        self.state.clamp_force_normalized = 0.0;
    }

    /// Advances gripper actuation by `timestep_ms`. Returns `true` when actuation just finished this tick.
    pub fn tick(&mut self, config: &WorkcellConfig, timestep_ms: u64) -> bool {
        let total = config.gripper.actuation_time_ms.max(timestep_ms);
        let max_open = config.gripper.max_opening_meters;
        let closed_part = config.gripper.closed_width_for_part_meters;

        match self.state.actuation_state {
            GripperActuationState::Closing => {
                self.actuation_elapsed_ms = (self.actuation_elapsed_ms + timestep_ms).min(total);
                let ratio = (self.actuation_elapsed_ms as f64) / (total as f64);
                self.state.jaw_opening_meters = max_open + (closed_part - max_open) * ratio;
                if self.actuation_elapsed_ms >= total {
                    self.state.actuation_state = GripperActuationState::Closed;
                    self.state.clamp_force_normalized = 1.0;
                    return true;
                }
            }
            GripperActuationState::Opening => {
                self.actuation_elapsed_ms = (self.actuation_elapsed_ms + timestep_ms).min(total);
                let ratio = (self.actuation_elapsed_ms as f64) / (total as f64);
                self.state.jaw_opening_meters = closed_part + (max_open - closed_part) * ratio;
                if self.actuation_elapsed_ms >= total {
                    self.state.actuation_state = GripperActuationState::Open;
                    self.state.jaw_opening_meters = max_open;
                    return true;
                }
            }
            _ => {}
        }
        false
    }

    pub fn validate_and_grasp(
        &mut self,
        config: &WorkcellConfig,
        tcp_world_pose: &Pose3D,
        workpiece: &WorkpieceState,
    ) -> Result<(), (FaultCode, String)> {
        if workpiece.mass_kg > config.robot.payload_limit_kg {
            self.state.actuation_state = GripperActuationState::Fault;
            return Err((
                FaultCode::PayloadExceeded,
                format!(
                    "Workpiece {} mass {:.2} kg exceeds payload limit {:.2} kg",
                    workpiece.id, workpiece.mass_kg, config.robot.payload_limit_kg
                ),
            ));
        }

        let dist = tcp_world_pose
            .position
            .sub(workpiece.pose_world.position)
            .norm();
        if dist > 0.015 {
            self.state.actuation_state = GripperActuationState::Fault;
            return Err((
                FaultCode::GripperFailure,
                format!(
                    "Grasp distance {:.4} m exceeds 0.015 m alignment tolerance for {}",
                    dist, workpiece.id
                ),
            ));
        }

        self.state.held_workpiece_id = Some(workpiece.id.clone());
        Ok(())
    }

    pub fn release(&mut self) -> Option<String> {
        self.state.held_workpiece_id.take()
    }
}
