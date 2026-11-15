use crate::types::{
    ConveyorRuntimeState, PerCycleHistoryEntry, ProductionMetrics, ProductionStage, ScenarioConfig,
    SimulationEvent, SimulationEventType, WorkcellConfig,
};

#[derive(Debug, Clone)]
pub struct CycleAccumulator {
    pub cycle_index: u64,
    pub start_time_ms: u64,
    pub robot_move_ms: u64,
    pub process_dwell_ms: u64,
    pub wait_time_ms: u64,
    pub energy_wh: f64,
    pub had_near_collision: bool,
    pub had_fault: bool,
}

impl CycleAccumulator {
    pub fn new(cycle_index: u64, start_time_ms: u64) -> Self {
        Self {
            cycle_index,
            start_time_ms,
            robot_move_ms: 0,
            process_dwell_ms: 0,
            wait_time_ms: 0,
            energy_wh: 0.0,
            had_near_collision: false,
            had_fault: false,
        }
    }
}

/// Synthetic power & tick energy calculation matching SIMULATION_SPEC.md Section 7.2.
#[allow(clippy::too_many_arguments)]
pub fn compute_tick_energy_wh(
    config: &WorkcellConfig,
    dq: &[f64; 6],
    ddq: &[f64; 6],
    held_mass_kg: Option<f64>,
    input_conv: &ConveyorRuntimeState,
    output_conv: &ConveyorRuntimeState,
    stage: ProductionStage,
    is_dwelling: bool,
    timestep_ms: u64,
) -> f64 {
    let p_idle = 120.0_f64;
    let mut p_joints = 0.0_f64;
    let mut dq_sq_sum = 0.0_f64;

    for i in 0..6 {
        let tau_rated = config.robot.joints[i].rated_torque_nm;
        let k_vel = 0.35 * tau_rated;
        let k_acc = 0.04 * tau_rated;
        // Resistive (copper / I^2R) drive loss: motor current scales with torque, which
        // scales with acceleration, so dissipated power grows with ddq^2. This term makes
        // very aggressive motion cost more energy per unit and gives the energy objective
        // an interior optimum instead of always favouring maximum speed.
        let k_res = 0.010 * tau_rated;
        p_joints += k_vel * dq[i].abs() + k_acc * ddq[i].abs() + k_res * ddq[i] * ddq[i];
        dq_sq_sum += dq[i] * dq[i];
    }

    let p_payload = match held_mass_kg {
        Some(m) => 18.0 * m * dq_sq_sum.sqrt().max(0.1),
        None => 0.0,
    };

    let mut p_aux = 0.0_f64;
    if input_conv.running {
        p_aux += 65.0;
    }
    if output_conv.running {
        p_aux += 65.0;
    }
    if stage == ProductionStage::ProcessWorkpiece && is_dwelling {
        p_aux += 180.0;
    }

    let p_total = p_idle + p_joints + p_payload + p_aux;
    let dt_sec = (timestep_ms as f64) / 1000.0;
    (p_total * dt_sec) / 3600.0
}

#[derive(Debug, Clone)]
pub struct MetricsTracker {
    pub run_id: String,
    pub scenario_id: String,
    pub total_sim_time_ms: u64,
    pub robot_active_time_ms: u64,
    pub conveyor_active_time_ms: u64,
    pub idle_time_ms: u64,
    pub downtime_ms: u64,
    pub cumulative_energy_wh: f64,
    pub per_cycle_history: Vec<PerCycleHistoryEntry>,
}

impl MetricsTracker {
    pub fn new(run_id: String, scenario_id: String) -> Self {
        Self {
            run_id,
            scenario_id,
            total_sim_time_ms: 0,
            robot_active_time_ms: 0,
            conveyor_active_time_ms: 0,
            idle_time_ms: 0,
            downtime_ms: 0,
            cumulative_energy_wh: 0.0,
            per_cycle_history: Vec::new(),
        }
    }

    pub fn build_metrics(
        &self,
        scenario: &ScenarioConfig,
        events: &[SimulationEvent],
    ) -> ProductionMetrics {
        let total_units = events
            .iter()
            .filter(|e| e.event_type == SimulationEventType::CycleCompleted)
            .count() as u64;
        let collision_count = events
            .iter()
            .filter(|e| e.event_type == SimulationEventType::CollisionDetected)
            .count() as u64;
        let near_collision_count = events
            .iter()
            .filter(|e| e.event_type == SimulationEventType::NearCollisionWarning)
            .count() as u64;

        let total_sim = self.total_sim_time_ms;
        let units_per_hour = if total_sim > 0 && total_units > 0 {
            (total_units as f64) * 3_600_000.0 / (total_sim as f64)
        } else {
            0.0
        };

        let (avg_cycle, min_cycle, max_cycle) = if self.per_cycle_history.is_empty() {
            (0.0, 0, 0)
        } else {
            let sum: u64 = self.per_cycle_history.iter().map(|c| c.cycle_time_ms).sum();
            let min_v = self
                .per_cycle_history
                .iter()
                .map(|c| c.cycle_time_ms)
                .min()
                .unwrap_or(0);
            let max_v = self
                .per_cycle_history
                .iter()
                .map(|c| c.cycle_time_ms)
                .max()
                .unwrap_or(0);
            (
                (sum as f64) / (self.per_cycle_history.len() as f64),
                min_v,
                max_v,
            )
        };

        let denom = (total_sim.max(1)) as f64;
        let robot_util = if total_sim > 0 {
            ((self.robot_active_time_ms as f64) / denom * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };
        let conv_util = if total_sim > 0 {
            ((self.conveyor_active_time_ms as f64) / denom * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };

        let energy_per_unit = if total_units > 0 {
            self.cumulative_energy_wh / (total_units as f64)
        } else {
            0.0
        };

        let uptime_ratio = if total_sim > 0 {
            ((total_sim.saturating_sub(self.downtime_ms)) as f64) / denom
        } else {
            0.0
        };
        let target_ratio = if scenario.target_production_rate_per_hour > 0.0 && total_units > 0 {
            (units_per_hour / scenario.target_production_rate_per_hour).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let efficiency = if total_sim > 0 && total_units > 0 {
            let collision_penalty = (collision_count as f64) * 15.0;
            ((0.6 * target_ratio + 0.4 * uptime_ratio) * 100.0 - collision_penalty)
                .clamp(0.0, 100.0)
        } else {
            0.0
        };

        ProductionMetrics {
            run_id: self.run_id.clone(),
            scenario_id: self.scenario_id.clone(),
            total_sim_time_ms: total_sim,
            total_units_produced: total_units,
            units_per_hour,
            average_cycle_time_ms: avg_cycle,
            min_cycle_time_ms: min_cycle,
            max_cycle_time_ms: max_cycle,
            robot_active_time_ms: self.robot_active_time_ms,
            robot_utilization_pct: robot_util,
            conveyor_active_time_ms: self.conveyor_active_time_ms,
            conveyor_utilization_pct: conv_util,
            idle_time_ms: self.idle_time_ms,
            downtime_ms: self.downtime_ms,
            collision_event_count: collision_count,
            near_collision_event_count: near_collision_count,
            estimated_energy_wh: self.cumulative_energy_wh,
            energy_per_unit_wh: energy_per_unit,
            production_efficiency_pct: efficiency,
            per_cycle_history: self.per_cycle_history.clone(),
        }
    }
}
