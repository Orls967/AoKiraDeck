use crate::math::{axis_angle_error, solve_6x6, Mat4};
use crate::types::{DhParameters, FaultCode, Pose3D, Vec3, WorkcellConfig};

#[derive(Debug, Clone)]
pub struct FkResult {
    pub frames_base: [Mat4; 7],
    pub tcp_base: Mat4,
    pub link_world_poses: Vec<Pose3D>,
    pub tcp_world_pose: Pose3D,
}

pub fn dh_transform(dh: &DhParameters, q_i: f64) -> Mat4 {
    let theta = q_i + dh.theta_offset_rad;
    let ct = theta.cos();
    let st = theta.sin();
    let ca = dh.alpha_rad.cos();
    let sa = dh.alpha_rad.sin();
    Mat4 {
        m: [
            [ct, -st * ca, st * sa, dh.a_meters * ct],
            [st, ct * ca, -ct * sa, dh.a_meters * st],
            [0.0, sa, ca, dh.d_meters],
            [0.0, 0.0, 0.0, 1.0],
        ],
    }
}

pub fn home_joints(config: &WorkcellConfig) -> [f64; 6] {
    let joints = &config.robot.joints;
    [
        joints[0].home_angle_rad,
        joints[1].home_angle_rad,
        joints[2].home_angle_rad,
        joints[3].home_angle_rad,
        joints[4].home_angle_rad,
        joints[5].home_angle_rad,
    ]
}

pub fn clamp_joints(config: &WorkcellConfig, q: &mut [f64; 6]) -> bool {
    let mut clamped = false;
    for (i, val) in q.iter_mut().enumerate() {
        let min = config.robot.joints[i].min_angle_rad;
        let max = config.robot.joints[i].max_angle_rad;
        if *val < min {
            *val = min;
            clamped = true;
        } else if *val > max {
            *val = max;
            clamped = true;
        }
    }
    clamped
}

pub fn forward_kinematics(config: &WorkcellConfig, q: &[f64; 6]) -> FkResult {
    let mut frames_base = [Mat4::IDENTITY; 7];
    let mut t = Mat4::IDENTITY;
    for (i, joint) in config.robot.joints.iter().enumerate() {
        t = t.mul(&dh_transform(&joint.dh, q[i]));
        frames_base[i + 1] = t;
    }

    let tcp_offset = &config.robot.tool_tcp_offset_meters;
    let t_tcp_local = Mat4 {
        m: [
            [1.0, 0.0, 0.0, tcp_offset.x],
            [0.0, 1.0, 0.0, tcp_offset.y],
            [0.0, 0.0, 1.0, tcp_offset.z],
            [0.0, 0.0, 0.0, 1.0],
        ],
    };
    let tcp_base = t.mul(&t_tcp_local);

    let t_wb = Mat4::from_pose(&config.robot.base_mount_pose);
    let mut link_world_poses = Vec::with_capacity(7);
    for frame in &frames_base {
        link_world_poses.push(t_wb.mul(frame).to_pose());
    }
    let tcp_world_pose = t_wb.mul(&tcp_base).to_pose();

    FkResult {
        frames_base,
        tcp_base,
        link_world_poses,
        tcp_world_pose,
    }
}

pub fn geometric_jacobian(frames_base: &[Mat4; 7], p_tcp_base: Vec3) -> [[f64; 6]; 6] {
    let mut j = [[0.0; 6]; 6];
    for i in 0..6 {
        let z = frames_base[i].z_axis();
        let p = frames_base[i].translation();
        let v = z.cross(p_tcp_base.sub(p));
        j[0][i] = v.x;
        j[1][i] = v.y;
        j[2][i] = v.z;
        j[3][i] = z.x;
        j[4][i] = z.y;
        j[5][i] = z.z;
    }
    j
}

pub fn max_theoretical_reach_from_shoulder(config: &WorkcellConfig) -> f64 {
    let j = &config.robot.joints;
    let a1 = j[0].dh.a_meters;
    let a2 = j[1].dh.a_meters;
    let a3 = j[2].dh.a_meters;
    let d4 = j[3].dh.d_meters;
    let d6 = j[5].dh.d_meters;
    let tcp = config.robot.tool_tcp_offset_meters.z;
    a1 + a2 + (a3 * a3 + d4 * d4).sqrt() + d6 + tcp
}

fn run_dls_seed(
    config: &WorkcellConfig,
    p_target_b: Vec3,
    r_target_b: &[[f64; 3]; 3],
    seed: [f64; 6],
) -> (bool, [f64; 6], bool) {
    let mut q = seed;
    let mut hit_bound = clamp_joints(config, &mut q);
    let mut lambda = 0.025_f64;
    let mut prev_err = f64::INFINITY;
    let pos_tol = 0.0005;
    let rot_tol = 0.005;
    let max_step = 0.25;

    for _iter in 0..120 {
        let fk = forward_kinematics(config, &q);
        let p_cur = fk.tcp_base.translation();
        let r_cur = fk.tcp_base.rotation();
        let ep = p_target_b.sub(p_cur);
        let er = axis_angle_error(r_target_b, &r_cur);
        let ep_norm = ep.norm();
        let er_norm = er.norm();

        if ep_norm <= pos_tol && er_norm <= rot_tol {
            return (true, q, hit_bound);
        }

        let err_sum = ep_norm + er_norm;
        if err_sum < prev_err {
            lambda = (0.7 * lambda).max(0.01);
        } else {
            lambda = (2.0 * lambda).min(0.25);
        }
        prev_err = err_sum;

        let j = geometric_jacobian(&fk.frames_base, p_cur);
        let mut jjt = [[0.0; 6]; 6];
        for r in 0..6 {
            for c in 0..6 {
                let mut sum = 0.0;
                for (k, &jr_k) in j[r].iter().enumerate() {
                    sum += jr_k * j[c][k];
                }
                if r == c {
                    sum += lambda * lambda;
                }
                jjt[r][c] = sum;
            }
        }
        let e = [ep.x, ep.y, ep.z, er.x, er.y, er.z];
        let Some(y) = solve_6x6(jjt, e) else {
            return (false, q, hit_bound);
        };

        let mut dq = [0.0; 6];
        let mut max_abs = 0.0_f64;
        for col in 0..6 {
            let mut sum = 0.0;
            for (row, &y_val) in y.iter().enumerate() {
                sum += j[row][col] * y_val;
            }
            dq[col] = sum;
            max_abs = max_abs.max(sum.abs());
        }
        if max_abs > max_step {
            let scale = max_step / max_abs;
            for v in &mut dq {
                *v *= scale;
            }
        }

        for i in 0..6 {
            q[i] += dq[i];
        }
        if clamp_joints(config, &mut q) {
            hit_bound = true;
        }
    }

    let fk = forward_kinematics(config, &q);
    let ep_norm = p_target_b.sub(fk.tcp_base.translation()).norm();
    let er_norm = axis_angle_error(r_target_b, &fk.tcp_base.rotation()).norm();
    (ep_norm <= pos_tol && er_norm <= rot_tol, q, hit_bound)
}

pub fn inverse_kinematics(
    config: &WorkcellConfig,
    target_world: &Pose3D,
    q_current: &[f64; 6],
) -> Result<[f64; 6], (FaultCode, String)> {
    let p = target_world.position;
    let o = target_world.orientation;
    if !(p.x.is_finite()
        && p.y.is_finite()
        && p.z.is_finite()
        && o.x.is_finite()
        && o.y.is_finite()
        && o.z.is_finite()
        && o.w.is_finite())
    {
        return Err((
            FaultCode::UnreachableTarget,
            "Target pose contains non-finite coordinates".to_string(),
        ));
    }

    let t_wb = Mat4::from_pose(&config.robot.base_mount_pose);
    let t_bw = t_wb.inverse_rigid();
    let target_b = t_bw.mul(&Mat4::from_pose(target_world));
    let p_target_b = target_b.translation();
    let r_target_b = target_b.rotation();

    let shoulder_origin_b = Vec3::new(0.0, 0.0, config.robot.joints[0].dh.d_meters);
    let dist_from_shoulder = p_target_b.sub(shoulder_origin_b).norm();
    let max_reach = max_theoretical_reach_from_shoulder(config);
    if dist_from_shoulder > max_reach + 1e-4 {
        return Err((
            FaultCode::UnreachableTarget,
            format!(
                "Target distance {:.3} m exceeds robot reach envelope {:.3} m",
                dist_from_shoulder, max_reach
            ),
        ));
    }

    let az = p_target_b.y.atan2(p_target_b.x);
    let q_home = home_joints(config);
    let seed2 = [az, 0.35, 0.45, 0.0, 0.77, 0.0];
    let seeds = [*q_current, q_home, seed2];

    let mut any_bound_blocked = false;
    for seed in seeds {
        let (ok, sol, hit_bound) = run_dls_seed(config, p_target_b, &r_target_b, seed);
        if ok {
            return Ok(sol);
        }
        if hit_bound {
            any_bound_blocked = true;
        }
    }

    if any_bound_blocked {
        Err((
            FaultCode::JointLimitViolation,
            format!(
                "IK target ({:.3}, {:.3}, {:.3}) m blocked by joint angle limits",
                p.x, p.y, p.z
            ),
        ))
    } else {
        Err((
            FaultCode::UnreachableTarget,
            format!(
                "IK solver failed to converge for target ({:.3}, {:.3}, {:.3}) m",
                p.x, p.y, p.z
            ),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::CANONICAL_WORKCELL_JSON;

    fn load_config() -> WorkcellConfig {
        serde_json::from_str(CANONICAL_WORKCELL_JSON).expect("canonical workcell JSON parses")
    }

    #[test]
    fn rust_kin_01_home_pose_analytical_check() {
        let cfg = load_config();
        let q = home_joints(&cfg);
        let fk = forward_kinematics(&cfg, &q);
        let r = fk.tcp_world_pose.orientation.to_mat3();
        // +Z_tcp column in WorldFrame must equal (0, -1, 0) within 1e-6
        assert!(r[0][2].abs() < 1e-6);
        assert!((r[1][2] + 1.0).abs() < 1e-6);
        assert!(r[2][2].abs() < 1e-6);

        // Closed-form DH check at q = [0, 10deg, 20deg, 0, 60deg, 0]:
        // upper arm tilts 10 deg from +Z_b toward +X_b; forearm tilts 30 deg from +X_b toward -Z_b (wait: from +Z_b -> 30 deg? Let's verify exact trig!)
        let q2 = 10.0_f64.to_radians();
        let q3 = 20.0_f64.to_radians();
        let expected_x_b =
            0.080 + 0.420 * q2.sin() + 0.050 * (q2 + q3).sin() + 0.400 * (q2 + q3).cos();
        let expected_z_b = 0.340 + 0.420 * q2.cos() + 0.050 * (q2 + q3).cos()
            - 0.400 * (q2 + q3).sin()
            - (0.100 + 0.120);
        let p_w = fk.tcp_world_pose.position;
        assert!(p_w.x.abs() < 1e-6);
        assert!((p_w.y - (0.450 + expected_z_b)).abs() < 1e-6);
        assert!((p_w.z - (-expected_x_b)).abs() < 1e-6);
    }

    #[test]
    fn rust_kin_02_zero_pose_and_orthonormality() {
        let cfg = load_config();
        let q = [0.0; 6];
        let fk = forward_kinematics(&cfg, &q);
        let p = fk.tcp_world_pose.position;
        assert!(p.x.abs() < 1e-9);
        assert!((p.y - 1.260).abs() < 1e-9);
        assert!((p.z - (-0.700)).abs() < 1e-9);

        let r = fk.tcp_world_pose.orientation.to_mat3();
        // Check orthogonality ||R^T R - I|| < 1e-9 and det(R) == +1
        for i in 0..3 {
            for j in 0..3 {
                let mut dot = 0.0;
                for row in &r {
                    dot += row[i] * row[j];
                }
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!((dot - expected).abs() < 1e-9);
            }
        }
        let det = r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1])
            - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0])
            + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]);
        assert!((det - 1.0).abs() < 1e-9);
    }

    #[test]
    fn rust_kin_03_world_frame_parity_quaternion() {
        let cfg = load_config();
        let r_wb = cfg.robot.base_mount_pose.orientation.to_mat3();
        assert!((r_wb[0][1] + 1.0).abs() < 1e-12);
        assert!((r_wb[1][2] - 1.0).abs() < 1e-12);
        assert!((r_wb[2][0] + 1.0).abs() < 1e-12);
        let fk = forward_kinematics(&cfg, &home_joints(&cfg));
        assert_eq!(fk.link_world_poses.len(), 7);
    }

    #[test]
    fn rust_ik_01_canonical_workcell_targets() {
        let cfg = load_config();
        let down_orient = cfg.processing_station.target_pose_world.orientation;
        let targets = [
            Vec3::new(-0.560, 0.890, 0.080),
            Vec3::new(-0.560, 0.750, 0.080),
            Vec3::new(0.000, 0.890, -0.560),
            Vec3::new(0.000, 0.750, -0.560),
            Vec3::new(0.560, 0.890, 0.080),
            Vec3::new(0.560, 0.750, 0.080),
        ];

        let mut q_curr = home_joints(&cfg);
        for pos in targets {
            let target = Pose3D {
                position: pos,
                orientation: down_orient,
            };
            let q_sol = inverse_kinematics(&cfg, &target, &q_curr).expect("target must solve");
            let fk = forward_kinematics(&cfg, &q_sol);
            let pos_err = fk.tcp_world_pose.position.sub(pos).norm();
            let rot_err = axis_angle_error(
                &down_orient.to_mat3(),
                &fk.tcp_world_pose.orientation.to_mat3(),
            )
            .norm();
            assert!(pos_err <= 0.0005, "pos_err={}", pos_err);
            assert!(rot_err <= 0.005, "rot_err={}", rot_err);
            for (i, &ang) in q_sol.iter().enumerate() {
                assert!(ang >= cfg.robot.joints[i].min_angle_rad - 1e-9);
                assert!(ang <= cfg.robot.joints[i].max_angle_rad + 1e-9);
            }
            q_curr = q_sol;
        }
    }

    #[test]
    fn rust_ik_02_round_trip_25_reachable_poses() {
        let cfg = load_config();
        let q_home = home_joints(&cfg);
        for k in 0..25 {
            let t = (k as f64) / 24.0;
            let q_sample = [
                (-1.6 + 3.2 * t),
                (0.10 + 0.35 * (t * 3.1).sin().abs()),
                (0.15 + 0.45 * (t * 2.7).cos().abs()),
                (0.25 * (t * 4.3).sin()),
                (0.75 + 0.40 * (t * 1.9).cos()),
                (-1.2 + 2.4 * t),
            ];
            let fk_expected = forward_kinematics(&cfg, &q_sample);
            let q_sol = inverse_kinematics(&cfg, &fk_expected.tcp_world_pose, &q_home)
                .expect("sampled pose must be reachable");
            let fk_actual = forward_kinematics(&cfg, &q_sol);
            let pos_err = fk_actual
                .tcp_world_pose
                .position
                .sub(fk_expected.tcp_world_pose.position)
                .norm();
            let rot_err = axis_angle_error(
                &fk_expected.tcp_world_pose.orientation.to_mat3(),
                &fk_actual.tcp_world_pose.orientation.to_mat3(),
            )
            .norm();
            assert!(pos_err <= 0.0005, "sample {} pos_err={}", k, pos_err);
            assert!(rot_err <= 0.005, "sample {} rot_err={}", k, rot_err);
        }
    }

    #[test]
    fn rust_ik_03_unreachable_outer_target() {
        let cfg = load_config();
        let q_curr = home_joints(&cfg);
        let target = Pose3D {
            position: Vec3::new(2.50, 0.80, 0.00),
            orientation: cfg.processing_station.target_pose_world.orientation,
        };
        let err = inverse_kinematics(&cfg, &target, &q_curr).expect_err("must reject outer target");
        assert_eq!(err.0, FaultCode::UnreachableTarget);
    }

    #[test]
    fn rust_ik_04_joint_limit_blocked_target() {
        let cfg = load_config();
        let q_curr = home_joints(&cfg);
        // Target straight behind robot pedestal inside radial reach where J1=180deg exceeds ±170deg or J2 hits min/max
        // Plus target directly at base pedestal floor requiring J2 beyond [-95, +120]
        let target = Pose3D {
            position: Vec3::new(0.0, 0.15, 0.48),
            orientation: cfg.processing_station.target_pose_world.orientation,
        };
        let err = inverse_kinematics(&cfg, &target, &q_curr)
            .expect_err("must fail due to joint bounds or unreachability");
        assert!(err.0 == FaultCode::JointLimitViolation || err.0 == FaultCode::UnreachableTarget);
    }
}
