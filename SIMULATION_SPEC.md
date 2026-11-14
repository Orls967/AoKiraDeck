# AoKira — Simulation Specification

**Document Role:** Canonical source of truth for coordinate systems, workcell physical geometry, 6-axis manipulator kinematics (DH parameters & FK/IK), trajectory interpolation, collision detection, workpiece/gripper/conveyor/station mechanics, the 8-stage production state machine, deterministic fixed-timestep clock, energy estimation, and simulation boundaries.
**Referenced Entity Types:** Defined in [DATA_MODEL.md](file:///Users/orl123456/Documents/AoKira/DATA_MODEL.md).

---

## 1. Coordinate Systems & Workcell Layout

### 1.1 Canonical Frames
1. **World Frame (`WorldFrame`)**:
   - Right-handed **Y-Up** Cartesian frame (`+X` left-to-right production flow, `+Y` vertical up, `+Z` toward front viewer), in **meters (`m`)**.
   - Origin `(0.000, 0.000, 0.000)` lies on the workcell floor directly beneath the center of the robot pedestal.
   - Three.js / React Three Fiber consumes `WorldFrame` poses directly without axis swizzling.
2. **Robot Base Frame (`BaseFrame`)**:
   - Right-handed **Z-Up** robotics convention (`+X_b` forward toward Processing Station `-Z_w`, `+Y_b` left toward Input Conveyor `-X_w`, `+Z_b` vertical up `+Y_w`).
   - Origin sits at the top mounting flange of the robot pedestal: `WorldFrame` `(0.000, 0.450, 0.000)`.
   - Exact rigid transform $T_{\text{world}\leftarrow\text{base}}$:
     $$R_{\text{world}\leftarrow\text{base}} = \begin{bmatrix} 0 & -1 & 0 \\ 0 & 0 & 1 \\ -1 & 0 & 0 \end{bmatrix}, \quad q_{\text{world}\leftarrow\text{base}} = (-0.5,\; +0.5,\; +0.5,\; +0.5), \quad p_{\text{base}} = \begin{bmatrix} 0.000 \\ 0.450 \\ 0.000 \end{bmatrix}\text{ m}$$
   - Purpose of this alignment: `q1 = 0` points directly toward the Processing Station (`-Z_w`), `q1 ≈ +98.13°` points toward Input Pick (`-X_w`), and `q1 ≈ -98.13°` points toward Output Place (`+X_w`). Total operational base sweep stays inside `[-105°, +105°]`, leaving over `65°` margin from the `±170°` limits and avoiding any `±180°` wrap-around discontinuity.

### 1.2 Locked Workcell Component Coordinates (`WorldFrame`)

| Component ID | Position / Bounds (`m`) | Key Elevation / Target (`m`) | Notes |
|---|---|---|---|
| `robot-pedestal` | Center `(0.000, 0.225, 0.000)`, cylinder radius `0.220`, height `0.450` | Top flange `y = 0.450` | Fixed static obstacle. |
| `input-conveyor` | `x ∈ [-1.460, -0.460]`, `z ∈ [-0.040, +0.200]`, belt box `y ∈ [0.620, 0.720]` | Belt top `y = 0.720`; Spawn `(-1.380, 0.750, +0.080)`; Pick `(-0.560, 0.750, +0.080)` | Flow along `+X_w`. |
| `output-conveyor` | `x ∈ [+0.460, +1.460]`, `z ∈ [-0.040, +0.200]`, belt box `y ∈ [0.620, 0.720]` | Belt top `y = 0.720`; Place `(+0.560, 0.750, +0.080)`; Despawn `x >= +1.400` | Flow along `+X_w`. |
| `processing-station` | `x ∈ [-0.200, +0.200]`, `z ∈ [-0.740, -0.380]`, table `y ∈ [0.000, 0.720]` | Fixture top `y = 0.720`; Workpiece center `(0.000, 0.750, -0.560)` | Rear scanner head sits at `z = -0.710, y = 0.880` (`150 mm` behind TCP) with side clamp jaws along `±Z` opening to `±0.065` for unobstructed vertical robot entry. |
| `workpiece` | Cube `0.060 x 0.060 x 0.060`, mass `1.20 kg` default (limit `5.0 kg`) | Resting center `+0.030` above belt/fixture (`y = 0.750`) | Synthetic rigid cuboid. |
| `safety-fence` | Perimeter walls at `x = ±1.600`, `z = ±1.200`, height `1.450` | Conveyor pass-through ports at `z ∈ [-0.180, +0.180]`, `y ∈ [0.720, 1.070]` | Static collision boundary. |
| `estop-station` | Outside fence at `(+1.720, 0.525, +1.050)` | Height `1.050` | Selectable & interactive emergency stop trigger. |
| `sensor-array` | Input `(-0.560, 0.750, +0.210)`, Station `(0.000, 0.750, -0.440)`, Output `(+0.560, 0.750, +0.210)`, Beacon `(+1.540, 1.520, -1.140)` | — | Visual optical beam & RGBY state tower. |

---

## 2. Six-Axis Robot Configuration & Kinematics

### 2.1 Standard Denavit-Hartenberg (DH) Table (`BaseFrame`)
Using Standard DH convention:
$$T_i(q_i) = R_z(\theta_i)\, T_z(d_i)\, T_x(a_i)\, R_x(\alpha_i)$$

| Joint | Name | $\theta_i$ (`rad`) | $d_i$ (`m`) | $a_i$ (`m`) | $\alpha_i$ (`rad`) | Min (`deg`) | Max (`deg`) | $v_{\max}$ (`deg/s`) | $a_{\max}$ (`deg/s^2`) | Home (`deg`) | Rated Torque (`Nm`) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `J1` | Base Yaw | $q_1$ | `0.340` | `0.080` | $-\pi/2$ | `-170` | `+170` | `180` | `450` | `0` | `120` |
| `J2` | Shoulder Pitch | $q_2 - \pi/2$ | `0.000` | `0.420` | `0` | `-95` | `+120` | `150` | `360` | `10` | `140` |
| `J3` | Elbow Pitch | $q_3$ | `0.000` | `0.050` | $-\pi/2$ | `-120` | `+135` | `180` | `450` | `20` | `90` |
| `J4` | Forearm Roll | $q_4$ | `0.400` | `0.000` | $+\pi/2$ | `-180` | `+180` | `240` | `600` | `0` | `45` |
| `J5` | Wrist Pitch | $q_5$ | `0.000` | `0.000` | $-\pi/2$ | `-125` | `+125` | `240` | `600` | `60` | `35` |
| `J6` | Tool Flange Roll | $q_6$ | `0.100` | `0.000` | `0` | `-360` | `+360` | `360` | `900` | `0` | `25` |

- **Fixed Gripper TCP Transform (`Flange -> TCP`)**: $T_{\text{tcp}} = T_z(+0.120\text{ m})$ along Frame 6 `+Z_6`.
- **Verification Property**: At `Home = [0°, 10°, 20°, 0°, 60°, 0°]`, $q_2 + q_3 + q_5 = 90^\circ$, orienting the gripper tool approach axis (`+Z_6`) straight downward (`-Z_b` / `-Y_w`) away from wrist singularity ($q_5 \neq 0$).

### 2.2 Forward Kinematics (FK)
- Given joint vector $q = [q_1, \dots, q_6]^T \in \mathbb{R}^6$:
  - Compute cumulative transforms $T_0^k(q) = \prod_{i=1}^{k} T_i(q_i)$ for $k = 1 \dots 6$.
  - Compute TCP transform in `BaseFrame`: $T_0^{\text{tcp}}(q) = T_0^6(q) \cdot T_z(0.120)$.
  - Transform all frames to `WorldFrame` via $T_{\text{world}}^k(q) = T_{\text{world}\leftarrow\text{base}} \cdot T_0^k(q)$.
- Both Rust/WASM (`crates/aokira-engine`) and Three.js visual joint hierarchy use the exact DH frame chain (`linkWorldPoses` from `SimulationSnapshot` drives the rendered robot link transforms directly, guaranteeing `AC-05` visual-kinematic parity).

### 2.3 Inverse Kinematics (IK)
- **Solver Algorithm**: Iterative **Damped Least Squares (Levenberg-Marquardt)** in `BaseFrame` using the `6 x 6` geometric Jacobian $J(q)$:
  - Linear columns: $J_{v,i} = z_{i-1} \times (p_{\text{tcp}} - p_{i-1})$
  - Angular columns: $J_{\omega,i} = z_{i-1}$
- **Error Metric**:
  - Position error: $e_p = p_{\text{target}} - p_{\text{tcp}}(q)$
  - Orientation error: $e_r = \text{axis\_angle}(R_{\text{target}} \cdot R_{\text{tcp}}(q)^T)$
  - Combined 6D error: $e = [e_p;\; e_r]$
- **Update Law**:
  $$\Delta q = J^T (J J^T + \lambda^2 I_6)^{-1} e$$
  - Base damping $\lambda_0 = 0.025$; adaptive damping scales $\lambda \leftarrow \min(2\lambda, 0.25)$ on non-decreasing residual and shrinks $\lambda \leftarrow \max(0.7\lambda, 0.01)$ on improvement.
  - Per-iteration joint step clamped to `max_step = 0.25 rad`.
  - Joint bounds clamped after each step: $q_i \leftarrow \text{clamp}(q_i, q_{i,\min}, q_{i,\max})$.
- **Multi-Seed Strategy**:
  1. Seed 0: current robot configuration `q_current`.
  2. Seed 1: `Home` pose `[0°, 10°, 20°, 0°, 60°, 0°]`.
  3. Seed 2: azimuth-aligned seed `[atan2(y_b, x_b), 0.35, 0.45, 0.0, 0.77, 0.0]`.
- **Convergence & Failure Rules**:
  - Maximum iterations per seed: `120`.
  - Convergence tolerances: $\|e_p\|_2 \le 0.0005\text{ m}$ (`0.5 mm`) and $\|e_r\|_2 \le 0.005\text{ rad}$ (`~0.29°`).
  - If all seeds fail tolerance or the target lies beyond physical envelope / hits an unresolvable joint bound, return structured error `UNREACHABLE_TARGET` or `JOINT_LIMIT_VIOLATION` without modifying live robot state (`AC-07`).

---

## 3. Motion Planning & Trajectory Interpolation

### 3.1 Waypoint & Approach Philosophy
Pick, place, and station transfers never command direct diagonal sweeps across obstacles. Every station interaction uses safe vertical hover waypoints (`+0.140 m` above target center):
- **Input Hover**: `(-0.560, 0.890, +0.080)` -> **Input Pick**: `(-0.560, 0.750, +0.080)`
- **Station Hover**: `(0.000, 0.890, -0.560)` -> **Station Place/Pick**: `(0.000, 0.750, -0.560)`
- **Output Hover**: `(+0.560, 0.890, +0.080)` -> **Output Place**: `(+0.560, 0.750, +0.080)`

### 3.2 Quintic Polynomial Joint-Space Trajectory
For a segment from $q_{\text{start}}$ to $q_{\text{end}}$ with zero boundary velocity and acceleration:
$$s(\tau) = 10\tau^3 - 15\tau^4 + 6\tau^5, \quad \tau = \frac{t}{T} \in [0, 1]$$
$$q(t) = q_{\text{start}} + (q_{\text{end}} - q_{\text{start}})\, s(\tau)$$
$$\dot{q}(t) = \frac{q_{\text{end}} - q_{\text{start}}}{T}\,(30\tau^2 - 60\tau^3 + 30\tau^4)$$
$$\ddot{q}(t) = \frac{q_{\text{end}} - q_{\text{start}}}{T^2}\,(60\tau - 180\tau^2 + 120\tau^3)$$

### 3.3 Constraint-Compliant Segment Duration $T$
Given effective limits scaled by scenario parameters (`v_eff = v_max * robotSpeedScale`, `a_eff = a_max * robotAccelScale`):
- Peak quintic velocity factor is `1.875` at $\tau = 0.5$.
- Peak quintic acceleration factor is `10 / sqrt(3) ≈ 5.7735` at $\tau = 0.5 \mp 1/\sqrt{12}$.
- Minimum valid duration across all 6 joints:
  $$T_{\min} = \max_{i=1..6} \left( \frac{1.875\,|\Delta q_i|}{v_{\text{eff},i}},\; \sqrt{\frac{5.7735\,|\Delta q_i|}{a_{\text{eff},i}}} \right)$$
- Segment duration $T$ is rounded upward to a multiple of `timestepMs` (`20 ms`) with minimum `100 ms` for non-zero motion (`AC-08`).
- Trajectory planning runs **before** segment execution: every sampled `20 ms` point along the planned trajectory is pre-checked against joint limits (and optionally previewed for collisions); runtime collision checks also execute every `20 ms` tick.

---

## 4. Collision & Clearance Detection

### 4.1 Collision Geometry Primitives
- **Robot Links (`link-1`..`link-6`) & Gripper**: Modeled as bounding **Capsules** (`segment [localStart, localEnd]` + `radius`), transformed into `WorldFrame` via current FK link poses:
  - `link-1` (shoulder turret): radius `0.095 m`
  - `link-2` (upper arm): radius `0.070 m`
  - `link-3` (elbow): radius `0.065 m`
  - `link-4` (forearm): radius `0.055 m`
  - `link-5` (wrist): radius `0.045 m`
  - `gripper` (body + jaws envelope): radius `0.055 m`
- **Held Workpiece**: Modeled as an oriented bounding sphere/box (`halfExtents = [0.030, 0.030, 0.030] m`) attached to TCP while `heldWorkpieceId != null`.
- **Static Environment**: Oriented/Axis-Aligned Bounding Boxes (`BoxVolume`) for `robot-pedestal`, `input-conveyor`, `output-conveyor`, `processing-station`, `safety-fence` walls, and `estop-station`.

### 4.2 Pairwise Distance & Classification
- Adjacent kinematic link pairs (`(i, i+1)`) and intentional contact pairs (e.g., `gripper` + `heldWorkpieceId`, or resting workpiece + supporting conveyor/fixture top) are excluded from false-positive collision alerts while grasping/resting.
- For all checked pairs $(A, B)$, compute exact minimum surface clearance $d_{\text{clear}}$:
  - $d_{\text{clear}} \le 0.000\text{ m}$ -> **`COLLISION`** (`severity = 'COLLISION'`).
  - $0.000\text{ m} < d_{\text{clear}} \le 0.025\text{ m}$ (`25 mm`) -> **`NEAR_COLLISION`** (`severity = 'NEAR_COLLISION'`).
  - $d_{\text{clear}} > 0.025\text{ m}$ -> **`NONE`**.
- **Consequences**:
  - `NEAR_COLLISION`: Logs `NEAR_COLLISION_WARNING` event (debounced per continuous approach episode) and highlights affected pair in Amber (`#F59E0B`).
  - `COLLISION`: Immediately halts motion, emits `COLLISION_DETECTED`, transitions state machine to `FAULT` (`FaultCode::COLLISION`), highlights pair in Red (`#EF4444`), and awaits `Reset` (`AC-09`).

---

## 5. Subsystems: Gripper, Conveyors, Processing Station & Workpiece

### 5.1 Two-Finger Parallel Gripper
- Jaw opening spans `[0.000 m, 0.080 m]`.
- Transitions (`OPEN -> CLOSING -> CLOSED` and `CLOSED -> OPENING -> OPEN`) execute smoothly over `actuationTimeMs = 300 ms` (`15` simulation ticks).
- **Grasp Precondition**: Workpiece center must be within `0.015 m` of `tcpWorldPose` and workpiece mass must satisfy `massKg <= payloadLimitKg (5.0 kg)`. Failure triggers `GRIPPER_FAILURE` or `PAYLOAD_EXCEEDED`.
- While grasped, workpiece `poseWorld` locks deterministically to `tcpWorldPose`.

### 5.2 Input & Output Conveyors
- Input conveyor spawns a synthetic `60 x 60 x 60 mm` workpiece at `(-1.380, 0.750, +0.080)` whenever belt entry is clear (`>= 0.220 m` spacing) and remaining target units allow.
- On each tick $\Delta t = 0.020\text{ s}$, ungrasped workpieces on a running belt advance along `+X_w` by `v_belt * 0.020 m`.
- **Input Zone Stop**: When a workpiece reaches `x >= -0.560`, `sensor-input` triggers, input belt pauses for that leading workpiece (holding it cleanly at pick zone `(-0.560, 0.750, +0.080)`), and transitions `DETECT_OBJECT -> APPROACH_PICK`.
- **Output Belt Exit**: Placed workpieces at `(+0.560, 0.750, +0.080)` travel along `+X_w` until `x >= +1.400`, trigger `sensor-output`, increment completed output exit, and retire from active scene meshes.

### 5.3 Processing Station
- Receives raw workpiece at `(0.000, 0.750, -0.560)`.
- Once robot releases workpiece and clears `Station Hover`, side clamps engage (`clampEngaged = true`) and processing dwell counts down deterministically over `processingDwellMs` (default `2500 ms`).
- At `100%` progress, clamps release and workpiece transitions `PROCESSING -> PROCESSED_READY`.

---

## 6. Production State Machine (8-Stage Cycle)

```
IDLE
  │ (Start command)
  ▼
DETECT_OBJECT ──(object timeout / missing test fault)──► FAULT
  │ (input sensor triggered)
  ▼
APPROACH_PICK (Home/Current -> Input Hover -> Input Pick)
  │
  ▼
PICK_WORKPIECE (Gripper closes 300 ms, attaches workpiece)
  │ (gripper fault / payload fault) ──────────────────► FAULT
  ▼
TRANSFER_TO_STATION (Input Hover -> Station Hover -> Station Place)
  │
  ▼
PROCESS_WORKPIECE (Release, retract to Station Hover, dwell 2500 ms)
  │
  ▼
PICK_FINISHED (Station Hover -> Station Pick -> Close Gripper 300 ms)
  │
  ▼
TRANSFER_TO_OUTPUT (Station Hover -> Output Hover -> Output Place)
  │
  ▼
PLACE_WORKPIECE (Release workpiece on output belt, retract to Output Hover)
  │
  ▼
CYCLE_COMPLETE (Emit CYCLE_COMPLETED, increment completedUnits)
  ├──(Continuous or completedUnits < targetUnits)──► DETECT_OBJECT
  └──(Single or target reached)───────────────────► IDLE / COMPLETED

(Any active stage: COLLISION / UNREACHABLE_TARGET / JOINT_LIMIT / ESTOP_ACTIVE ──► FAULT)
(FAULT ──(Reset command)──► IDLE)
```

Every transition emits a `SimulationEvent` with `STAGE_ENTERED` (and `CYCLE_STARTED` / `CYCLE_COMPLETED` where applicable).

---

## 7. Simulation Clock, Determinism & Energy Model

### 7.1 Deterministic Fixed-Timestep Clock
- Canonical timestep: **`timestepMs = 20`** (`50 Hz` deterministic simulation rate).
- Browser `requestAnimationFrame` accumulates elapsed wall time multiplied by `playbackSpeedMultiplier` (`0.25x` to `4.0x`), capped at `200 ms` per frame to prevent spiral-of-death lag, and invokes fixed `step(20)` ticks in the Rust/WASM Web Worker.
- **Determinism Invariant**: Identical `WorkcellConfig` + `ScenarioConfig` (including `seed`) produces bit-identical `SimulationSnapshot` trajectories, `simTimeMs`, `SimulationEvent[]`, and KPIs independent of display refresh rate (`AC-12`).

### 7.2 Synthetic Energy Consumption Estimate
Calculated per `20 ms` tick (`dt = 0.020 s`) as an **engineering demonstrator estimate** (never physical electrical metering):
$$P_{\text{total}}(t) = P_{\text{idle}} + \sum_{i=1}^{6} \left( k_{\text{vel},i}|\dot{q}_i(t)| + k_{\text{acc},i}|\ddot{q}_i(t)| \right) + P_{\text{payload}}(m_{\text{held}}, \dot{q}) + P_{\text{aux}}(t)$$
- $P_{\text{idle}} = 120\text{ W}$ (controller + standby servos + sensors)
- Joint mechanical/drive proxy coefficients: $k_{\text{vel},i} = 0.35\,\tau_{\text{rated},i}$, $k_{\text{acc},i} = 0.04\,\tau_{\text{rated},i}$
- Payload lift/carry proxy: $P_{\text{payload}} = 18.0 \cdot m_{\text{held}} \cdot \max(\|\dot{q}\|_2, 0.1)\text{ W}$ when holding workpiece
- Auxiliary power: $P_{\text{aux}} = 65\text{ W}$ per active conveyor + `180 W` during `PROCESS_WORKPIECE`
- Tick energy increment: $\Delta E_{\text{J}} = P_{\text{total}}(t)\cdot \Delta t$, $\Delta E_{\text{Wh}} = \Delta E_{\text{J}} / 3600$.

---

## 8. Explicit Simulation Limitations

1. **No Rigid-Body Dynamics or Friction Physics**: Workpieces follow kinematic belt motion and rigid grasp attachment; toppling, slip, or deformable collisions are out of scope.
2. **No Dynamic Obstacle-Avoidance Path Planner**: Trajectory planning validates collision-free waypoint arcs and aborts on collision rather than running RRT*/PRM re-routing.
3. **Approximate Bounding Volumes**: Capsule and box primitives approximate visual meshes; sub-millimeter CAD surface contact is not modeled.
4. **Synthetic Energy Proxy**: `P_total` estimates trend comparisons between scenarios; it does not model real servo efficiency curves, regenerative braking, or power factor.
