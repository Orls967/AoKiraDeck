use crate::kinematics::home_joints;
use crate::types::{FaultCode, JointState, WorkcellConfig};

pub fn build_joint_states(
    config: &WorkcellConfig,
    q: &[f64; 6],
    dq: &[f64; 6],
    ddq: &[f64; 6],
) -> [JointState; 6] {
    let mut out = Vec::with_capacity(6);
    for (i, cfg) in config.robot.joints.iter().enumerate() {
        let at_limit =
            (q[i] - cfg.min_angle_rad).abs() <= 1e-5 || (q[i] - cfg.max_angle_rad).abs() <= 1e-5;
        let vel_ratio = (dq[i].abs() / cfg.max_velocity_rad_per_sec).clamp(0.0, 1.0);
        let half_span = ((cfg.max_angle_rad - cfg.min_angle_rad) * 0.5).max(1e-6);
        let mid = 0.5 * (cfg.max_angle_rad + cfg.min_angle_rad);
        let pos_ratio = ((q[i] - mid).abs() / half_span).clamp(0.0, 1.0);
        let utilization_ratio = vel_ratio.max(pos_ratio * 0.25);

        out.push(JointState {
            id: cfg.id,
            angle_rad: q[i],
            velocity_rad_per_sec: dq[i],
            acceleration_rad_per_sec2: ddq[i],
            at_limit,
            utilization_ratio,
        });
    }
    [out[0], out[1], out[2], out[3], out[4], out[5]]
}

pub fn validate_joint_angles(
    config: &WorkcellConfig,
    angles: &[f64],
) -> Result<[f64; 6], (FaultCode, String)> {
    if angles.len() != 6 {
        return Err((
            FaultCode::JointLimitViolation,
            format!("Expected 6 joint angles, received {}", angles.len()),
        ));
    }
    let mut out = [0.0; 6];
    for i in 0..6 {
        let a = angles[i];
        let j = &config.robot.joints[i];
        if !a.is_finite() {
            return Err((
                FaultCode::JointLimitViolation,
                format!("Non-finite angle on {:?}", j.id),
            ));
        }
        if a < j.min_angle_rad - 1e-6 || a > j.max_angle_rad + 1e-6 {
            return Err((
                FaultCode::JointLimitViolation,
                format!(
                    "Joint {:?} angle {:.3} rad exceeds bounds [{:.3}, {:.3}]",
                    j.id, a, j.min_angle_rad, j.max_angle_rad
                ),
            ));
        }
        out[i] = a.clamp(j.min_angle_rad, j.max_angle_rad);
    }
    Ok(out)
}

pub fn initial_joints(config: &WorkcellConfig) -> [f64; 6] {
    home_joints(config)
}
