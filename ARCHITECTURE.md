# AoKira — System Architecture

**Document Role:** Canonical source of truth for overall system topology, technology stack, module organization across TypeScript, Rust/WASM, and Python, Web Worker protocol, data flow, error propagation, offline/graceful degradation, deployment topology, and runtime performance patterns.
**Related Canonical Docs:** [DATA_MODEL.md](DATA_MODEL.md), [SIMULATION_SPEC.md](SIMULATION_SPEC.md), [API_CONTRACT.md](API_CONTRACT.md).

---

## 1. System Topology

`AoKira` isolates **interactive visualization**, **real-time deterministic simulation**, and **batch numerical analytics/optimization** into three decoupled execution tiers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser Main Thread — React + TypeScript + Three.js / React Three Fiber │
│  • 5 Feature Views (Overview, Digital Twin, Sim Lab, Analytics, Opt)    │
│  • 3D Scene Graph & Camera Controls                                     │
│  • Zustand Stores (UI State, Sim Mirror, Event Buffer, Analytics Cache) │
└───────────────┬───────────────────────────────────────┬─────────────────┘
                │ postMessage (WorkerCommand/Snapshot)  │ HTTPS JSON (/api/v1)
                ▼                                       ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────┐
│ Web Worker — Rust compiled to WASM    │ │ Separate Container Service    │
│ (crates/aokira-engine)                │ │ Python 3.12 + FastAPI         │
│ • FK / DLS IK / Quintic Trajectory    │ │ (apps/api)                    │
│ • Capsule/Box Collision Checker       │ │ • KPI & Energy Analytics      │
│ • 8-Stage State Machine (20 ms clock) │ │ • Bottleneck Detection        │
│ • Conveyor / Gripper / Station        │ │ • Multi-Scenario Optimization │
│ • Deterministic Event & Metric Stream │ │ • Consistency Validation      │
└───────────────────────────────────────┘ └───────────────────────────────┘
```

### Key Architectural Invariant
The Rust/WASM Web Worker executes **100% client-side** inside the browser. The Python FastAPI backend is strictly an **analytical and optimization co-processor** and is never required on the frame-by-frame simulation path or for local simulation execution.

---

## 2. Technology Stack & Repository Structure

### 2.1 Locked Stack

| Tier | Technologies |
|---|---|
| **Frontend (`apps/web`)** | TypeScript, React 18+, Vite, Three.js, `@react-three/fiber`, `@react-three/drei`, Zustand, Tailwind CSS, Recharts, React Router |
| **Simulation Engine (`crates/aokira-engine`)** | Rust (stable), `wasm-bindgen`, `serde`, `serde_json`, `serde-wasm-bindgen`, `wasm-pack` |
| **Analytics & Optimization (`apps/api`)** | Python 3.12+, FastAPI, Pydantic v2, Uvicorn, NumPy, SciPy, Pytest, HTTPX |
| **Tooling & CI/CD** | Node.js / pnpm (or npm), Cargo, Playwright, GitHub Actions, Docker |

### 2.2 Target Repository Organization

```text
AoKira/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/              # Router, shell layout, error boundaries
│   │   │   ├── components/       # Shared UI primitives & 3D scene components
│   │   │   ├── features/
│   │   │   │   ├── overview/
│   │   │   │   ├── digital-twin/
│   │   │   │   ├── simulation/
│   │   │   │   ├── analytics/
│   │   │   │   └── optimization/
│   │   │   ├── hooks/            # Worker bridge, reduced-motion, API health
│   │   │   ├── services/         # Typed HTTP client for /api/v1
│   │   │   ├── stores/           # Zustand stores (twinUi, simulation, scenarios)
│   │   │   ├── workers/          # Dedicated simulation.worker.ts
│   │   │   └── styles/           # Tailwind & design tokens
│   │   └── package.json
│   └── api/
│       ├── app/
│       │   ├── main.py           # FastAPI app, CORS, lifespan, routers
│       │   ├── routes/           # health, analytics, scenarios, optimization
│       │   ├── schemas/          # Pydantic v2 models matching DATA_MODEL.md
│       │   ├── services/         # Orchestration layer
│       │   └── analytics/        # analytics, bottleneck, optimization, forecasting, energy, validation
│       ├── tests/
│       ├── pyproject.toml
│       └── Dockerfile
├── crates/
│   └── aokira-engine/
│       ├── src/
│       │   ├── lib.rs            # WASM exports & engine entry point
│       │   ├── kinematics/       # Standard DH FK & Damped Least Squares IK
│       │   ├── trajectory/       # Quintic interpolation & velocity/accel scaling
│       │   ├── collision/        # Capsule & box distance / near-collision checks
│       │   ├── robot/            # Joint state, bounds, home/jog validation
│       │   ├── gripper/          # Parallel jaw state & grasp validation
│       │   ├── conveyor/         # Input/output belt advance & sensor zones
│       │   ├── production/       # 8-stage state machine & fault handling
│       │   ├── scheduler/        # Fixed 20 ms tick accumulator & event sequencing
│       │   └── metrics/          # Event-derived counters & synthetic energy integral
│       └── Cargo.toml
├── data/
│   ├── workcell/                 # Canonical aokira-workcell.v1.json
│   ├── scenarios/                # Baseline & preset scenario JSONs (A-D)
│   └── fixtures/                 # Deterministic golden event/test fixtures
└── docs / root Markdown specs
```

---

## 3. Frontend Architecture (`apps/web`)

### 3.1 State Stores (Zustand)
1. **`useTwinUiStore`**: Camera preset, selected component ID, component visibility/isolation map, exploded-view slider (`0..1`), grid/axes toggle, labels/sensor toggle, collision-geometry toggle, WebGL availability flag.
2. **`useSimulationStore`**: `SimulationSnapshot` mirror, `SimulationRunStatus`, `ScenarioConfig`, rolling `SimulationEvent[]` log, live `ProductionMetrics`, manual joint jog overrides (only active when `runStatus === 'READY' | 'STOPPED'`), and Worker connection state.
3. **`useAnalyticsStore`**: Cached Python `/analytics/evaluate`, `/scenarios/compare`, and `/optimization/run` responses, backend health (`ONLINE | CHECKING | UNAVAILABLE`), and in-flight loading/error states.

### 3.2 3D Rendering Layer (React Three Fiber)
- **Single Shared Canvas**: Persistent or view-scoped `<Canvas>` wrapped in a `<WebGLErrorBoundary>` with graceful non-WebGL SVG/data fallback (`AC-17`).
- **Kinematic Parity**: Robot link `<group>` components read `snapshot.linkWorldPoses` from a mutable ref updated via Zustand transient subscription inside `useFrame`, preventing React component tree re-renders on every `20 ms` tick while staying strictly synchronized with Rust FK transforms (`AC-05`).
- **Exploded View Transform**: Applied purely in the visual layer as outward radial/axial offsets (`explodedFactor * componentExplosionVector`) on non-simulating inspection views (`Digital Twin`), leaving underlying Rust collision/kinematic coordinates untouched.

---

## 4. Rust/WASM Architecture (`crates/aokira-engine`)

### 4.1 Module Responsibilities
- **`kinematics`**: Loads `WorkcellConfig` DH parameters; computes `forward_kinematics(q)` returning all 7 `Pose3D` frames and `6x6` geometric Jacobian; runs `inverse_kinematics(target, seed)` with DLS + multi-seed fallback.
- **`trajectory`**: Plans `QuinticTrajectory` segments within effective velocity/acceleration limits; samples `q(t), dq(t), ddq(t)` and validates every sample against `JointConfig` bounds.
- **`collision`**: Evaluates capsule-capsule and capsule-box clearances against static obstacles, conveyors, station, and held workpiece; returns `CollisionReport`.
- **`robot`**: Maintains active `[JointState; 6]`, enforces manual jog bounds, validates payload mass (`<= 5.0 kg`).
- **`gripper`**: Advances jaw opening (`OPEN <-> CLOSED` over `300 ms`), verifies workpiece proximity (`<= 0.015 m`) on grasp.
- **`conveyor`**: Spawns workpieces deterministically on `input-conveyor`, advances positions along `+X_w`, detects sensor zones, retires exited output workpieces.
- **`production`**: Executes the 8-stage state machine (`IDLE` -> `CYCLE_COMPLETE` -> loop/idle or `FAULT`), handles `Pause`/`Resume`/`Stop`/`Reset`/`E-Stop`.
- **`scheduler`**: Owns `sim_time_ms: u64`, `tick_index: u64`, monotonic `event_seq: u64`, and fixed `step_tick(20)` execution.
- **`metrics`**: Aggregates `ProductionMetrics` incrementally from emitted `SimulationEvent` records and tick energy increments.

---

## 5. Web Worker Bridge Protocol

The dedicated worker (`apps/web/src/workers/simulation.worker.ts`) instantiates the WASM module once at startup and communicates strictly via typed discriminated messages:

| Direction | Message Type | Payload | Purpose |
|---|---|---|---|
| Main -> Worker | `INIT` | `{ workcellConfigJson?: string }` | Load WASM engine & verify default config |
| Main -> Worker | `LOAD_SCENARIO` | `{ scenario: ScenarioConfig }` | Reset & apply speed, mode, quantity, dwell, seed |
| Main -> Worker | `COMMAND` | `{ action: 'START' \| 'PAUSE' \| 'RESUME' \| 'STOP' \| 'RESET' \| 'ESTOP' }` | State machine lifecycle control |
| Main -> Worker | `STEP_TICKS` | `{ tickCount: number }` | Advance `N x 20 ms` deterministic simulation ticks |
| Main -> Worker | `SET_JOINTS` | `{ anglesRad: number[] }` | Manual joint inspection jog (allowed only when idle/stopped) |
| Main -> Worker | `SOLVE_IK` | `{ requestId: string; targetPose: Pose3D }` | Validate Cartesian target reachability & apply/preview |
| Main -> Worker | `SET_GRIPPER` | `{ open: boolean }` | Manual gripper test toggle in `Simulation Lab` |
| Worker -> Main | `READY` | `{ engineVersion: string; initialSnapshot: SimulationSnapshot }` | Confirm WASM initialization |
| Worker -> Main | `TICK_RESULT` | `{ snapshot: SimulationSnapshot; newEvents: SimulationEvent[]; metrics: ProductionMetrics }` | Latest deterministic state + newly emitted events |
| Worker -> Main | `IK_RESULT` | `{ requestId: string; ok: boolean; anglesRad?: number[]; fault?: FaultCode; message?: string }` | Synchronous/correlated IK response |
| Worker -> Main | `WORKER_ERROR` | `{ code: string; message: string }` | Unrecoverable WASM panic / worker exception |

---

## 6. Python Backend Architecture (`apps/api`)

`apps/api` is a stateless FastAPI service organized by separation of concerns:
- **`routes/`**: Thin HTTP endpoints (`/api/v1/health`, `/api/v1/analytics/evaluate`, `/api/v1/scenarios/compare`, `/api/v1/optimization/run`) delegating to `services/`.
- **`schemas/`**: Strict Pydantic v2 models enforcing `camelCase` JSON aliases matching `DATA_MODEL.md`.
- **`analytics/`**:
  - `analytics.py`: Independent KPI recomputation from raw `SimulationEvent[]` (cross-verifies throughput, cycle splits, utilization, downtime).
  - `bottleneck.py`: Stage-duration share analysis identifying the limiting constraint (e.g., robot transit vs. processing dwell vs. input conveyor starvation/feed speed).
  - `energy.py`: Component-level energy breakdown (`robotMotionWh`, `processingWh`, `conveyorWh`, `idleStandbyWh`) using identical synthetic formulas as `SIMULATION_SPEC.md`.
  - `forecasting.py`: Deterministic steady-state shift/hour throughput projections (`1h`, `8h` shift) with zero invented stochastic variance.
  - `optimization.py`: Constrained grid + SciPy bounded search (`SLSQP` / `differential_evolution` or deterministic grid refinement) over `robotSpeedScale`, `robotAccelScale`, `inputConveyorSpeedMps`, `outputConveyorSpeedMps`, `processingDwellMs` minimizing cycle time / energy subject to zero collisions and target throughput.
  - `validation.py`: Checks event sequence monotonicity, negative durations, and client-vs-server KPI delta (`|Δ| < 1e-4`).

---

## 7. Error Handling & Offline Degradation

1. **WASM / Worker Failure**: If WebAssembly instantiation fails or throws, Worker emits `WORKER_ERROR`; UI switches simulation panel to a clear diagnostic banner with a `Reload Engine` action while keeping `Digital Twin` static inspection operable.
2. **Simulation Faults (Expected Domain States)**: Collisions, unreachable IK targets, and joint violations never crash the worker; they emit `FAULT` snapshots + error events and remain inspectable until `Reset`.
3. **Python Backend Unavailability (`AC-15`)**:
   - App polls `/api/v1/health` on mount and lazily before optimization/analytics requests (timeout `3000 ms`).
   - When unreachable (network error, `5xx`, CORS failure, or GitHub Pages demo without hosted API URL configured via `VITE_API_BASE_URL`):
     - `Overview`, `Digital Twin`, `Simulation Lab`, and client-side live `ProductionMetrics` in `Performance Analytics` continue operating normally via Rust/WASM.
     - Python-dependent panels (Bottleneck Deep-Dive, Shift Forecast, Consistency Audit, Multi-Scenario Optimization) display an explicit **`Backend Unavailable`** status banner with retry button and clear explanation — never silent empty panels or uncaught Promise crashes.

---

## 8. Deployment & Performance Architecture

### 8.1 Deployment Topology
- **Frontend + Rust/WASM**: Built via Vite + `wasm-pack` in GitHub Actions and published to **GitHub Pages** (`https://orls967.github.io/AoKira/` with Vite `base: '/AoKira/'` configured via environment variable).
- **Python Backend**: Packaged via `apps/api/Dockerfile` (multi-stage Python slim image running `uvicorn app.main:app`) for container hosting (e.g., Cloud Run / Fly.io / Railway / Render / local Docker Compose). CORS origins explicitly allow local dev (`http://localhost:5173`) and the GitHub Pages origin (`https://orls967.github.io`).
- **Configuration Injection**: Frontend reads `VITE_API_BASE_URL` at build time; if unset, backend status gracefully enters `Unavailable` / `Not Configured` while local WASM simulation remains 100% functional.

### 8.2 Runtime Performance Strategy
- Keep `step_tick` allocations minimal in Rust and batch multiple `20 ms` ticks when playback speed `> 1x` into **one** `TICK_RESULT` `postMessage` per animation frame (`<= 60` messages/sec).
- Cap rendered 3D scene geometry complexity using low-poly procedural/CAD-grade meshes + shared PBR materials.
- Maintain a bounded UI log display window (e.g., latest `500` events rendered in virtualized/scrollable list) while keeping full cycle summary counters for long continuous runs.
