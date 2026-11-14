use crate::math::Mat4;
use crate::types::{
    BoxVolume, CollisionReport, CollisionSeverity, Pose3D, Vec3, WorkcellConfig, WorkpieceState,
    WorkpieceStatus,
};

#[derive(Debug, Clone)]
pub struct WorldCapsule {
    pub owner_id: String,
    pub link_index: usize,
    pub start: Vec3,
    pub end: Vec3,
    pub radius: f64,
}

pub fn build_world_capsules(config: &WorkcellConfig, frames_base: &[Mat4; 7]) -> Vec<WorldCapsule> {
    let t_wb = Mat4::from_pose(&config.robot.base_mount_pose);
    let mut world_frames = [Mat4::IDENTITY; 7];
    for i in 0..7 {
        world_frames[i] = t_wb.mul(&frames_base[i]);
    }

    config
        .robot
        .collision_capsules
        .iter()
        .map(|cap| {
            let link_index = match cap.owner_id.as_str() {
                "link-1" => 1,
                "link-2" => 2,
                "link-3" => 3,
                "link-4" => 4,
                "link-5" => 6,
                "gripper" => 6,
                _ => 6,
            };
            let t = &world_frames[link_index];
            WorldCapsule {
                owner_id: cap.owner_id.clone(),
                link_index,
                start: t.transform_point(cap.local_start),
                end: t.transform_point(cap.local_end),
                radius: cap.radius,
            }
        })
        .collect()
}

/// Returns (distance, closest_on_seg1, closest_on_seg2).
pub fn segment_segment_distance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3) -> (f64, Vec3, Vec3) {
    let d1 = q1.sub(p1);
    let d2 = q2.sub(p2);
    let r = p1.sub(p2);
    let a = d1.dot(d1);
    let e = d2.dot(d2);
    let f = d2.dot(r);

    let (s, t) = if a <= 1e-12 && e <= 1e-12 {
        (0.0, 0.0)
    } else if a <= 1e-12 {
        (0.0, (f / e).clamp(0.0, 1.0))
    } else {
        let c = d1.dot(r);
        if e <= 1e-12 {
            ((-c / a).clamp(0.0, 1.0), 0.0)
        } else {
            let b = d1.dot(d2);
            let denom = a * e - b * b;
            let mut s_val = if denom.abs() > 1e-14 {
                ((b * f - c * e) / denom).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let mut t_val = (b * s_val + f) / e;
            if t_val < 0.0 {
                t_val = 0.0;
                s_val = (-c / a).clamp(0.0, 1.0);
            } else if t_val > 1.0 {
                t_val = 1.0;
                s_val = ((b - c) / a).clamp(0.0, 1.0);
            }
            (s_val, t_val)
        }
    };

    let c1 = p1.add(d1.scale(s));
    let c2 = p2.add(d2.scale(t));
    (c1.sub(c2).norm(), c1, c2)
}

fn point_aabb_signed(p: Vec3, h: Vec3) -> (f64, Vec3) {
    let clamped = Vec3::new(
        p.x.clamp(-h.x, h.x),
        p.y.clamp(-h.y, h.y),
        p.z.clamp(-h.z, h.z),
    );
    let diff = p.sub(clamped);
    let outside_dist = diff.norm();
    if outside_dist > 0.0 {
        return (outside_dist, clamped);
    }
    // Point is inside or on boundary: negative depth to nearest face
    let dx = h.x - p.x.abs();
    let dy = h.y - p.y.abs();
    let dz = h.z - p.z.abs();
    let pen = dx.min(dy).min(dz);
    (-pen, clamped)
}

/// Exact analytical signed distance from segment [a, b] to AABB centered at origin with half-extents `h`.
/// Returns (signed_distance, point_on_seg, point_on_box). Negative when intersecting box interior.
pub fn segment_local_aabb_signed(a: Vec3, b: Vec3, h: Vec3) -> (f64, Vec3, Vec3) {
    let d = b.sub(a);
    let mut ts = Vec::with_capacity(8);
    ts.push(0.0_f64);
    ts.push(1.0_f64);

    let axes_a = [a.x, a.y, a.z];
    let axes_d = [d.x, d.y, d.z];
    let axes_h = [h.x, h.y, h.z];
    for k in 0..3 {
        if axes_d[k].abs() > 1e-12 {
            for sign in [-1.0, 1.0] {
                let t = (sign * axes_h[k] - axes_a[k]) / axes_d[k];
                if t > 0.0 && t < 1.0 {
                    ts.push(t);
                }
            }
        }
    }
    ts.sort_by(|x, y| x.total_cmp(y));

    let mut best_signed = f64::INFINITY;
    let mut best_seg_p = a;
    let mut best_box_p = a;

    let mut eval_t = |t: f64| {
        let p = a.add(d.scale(t));
        let (sd, bp) = point_aabb_signed(p, h);
        if sd < best_signed {
            best_signed = sd;
            best_seg_p = p;
            best_box_p = bp;
        }
    };

    for &t in &ts {
        eval_t(t);
    }

    for w in ts.windows(2) {
        let t_lo = w[0];
        let t_hi = w[1];
        if t_hi - t_lo <= 1e-12 {
            continue;
        }
        let t_mid = 0.5 * (t_lo + t_hi);
        let p_mid = a.add(d.scale(t_mid));
        let mid_arr = [p_mid.x, p_mid.y, p_mid.z];

        // Compute quadratic coefficients sum_k (u_k + v_k * t)^2 on active clamped axes
        let mut quad_a = 0.0;
        let mut quad_b = 0.0;
        for k in 0..3 {
            if mid_arr[k] > axes_h[k] {
                quad_a += axes_d[k] * axes_d[k];
                quad_b += (axes_a[k] - axes_h[k]) * axes_d[k];
            } else if mid_arr[k] < -axes_h[k] {
                quad_a += axes_d[k] * axes_d[k];
                quad_b += (axes_a[k] + axes_h[k]) * axes_d[k];
            }
        }
        if quad_a > 1e-14 {
            let t_star = (-quad_b / quad_a).clamp(t_lo, t_hi);
            eval_t(t_star);
        } else {
            eval_t(t_mid);
        }
    }

    (best_signed, best_seg_p, best_box_p)
}

pub fn segment_box_clearance(
    seg_start: Vec3,
    seg_end: Vec3,
    radius: f64,
    box_vol: &BoxVolume,
) -> (f64, Vec3) {
    let inv_q = box_vol.orientation.conjugate().normalize();
    let local_a = inv_q.rotate_vec(seg_start.sub(box_vol.center));
    let local_b = inv_q.rotate_vec(seg_end.sub(box_vol.center));
    let (signed_dist, _seg_p, box_p) =
        segment_local_aabb_signed(local_a, local_b, box_vol.half_extents);
    let clearance = signed_dist - radius;
    let world_contact = box_vol
        .center
        .add(box_vol.orientation.normalize().rotate_vec(box_p));
    (clearance, world_contact)
}

/// Exact signed surface clearance between an oriented box (workpiece) and a static BoxVolume.
pub fn obb_box_clearance(wp_pose: &Pose3D, wp_half: Vec3, box_vol: &BoxVolume) -> (f64, Vec3) {
    let inv_b = box_vol.orientation.conjugate().normalize();
    let c_local = inv_b.rotate_vec(wp_pose.position.sub(box_vol.center));
    let q_rel = crate::math::Mat4::from_pose(&Pose3D {
        position: Vec3::ZERO,
        orientation: box_vol.orientation.conjugate(),
    })
    .mul(&crate::math::Mat4::from_pose(&Pose3D {
        position: Vec3::ZERO,
        orientation: wp_pose.orientation,
    }))
    .rotation();

    let u = [
        Vec3::new(q_rel[0][0], q_rel[1][0], q_rel[2][0]),
        Vec3::new(q_rel[0][1], q_rel[1][1], q_rel[2][1]),
        Vec3::new(q_rel[0][2], q_rel[1][2], q_rel[2][2]),
    ];
    let e_a = [wp_half.x, wp_half.y, wp_half.z];
    let e_b = [
        box_vol.half_extents.x,
        box_vol.half_extents.y,
        box_vol.half_extents.z,
    ];
    let b_axes = [
        Vec3::new(1.0, 0.0, 0.0),
        Vec3::new(0.0, 1.0, 0.0),
        Vec3::new(0.0, 0.0, 1.0),
    ];

    // SAT overlap check across 15 axes
    let mut separated = false;
    let mut min_pen = f64::INFINITY;
    let mut check_axis = |axis: Vec3| {
        let len = axis.norm();
        if len < 1e-10 {
            return;
        }
        let n = axis.scale(1.0 / len);
        let ra =
            e_a[0] * n.dot(u[0]).abs() + e_a[1] * n.dot(u[1]).abs() + e_a[2] * n.dot(u[2]).abs();
        let rb = e_b[0] * n.dot(b_axes[0]).abs()
            + e_b[1] * n.dot(b_axes[1]).abs()
            + e_b[2] * n.dot(b_axes[2]).abs();
        let dist_c = c_local.dot(n).abs();
        let gap = dist_c - (ra + rb);
        if gap > 0.0 {
            separated = true;
        } else {
            min_pen = min_pen.min(-gap);
        }
    };

    for ax in b_axes {
        check_axis(ax);
    }
    for ax in u {
        check_axis(ax);
    }
    for ax_a in u {
        for ax_b in b_axes {
            check_axis(ax_a.cross(ax_b));
        }
    }

    if !separated {
        let world_c = box_vol
            .center
            .add(box_vol.orientation.normalize().rotate_vec(c_local));
        return (-min_pen, world_c);
    }

    // Separated: exact minimum over 12 OBB edges -> AABB and 8 AABB vertices -> OBB
    let mut best_dist = f64::INFINITY;
    let mut best_local_box = Vec3::ZERO;

    let mut verts = [Vec3::ZERO; 8];
    let mut idx = 0;
    for sx in [-1.0, 1.0] {
        for sy in [-1.0, 1.0] {
            for sz in [-1.0, 1.0] {
                verts[idx] = c_local
                    .add(u[0].scale(sx * e_a[0]))
                    .add(u[1].scale(sy * e_a[1]))
                    .add(u[2].scale(sz * e_a[2]));
                idx += 1;
            }
        }
    }

    let edge_pairs: [(usize, usize); 12] = [
        (0, 1),
        (2, 3),
        (4, 5),
        (6, 7),
        (0, 2),
        (1, 3),
        (4, 6),
        (5, 7),
        (0, 4),
        (1, 5),
        (2, 6),
        (3, 7),
    ];
    for (i0, i1) in edge_pairs {
        let (d, _sp, bp) = segment_local_aabb_signed(verts[i0], verts[i1], box_vol.half_extents);
        if d < best_dist {
            best_dist = d;
            best_local_box = bp;
        }
    }

    // 8 AABB vertices tested against OBB A
    for sx in [-1.0, 1.0] {
        for sy in [-1.0, 1.0] {
            for sz in [-1.0, 1.0] {
                let vb = Vec3::new(sx * e_b[0], sy * e_b[1], sz * e_b[2]);
                let rel = vb.sub(c_local);
                let in_a = Vec3::new(rel.dot(u[0]), rel.dot(u[1]), rel.dot(u[2]));
                let (d, _) = point_aabb_signed(in_a, wp_half);
                if d < best_dist {
                    best_dist = d;
                    best_local_box = vb;
                }
            }
        }
    }

    let world_contact = box_vol
        .center
        .add(box_vol.orientation.normalize().rotate_vec(best_local_box));
    (best_dist, world_contact)
}

fn are_links_adjacent(a: &str, b: &str) -> bool {
    let rank = |id: &str| -> Option<i32> {
        match id {
            "link-1" => Some(1),
            "link-2" => Some(2),
            "link-3" => Some(3),
            "link-4" => Some(4),
            "link-5" => Some(5),
            "gripper" => Some(6),
            _ => None,
        }
    };
    match (rank(a), rank(b)) {
        (Some(ra), Some(rb)) => (ra - rb).abs() <= 1,
        _ => false,
    }
}

fn is_intentional_support_contact(
    wp_pose: &Pose3D,
    wp_half: Vec3,
    box_vol: &BoxVolume,
    config: &WorkcellConfig,
) -> bool {
    let wp_bottom = wp_pose.position.y - wp_half.y;
    let check_zone = |zone: Vec3, top_y: f64| -> bool {
        let dx = wp_pose.position.x - zone.x;
        let dz = wp_pose.position.z - zone.z;
        (dx * dx + dz * dz).sqrt() <= 0.045
            && wp_bottom >= top_y - 0.002
            && wp_bottom <= top_y + 0.045
    };
    match box_vol.owner_id.as_str() {
        "input-conveyor" => check_zone(
            config.input_conveyor.target_zone_world,
            config.input_conveyor.belt_top_y,
        ),
        "processing-station" => check_zone(
            config.processing_station.target_pose_world.position,
            config.processing_station.fixture_top_y,
        ),
        "output-conveyor" => check_zone(
            config.output_conveyor.target_zone_world,
            config.output_conveyor.belt_top_y,
        ),
        _ => false,
    }
}

pub fn evaluate_workcell_collisions(
    config: &WorkcellConfig,
    frames_base: &[Mat4; 7],
    tcp_world_pose: &Pose3D,
    held_workpiece: Option<&WorkpieceState>,
    workpieces: &[WorkpieceState],
) -> CollisionReport {
    let capsules = build_world_capsules(config, frames_base);

    let mut all_boxes: Vec<&BoxVolume> = Vec::with_capacity(
        2 + config.processing_station.collision_boxes.len() + config.static_obstacles.len(),
    );
    all_boxes.push(&config.input_conveyor.collision_box);
    all_boxes.push(&config.output_conveyor.collision_box);
    for b in &config.processing_station.collision_boxes {
        all_boxes.push(b);
    }
    for b in &config.static_obstacles {
        all_boxes.push(b);
    }

    let mut min_clearance = f64::INFINITY;
    let mut best_a = String::new();
    let mut best_b = String::new();
    let mut best_point: Option<Vec3> = None;

    let mut record = |clr: f64, a: &str, b: &str, pt: Vec3| {
        if clr < min_clearance {
            min_clearance = clr;
            best_a = a.to_string();
            best_b = b.to_string();
            best_point = Some(pt);
        }
    };

    // 1. Non-adjacent robot link self-collisions
    for i in 0..capsules.len() {
        for j in (i + 1)..capsules.len() {
            let ca = &capsules[i];
            let cb = &capsules[j];
            if are_links_adjacent(&ca.owner_id, &cb.owner_id) {
                continue;
            }
            let (d, p1, p2) = segment_segment_distance(ca.start, ca.end, cb.start, cb.end);
            let clr = d - (ca.radius + cb.radius);
            record(clr, &ca.owner_id, &cb.owner_id, p1.lerp(p2, 0.5));
        }
    }

    // 2. Robot capsules vs static boxes (conveyors, station, pedestal, fence, estop)
    for cap in &capsules {
        for bx in &all_boxes {
            let (clr, pt) = segment_box_clearance(cap.start, cap.end, cap.radius, bx);
            record(clr, &cap.owner_id, &bx.owner_id, pt);
        }
    }

    // 3. Held workpiece vs static boxes + other resting workpieces
    if let Some(held) = held_workpiece {
        let wp_half = held.dimensions_meters.scale(0.5);
        for bx in &all_boxes {
            if is_intentional_support_contact(tcp_world_pose, wp_half, bx, config) {
                continue;
            }
            let (clr, pt) = obb_box_clearance(tcp_world_pose, wp_half, bx);
            record(clr, &held.id, &bx.owner_id, pt);
        }
        // Against other ungrasped workpieces
        for other in workpieces {
            if other.id == held.id || other.status == WorkpieceStatus::Completed {
                continue;
            }
            let other_box = BoxVolume {
                kind: "box".to_string(),
                owner_id: other.id.clone(),
                center: other.pose_world.position,
                half_extents: other.dimensions_meters.scale(0.5),
                orientation: other.pose_world.orientation,
            };
            let (clr, pt) = obb_box_clearance(tcp_world_pose, wp_half, &other_box);
            record(clr, &held.id, &other.id, pt);
        }
    } else {
        // Ungrasped robot arms vs non-target-graspable resting workpieces?
        // Only check non-gripper links vs resting workpieces, and gripper when not above target zone
        for cap in &capsules {
            for wp in workpieces {
                if wp.status == WorkpieceStatus::Grasped || wp.status == WorkpieceStatus::Completed
                {
                    continue;
                }
                // Intentional grasp proximity exclusion when gripper approaches ready workpiece
                if cap.owner_id == "gripper" {
                    let dx = tcp_world_pose.position.x - wp.pose_world.position.x;
                    let dz = tcp_world_pose.position.z - wp.pose_world.position.z;
                    let dy = tcp_world_pose.position.y - wp.pose_world.position.y;
                    if (dx * dx + dz * dz).sqrt() <= 0.045 && dy >= -0.005 {
                        continue;
                    }
                }
                let wp_box = BoxVolume {
                    kind: "box".to_string(),
                    owner_id: wp.id.clone(),
                    center: wp.pose_world.position,
                    half_extents: wp.dimensions_meters.scale(0.5),
                    orientation: wp.pose_world.orientation,
                };
                let (clr, pt) = segment_box_clearance(cap.start, cap.end, cap.radius, &wp_box);
                record(clr, &cap.owner_id, &wp.id, pt);
            }
        }
    }

    let severity = if min_clearance <= 0.0 {
        CollisionSeverity::Collision
    } else if min_clearance <= config.near_collision_threshold_meters {
        CollisionSeverity::NearCollision
    } else {
        CollisionSeverity::None
    };

    CollisionReport {
        severity,
        min_clearance_meters: min_clearance,
        pair_a: best_a,
        pair_b: best_b,
        contact_point_world: if severity == CollisionSeverity::None {
            None
        } else {
            best_point
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kinematics::{forward_kinematics, home_joints, inverse_kinematics};
    use crate::trajectory::QuinticSegment;
    use crate::CANONICAL_WORKCELL_JSON;

    fn load_config() -> WorkcellConfig {
        serde_json::from_str(CANONICAL_WORKCELL_JSON).expect("canonical workcell JSON parses")
    }

    #[test]
    fn rust_col_01_nominal_trajectory_zero_collisions() {
        let cfg = load_config();
        let down = cfg.processing_station.target_pose_world.orientation;
        let waypoints = [
            home_joints(&cfg),
            inverse_kinematics(
                &cfg,
                &Pose3D {
                    position: Vec3::new(-0.56, 0.89, 0.08),
                    orientation: down,
                },
                &home_joints(&cfg),
            )
            .unwrap(),
            inverse_kinematics(
                &cfg,
                &Pose3D {
                    position: Vec3::new(-0.56, 0.75, 0.08),
                    orientation: down,
                },
                &home_joints(&cfg),
            )
            .unwrap(),
            inverse_kinematics(
                &cfg,
                &Pose3D {
                    position: Vec3::new(0.0, 0.89, -0.56),
                    orientation: down,
                },
                &home_joints(&cfg),
            )
            .unwrap(),
            inverse_kinematics(
                &cfg,
                &Pose3D {
                    position: Vec3::new(0.0, 0.75, -0.56),
                    orientation: down,
                },
                &home_joints(&cfg),
            )
            .unwrap(),
            inverse_kinematics(
                &cfg,
                &Pose3D {
                    position: Vec3::new(0.56, 0.89, 0.08),
                    orientation: down,
                },
                &home_joints(&cfg),
            )
            .unwrap(),
            inverse_kinematics(
                &cfg,
                &Pose3D {
                    position: Vec3::new(0.56, 0.75, 0.08),
                    orientation: down,
                },
                &home_joints(&cfg),
            )
            .unwrap(),
        ];

        for pair in waypoints.windows(2) {
            let seg = QuinticSegment::plan(&cfg, pair[0], pair[1], 1.0, 1.0, 20).unwrap();
            let mut t = 0;
            while t <= seg.duration_ms {
                let (q, _, _) = seg.sample(t);
                let fk = forward_kinematics(&cfg, &q);
                let report = evaluate_workcell_collisions(
                    &cfg,
                    &fk.frames_base,
                    &fk.tcp_world_pose,
                    None,
                    &[],
                );
                assert_eq!(
                    report.severity,
                    CollisionSeverity::None,
                    "Unexpected {:?} between {} and {} (clr={:.4} m)",
                    report.severity,
                    report.pair_a,
                    report.pair_b,
                    report.min_clearance_meters
                );
                t += 20;
            }
        }
    }

    #[test]
    fn rust_col_02_near_collision_warning_within_25mm() {
        let cfg = load_config();
        let down = cfg.processing_station.target_pose_world.orientation;
        // Gripper capsule extends down to y_tcp + 0.003 (radius 0.055 around z6=0.062, flange at y_tcp+0.120 -> lowest point y_tcp + 0.003).
        // Station deck top is 0.720 m; putting TCP at y = 0.732 puts lowest gripper surface at y = 0.735 -> 15 mm clearance!
        let q = inverse_kinematics(
            &cfg,
            &Pose3D {
                position: Vec3::new(0.0, 0.732, -0.56),
                orientation: down,
            },
            &home_joints(&cfg),
        )
        .unwrap();
        let fk = forward_kinematics(&cfg, &q);
        let report =
            evaluate_workcell_collisions(&cfg, &fk.frames_base, &fk.tcp_world_pose, None, &[]);
        assert_eq!(report.severity, CollisionSeverity::NearCollision);
        assert!(report.min_clearance_meters > 0.0);
        assert!(report.min_clearance_meters <= cfg.near_collision_threshold_meters);
    }

    #[test]
    fn rust_col_03_collision_into_input_conveyor() {
        let cfg = load_config();
        let down = cfg.processing_station.target_pose_world.orientation;
        let q = inverse_kinematics(
            &cfg,
            &Pose3D {
                position: Vec3::new(-0.56, 0.68, 0.08),
                orientation: down,
            },
            &home_joints(&cfg),
        )
        .unwrap();
        let fk = forward_kinematics(&cfg, &q);
        let report =
            evaluate_workcell_collisions(&cfg, &fk.frames_base, &fk.tcp_world_pose, None, &[]);
        assert_eq!(report.severity, CollisionSeverity::Collision);
        assert_eq!(report.pair_b, "input-conveyor");
        assert!(report.min_clearance_meters <= 0.0);
    }

    #[test]
    fn rust_col_04_safety_fence_collision_detection() {
        let mut cfg = load_config();
        // Override fence wall closer in unit test to test full robot->fence collision boundary
        for obs in &mut cfg.static_obstacles {
            if obs.owner_id == "safety-fence-north" {
                obs.center.z = -0.68;
            }
        }
        let fk = forward_kinematics(&cfg, &[0.0; 6]);
        let report =
            evaluate_workcell_collisions(&cfg, &fk.frames_base, &fk.tcp_world_pose, None, &[]);
        assert_eq!(report.severity, CollisionSeverity::Collision);
        assert!(report.pair_b.starts_with("safety-fence-"));
    }

    #[test]
    fn rust_col_05_held_workpiece_collision_on_low_transit() {
        let cfg = load_config();
        let down = cfg.processing_station.target_pose_world.orientation;
        // Command low transit sweeping into station table side at x=-0.20, y=0.69, z=-0.56
        let q = inverse_kinematics(
            &cfg,
            &Pose3D {
                position: Vec3::new(-0.20, 0.72, -0.56),
                orientation: down,
            },
            &home_joints(&cfg),
        )
        .unwrap();
        let fk = forward_kinematics(&cfg, &q);
        let held = WorkpieceState {
            id: "WP-0001".to_string(),
            mass_kg: 1.2,
            dimensions_meters: cfg.workpiece_template.dimensions_meters,
            pose_world: fk.tcp_world_pose,
            status: WorkpieceStatus::Grasped,
            spawn_time_ms: 0,
            completed_time_ms: None,
        };
        let report = evaluate_workcell_collisions(
            &cfg,
            &fk.frames_base,
            &fk.tcp_world_pose,
            Some(&held),
            std::slice::from_ref(&held),
        );
        assert_eq!(report.severity, CollisionSeverity::Collision);
        assert_eq!(report.pair_a, "WP-0001");
    }

    #[test]
    fn rust_col_06_intentional_grasp_no_false_positive() {
        let cfg = load_config();
        let down = cfg.processing_station.target_pose_world.orientation;
        let q = inverse_kinematics(
            &cfg,
            &Pose3D {
                position: Vec3::new(-0.56, 0.75, 0.08),
                orientation: down,
            },
            &home_joints(&cfg),
        )
        .unwrap();
        let fk = forward_kinematics(&cfg, &q);
        let held = WorkpieceState {
            id: "WP-0001".to_string(),
            mass_kg: 1.2,
            dimensions_meters: cfg.workpiece_template.dimensions_meters,
            pose_world: fk.tcp_world_pose,
            status: WorkpieceStatus::Grasped,
            spawn_time_ms: 0,
            completed_time_ms: None,
        };
        let report = evaluate_workcell_collisions(
            &cfg,
            &fk.frames_base,
            &fk.tcp_world_pose,
            Some(&held),
            std::slice::from_ref(&held),
        );
        assert_eq!(report.severity, CollisionSeverity::None);
    }
}
