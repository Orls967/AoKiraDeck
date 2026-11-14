# AoKira — Engineering Constraints & Agent Execution Rules

**Document Role:** Mandatory engineering guardrails, architectural boundaries, simulation invariants, Git hygiene rules, and autonomous execution protocols governing all implementation sessions (including Claude Code). Violations fail phase validation gates in [flow.md](file:///Users/orl123456/Documents/AoKira/flow.md).

---

## 1. Architecture & Subsystem Boundaries

1. **Frontend (`apps/web`) Owns Rendering & Orchestration Only**:
   - Never re-implement DH forward kinematics, DLS inverse kinematics, quintic trajectory generation, or collision math in TypeScript. All motion and collision truth comes from `crates/aokira-engine`.
   - Never run simulation ticks (`step_tick`) on the main UI thread; execute all WASM simulation inside `simulation.worker.ts`.
   - Never trigger React state re-renders inside Three.js `useFrame` loops; update 3D object transforms via mutable refs / transient subscriptions from `SimulationSnapshot`.
2. **Rust Engine (`crates/aokira-engine`) Owns Deterministic Simulation Only**:
   - Maintain strict isolation from DOM, `window`, browser clocks, or HTTP clients.
   - Never panic across the `wasm-bindgen` FFI boundary (`unwrap()`/`expect()` prohibited on external inputs or solver convergence paths; return typed `Result` / `FaultCode`).
3. **Python Service (`apps/api`) Owns Batch Analytics & Optimization Only**:
   - Remain strictly stateless across HTTP requests.
   - Never become a runtime dependency for starting, stepping, or inspecting 3D pick-and-place simulations.
4. **Single Source of Truth**:
   - Load all robot link dimensions, DH parameters, joint bounds, collision primitives, and station coordinates from `data/workcell/aokira-workcell.v1.json`. Duplicating competing coordinate constants across files is prohibited.

---

## 2. Simulation Correctness & Determinism Invariants

1. **Deterministic Clock**: Simulation time advances exclusively in integer `20 ms` fixed steps (`timestepMs = 20`). Browser frame intervals (`dt`) may only determine *how many* fixed `20 ms` ticks to batch (clamped at `<= 200 ms` per frame), never the physics/motion integration step size itself.
2. **IK Does Not Imply Collision-Free**: Inverse kinematics convergence validates pose reachability within joint bounds only. Collision detection (`collision` module) must run independently for planned trajectories and on every simulation tick.
3. **Explicit Faults Over Silent Clamping**: Unreachable Cartesian targets or joint limit violations must return `UNREACHABLE_TARGET` or `JOINT_LIMIT_VIOLATION` without corrupting live joint state. Never silently clamp an invalid target into an approximate wrong pose during IK.
4. **Event-Derived Metrics Only**: Every KPI on `Overview`, `Performance Analytics`, and `Optimization Center` must trace back to `SimulationEvent[]` and cumulative tick energy integrals. Hardcoded, static, or random placeholder KPIs are strictly prohibited.
5. **No OEM Imitation & No Thermal Fiction**: Keep the generic 6-axis robot geometry defined in [SIMULATION_SPEC.md](file:///Users/orl123456/Documents/AoKira/SIMULATION_SPEC.md). Never introduce thermal simulation or brand-copied robot kinematics.

---

## 3. Coding Conventions & Quality Standards

- **TypeScript (`apps/web`)**:
  - `"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, zero `any` types at module boundaries.
  - Use Tailwind tokens defined in [DESIGN.md](file:///Users/orl123456/Documents/AoKira/DESIGN.md); enforce `tabular-nums` on numeric readouts.
- **Rust (`crates/aokira-engine`)**:
  - Must pass `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings`.
  - Keep math modules pure, deterministic (`f64` internally), and unit-tested independently of `wasm-bindgen`.
- **Python (`apps/api`)**:
  - Python `3.12+` type annotations required everywhere; Pydantic v2 models must mirror [DATA_MODEL.md](file:///Users/orl123456/Documents/AoKira/DATA_MODEL.md) and [API_CONTRACT.md](file:///Users/orl123456/Documents/AoKira/API_CONTRACT.md) with `camelCase` JSON aliases.
  - Validate finite floats (`allow_nan=False` / explicit rejection of `NaN`/`Infinity`).
  - Pass `ruff check` and `pytest` cleanly.
- **General Code Hygiene**:
  - Do not duplicate logic across modules; extract shared helpers cleanly.
  - Preserve existing unrelated comments and documentation unless superseded by an updated spec.

---

## 4. Scope Protection & Prohibited Shortcuts

- **Explicitly Prohibited Scope Creep**: Do not implement authentication/login, payment, multi-user databases, PLC/OPC-UA/ROS 2 bridges, general-purpose rigid-body physics, OEM CAD downloads, or live factory telemetry.
- **Mandatory Disclaimers**: Never claim or imply `AoKira` is certified robot control software, ISO safety software, or real electrical metering hardware.
- **Prohibited Engineering Shortcuts**:
  - No `sleep`-based async timing hacks in tests or simulation loops.
  - No skipped (`test.skip` / `@pytest.mark.skip` / `#[ignore]`) acceptance tests to manufacture green builds.
  - No empty placeholder source files created solely to mimic directory structure ahead of actual phase work.
  - Never report tests or performance budgets as passing/met unless actually executed after the final edit with all cases passing.

---

## 5. Git Workflow & Safety Rules

1. **Granular Validated Commits**: Commit small, logically complete units after verifying builds/tests/lints pass (using Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`).
2. **Explicit File Staging**: Never run blind `git add -A` or `git add .` when untracked local files or OS artifacts (`.DS_Store`, `.env`) exist; stage explicit paths.
3. **Never Commit Sensitive or Generated Artifacts**: Never commit `.env`, API keys, tokens, `node_modules/`, `target/`, `pkg/`, or build outputs.
4. **Prohibited Git Operations**:
   - Never run destructive commands (`git reset --hard`, `git clean -fd`, `git checkout --` on user edits).
   - Never force-push (`git push --force`).
   - **Never push to GitHub (`git push`) or alter remotes without explicit user authorization.**

---

## 6. Documentation Maintenance & Autonomous Agent Rules

1. **Canonical Doc First**: If implementation uncovers a necessary change to a kinematic constant, API payload field, or data type, update the single canonical document (`SIMULATION_SPEC.md`, `API_CONTRACT.md`, or `DATA_MODEL.md`) first before or alongside code changes so docs never drift.
2. **Autonomous Execution Scope**: An implementation agent (e.g. Claude Code) may independently decide internal module refactoring, helper layout, UI micro-copy, and unit test structure inside locked specifications.
3. **Mandatory Escalation Triggers**: Stop and ask the user **only** when a decision would materially alter product scope, change the `AoKira` brand identity, deviate from the 3-tier `TypeScript + Rust/WASM + Python/FastAPI` architecture, modify remote Git configuration, or push/deploy to production.
