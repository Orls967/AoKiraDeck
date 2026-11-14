use crate::types::{Pose3D, Quat, Vec3};

impl Vec3 {
    pub const ZERO: Self = Self {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };

    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn add(self, other: Self) -> Self {
        Self {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn sub(self, other: Self) -> Self {
        Self {
            x: self.x - other.x,
            y: self.y - other.y,
            z: self.z - other.z,
        }
    }

    pub fn scale(self, s: f64) -> Self {
        Self {
            x: self.x * s,
            y: self.y * s,
            z: self.z * s,
        }
    }

    pub fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    pub fn cross(self, other: Self) -> Self {
        Self {
            x: self.y * other.z - self.z * other.y,
            y: self.z * other.x - self.x * other.z,
            z: self.x * other.y - self.y * other.x,
        }
    }

    pub fn norm_sq(self) -> f64 {
        self.dot(self)
    }

    pub fn norm(self) -> f64 {
        self.norm_sq().sqrt()
    }

    pub fn lerp(self, other: Self, t: f64) -> Self {
        Self {
            x: self.x + (other.x - self.x) * t,
            y: self.y + (other.y - self.y) * t,
            z: self.z + (other.z - self.z) * t,
        }
    }
}

impl Quat {
    pub const IDENTITY: Self = Self {
        x: 0.0,
        y: 0.0,
        z: 0.0,
        w: 1.0,
    };

    pub fn normalize(self) -> Self {
        let len = (self.x * self.x + self.y * self.y + self.z * self.z + self.w * self.w).sqrt();
        if len <= 1e-15 {
            Self::IDENTITY
        } else {
            Self {
                x: self.x / len,
                y: self.y / len,
                z: self.z / len,
                w: self.w / len,
            }
        }
    }

    pub fn conjugate(self) -> Self {
        Self {
            x: -self.x,
            y: -self.y,
            z: -self.z,
            w: self.w,
        }
    }

    pub fn rotate_vec(self, v: Vec3) -> Vec3 {
        let q = self.normalize();
        let u = Vec3::new(q.x, q.y, q.z);
        let s = q.w;
        let t = u.cross(v).scale(2.0);
        v.add(t.scale(s)).add(u.cross(t))
    }

    pub fn to_mat3(self) -> [[f64; 3]; 3] {
        let q = self.normalize();
        let (x, y, z, w) = (q.x, q.y, q.z, q.w);
        [
            [
                1.0 - 2.0 * (y * y + z * z),
                2.0 * (x * y - z * w),
                2.0 * (x * z + y * w),
            ],
            [
                2.0 * (x * y + z * w),
                1.0 - 2.0 * (x * x + z * z),
                2.0 * (y * z - x * w),
            ],
            [
                2.0 * (x * z - y * w),
                2.0 * (y * z + x * w),
                1.0 - 2.0 * (x * x + y * y),
            ],
        ]
    }

    pub fn from_mat3(m: &[[f64; 3]; 3]) -> Self {
        let trace = m[0][0] + m[1][1] + m[2][2];
        let q = if trace > 0.0 {
            let s = (trace + 1.0).sqrt() * 2.0;
            Self {
                w: 0.25 * s,
                x: (m[2][1] - m[1][2]) / s,
                y: (m[0][2] - m[2][0]) / s,
                z: (m[1][0] - m[0][1]) / s,
            }
        } else if m[0][0] > m[1][1] && m[0][0] > m[2][2] {
            let s = (1.0 + m[0][0] - m[1][1] - m[2][2]).sqrt() * 2.0;
            Self {
                w: (m[2][1] - m[1][2]) / s,
                x: 0.25 * s,
                y: (m[0][1] + m[1][0]) / s,
                z: (m[0][2] + m[2][0]) / s,
            }
        } else if m[1][1] > m[2][2] {
            let s = (1.0 + m[1][1] - m[0][0] - m[2][2]).sqrt() * 2.0;
            Self {
                w: (m[0][2] - m[2][0]) / s,
                x: (m[0][1] + m[1][0]) / s,
                y: 0.25 * s,
                z: (m[1][2] + m[2][1]) / s,
            }
        } else {
            let s = (1.0 + m[2][2] - m[0][0] - m[1][1]).sqrt() * 2.0;
            Self {
                w: (m[1][0] - m[0][1]) / s,
                x: (m[0][2] + m[2][0]) / s,
                y: (m[1][2] + m[2][1]) / s,
                z: 0.25 * s,
            }
        };
        q.normalize()
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Mat4 {
    pub m: [[f64; 4]; 4],
}

impl Mat4 {
    pub const IDENTITY: Self = Self {
        m: [
            [1.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ],
    };

    pub fn from_pose(pose: &Pose3D) -> Self {
        let r = pose.orientation.to_mat3();
        Self {
            m: [
                [r[0][0], r[0][1], r[0][2], pose.position.x],
                [r[1][0], r[1][1], r[1][2], pose.position.y],
                [r[2][0], r[2][1], r[2][2], pose.position.z],
                [0.0, 0.0, 0.0, 1.0],
            ],
        }
    }

    pub fn to_pose(&self) -> Pose3D {
        Pose3D {
            position: self.translation(),
            orientation: Quat::from_mat3(&self.rotation()),
        }
    }

    pub fn rotation(&self) -> [[f64; 3]; 3] {
        [
            [self.m[0][0], self.m[0][1], self.m[0][2]],
            [self.m[1][0], self.m[1][1], self.m[1][2]],
            [self.m[2][0], self.m[2][1], self.m[2][2]],
        ]
    }

    pub fn translation(&self) -> Vec3 {
        Vec3::new(self.m[0][3], self.m[1][3], self.m[2][3])
    }

    pub fn z_axis(&self) -> Vec3 {
        Vec3::new(self.m[0][2], self.m[1][2], self.m[2][2])
    }

    pub fn mul(&self, other: &Self) -> Self {
        let mut out = [[0.0; 4]; 4];
        for (i, out_row) in out.iter_mut().enumerate() {
            for (j, cell) in out_row.iter_mut().enumerate() {
                let mut sum = 0.0;
                for k in 0..4 {
                    sum += self.m[i][k] * other.m[k][j];
                }
                *cell = sum;
            }
        }
        Self { m: out }
    }

    pub fn transform_point(&self, p: Vec3) -> Vec3 {
        Vec3 {
            x: self.m[0][0] * p.x + self.m[0][1] * p.y + self.m[0][2] * p.z + self.m[0][3],
            y: self.m[1][0] * p.x + self.m[1][1] * p.y + self.m[1][2] * p.z + self.m[1][3],
            z: self.m[2][0] * p.x + self.m[2][1] * p.y + self.m[2][2] * p.z + self.m[2][3],
        }
    }

    pub fn inverse_rigid(&self) -> Self {
        let r = self.rotation();
        let t = self.translation();
        let rt = transpose_mat3(&r);
        let inv_t = mat3_mul_vec(&rt, Vec3::new(-t.x, -t.y, -t.z));
        Self {
            m: [
                [rt[0][0], rt[0][1], rt[0][2], inv_t.x],
                [rt[1][0], rt[1][1], rt[1][2], inv_t.y],
                [rt[2][0], rt[2][1], rt[2][2], inv_t.z],
                [0.0, 0.0, 0.0, 1.0],
            ],
        }
    }
}

pub fn transpose_mat3(r: &[[f64; 3]; 3]) -> [[f64; 3]; 3] {
    [
        [r[0][0], r[1][0], r[2][0]],
        [r[0][1], r[1][1], r[2][1]],
        [r[0][2], r[1][2], r[2][2]],
    ]
}

pub fn mat3_mul(a: &[[f64; 3]; 3], b: &[[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let mut out = [[0.0; 3]; 3];
    for (i, row) in out.iter_mut().enumerate() {
        for (j, cell) in row.iter_mut().enumerate() {
            *cell = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    out
}

pub fn mat3_mul_vec(r: &[[f64; 3]; 3], v: Vec3) -> Vec3 {
    Vec3 {
        x: r[0][0] * v.x + r[0][1] * v.y + r[0][2] * v.z,
        y: r[1][0] * v.x + r[1][1] * v.y + r[1][2] * v.z,
        z: r[2][0] * v.x + r[2][1] * v.y + r[2][2] * v.z,
    }
}

pub fn axis_angle_error(r_target: &[[f64; 3]; 3], r_cur: &[[f64; 3]; 3]) -> Vec3 {
    let r_err = mat3_mul(r_target, &transpose_mat3(r_cur));
    let trace = r_err[0][0] + r_err[1][1] + r_err[2][2];
    let cos_theta = ((trace - 1.0) * 0.5).clamp(-1.0, 1.0);
    let theta = cos_theta.acos();
    if theta < 1e-8 {
        return Vec3::new(
            0.5 * (r_err[2][1] - r_err[1][2]),
            0.5 * (r_err[0][2] - r_err[2][0]),
            0.5 * (r_err[1][0] - r_err[0][1]),
        );
    }
    if std::f64::consts::PI - theta < 1e-4 {
        let diag = [
            0.5 * (r_err[0][0] + 1.0),
            0.5 * (r_err[1][1] + 1.0),
            0.5 * (r_err[2][2] + 1.0),
        ];
        let mut best_col = 0;
        if diag[1] > diag[best_col] {
            best_col = 1;
        }
        if diag[2] > diag[best_col] {
            best_col = 2;
        }
        let col_vec = Vec3::new(
            0.5 * (r_err[0][best_col] + if best_col == 0 { 1.0 } else { 0.0 }),
            0.5 * (r_err[1][best_col] + if best_col == 1 { 1.0 } else { 0.0 }),
            0.5 * (r_err[2][best_col] + if best_col == 2 { 1.0 } else { 0.0 }),
        );
        let len = col_vec.norm();
        if len > 1e-12 {
            return col_vec.scale(theta / len);
        }
    }
    let scale = theta / (2.0 * theta.sin());
    Vec3::new(
        scale * (r_err[2][1] - r_err[1][2]),
        scale * (r_err[0][2] - r_err[2][0]),
        scale * (r_err[1][0] - r_err[0][1]),
    )
}

/// Gaussian elimination with partial pivoting for 6x6 positive-definite DLS linear systems.
pub fn solve_6x6(mut a: [[f64; 6]; 6], mut b: [f64; 6]) -> Option<[f64; 6]> {
    for col in 0..6 {
        let mut pivot_row = col;
        let mut pivot_val = a[col][col].abs();
        for (r, row) in a.iter().enumerate().skip(col + 1) {
            let cand = row[col].abs();
            if cand > pivot_val {
                pivot_val = cand;
                pivot_row = r;
            }
        }
        if pivot_val < 1e-14 || !pivot_val.is_finite() {
            return None;
        }
        if pivot_row != col {
            a.swap(col, pivot_row);
            b.swap(col, pivot_row);
        }
        let diag = a[col][col];
        let pivot_row = a[col];
        for r in (col + 1)..6 {
            let factor = a[r][col] / diag;
            a[r][col] = 0.0;
            for (cell, &pcell) in a[r][(col + 1)..].iter_mut().zip(&pivot_row[(col + 1)..]) {
                *cell -= factor * pcell;
            }
            b[r] -= factor * b[col];
        }
    }

    let mut x = [0.0; 6];
    for i in (0..6).rev() {
        let mut sum = b[i];
        for j in (i + 1)..6 {
            sum -= a[i][j] * x[j];
        }
        x[i] = sum / a[i][i];
        if !x[i].is_finite() {
            return None;
        }
    }
    Some(x)
}
