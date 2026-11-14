use crate::types::{
    ConveyorRuntimeState, Pose3D, Quat, Vec3, WorkcellConfig, WorkpieceState, WorkpieceStatus,
};

pub const INPUT_SPAWN_X: f64 = -1.380;
pub const MIN_WORKPIECE_SPACING_M: f64 = 0.220;
pub const OUTPUT_DESPAWN_X: f64 = 1.400;

#[allow(clippy::too_many_arguments)]
pub fn advance_conveyors(
    config: &WorkcellConfig,
    workpieces: &mut Vec<WorkpieceState>,
    input_speed_mps: f64,
    output_speed_mps: f64,
    timestep_ms: u64,
    sim_time_ms: u64,
    can_spawn_more: bool,
    next_wp_seq: &mut u64,
) -> (
    ConveyorRuntimeState,
    ConveyorRuntimeState,
    Option<WorkpieceState>,
    usize,
) {
    let dt = (timestep_ms as f64) / 1000.0;
    let pick_x = config.input_conveyor.target_zone_world.x;
    let zone_y = config.input_conveyor.target_zone_world.y;
    let zone_z = config.input_conveyor.target_zone_world.z;

    // 1. Spawn workpiece on input conveyor if entry is clear (>= 0.220 m spacing) and allowed
    let mut spawned: Option<WorkpieceState> = None;
    if can_spawn_more {
        let entry_blocked = workpieces.iter().any(|wp| {
            matches!(
                wp.status,
                WorkpieceStatus::SpawnedOnInput | WorkpieceStatus::ReadyForPick
            ) && (wp.pose_world.position.x - INPUT_SPAWN_X) < MIN_WORKPIECE_SPACING_M
        });
        if !entry_blocked {
            *next_wp_seq += 1;
            let wp = WorkpieceState {
                id: format!("WP-{:04}", *next_wp_seq),
                mass_kg: config.workpiece_template.default_mass_kg,
                dimensions_meters: config.workpiece_template.dimensions_meters,
                pose_world: Pose3D {
                    position: Vec3::new(INPUT_SPAWN_X, zone_y, zone_z),
                    orientation: Quat::IDENTITY,
                },
                status: WorkpieceStatus::SpawnedOnInput,
                spawn_time_ms: sim_time_ms,
                completed_time_ms: None,
            };
            workpieces.push(wp.clone());
            spawned = Some(wp);
        }
    }

    // 2. Advance input conveyor workpieces in descending X order so trailing parts keep spacing
    let mut input_indices: Vec<usize> = workpieces
        .iter()
        .enumerate()
        .filter_map(|(idx, wp)| {
            if matches!(
                wp.status,
                WorkpieceStatus::SpawnedOnInput | WorkpieceStatus::ReadyForPick
            ) {
                Some(idx)
            } else {
                None
            }
        })
        .collect();
    input_indices.sort_by(|&a, &b| {
        workpieces[b]
            .pose_world
            .position
            .x
            .total_cmp(&workpieces[a].pose_world.position.x)
    });

    let mut input_moved = false;
    let mut prev_x: Option<f64> = None;
    for idx in input_indices {
        let cur_x = workpieces[idx].pose_world.position.x;
        let max_allowed_x = match prev_x {
            Some(lead_x) => (lead_x - MIN_WORKPIECE_SPACING_M).min(pick_x),
            None => pick_x,
        };
        if cur_x < max_allowed_x - 1e-6 {
            let next_x = (cur_x + input_speed_mps * dt).min(max_allowed_x);
            workpieces[idx].pose_world.position.x = next_x;
            input_moved = true;
            if (next_x - pick_x).abs() <= 1e-6 {
                workpieces[idx].status = WorkpieceStatus::ReadyForPick;
            }
        } else if (cur_x - pick_x).abs() <= 1e-6 {
            workpieces[idx].status = WorkpieceStatus::ReadyForPick;
        }
        prev_x = Some(workpieces[idx].pose_world.position.x);
    }

    let input_sensor = workpieces
        .iter()
        .any(|wp| wp.status == WorkpieceStatus::ReadyForPick);
    let input_count = workpieces
        .iter()
        .filter(|wp| {
            matches!(
                wp.status,
                WorkpieceStatus::SpawnedOnInput | WorkpieceStatus::ReadyForPick
            )
        })
        .count();

    // 3. Advance output conveyor workpieces
    let mut output_moved = false;
    let mut output_sensor = false;
    let mut exited_count = 0_usize;

    for wp in workpieces.iter_mut() {
        if wp.status == WorkpieceStatus::OnOutputConveyor {
            if output_speed_mps > 0.0 {
                wp.pose_world.position.x += output_speed_mps * dt;
                output_moved = true;
            }
            if wp.pose_world.position.x >= OUTPUT_DESPAWN_X {
                wp.status = WorkpieceStatus::Completed;
                wp.completed_time_ms = Some(sim_time_ms);
                output_sensor = true;
                exited_count += 1;
            }
        }
    }

    // Retain active workpieces (prune retired COMPLETED pieces after exit)
    workpieces.retain(|wp| wp.status != WorkpieceStatus::Completed);

    let output_count = workpieces
        .iter()
        .filter(|wp| wp.status == WorkpieceStatus::OnOutputConveyor)
        .count();

    let input_state = ConveyorRuntimeState {
        id: config.input_conveyor.id.clone(),
        running: input_moved,
        speed_meters_per_sec: input_speed_mps,
        sensor_triggered: input_sensor,
        workpiece_count_on_belt: input_count,
    };

    let output_state = ConveyorRuntimeState {
        id: config.output_conveyor.id.clone(),
        running: output_moved,
        speed_meters_per_sec: output_speed_mps,
        sensor_triggered: output_sensor,
        workpiece_count_on_belt: output_count,
    };

    (input_state, output_state, spawned, exited_count)
}
