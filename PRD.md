# AoKira — Product Requirements Document (PRD)

**Product Identity:** `AoKira` — *Industrial Robotic Workcell Digital Twin*
**Tagline:** *Design. Simulate. Optimize. Operate.*
**Document Role:** Canonical source of truth for product vision, user personas, functional scope, feature priorities, explicit exclusions, non-functional requirements, and acceptance criteria (`AC-01` through `AC-18`).
**Status:** Locked for Implementation (Phase 0 Documentation Baseline)

---

## 1. Product Vision & Problem Statement

### 1.1 Vision
`AoKira` is an interactive 3D industrial robotic workcell digital twin platform in the browser. Rather than serving as a passive 3D model showcase or a static dashboard with mock numbers, `AoKira` operates a unified, deterministic smart-manufacturing workcell where 3D visualization, real-time Rust/WebAssembly kinematics and collision simulation, production event logging, and Python-based analytics and scenario optimization all originate from a single simulation core.

### 1.2 Problem Statement
Evaluating automated pick-and-place workcells typically requires expensive proprietary offline-programming (OLP) suites, steep setup overhead, or fragmented tools where 3D kinematics, cycle-time estimation, collision checking, and throughput optimization live in separate disconnected spreadsheets and visualizers. Conversely, lightweight web 3D demos lack kinematic rigor, collision validation, deterministic event trails, and actionable production analytics.

`AoKira` bridges this gap as an accessible, self-contained engineering demonstrator: users can inspect a generic 6-axis articulated robot workcell in 3D, test joint limits and inverse kinematics, detect collisions before executing cycles, observe real-time production state transitions, measure event-derived KPIs, and run constrained multi-scenario optimization in Python.

### 1.3 Mandatory Non-Safety & Simulation-Only Boundary
`AoKira` is strictly a **simulation-only demonstrator** powered by synthetic, deterministic, configurable models. It **must never** be presented, deployed, or used as:
- Real-world industrial robot control software or motion firmware.
- PLC, fieldbus, or ROS 2 hardware integration middleware.
- A certified industrial safety validation system (ISO 10218 / ISO/TS 15066).
- Accurate electrical utility metering or live factory telemetry.

---

## 2. Product Objectives & Success Metrics

| Objective ID | Objective | Measurable Outcome Target (Verified at Phase 7) |
|---|---|---|
| **OBJ-01** | Deliver an interactive, 3D-centered digital twin experience | All primary workcell components selectable, inspectable, isolatable, and controllable in 3D with preset and orbit cameras (`AC-01`–`AC-03`). |
| **OBJ-02** | Ground all motion in authentic computational kinematics & collision checking | 6-DOF forward/inverse kinematics, quintic trajectories within joint limits, and capsule/bounding-volume collision checks executed in Rust/WASM (`AC-04`–`AC-09`). |
| **OBJ-03** | Unify simulation events with production KPIs | 100% of analytics metrics computed directly from deterministic simulation event streams rather than static/mocked dashboard values (`AC-10`–`AC-12`). |
| **OBJ-04** | Enable constrained multi-scenario optimization & bottleneck discovery | Python FastAPI engine compares baseline and variant configurations and identifies bottlenecks and recommended parameters (`AC-13`, `AC-14`). |
| **OBJ-05** | Guarantee offline resilience and graceful degradation | Core 3D workcell inspection and Rust/WASM production simulation remain fully operational when the Python backend is unavailable (`AC-15`). |
| **OBJ-06** | Meet cross-device, accessibility, and build quality bars | Responsive desktop/mobile layouts, `prefers-reduced-motion` support, WebGL fallback view, and clean CI/test verification (`AC-16`–`AC-18`). |

*(Note: Quantitative latency, FPS, and solver tolerance budgets are established and measured against hardware baselines in [TEST_PLAN.md](TEST_PLAN.md); no unmeasured benchmarks are fabricated.)*

---

## 3. Target Users & Personas

| Persona | Profile | Primary Goals in AoKira | Primary Views Used |
|---|---|---|---|
| **Manufacturing / Automation Engineer** | Designs or evaluates pick-and-place workcell concepts | Inspect robot reachability, test joint limits, validate collision clearances, tune speeds, minimize cycle time | `Digital Twin`, `Simulation Lab`, `Optimization Center` |
| **Robotics & Simulation Developer / Student** | Studies manipulator kinematics, trajectory planning, and event-driven digital twins | Observe FK/IK consistency, verify quintic motion profiles, inspect collision primitives and state-machine logs | `Digital Twin`, `Simulation Lab` |
| **Operations / Plant Analyst** | Reviews throughput, utilization, downtime, energy estimates, and bottlenecks | Analyze cycle-by-cycle KPI trends, compare "what-if" scenarios, justify parameter tuning | `Performance Analytics`, `Optimization Center`, `Overview` |

---

## 4. Core User Journeys

### Journey 1 — Guided Cell Discovery (`Overview` -> `Digital Twin`)
1. User lands on `Overview`, observing the live cinematic 3D workcell executing an animated pick-and-place showcase alongside real-time system health and active production summary.
2. User clicks the primary CTA to enter `Digital Twin`.
3. User orbits around the workcell, triggers camera presets (`Front`, `Side`, `Top`, `Isometric`), selects the 6-axis robot arm to inspect its 6 individual joints and parameters, enables exploded view, isolates a subassembly, and toggles collision geometry and coordinate axes.

### Journey 2 — Motion Planning & Production Execution (`Simulation Lab`)
1. User opens `Simulation Lab` and selects either `Single Cycle` or `Continuous` mode with a target production quantity (default `60 units/hour` target rate).
2. User adjusts robot motion speed, conveyor speed, or simulation playback speed, or manually toggles gripper open/close and joint test poses.
3. User clicks `Start`; the 8-stage production state machine runs deterministically in the Rust/WASM Web Worker, streaming joint transforms, workpiece positions, gripper states, and timestamped events.
4. If an unreachable target, joint limit violation, gripper fault, or collision occurs, the state machine enters an explicit fault/error state, highlights offending geometry in 3D, logs the diagnostic event, and allows `Reset` recovery.

### Journey 3 — Event-Driven KPI Evaluation (`Performance Analytics`)
1. User navigates to `Performance Analytics` during or after a simulation run.
2. Dashboard displays KPIs derived strictly from the active simulation event history: total units produced, units/hour, average cycle time, robot utilization, conveyor utilization, idle time, downtime, collision count, estimated energy consumption, and production efficiency.
3. If the Python analytics service is reachable, backend-computed bottleneck diagnostics, energy breakdown, and consistency validations enrich the view; if offline, client-side simulation summaries remain visible while backend-only panels clearly display an `Unavailable` status without crashing.

### Journey 4 — Multi-Scenario Comparison & Optimization (`Optimization Center`)
1. User loads the baseline scenario (`Scenario A: Baseline`) alongside alternative configurations (e.g., `Scenario B: Faster Robot Motion`, `Scenario C: Optimized Trajectory`, `Scenario D: Adjusted Conveyor Speed`) or defines custom parameter bounds.
2. User triggers batch scenario analysis and constrained optimization via the Python FastAPI service.
3. System evaluates cycle time, throughput, idle time, estimated energy, collision counts, and bottlenecks across scenarios, then presents a ranked comparison table/charts and a recommended configuration that can be loaded back into `Simulation Lab`.

---

## 5. Functional Requirements

### 5.1 Workcell Physical Configuration (Locked Baseline)
The single canonical workcell modeled consistently across all views comprises:
1. Generic 6-axis articulated robotic arm (defined in-house; no proprietary OEM robot brand imitation).
2. Two-finger parallel gripper.
3. Input conveyor (default `0.20 m/s`).
4. Output conveyor (default `0.20 m/s`).
5. Processing station (fixture + simulated processing dwell).
6. Workpiece (`60 x 60 x 60 mm` synthetic part, `<= 5 kg` simulated payload limit).
7. Robot pedestal.
8. Safety fence perimeter.
9. Emergency stop station.
10. Presence sensors and status indicator beacons.

Detailed coordinates, dimensions, DH parameters, and joint limits are canonically specified in [SIMULATION_SPEC.md](SIMULATION_SPEC.md) and typed in [DATA_MODEL.md](DATA_MODEL.md).

### 5.2 Application Views & Feature Requirements

| ID | Feature Area | Requirement Description | Priority |
|---|---|---|---|
| **FR-OV-01** | Overview Landing | Hero 3D workcell canvas with cinematic camera orbit and active animated manufacturing cycle (non-generic landing page). | P0 (Must) |
| **FR-OV-02** | Overview Status & Nav | Live system status indicators (WASM engine, backend API reachability), live production summary metrics, quick navigation, and direct CTAs to `Digital Twin` and `Simulation Lab`. | P0 (Must) |
| **FR-DT-01** | 3D Navigation & Presets | Orbit, pan, zoom controls plus camera presets: `Front`, `Side`, `Top`, and `Isometric`. | P0 (Must) |
| **FR-DT-02** | Component Inspection | Interactive raycast selection for all 10 major workcell components, opening a Component Information Panel with identity, role, dimensions, and live state. | P0 (Must) |
| **FR-DT-03** | Robot 6-Joint Inspector | Selecting the robot arm exposes all 6 joints (`J1`–`J6`) individually with current angle, min/max angle limits, velocity/acceleration limits, axis, and interactive manual jog sliders. | P0 (Must) |
| **FR-DT-04** | Scene Visibility & Diagnostics | Show/hide individual components, isolate selected component, exploded view slider, toggle coordinate axes/grid, toggle labels & sensor indicators, inspect collision bounding volumes, and reset workcell view/pose. | P0 (Must) |
| **FR-SL-01** | Simulation Playback Controls | `Start`, `Pause`, `Resume`, `Stop`, `Reset` controls with deterministic `20 ms` simulation clock independent of browser FPS. | P0 (Must) |
| **FR-SL-02** | Cycle Modes & Tuning | Select `Single Cycle` or `Continuous` production; configure target production quantity, simulation playback speed multiplier, conveyor speed, robot motion speed scale, and manual gripper open/close test. | P0 (Must) |
| **FR-SL-03** | 8-Stage Process Visibility | Real-time display of the active stage (`Input Conveyor` -> `Object Detection` -> `Robot Approaches` -> `Pick Workpiece` -> `Move to Processing Station` -> `Processing / Assembly` -> `Pick Finished Workpiece` -> `Move to Output Conveyor` -> `Place Workpiece` -> `Cycle Completed`) and timestamped event log. | P0 (Must) |
| **FR-SL-04** | Fault, IK & Collision Feedback | Clear visual and textual error feedback for collisions, near-collision warnings, unreachable Cartesian targets, joint limit violations, missing objects, and gripper failures. | P0 (Must) |
| **FR-PA-01** | Event-Derived KPIs | Compute and display: Total Units Produced, Units/Hour, Average Cycle Time, Robot Utilization, Conveyor Utilization, Idle Time, Downtime, Collision Events, Estimated Energy Consumption, and Production Efficiency — strictly from simulation event logs. | P0 (Must) |
| **FR-PA-02** | Production History & Charts | Time-series and per-cycle visualizations (throughput trend, cycle time breakdown, state utilization, energy estimate) plus backend consistency validation indicators. | P1 (Should) |
| **FR-OC-01** | Multi-Scenario Comparison | Create, manage, and compare baseline and variant scenarios (e.g., baseline, faster robot motion, optimized trajectory, adjusted conveyor speed) across cycle time, throughput, idle time, energy estimate, collision count, and bottlenecks. | P0 (Must) |
| **FR-OC-02** | Constrained Optimization | Trigger Python FastAPI optimization to search valid parameter combinations under joint, collision-clearance, and payload constraints; display recommended configuration and apply it to `Simulation Lab`. | P0 (Must) |
| **FR-SYS-01** | Graceful Degradation | When Python FastAPI backend is unreachable, keep 3D visualization and Rust/WASM simulation running normally while displaying explicit `Backend Unavailable` states on Python-dependent analytics/optimization actions. | P0 (Must) |

### 5.3 Feature Priorities (MoSCoW Summary)
- **Must Have (`P0`)**: All 5 routes, 3D workcell with 10 selectable components, 6-joint control + FK/IK, quintic joint-space trajectory planning, capsule/AABB collision detection, 8-stage deterministic state machine, event log, event-derived KPIs, scenario comparison, Python optimization endpoint, offline/unavailable states, reduced-motion, WebGL fallback.
- **Should Have (`P1`)**: Preset scenario templates (`A`–`D`), exportable scenario JSON/CSV comparison report, visual trajectory path trace overlay in 3D.
- **Could Have (`P2`)**: Saved browser-local scenario library (`localStorage`), interactive Cartesian waypoint gizmo in `Simulation Lab`.
- **Won't Have (This Release)**: See Section 6.

---

## 6. Scope Boundaries & Explicit Exclusions

| Included in Scope | Explicitly Excluded from Scope |
|---|---|
| Generic 6-axis articulated robot model | Proprietary brand robot CAD/firmware replication or real robot hardware control |
| Simulated two-finger parallel gripper | Force-feedback servo gripper control or pneumatic PLC I/O |
| Pick-and-place production cell (8 stages) | Multi-cell / full-factory discrete-event simulation |
| Input & output conveyors + processing station | Complex multi-machine routing, AGVs, or warehouse logistics |
| Bounding-volume & capsule collision detection | General-purpose rigid-body / FEM physics engine from scratch |
| Quintic joint-space & IK motion planning | Industrial-grade RRT*/PRM obstacle-avoidance path planners |
| Synthetic, deterministic simulation events | Real factory telemetry, OPC-UA, MQTT, or PLC/ROS 2 integration |
| Engineering energy consumption estimation | Certified electrical metering or thermal simulation |
| Single-user browser + stateless REST analytics API | Authentication, login, RBAC, multi-user cloud workspaces, billing, IoT deployment |

---

## 7. Non-Functional Requirements

| Category | Requirement | Canonical Reference |
|---|---|---|
| **Determinism** | Identical initial state, seed, and configuration must produce identical simulation state transitions, timestamps, and metrics across runs regardless of client frame rate. | [SIMULATION_SPEC.md](SIMULATION_SPEC.md) |
| **Single Source of Truth** | Robot link geometry, joint limits, and workcell layout dimensions must load from one canonical configuration definition shared across Rust/WASM and TypeScript/Three.js. | [DATA_MODEL.md](DATA_MODEL.md) |
| **Thread Separation** | Fixed-timestep simulation ticks and heavy IK/collision computations must execute inside a Web Worker (`Rust/WASM`), never blocking the React main UI/render thread. | [ARCHITECTURE.md](ARCHITECTURE.md) |
| **Responsiveness & Accessibility** | Desktop-first layout with usable tablet/mobile views; keyboard navigation, ARIA labels, tabular numerals, `prefers-reduced-motion` support, and clean WebGL-unavailable fallback UI. | [DESIGN.md](DESIGN.md) |
| **API Validation & Safety** | All TypeScript <-> Python requests/responses strictly validated via Pydantic v2 schemas and versioned under `/api/v1`. | [API_CONTRACT.md](API_CONTRACT.md) |
| **Reliability & Testing** | Automated unit, integration, API contract, and end-to-end tests covering kinematics, collision cases, state machine determinism, and UI states. | [TEST_PLAN.md](TEST_PLAN.md) |

---

## 8. Acceptance Criteria (Canonical ID Registry)

Every criterion below is mandatory prior to final delivery and maps directly to verification suites in [TEST_PLAN.md](TEST_PLAN.md).

| ID | Criterion | Primary Verification Owner |
|---|---|---|
| **AC-01** | Landing page (`Overview`) renders the 3D robot workcell accurately with active animated showcase. | Frontend / E2E |
| **AC-02** | All 10 primary workcell components can be selected in 3D and inspected in the info panel. | Frontend / E2E |
| **AC-03** | Camera controls (orbit, pan, zoom) and presets (`Front`, `Side`, `Top`, `Isometric`) operate cleanly. | Frontend / E2E |
| **AC-04** | Robot arm exposes 6 independently controllable joints (`J1`–`J6`) respecting defined bounds. | Rust + Frontend |
| **AC-05** | Forward kinematics poses computed by Rust/WASM match Three.js visual joint/end-effector transforms. | Rust + Integration |
| **AC-06** | Inverse kinematics converges accurately for valid reachable workcell targets. | Rust Unit + Integration |
| **AC-07** | Unreachable Cartesian targets return explicit structured errors without corrupting robot state. | Rust Unit + UI |
| **AC-08** | Generated trajectories never violate joint angle, velocity, or acceleration limits. | Rust Unit |
| **AC-09** | Collision and near-collision detection triggers reliably on defined collision test scenarios. | Rust Unit + UI |
| **AC-10** | Full 8-stage pick-and-place production cycle executes to completion with workpiece transfer. | Rust + E2E |
| **AC-11** | Simulation supports `Start`, `Pause`, `Resume`, `Stop`, and `Reset` cleanly in single and continuous modes. | Worker + E2E |
| **AC-12** | Simulation event log deterministically produces consistent KPI metrics (zero static mock KPIs). | Rust + Frontend + Python |
| **AC-13** | Python FastAPI analytics service ingests simulation events/run payloads and returns valid KPI, energy, and consistency checks. | Python Pytest + Integration |
| **AC-14** | Optimization Center compares multiple scenarios and returns valid constrained recommendations. | Python Pytest + E2E |
| **AC-15** | UI clearly presents simulation faults (collision/IK/gripper) and backend `Unavailable` states without crashing core simulation. | Frontend + E2E |
| **AC-16** | Layout remains usable across desktop and responsive mobile/tablet viewports. | Frontend / E2E |
| **AC-17** | `prefers-reduced-motion` behavior and a non-crashing WebGL fallback view are implemented and verified. | Frontend / E2E |
| **AC-18** | Production build, automated test suites across TS/Rust/Python, and GitHub Pages + Docker deployment verification pass. | CI / Delivery Gate |

---

## 9. Decision Governance: Locked vs. Defaults vs. Assumptions vs. Open Questions

| Classification | Decisions Covered | Authority / Review Rule |
|---|---|---|
| **Locked Decisions** | Brand identity (`AoKira`), simulation-only boundary, 5 routes, 10 workcell components, generic 6-axis arm, 8-stage cycle, 3-tier `TypeScript/R3F + Rust/WASM + Python/FastAPI` split, `#0B0F14`–`#EF4444` color system, GitHub Pages + container backend topology, `AC-01`–`AC-18` | Immutable without explicit user approval ([constraints.md](constraints.md)). |
| **Reasonable Implementation Defaults** | DH link dimensions & joint limits (`SIMULATION_SPEC.md`), workcell world coordinates, DLS `lambda = 0.025` / `maxIterations = 120`, near-collision threshold `25 mm`, `300 ms` gripper actuation, `2500 ms` default dwell, energy model coefficients, HTTP timeouts (`3s`/`10s`/`20s`) | Locked in `DATA_MODEL.md` / `SIMULATION_SPEC.md` / `API_CONTRACT.md` so implementation agents do not guess; tunable via scenario config or documented spec update if calibration requires. |
| **Engineering Assumptions** | Target users run modern WebAssembly + Web Worker browsers; HTTP analytics payloads remain `<= 5 MB`; single-user browser state does not require server database persistence; CORS allowlist suffices for stateless demo API access | Validated across Phase 4–7 tests. |
| **Open Decisions (Deferred to Deployment / Phase 7–8)** | (1) Concrete hardware performance baseline numbers measured in Phase 7 (`TEST_PLAN.md` Section 8); (2) Choice of external container hosting provider for `apps/api` (`VITE_API_BASE_URL`) when deploying beyond Docker localhost; (3) Explicit user push/deploy authorization at Phase 8 | Does **not** block Phases 1–7 local implementation, testing, or GitHub Pages prep. |
