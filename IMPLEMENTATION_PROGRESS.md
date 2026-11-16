# AoKira — Implementation Progress Tracker

**Current Phase:** Phases 1–8 Complete · Post-delivery: CI green, GitHub Pages live (https://orls967.github.io/AoKiraDeck/)
**Last Updated:** 2026-11-16
**Branch:** `main`
**Remote:** `https://github.com/Orls967/AoKiraDeck.git`

---

## Completed Milestones
- [x] **Phase 0 / Repo Audit**: Audited all 10 canonical specifications (`PRD.md`, `DATA_MODEL.md`, `SIMULATION_SPEC.md`, `ARCHITECTURE.md`, `API_CONTRACT.md`, `DESIGN.md`, `TEST_PLAN.md`, `flow.md`, `constraints.md`, `README.md`), verified DH parameters, DLS IK convergence, and capsule/box collision clearances analytically.
- [x] **Git Hygiene (`9da427b`)**: Created `.gitignore` and untracked `.DS_Store` from Git index while keeping local copy.
- [x] **Phase 1 — Foundation & Canonical Config (`c7b3217`)**:
  - Created `data/workcell/aokira-workcell.v1.json` and `data/scenarios/scenario-{a,b,c,d}.json`.
  - Initialized `crates/aokira-engine` (Rust + `wasm-bindgen` + `serde`), `apps/api` (FastAPI + Pydantic v2 + NumPy/SciPy + `.venv`), and `apps/web` (Vite + React 18 + TS strict + Tailwind CSS tokens + R3F/Drei + Zustand + Recharts + Vitest).
  - Implemented `AppShell` (5 routes, status pills, mobile nav drawer), `WebGLErrorBoundary`, `WebGLFallbackView` (2D SVG schematic), `useReducedMotion`, canonical TS types & config loaders.
  - Verified: `npm run typecheck`, `npm run test` (2 passed), `npm run build`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (1 passed), `pytest` (1 passed), `ruff check .`.
- [x] **Phase 3 — Deterministic Rust/WASM Simulation Core (`565fb74`)**:
  - Implemented `math`, `kinematics` (Standard DH FK, 3-seed DLS IK), `trajectory` (quintic time scaling), `collision` (exact capsule-capsule, capsule-box, held OBB-box with 25 mm near-collision threshold), `robot`, `gripper`, `conveyor` (including drop-zone interlock while robot releases/retracts finished billet), `metrics`, `production` (8-stage state machine), `scheduler`, and `AokiraSimEngine` `wasm_bindgen` FFI.
  - Generated canonical fixture `data/fixtures/baseline-3cycles.golden.json` and verified all 22 Rust tests (`RUST-KIN-01..03`, `RUST-IK-01..04`, `RUST-TRAJ-01..03`, `RUST-COL-01..06`, `RUST-PROD-01..06`), `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `wasm-pack build` (`264K` `aokira_engine_bg.wasm`).
- [x] **Phase 5 — Stateless Python FastAPI Analytics & Optimization Service (`a0668f0`)**:
  - Implemented Pydantic v2 `camelCase` request/response/error schemas, 5 MB payload cap middleware (`413`), uniform `ApiErrorResponse` error handlers (`VALIDATION_ERROR`, `INVALID_EVENT_SEQUENCE`, `INFEASIBLE_OPTIMIZATION`, `INTERNAL_ERROR`), and CORS headers.
  - Implemented event-driven `analytics.py`, `validation.py`, `energy.py`, `bottleneck.py`, `forecasting.py`, analytical quintic `surrogate.py`, and SciPy SLSQP `optimization.py` (`/api/v1/analytics/evaluate`, `/api/v1/scenarios/compare`, `/api/v1/optimization/run`), plus `apps/api/Dockerfile`.
  - Verified `ruff check .` (0 errors) and `pytest -v` (8 passed: `API-01..07` + smoke check, golden fixture agreement `< 0.01%`).
- [x] **Phase 2 — Core 3D Workcell, WASM Worker Bridge & Digital Twin Inspector (`cb8dd13`)**:
  - Implemented `apps/web/src/workers/simulation.worker.ts` (dedicated Web Worker wrapping `AokiraSimEngine` WASM module), `useSimulationStore` (`liveSnapshotRef` & `liveTracePointsRef` outside React state, `rAF` `20 ms` tick accumulator capped at `200 ms`, rolling 500-event log, Promise-based `solveIk`), and `useTwinUiStore`.
  - Implemented offline R3F 3D scene modules under `apps/web/src/components/scene/` (`RobotArmModel`, `GripperModel`, `ConveyorModels`, `ProcessingStationModel`, `WorkpieceMeshes`, `EnvironmentRig` with reach envelope/collision wireframes/frames/TCP trace, `CameraRig`, `WorkcellCanvas`, `CameraPresetBar`).
  - Implemented `DigitalTwinPage.tsx` (Component Tree with Isolate/Hide, Exploded View slider, overlay toggles, 6-Joint FK inspector J1–J6, Cartesian IK Target Probe) and `DigitalTwinPage.test.tsx` (`FE-02`), wired worker initialization in `App.tsx`.
  - Verified `npm run typecheck`, `npm run test` (3 files, 6 passed), and `npm run build`.
- [x] **Phase 4 — Overview Live Showcase & Simulation Lab (`6caa45e`)**:
  - Added deterministic `playbackSpeed` (`0.25x`–`4.0x`) multiplier to `useSimulationStore` (`20 ms` fixed WASM steps preserved) and `compact` mode on `CameraPresetBar`.
  - Implemented `OverviewPage.tsx` (full-bleed hero 3D viewport with `autoOrbit`, editorial launch card, live telemetry HUD synced to Rust/WASM ticks, auto-starting demo showcase that cleanly resets when navigating to interactive routes).
  - Implemented `SimulationLabPage.tsx` (Transport deck `Start`/`Pause`/`Resume`/`Stop`/`Step 20ms`/`Reset`/`E-Stop`, playback speeds, Scenario `A–D` selector, `SINGLE`/`FIXED_COUNT`/`CONTINUOUS` modes, parameter sliders, manual gripper toggle, 8-stage pipeline stepper, Active Fault banner, color-coded filterable Event Log, keyboard shortcuts) and `SimulationLabPage.test.tsx` (`FE-01`).
  - Verified `npm run typecheck`, `npm run test` (4 files, 8 passed), and `npm run build`.
- [x] **Phase 6 — Performance Analytics & Optimization Center UI**:
  - Implemented `apps/web/src/services/apiClient.ts` (strict `3s`/`10s`/`20s` AbortController timeouts, structured `ApiDomainError` & `BackendUnavailableError`) and `useAnalyticsStore.ts` (health polling, `/analytics/evaluate`, `/scenarios/compare`, `/optimization/run`), wired into `App.tsx` -> `<AppShell>`.
  - Implemented `AnalyticsPage.tsx` (zero-data empty state `FE-03`, 10 event-derived KPIs, 3 Recharts charts, Python bottleneck/energy/forecast/consistency enrichment panels, offline degraded mode `FE-04` with `Retry Connection`) and `OptimizationPage.tsx` (scenario comparison table/chart, bounds & constraints workbench, SLSQP recommendation card + `Load into Simulation Lab`, `INFEASIBLE_OPTIMIZATION` banner).
  - Verified full `scripts/test-all.sh`: Rust `22 passed`, Python `8 passed` + `ruff check .` clean, Web `6 test files / 13 tests passed` (`FE-01..FE-05`), and production `vite build`.

---

## Technical Decisions Recorded
1. **Collision Capsule Endpoints (`link-1`..`link-5`, `gripper`)**: Sized capsule segments within each DH link frame so adjacent links and resting/grasp contacts never produce false-positive `NEAR_COLLISION` (`<= 25 mm`) alerts along the nominal pick-and-place trajectory (`min clearance >= 28.85 mm` vs static geometry and `>= 39.20 mm` non-adjacent self-clearance).
2. **React & R3F Stack Versions**: Selected React 18.3 + `@react-three/fiber` 8.17 + `@react-three/drei` 9.117 + `three` 0.170 + `recharts` 2.13 + `tailwindcss` 3.4 for clean peer compatibility and deterministic production bundling.
3. **WASM Typed Ambient Module**: Added `apps/web/src/types/wasm-engine.d.ts` so TypeScript typechecking works cleanly alongside `apps/web/src/wasm/` generated by `scripts/build-wasm.sh`.
4. **Output Conveyor Placement Zone Interlock**: In `PlaceWorkpiece` release/retraction subphases, output belt feed pauses momentarily while the gripper opens and lifts clear of the billet above the drop zone, preventing conveyor carry-away from shearing across descending/opening jaws.

---

## Remaining Tasks
- [x] **Phase 3 (Rust/WASM Engine)**: Complete (`cargo test` 22/22 passed, `wasm-pack` 264K).
- [x] **Phase 5 (Python Analytics & Optimization Service)**: Complete (`pytest` 8/8 passed, `ruff check .` clean).
- [x] **Phase 2 (Core 3D Workcell)**: Complete (R3F workcell, WASM Worker bridge, `DigitalTwinPage` `FE-02` passing).
- [x] **Phase 4 (Simulation Lab & Overview Showcase)**: Complete (`OverviewPage`, `SimulationLabPage`, `FE-01`, `npm test` 8/8 passing).
- [x] **Phase 6 (Performance Analytics & Optimization Center UI)**: Complete (`apiClient`, `AnalyticsPage`, `OptimizationPage`, `FE-01..FE-05`, `scripts/test-all.sh` green).
- [x] **Phase 7 (Testing & Performance Baseline)**: Run Playwright E2E (`E2E-01`..`E2E-05` desktop & mobile), measure empirical runtime/build baselines, resolve any defects.
- [x] **Phase 8 (CI/CD & Final Delivery)**: Add `.github/workflows/ci-deploy.yml`, verify Docker & build configs, update `README.md`, push final commits, produce Final Report.

---

## Git Commit & Push Log
| Commit | Summary | Push Status |
|---|---|---|
| `9da427b` | `chore: configure repository gitignore and untrack .DS_Store` | Pushed to `origin/main` |
| `c7b3217` | `feat: initialize canonical configs and Phase 1 full-stack scaffold` | Pushed to `origin/main` |
| `565fb74` | `feat(engine): implement deterministic Rust/WASM robotics engine and golden baseline` | Pushed to `origin/main` |
| `a0668f0` | `feat(api): implement FastAPI analytics and SciPy SLSQP optimization service` | Pushed to `origin/main` |
| `cb8dd13` | `feat(web): implement R3F 3D workcell, WASM worker bridge, and Digital Twin inspector` | Pushed to `origin/main` |
| `6caa45e` | `feat(web): implement Overview live showcase and Simulation Lab control deck` | Pushed to `origin/main` |
| `43bdd21` | `feat(web): implement Performance Analytics and Optimization Center UI` | Pushed to `origin/main` |

## Phase 7: End-to-End Integration, Verification & Measured Baselines — DONE

### E2E Verification (`E2E-01`–`E2E-05`, Real Chrome GPU WebGL + Uvicorn Backend)
- **E2E-01**: Overview 3D workcell showcase, live Rust/WASM stepping, zero console/page errors (`2.8s`)
- **E2E-02**: Digital Twin selection, camera presets, overlays, 6-joint inspector, IK solve/unreachable feedback (`862ms`)
- **E2E-03**: Simulation Lab full pick-and-place cycle + Analytics Python enrichment & `projectedUnitsPer8hShift` (`4.6s`)
- **E2E-04**: Optimization Center comparison, SciPy SLSQP solver, infeasible domain error handling & offline mode (`846ms`)
- **E2E-05**: Responsive mobile viewport (`390x844`) across all 5 routes without horizontal overflow (`587ms`)

### Measured Phase 7 Performance Baselines
- **Rust 1,000 Simulation Ticks (release)**: `22.917 ms` total (`0.0229 ms/tick`)
- **Rust 3-seed DLS IK Solve (release)**: `0.0133 ms` avg / `0.0148 ms` worst (reachable); `0.0013 ms` unreachable rejection
- **FastAPI `POST /api/v1/analytics/evaluate` (1,000 events)**: `22.61 ms` (HTTP `200`)
- **FastAPI `POST /api/v1/optimization/run` (90 SciPy SLSQP evaluations)**: `7.77 ms` (HTTP `200`)
- **WebGL Canvas rAF Rate (`E2E-01`)**: `60.5 FPS`
- **Production WASM Binary (`aokira_engine_bg.wasm`)**: `270.35 kB` raw / `108.62 kB` gzip (`vite build` in `2.93s`)


- Commit: `50e52ff` (`test(e2e): add Playwright E2E suite, perf benchmarks, and Phase 7 fixes`, pushed to `origin/main`)

## Phase 8: CI/CD Workflow, Production Deployment Prep & Final Docs — DONE

- Created `.github/workflows/ci-deploy.yml` covering `rust-and-wasm` (`fmt`, `clippy`, `test`, `wasm-pack`), `python-api` (`ruff`, `pytest`, Docker build + `/api/v1/health` container smoke test), `web-and-e2e` (`typecheck`, `vitest`, Playwright `E2E-01..05`, and `/AoKiraDeck/` Pages build with `404.html` SPA fallback), and `deploy-pages` (`actions/deploy-pages@v4`).
- Verified YAML workflow validity (`yaml.safe_load` parsed all 4 jobs cleanly) and verified `VITE_BASE_PATH=/AoKiraDeck/` production bundle rewrites `/AoKiraDeck/` assets, `/AoKiraDeck/favicon.svg`, and `/AoKiraDeck/assets/aokira_engine_bg-*.wasm`.
- Checked local Docker availability (`docker info` reported daemon socket unavailable on macOS host; CI enforces Docker image smoke testing on Ubuntu runners).
- Updated `README.md` with implemented workspace layout, verified local/CI setup commands, measured Phase 7/8 performance baselines, offline/synthetic disclaimers, and deployment guide.

## Post-Delivery: CI Fixes, GitHub Pages Launch & README Gallery — DONE (2026-11-16)

- **CI was red on `9e7fea5`** (Pages never deployed). Two causes, both fixed:
  1. CI's `stable` toolchain (Rust 1.100) clippy flags `collapsible_match` in `production.rs` (local 1.93 did not). Folded the nested `if segment_just_finished` blocks into match guards; removed unused `serde-wasm-bindgen` dependency. Verified with `cargo +1.100.0 clippy --all-targets -- -D warnings`.
  2. `RUST-PROD-06` compared the golden fixture byte-for-byte; Linux libm produces last-ULP differences in synthetic `energyWh` vs the macOS-generated fixture. The test now compares the JSON tree structurally: event order, integers, strings and booleans exact; non-integer numbers within `1e-12` relative.
- Enabled GitHub Pages (`build_type=workflow`); all 4 CI jobs green and the site deploys from `main`.
- Converted `file:///Users/...` absolute links in all docs to repository-relative links so they work on GitHub.
- Added `apps/web/playwright.screenshots.config.ts` + `apps/web/screenshots/capture.spec.ts` (`npm run screenshots`) producing the README gallery in `docs/screenshots/` (live Pages for browser-only views, local full stack for Python-backed views).
- Rewrote `README.md` (feature tour per page/option, run modes, scenario table, architecture diagrams, setup, CI, limitations) and set the GitHub repository About (description, homepage, topics).
- **Observation recorded:** with default bounds the optimizer returned the same recommendation for `MIN_CYCLE_TIME`, `MIN_ENERGY_PER_UNIT` and `BALANCED`. Resolved in the next section.

## Model & Optimizer Overhaul + UI Polish — DONE (2026-11-16)

**Why the three objectives were identical.** The spec energy model had no term that penalised aggressive motion: idle standby (120 W) dominates, `k_vel·|q̇|` integrates to a speed-independent constant, and `k_acc·|q̈|` grows only linearly. Energy per unit therefore fell monotonically with speed, belt speed and shorter dwell, so every objective chose the same corner. Investigating this uncovered further defects:

| Finding | Impact | Fix |
|---|---|---|
| No resistive drive loss | Min Energy ≡ Min Cycle | Added `k_res,i·q̈ᵢ²` (`k_res = 0.010·τ_rated`) to spec §7.2, Rust `metrics.rs`, Python surrogate. Engine energy/unit now has a U-shaped minimum around 1.0× speed. |
| **Input belt ≥ ~0.45 m/s drove the next part into the one being lifted → Collision fault** | The optimizer's own recommendation (0.5 m/s belts) crashed in the real engine; "Zero-Collision ENFORCED" was untrue | Input-belt PLC interlock during `PICK_WORKPIECE` actuation/retraction (mirrors the existing output interlock). New `RUST-PROD-07` runs all 16 corners of the allowed parameter box; verified it fails without the interlock. |
| Python surrogate constants out of sync with `aokira-workcell.v1.json` (all 6 accel limits, J5/J6 velocity, J1/J6 torque) and patched with a multiplicative fudge factor | Analytical estimates drifted from the engine | Constants synced (guarded by `API-08`), fudge replaced by physically meaningful offsets (4×300 ms gripper + settle, hand-off ticks), calibrated with new `examples/energy_sweep.rs`: cycle error ≤ 1.0 %, energy error ≤ 0.8 % over a 60-point grid (`API-09`). |
| SLSQP stalled at its start point | Results not optimal (e.g. dwell 1420 ms when 1200 is better) | Optimizer now searches in normalised `[0,1]⁵` coordinates with unrounded/unquantised evaluations (rounding made finite-difference gradients zero), always keeps SLSQP's final iterate, `ftol 1e-9`. Min Energy within 0.1 % of a `differential_evolution` global reference (`API-10`). |
| `BALANCED` weights normalised by baseline | Energy range (few %) swamped by cycle range (~25 %) → Balanced ≡ Min Cycle | Compromise programming: find both anchors, normalise by the actual trade-off range, then apply weights. Balanced now lies strictly between the anchors. |
| Optimizer always cut process dwell to its lower bound | Dwell is a process requirement, not a robot tuning knob | UI locks dwell to the base scenario by default (opt-in checkbox). |
| `targetProductionRatePerHour = 60` | "Production efficiency" always clamped to 100 %, "target attained 461 %" | Target set to 330 u/h (takt ≈ 10.9 s); baseline efficiency now 90 %. |

**Resulting recommendations** (Scenario A, default bounds, dwell free): Min Cycle 1.40×/1.40× → 8 860 ms, 0.802 Wh · Balanced 1.40×/1.16× → 9 380 ms, 0.780 Wh · Min Energy 1.19×/0.78× → 10 780 ms, 0.765 Wh.

**UI**
- Optimization Center: objective hints, "Optimize process dwell" toggle, **Compare Objectives** (runs all three) with a results table, and a **cycle-time vs energy trade-off map** (presets, baseline, optimized points) replacing the bar chart that mixed u/h with "cWh = Wh×100".
- 3D scene: procedural Lightformer environment (offline-safe) so PBR metals no longer render black; neutral fill light; subtler selection emissive (cyan tint had turned the safety-orange links salmon); lighter structural graphite; transparent fence panels no longer write depth (they rendered as opaque black slabs); safety-yellow guard posts.
- Adaptive render quality: CPU-rasterised WebGL (SwiftShader/llvmpipe/Basic Render, e.g. VMs, CI, GPU acceleration off) skips the environment map and shadows and uses DPR 1. SwiftShader frame rate 0.54 → 11.6 FPS (it was 4.7 before this overhaul); GPU path unchanged at 60 FPS.
- Analytics and Optimization routes lazy-loaded: Recharts (113 kB gzip) no longer downloaded on landing.
- React Router v7 future flags enabled (removes console warnings).

**Verification:** Rust 23/23 (clippy 1.100 clean), Python 13/13 (ruff clean), Vitest 14/14, Playwright E2E 5/5 (E2E-04 now also asserts three distinct objective results).
