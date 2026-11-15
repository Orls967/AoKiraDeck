# AoKira — Quality Assurance & Test Plan

**Document Role:** Canonical verification specification defining unit, engine, kinematics, collision, production cycle, API contract, frontend, end-to-end, regression, and performance baseline protocols, plus the authoritative Acceptance Test Matrix (`AC-01` through `AC-18`).
**Related Canonical Docs:** [PRD.md](PRD.md), [SIMULATION_SPEC.md](SIMULATION_SPEC.md), [API_CONTRACT.md](API_CONTRACT.md), [DESIGN.md](DESIGN.md).

---

## 1. Testing Strategy & Tooling Stack

| Layer | Test Runner & Framework | Scope |
|---|---|---|
| **Rust Simulation Core (`crates/aokira-engine`)** | `cargo test` + `wasm-pack test --headless --chrome` (optional WASM smoke) | FK, IK, quintic trajectories, collision primitives, state machine, determinism, energy integral |
| **Python Analytics API (`apps/api`)** | `pytest` + `fastapi.testclient` / `httpx` | Pydantic validation, KPI parity, bottleneck detection, optimization constraints, error envelopes |
| **Frontend (`apps/web`)** | `vitest` + `@testing-library/react` + `@testing-library/user-event` | Stores, Worker protocol adapter, API client fallback, UI panels, reduced-motion, WebGL fallback |
| **End-to-End (`apps/web` + WASM + API)** | `playwright` (`chromium`, desktop `1440x900` & mobile `390x844`) | Multi-page journeys, 3D scene mounting, full pick-and-place cycles, offline degradation |

*(No benchmark or pass metrics may be reported before actually executing the suite after implementation edits.)*

---

## 2. Rust Simulation Engine & Kinematics Validation (`crates/aokira-engine`)

### 2.1 Forward Kinematics & Frame Parity (`RUST-KIN-01..03`)
- **`RUST-KIN-01` (Home Pose Analytical Check)**: Given `q = [0°, 10°, 20°, 0°, 60°, 0°]`, verify TCP approach axis points straight down along `-Y_w` (`(0, -1, 0)_w` within `1e-6`) and wrist position matches closed-form DH trigonometric derivation (`< 1e-6 m`).
- **`RUST-KIN-02` (Zero & Extremal Joint Check)**: Test `q = [0, 0, 0, 0, 0, 0]` (`TCP` horizontal forward along `-Z_w` at `z_w = -(0.080 + 0.400 + 0.100 + 0.120) = -0.700 m`, `y_w = 0.450 + 0.340 + 0.420 + 0.050 = 1.260 m`) and verify `|det(R)| = 1.0`, orthogonality `||R^T R - I|| < 1e-9`.
- **`RUST-KIN-03` (WorldFrame Parity)**: Confirm `BaseFrame -> WorldFrame` quaternion `(-0.5, 0.5, 0.5, 0.5)` produces exact expected pick/station/place coordinates (`AC-05`).

### 2.2 Inverse Kinematics Validation (`RUST-IK-01..04`)
- **`RUST-IK-01` (Canonical Workcell Targets)**: Solve IK for all 6 operational waypoints (`Input Hover`, `Input Pick`, `Station Hover`, `Station Target`, `Output Hover`, `Output Place`); assert `||Δp|| <= 0.0005 m` (`0.5 mm`), `||Δr|| <= 0.005 rad`, and all `q_i ∈ [minAngleRad, maxAngleRad]` (`AC-06`).
- **`RUST-IK-02` (Round-Trip FK(IK(T)) == T)**: Across `25` deterministic reachable poses inside the workcell envelope, verify `FK(IK(pose))` matches `pose` within tolerance.
- **`RUST-IK-03` (Unreachable Outer Target)**: Target `(2.50, 0.80, 0.00)` (beyond `~0.903 m` wrist reach); assert `Err(UNREACHABLE_TARGET)` and confirm live robot joint vector remains completely unchanged (`AC-07`).
- **`RUST-IK-04` (Joint-Limit Blocked Target)**: Target requiring `J1` or `J2` violation beyond bounds; assert explicit error and state preservation.

### 2.3 Trajectory Planning (`RUST-TRAJ-01..03`)
- **`RUST-TRAJ-01` (Boundary Continuity)**: Verify `q(0) = q_start`, `q(T) = q_end`, `dq(0) = dq(T) = 0`, `ddq(0) = ddq(T) = 0`.
- **`RUST-TRAJ-02` (Velocity & Acceleration Compliance)**: Sample every `20 ms` across all segments scaled by `robotSpeedScale ∈ [0.20, 1.50]` and `robotAccelScale ∈ [0.20, 1.50]`; assert `|dq_i| <= v_eff_i + 1e-6` and `|ddq_i| <= a_eff_i + 1e-6`, and `q_i` within limits (`AC-08`).
- **`RUST-TRAJ-03` (Zero-Delta Degenerate Segment)**: Confirm `q_start == q_end` completes cleanly without `NaN` or division by zero.

---

## 3. Collision & Clearance Test Cases (`RUST-COL-01..06`)

| Test ID | Scenario | Expected Result |
|---|---|---|
| **`RUST-COL-01`** | Nominal pick-and-place trajectory (Input -> Station -> Output) | `severity == NONE` across every `20 ms` tick of the entire cycle (`minClearance > 0.025 m`) |
| **`RUST-COL-02`** | Elbow/wrist positioned `15 mm` above `processing-station` deck | `severity == NEAR_COLLISION` (`0 < clearance <= 0.025 m`), emits `NEAR_COLLISION_WARNING`, simulation continues |
| **`RUST-COL-03`** | Command joint pose driving `link-4` / `gripper` into `input-conveyor` housing (`y < 0.720`) | `severity == COLLISION`, emits `COLLISION_DETECTED`, state transitions immediately to `FAULT` (`AC-09`) |
| **`RUST-COL-04`** | Arm swung into `safety-fence` boundary (`x = ±1.600` or `z = ±1.200`) | `severity == COLLISION`, `pairB == "safety-fence-*"`, immediate halt |
| **`RUST-COL-05`** | Held workpiece (`60 mm` cube) colliding with station frame during invalid low transit | `severity == COLLISION` involving held workpiece primitive |
| **`RUST-COL-06`** | Gripper actively grasping `WP-0001` (`GRIPPER_GRASPED`) | Intentional grasp contact excluded; zero false-positive `COLLISION` or `NEAR_COLLISION` |

---

## 4. Production Cycle, Determinism & State Machine Tests (`RUST-PROD-01..06`)

- **`RUST-PROD-01` (Single Cycle Complete)**: Run `SINGLE` mode until `COMPLETED`; verify exact ordered stage progression (`IDLE -> DETECT_OBJECT -> APPROACH_PICK -> PICK_WORKPIECE -> TRANSFER_TO_STATION -> PROCESS_WORKPIECE -> PICK_FINISHED -> TRANSFER_TO_OUTPUT -> PLACE_WORKPIECE -> CYCLE_COMPLETE -> IDLE/COMPLETED`), `completedUnits == 1`, and workpiece delivered on `output-conveyor` (`AC-10`).
- **`RUST-PROD-02` (Multi-Cycle Determinism)**: Execute `FIXED_COUNT = 3` twice with identical `ScenarioConfig` (`seed = 42`), once tick-by-tick (`1x20ms` batches) and once in `5x20ms` batches; assert bit-for-bit identical `SimulationSnapshot`, `SimulationEvent[]` sequence, and `ProductionMetrics` (`AC-12`).
- **`RUST-PROD-03` (Transport Controls)**: Verify `Start -> Pause -> Resume -> Stop -> Reset` preserves state accurately during `Pause` (zero clock/motion advance) and clears events/workpieces cleanly on `Reset` (`AC-11`).
- **`RUST-PROD-04` (Fault Injection & Recovery)**: Test `PAYLOAD_EXCEEDED` (`workpieceMassKg = 5.5` if injected internally / clamped test fixture), `OBJECT_UNAVAILABLE`, `GRIPPER_FAILURE`, and `ESTOP_ACTIVE`; verify `FAULT` state blocks motion until `Reset`.
- **`RUST-PROD-05` (Energy Monotonicity)**: Verify `cumulativeEnergyWh` strictly increases during active ticks and scales appropriately with higher `robotSpeedScale` and `workpieceMassKg`.
- **`RUST-PROD-06` (Golden Fixture Regression)**: Compare generated JSON event stream and KPI summary for `Scenario A: Baseline` (`3` cycles) against committed golden fixture `data/fixtures/baseline-3cycles.golden.json`.

---

## 5. Python Backend & API Contract Tests (`apps/api/tests/`)

| Test ID | Endpoint / Module | Assertions |
|---|---|---|
| **`API-01`** | `GET /api/v1/health` | Returns `200`, `status == "ok"`, `apiVersion == "1.0.0"`, UTC ISO timestamp |
| **`API-02`** | `POST /api/v1/analytics/evaluate` | Recomputes KPIs from `baseline-3cycles.golden.json`; `validation.isValid == true`, `clientServerDeltaPct < 0.01`, `energyBreakdown` components sum to `totalWh` (`AC-13`) |
| **`API-03`** | `POST /api/v1/analytics/evaluate` (Invalid Input) | Non-monotonic `seq` or `simTimeMs` returns `400`/`422` with structured `ApiErrorResponse`; invalid `robotSpeedScale = 5.0` returns `422` with `details` |
| **`API-04`** | `POST /api/v1/scenarios/compare` | Evaluates Scenarios `A`–`D`; ranks strictly according to `rankingObjective` (`MIN_CYCLE_TIME`, `MIN_ENERGY`, `BALANCED`) (`AC-14`) |
| **`API-05`** | `POST /api/v1/optimization/run` | Respects `OptimizationBounds`, `minThroughputUnitsPerHour`, and zero-collision rule; `recommendedProjected` beats or equals `baselineProjected` on objective (`AC-14`) |
| **`API-06`** | `POST /api/v1/optimization/run` (Infeasible) | Requesting unreachable throughput (`minThroughputUnitsPerHour = 100000`) returns `INFEASIBLE_OPTIMIZATION` with clear diagnostic message |
| **`API-07`** | `analytics/validation.py` & `energy.py` | Unit tests verifying negative duration rejection, `NaN`/`Inf` rejection, and energy component parity with `SIMULATION_SPEC.md` |

---

## 6. Frontend Unit & Integration Tests (`apps/web`)

- **`FE-01` (Worker Bridge Adapter)**: Mock/run `simulation.worker.ts` dispatching `INIT`, `LOAD_SCENARIO`, `START`, `STEP_TICKS`, `SOLVE_IK`, verifying typed store state updates.
- **`FE-02` (Component Registry & 6-Joint Inspector)**: Selecting `robot-arm` mounts `J1`–`J6` sliders bounded to canonical min/max radians converted to degrees; jogging updates `SET_JOINTS` (`AC-04`).
- **`FE-03` (Zero-Mock Analytics Guard)**: With empty event history, `Performance Analytics` displays empty prompt rather than hardcoded placeholder numbers (`AC-12`).
- **`FE-04` (Backend Offline Degradation)**: Simulate network failure / `503` on `/api/v1/health`; assert `backendStatus === 'UNAVAILABLE'`, error banner displays cleanly, and local simulation transport buttons remain enabled (`AC-15`).
- **`FE-05` (Reduced Motion & WebGL Fallback)**: Mock `matchMedia('(prefers-reduced-motion: reduce)')` and missing WebGL context; verify `WebGLFallbackView` renders 2D SVG schematic synced to `SimulationSnapshot` with zero runtime exceptions (`AC-17`).

---

## 7. End-to-End & Responsive Verification (Playwright)

- **`E2E-01` (Overview Showcase)**: Navigate to `/`, assert canvas renders non-zero dimensions, zero console errors, active cycle status updates, and working navigation CTAs (`AC-01`).
- **`E2E-02` (Digital Twin Inspection)**: Navigate to `/digital-twin`, trigger `Front`/`Side`/`Top`/`Isometric` camera presets, select components, toggle exploded view and collision geometry, verify 6-joint inspector visibility (`AC-02`, `AC-03`, `AC-04`).
- **`E2E-03` (Simulation Lab Full Cycle -> Analytics)**: Navigate to `/simulation`, start `Single Cycle` at `2x` speed, wait for `Cycle Completed` / `completedUnits >= 1`, navigate to `/analytics`, verify `Total Units Produced >= 1` and matching cycle time (`AC-10`, `AC-11`, `AC-12`).
- **`E2E-04` (Optimization Center Flow)**: With FastAPI test server running, compare Scenarios `A`–`D`, run optimization, load recommended scenario into `Simulation Lab` (`AC-13`, `AC-14`).
- **`E2E-05` (Mobile Responsive Layout)**: Run at `390x844` viewport across all 5 routes verifying zero horizontal overflow and accessible navigation/controls (`AC-16`).

---

## 8. Performance Baseline Protocol & Initial Target Budgets

Because concrete runtime timings depend on target browser GPU and hardware, performance metrics **must be measured in Phase 7** on actual builds rather than assumed upfront.

| Metric | Initial Design Budget (To Be Baseline-Measured in Phase 7) | Measurement Method |
|---|---|---|
| **3D Viewport Frame Rate** | Target `>= 60 FPS` steady desktop (`>= 30 FPS` low-power/mobile) during continuous cycle | Chrome DevTools Performance / Playwright frame timing over 30s run |
| **Rust/WASM Tick Execution** | Target `< 1.0 ms` per `20 ms` `step_tick` (leaves `> 95%` worker headroom even at `4x` speed) | Rust Criterion/bench or `performance.now()` over 1,000 ticks |
| **IK Solve Time** | Target `< 2.0 ms` worst-case across 3 seeds x 120 iterations | Rust unit timing benchmark |
| **Python `/analytics/evaluate`** | Target `< 100 ms` for 1,000-event run payload | Pytest + HTTPX local container benchmark |
| **Python `/optimization/run`** | Target `< 1500 ms` for 120-evaluation constrained search | Pytest + HTTPX local container benchmark |
| **Web Production Bundle** | Target initial route JS `< 450 KB` gzipped (excluding lazy routes/WASM) | Vite build artifact report (`dist/`) |

---

## 9. Acceptance Test Matrix (`AC-01` through `AC-18`)

| AC ID | Requirement Summary | Verification Test IDs | Automated Gate |
|---|---|---|---|
| **AC-01** | Landing page displays 3D robot workcell correctly | `E2E-01` | Playwright |
| **AC-02** | All 10 primary components selectable | `FE-02`, `E2E-02` | Vitest + Playwright |
| **AC-03** | Orbit/pan/zoom + camera presets work | `E2E-02` | Playwright |
| **AC-04** | 6 independently controllable joints within limits | `RUST-KIN-01`, `FE-02`, `E2E-02` | Cargo + Vitest + Playwright |
| **AC-05** | FK matches visual 3D transforms | `RUST-KIN-01..03` | Cargo + Integration |
| **AC-06** | IK solves reachable targets accurately | `RUST-IK-01`, `RUST-IK-02` | Cargo |
| **AC-07** | Unreachable targets return structured error | `RUST-IK-03`, `RUST-IK-04` | Cargo + Vitest |
| **AC-08** | Trajectories respect joint angle/vel/accel bounds | `RUST-TRAJ-01..03` | Cargo |
| **AC-09** | Collision & near-collision detection on test scenarios | `RUST-COL-01..06` | Cargo + E2E |
| **AC-10** | Full 8-stage pick-and-place cycle completes | `RUST-PROD-01`, `E2E-03` | Cargo + Playwright |
| **AC-11** | Pause, Resume, Stop, Reset work cleanly | `RUST-PROD-03`, `E2E-03` | Cargo + Playwright |
| **AC-12** | Simulation events deterministically drive KPIs | `RUST-PROD-02`, `RUST-PROD-06`, `FE-03`, `E2E-03` | Cargo + Vitest + Playwright |
| **AC-13** | Python analytics consumes runs & validates metrics | `API-01..03`, `API-07` | Pytest |
| **AC-14** | Optimization Center compares scenarios & recommends config | `API-04..06`, `E2E-04` | Pytest + Playwright |
| **AC-15** | UI displays fault & backend-unavailable states cleanly | `RUST-PROD-04`, `FE-04` | Cargo + Vitest |
| **AC-16** | Responsive layout usable on desktop & mobile | `E2E-05` | Playwright (`390x844`, `1440x900`) |
| **AC-17** | Reduced-motion & WebGL fallback verified | `FE-05` | Vitest + Playwright |
| **AC-18** | Build, test suites & deployment verified end-to-end | Full CI pipeline + Pages/Docker smoke | GitHub Actions + Manual Sign-off |
