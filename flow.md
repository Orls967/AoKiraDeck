# AoKira — Phased Implementation Flow

**Document Role:** Canonical execution roadmap governing the complete project lifecycle from Phase 0 documentation lock through Phase 8 final deployment. Every phase specifies dependencies, deliverables, validation gates, and a strict Definition of Done (DoD).
**Execution Rules:** Governed by [constraints.md](file:///Users/orl123456/Documents/AoKira/constraints.md). Verification details live in [TEST_PLAN.md](file:///Users/orl123456/Documents/AoKira/TEST_PLAN.md).

---

## 1. Phase Dependency Overview

```
Phase 0 (Repo Audit & Docs Lock)
   │
   ▼
Phase 1 (Foundation, Canonical Workcell Config, Shell & Design System)
   ├───────────────────────────┬───────────────────────────┐
   ▼                           ▼                           ▼
Phase 2 (3D Workcell)     Phase 3 (Rust/WASM Engine)   Phase 5 (Python API)
   └───────────┬───────────────┘                           │
               ▼                                           │
         Phase 4 (Production Cycle, Worker & Sim Lab)      │
               └───────────────────────────┬───────────────┘
                                           ▼
                                  Phase 6 (Analytics & Optimization UI)
                                           │
                                           ▼
                                  Phase 7 (Testing, Perf Baseline & Polish)
                                           │
                                           ▼
                                  Phase 8 (Deployment & Final Delivery)
```

---

## 2. Detailed Phase Specifications

### Phase 0 — Repository Audit & Documentation Lock *(Current Phase)*
- **Entry Criteria:** Valid GitHub repository (`Orls967/AoKira`) verified; project name (`AoKira`) confirmed.
- **Deliverables:** Complete cross-audited documentation package (`PRD.md`, `DATA_MODEL.md`, `SIMULATION_SPEC.md`, `ARCHITECTURE.md`, `API_CONTRACT.md`, `DESIGN.md`, `TEST_PLAN.md`, `flow.md`, `constraints.md`, `README.md`) committed incrementally.
- **Validation Gate:** Cross-document consistency audit passes with zero conflicting parameters, schema mismatches, or unverified claims.
- **Definition of Done:** All 10 documents committed cleanly on `main`; explicit user sign-off received prior to writing application code.

---

### Phase 1 — Project Foundation, Canonical Config & Design System
- **Depends On:** Phase 0.
- **Deliverables:**
  - `.gitignore` (excluding `node_modules/`, `target/`, `pkg/`, `.venv/`, `dist/`, `.env*`, `.DS_Store`).
  - Canonical single-source-of-truth workcell config `data/workcell/aokira-workcell.v1.json` and baseline scenario presets `data/scenarios/scenario-{a,b,c,d}.json`.
  - Frontend workspace (`apps/web`): Vite + TypeScript strict + React + Tailwind CSS tokens (`#0B0F14`..`#EF4444`), typography, persistent top navigation across 5 routes, `<WebGLErrorBoundary>`, `WebGLFallbackView` skeleton, and `prefers-reduced-motion` hook.
  - Rust workspace (`crates/aokira-engine/Cargo.toml`) and Python workspace (`apps/api/pyproject.toml`).
- **Validation Gate:**
  - `npm run typecheck && npm run build` succeeds in `apps/web`.
  - `cargo check` succeeds in `crates/aokira-engine`.
  - `pytest --collect-only` or minimal import check succeeds in `apps/api`.
  - JSON schema smoke check verifies `aokira-workcell.v1.json` parses cleanly.
- **Definition of Done:** Empty application shell renders all 5 routes responsively with locked design tokens and zero console/build errors.

---

### Phase 2 — 3D Robotic Workcell (`Overview` + `Digital Twin` Scene)
- **Depends On:** Phase 1.
- **Deliverables:**
  - Procedural/CAD-grade Three.js / R3F models built directly from `aokira-workcell.v1.json`: pedestal, 6-axis articulated arm (`link-0`..`link-6`), two-finger parallel gripper, input conveyor, output conveyor, processing station (with rear scanner + side clamps), workpiece template, safety fence, E-stop console, sensors & status beacon tower.
  - Interactive raycast selection for all 10 `ComponentId` targets (`AC-02`).
  - Camera preset rig (`Isometric`, `Front`, `Side`, `Top`) + clamped `OrbitControls` (`AC-03`).
  - `Digital Twin` inspection overlays: show/hide, isolate component, exploded view slider, grid/axes toggle, labels/sensor indicators, collision primitive wireframe toggle, and 6-joint inspector panel (initially bound to local FK/store until Phase 3 WASM link).
  - `Overview` hero viewport with cinematic camera drift respecting `prefers-reduced-motion`.
- **Validation Gate:**
  - Visual & Vitest/DOM verification of component selection, camera preset transitions, exploded slider, and responsive layout.
- **Definition of Done:** All 10 components selectable, isolated, and inspectable; all 6 robot joints visually articulate around exact DH axes.

---

### Phase 3 — Rust/WASM Simulation Engine (`crates/aokira-engine`)
- **Depends On:** Phase 1 (can execute in parallel with Phase 2).
- **Deliverables:**
  - `kinematics`: Standard DH FK (`BaseFrame` -> `WorldFrame`) + DLS IK with 3-seed strategy and structured unreachable/limit errors (`AC-05`, `AC-06`, `AC-07`).
  - `trajectory`: Quintic joint-space planner honoring velocity/accel scaling (`AC-08`).
  - `collision`: Capsule + box clearance checker (`NONE`, `NEAR_COLLISION <= 25 mm`, `COLLISION <= 0 mm`) with intentional-grasp exclusions (`AC-09`).
  - `robot`, `gripper`, `conveyor`, `production`, `scheduler`, `metrics`: Fixed `20 ms` tick loop, 8-stage state machine, deterministic event sequence, synthetic energy integral.
  - `wasm-pack build --target web` pipeline emitting typed WASM bindings for `apps/web`.
- **Validation Gate:**
  - `cargo test` passes `RUST-KIN-01..03`, `RUST-IK-01..04`, `RUST-TRAJ-01..03`, `RUST-COL-01..06`, `RUST-PROD-01..06` with zero warnings (`cargo clippy -- -D warnings`).
  - `wasm-pack build` succeeds without panic paths across FFI.
- **Definition of Done:** Pure Rust engine proves deterministic multi-cycle execution, collision stopping, IK error handling, and FK parity against golden fixtures.

---

### Phase 4 — Production Cycle, Web Worker Bridge & `Simulation Lab`
- **Depends On:** Phase 2 and Phase 3.
- **Deliverables:**
  - Dedicated `simulation.worker.ts` hosting Rust/WASM (`INIT`, `LOAD_SCENARIO`, `COMMAND`, `STEP_TICKS`, `SET_JOINTS`, `SOLVE_IK`, `SET_GRIPPER`).
  - Zero-re-render `useFrame` matrix/pose sync connecting `SimulationSnapshot` to the 3D scene (`AC-05`).
  - Full `Simulation Lab` UI: transport controls (`Start`, `Pause`, `Resume`, `Stop`, `Reset`, `E-Stop`), mode & speed controls, manual gripper toggle, 8-stage stepper, live event log, collision highlight colors (`#F59E0B` / `#EF4444`), and fault banner (`AC-10`, `AC-11`, `AC-15`).
  - Wired `Digital Twin` 6-joint manual jog & Cartesian IK probe to WASM Worker (`AC-04`, `AC-06`, `AC-07`), plus `Overview` live animated production showcase (`AC-01`).
- **Validation Gate:**
  - `FE-01`, `FE-02`, `E2E-01`, `E2E-02`, and `E2E-03` (single/continuous cycle completion in browser) pass.
- **Definition of Done:** Live 3D pick-and-place cycles run deterministically inside the Web Worker with real-time collision visualization and zero main-thread frame lockups.

---

### Phase 5 — Python Analytics & Optimization Service (`apps/api`)
- **Depends On:** Phase 1 (aligned with `DATA_MODEL.md` & `API_CONTRACT.md`).
- **Deliverables:**
  - FastAPI application (`routes/`, `schemas/`, `services/`, `analytics/`) implementing `/api/v1/health`, `/api/v1/analytics/evaluate`, `/api/v1/scenarios/compare`, `/api/v1/optimization/run`.
  - Independent KPI verification, stage bottleneck detection, component energy breakdown, deterministic shift forecast, and SciPy/NumPy constrained scenario optimizer.
  - `apps/api/Dockerfile` and local container run verification.
- **Validation Gate:**
  - `pytest` passes `API-01..07` using golden fixtures from `data/fixtures/`.
  - `docker build` succeeds and container responds `200 OK` on `/api/v1/health`.
- **Definition of Done:** All `/api/v1` endpoints conform strictly to `API_CONTRACT.md` schemas, validation bounds, and error envelopes.

---

### Phase 6 — `Performance Analytics`, `Optimization Center` & Graceful Degradation
- **Depends On:** Phase 4 and Phase 5.
- **Deliverables:**
  - `apps/web/src/services/apiClient.ts` with typed timeouts (`3s`/`10s`/`20s`), `/health` check, and explicit `BACKEND_UNAVAILABLE` handling.
  - `Performance Analytics` page displaying all 10 event-derived KPIs (`AC-12`), Recharts cycle/throughput/energy charts, zero-mock empty state, and backend bottleneck/forecast/validation enrichment (`AC-13`).
  - `Optimization Center` page supporting Scenarios `A`–`D` comparison, constrained optimization execution, ranked comparison table/charts, and one-click `Load into Simulation Lab` (`AC-14`).
  - Full `Backend Unavailable` state verification (`AC-15`).
- **Validation Gate:**
  - `FE-03`, `FE-04`, and `E2E-04` pass with backend online AND with backend stopped (degraded mode).
- **Definition of Done:** Every analytics figure traces back to active simulation events; optimization results flow seamlessly back into the 3D simulator; offline mode never crashes.

---

### Phase 7 — Comprehensive Testing, Performance Baseline & Refinement
- **Depends On:** Phase 6.
- **Deliverables:**
  - Full Playwright E2E regression suite (`E2E-01`..`E2E-05`) across desktop (`1440x900`) and mobile (`390x844`) (`AC-16`).
  - `FE-05` verification for `prefers-reduced-motion` and `WebGLFallbackView` (`AC-17`).
  - Measured Phase 7 performance baseline report comparing observed FPS, WASM tick latency, IK solve duration, API response latency, and bundle size against targets in [TEST_PLAN.md](file:///Users/orl123456/Documents/AoKira/TEST_PLAN.md).
  - Defect resolution and UI/UX polish without scope creep.
- **Validation Gate:** All `AC-01` through `AC-17` test cases pass cleanly on final candidate commits.
- **Definition of Done:** Zero failing tests, zero skipped acceptance assertions, and observed performance baselines recorded truthfully.

---

### Phase 8 — Final Delivery & Deployment (`AC-18`)
- **Depends On:** Phase 7.
- **Deliverables:**
  - GitHub Actions workflow `.github/workflows/ci-deploy.yml` running Rust `cargo test`, Python `pytest`, Web `vitest` + `vite build`, and GitHub Pages artifact deployment for `https://orls967.github.io/AoKira/`.
  - Containerized Python backend deployment configuration & health verification instructions.
  - Final `README.md` command & live URL verification and Phase 8 Delivery Report.
- **Validation Gate:** Clean CI build/test pass + verified deployed frontend & container backend behavior (`AC-18`).
- **Definition of Done:** Production artifacts built, tested, deployed (upon user authorization for push/deploy), and signed off against `AC-01`–`AC-18`.
