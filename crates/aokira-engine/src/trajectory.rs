use crate::types::{FaultCode, WorkcellConfig};

#[derive(Debug, Clone)]
pub struct QuinticSegment {
    pub q_start: [f64; 6],
    pub q_end: [f64; 6],
    pub duration_ms: u64,
    pub elapsed_ms: u64,
}

impl QuinticSegment {
    pub fn plan(
        config: &WorkcellConfig,
        q_start: [f64; 6],
        q_end: [f64; 6],
        speed_scale: f64,
        accel_scale: f64,
        timestep_ms: u64,
    ) -> Result<Self, (FaultCode, String)> {
        let mut max_delta = 0.0_f64;
        for i in 0..6 {
            let min = config.robot.joints[i].min_angle_rad;
            let max = config.robot.joints[i].max_angle_rad;
            if q_start[i] < min - 1e-6
                || q_start[i] > max + 1e-6
                || q_end[i] < min - 1e-6
                || q_end[i] > max + 1e-6
            {
                return Err((
                    FaultCode::JointLimitViolation,
                    format!(
                        "Trajectory endpoint exceeds limits for {:?}",
                        config.robot.joints[i].id
                    ),
                ));
            }
            max_delta = max_delta.max((q_end[i] - q_start[i]).abs());
        }

        if max_delta <= 1e-9 {
            return Ok(Self {
                q_start,
                q_end: q_start,
                duration_ms: 0,
                elapsed_ms: 0,
            });
        }

        let peak_vel_factor = 1.875_f64;
        let peak_acc_factor = 10.0_f64 / 3.0_f64.sqrt();
        let mut t_min_sec = 0.0_f64;

        for i in 0..6 {
            let dq = (q_end[i] - q_start[i]).abs();
            if dq <= 1e-12 {
                continue;
            }
            let v_eff = config.robot.joints[i].max_velocity_rad_per_sec * speed_scale;
            let a_eff = config.robot.joints[i].max_acceleration_rad_per_sec2 * accel_scale;
            let tv = (peak_vel_factor * dq) / v_eff;
            let ta = ((peak_acc_factor * dq) / a_eff).sqrt();
            t_min_sec = t_min_sec.max(tv).max(ta);
        }

        let raw_ms = (t_min_sec * 1000.0).ceil() as u64;
        let step = timestep_ms.max(1);
        let rounded_ms = raw_ms.div_ceil(step) * step;
        let duration_ms = rounded_ms.max(100);

        // Pre-validate every sampled timestep along the planned segment against joint bounds
        let seg = Self {
            q_start,
            q_end,
            duration_ms,
            elapsed_ms: 0,
        };
        let mut t = 0;
        while t <= duration_ms {
            let (q, _, _) = seg.sample(t);
            for (i, &angle) in q.iter().enumerate() {
                let min = config.robot.joints[i].min_angle_rad;
                let max = config.robot.joints[i].max_angle_rad;
                if angle < min - 1e-6 || angle > max + 1e-6 {
                    return Err((
                        FaultCode::JointLimitViolation,
                        format!(
                            "Planned trajectory violates joint limit on {:?}",
                            config.robot.joints[i].id
                        ),
                    ));
                }
            }
            t += step;
        }

        Ok(seg)
    }

    /// Returns (q, dq, ddq) at elapsed time `t_ms`.
    pub fn sample(&self, t_ms: u64) -> ([f64; 6], [f64; 6], [f64; 6]) {
        if self.duration_ms == 0 {
            return (self.q_end, [0.0; 6], [0.0; 6]);
        }
        let duration_sec = (self.duration_ms as f64) / 1000.0;
        let tau = ((t_ms as f64) / (self.duration_ms as f64)).clamp(0.0, 1.0);
        let tau2 = tau * tau;
        let tau3 = tau2 * tau;
        let tau4 = tau3 * tau;
        let tau5 = tau4 * tau;

        let s = 10.0 * tau3 - 15.0 * tau4 + 6.0 * tau5;
        let ds = (30.0 * tau2 - 60.0 * tau3 + 30.0 * tau4) / duration_sec;
        let dds = (60.0 * tau - 180.0 * tau2 + 120.0 * tau3) / (duration_sec * duration_sec);

        let mut q = [0.0; 6];
        let mut dq = [0.0; 6];
        let mut ddq = [0.0; 6];
        for i in 0..6 {
            let delta = self.q_end[i] - self.q_start[i];
            q[i] = self.q_start[i] + delta * s;
            dq[i] = delta * ds;
            ddq[i] = delta * dds;
        }
        (q, dq, ddq)
    }

    pub fn is_complete(&self) -> bool {
        self.elapsed_ms >= self.duration_ms
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kinematics::home_joints;
    use crate::CANONICAL_WORKCELL_JSON;

    fn load_config() -> WorkcellConfig {
        serde_json::from_str(CANONICAL_WORKCELL_JSON).expect("canonical workcell JSON parses")
    }

    #[test]
    fn rust_traj_01_boundary_continuity() {
        let cfg = load_config();
        let q0 = home_joints(&cfg);
        let q1 = [1.2, 0.35, 0.30, 0.0, 0.90, -1.2];
        let seg = QuinticSegment::plan(&cfg, q0, q1, 1.0, 1.0, 20).expect("valid segment");

        let (qs, dqs, ddqs) = seg.sample(0);
        let (qe, dqe, ddqe) = seg.sample(seg.duration_ms);

        for i in 0..6 {
            assert!((qs[i] - q0[i]).abs() < 1e-9);
            assert!((qe[i] - q1[i]).abs() < 1e-9);
            assert!(dqs[i].abs() < 1e-9);
            assert!(dqe[i].abs() < 1e-9);
            assert!(ddqs[i].abs() < 1e-9);
            assert!(ddqe[i].abs() < 1e-9);
        }
    }

    #[test]
    fn rust_traj_02_velocity_and_acceleration_compliance() {
        let cfg = load_config();
        let q0 = [-1.5, -0.5, -0.4, -1.0, -0.6, -2.0];
        let q1 = [1.5, 0.8, 0.9, 1.2, 1.1, 2.5];
        for speed_scale in [0.20, 1.00, 1.50] {
            for accel_scale in [0.20, 1.00, 1.50] {
                let seg = QuinticSegment::plan(&cfg, q0, q1, speed_scale, accel_scale, 20)
                    .expect("valid scaled segment");
                let mut t = 0;
                while t <= seg.duration_ms {
                    let (q, dq, ddq) = seg.sample(t);
                    for i in 0..6 {
                        let j = &cfg.robot.joints[i];
                        assert!(q[i] >= j.min_angle_rad - 1e-6);
                        assert!(q[i] <= j.max_angle_rad + 1e-6);
                        assert!(
                            dq[i].abs() <= j.max_velocity_rad_per_sec * speed_scale + 1e-6,
                            "dq[{}]={} > v_eff",
                            i,
                            dq[i].abs()
                        );
                        assert!(
                            ddq[i].abs() <= j.max_acceleration_rad_per_sec2 * accel_scale + 1e-6,
                            "ddq[{}]={} > a_eff",
                            i,
                            ddq[i].abs()
                        );
                    }
                    t += 20;
                }
            }
        }
    }

    #[test]
    fn rust_traj_03_zero_delta_segment_no_nan() {
        let cfg = load_config();
        let q0 = home_joints(&cfg);
        let seg = QuinticSegment::plan(&cfg, q0, q0, 1.0, 1.0, 20).expect("zero delta ok");
        assert_eq!(seg.duration_ms, 0);
        let (q, dq, ddq) = seg.sample(0);
        for i in 0..6 {
            assert!((q[i] - q0[i]).abs() < 1e-12);
            assert!(dq[i].is_finite() && dq[i] == 0.0);
            assert!(ddq[i].is_finite() && ddq[i] == 0.0);
        }
    }
}
