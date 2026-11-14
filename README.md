# AoKira

**Industrial Robotic Workcell Digital Twin**
*Interactive 3D Manufacturing Simulation, Robot Motion Planning & Production Optimization Platform*
Tagline: **Design. Simulate. Optimize. Operate.**

> **Project Phase Notice:** `AoKira` is currently at **Phase 0 (Documentation Lock)**. The Markdown specification package is complete and ready for autonomous phased implementation starting at Phase 1 (see [flow.md](file:///Users/orl123456/Documents/AoKira/flow.md)). Application source directories (`apps/`, `crates/`, `data/`) shown in the target structure below will be created during Phases 1–5.
>
> **Simulation-Only Disclaimer:** `AoKira` is a deterministic synthetic engineering demonstrator. It is **not** physical robot control firmware, PLC/ROS 2 middleware, a certified industrial safety system, or calibrated electrical metering hardware.

---

## 1. Overview & Key Features

`AoKira` unifies interactive 3D CAD inspection, deterministic Rust/WebAssembly robot kinematics, event-driven production telemetry, and Python-based scenario optimization around a single virtual manufacturing workcell:

- **01. Overview (`/`)**: Cinematic 3D workcell showcase, animated manufacturing cycle, live engine/API status, and direct entry into engineering tools.
- **02. Digital Twin (`/digital-twin`)**: Orbit/pan/zoom + camera presets (`Front`, `Side`, `Top`, `Isometric`), selection and isolation across all 10 workcell components, 6-joint manual inspection & jogging (`J1`–`J6`), exploded view slider, coordinate axes/grid, sensor indicators, and collision bounding geometry visualization.
- **03. Simulation Lab (`/simulation`)**: Fixed `20 ms` deterministic simulation clock running in a Rust/WASM Web Worker (`Start`, `Pause`, `Resume`, `Stop`, `Reset`, `E-Stop`), single/fixed/continuous production modes, speed scaling, manual gripper toggle, 8-stage pipeline tracking, live event log, and explicit collision/IK fault feedback.
- **04. Performance Analytics (`/analytics`)**: Event-derived KPIs (throughput, cycle time, robot/conveyor utilization, idle/downtime, collisions, synthetic energy estimates, efficiency) enriched by Python FastAPI bottleneck and consistency diagnostics.
- **05. Optimization Center (`/optimization`)**: Multi-scenario comparison (`Baseline`, faster motion, optimized trajectory, conveyor tuning) and constrained parameter search via Python/SciPy with one-click loading into `Simulation Lab`.
- **Offline-Capable Core**: 3D visualization and the entire Rust/WASM pick-and-place simulation engine run locally in the browser even when the Python backend is offline.

---

## 2. Architecture & Technology Stack

```text
Browser UI (TypeScript / React / Three.js + React Three Fiber)
   ├──► Dedicated Web Worker ──► Rust/WASM Core (aokira-engine: FK/IK, Quintic, Collision, 8-Stage SM)
   └──► HTTPS REST (/api/v1) ──► Containerized Python + FastAPI (Analytics, Bottleneck, SciPy Optimization)
```

| Layer | Technologies |
|---|---|
| **Frontend** | TypeScript, React, Vite, Three.js, `@react-three/fiber`, `@react-three/drei`, Zustand, Tailwind CSS, Recharts |
| **Simulation Core** | Rust, `wasm-bindgen`, `serde`, `wasm-pack`, Web Workers |
| **Analytics & Optimization** | Python 3.12+, FastAPI, Pydantic v2, NumPy, SciPy, Pytest |
| **Deployment** | GitHub Pages (Frontend + WASM) + Dockerized Python Service + GitHub Actions |

---

## 3. Target Repository Structure

*(Target organization to be scaffolded during Phases 1–5; see [ARCHITECTURE.md](file:///Users/orl123456/Documents/AoKira/ARCHITECTURE.md) for module responsibilities.)*

```text
AoKira/
├── apps/
│   ├── web/                # React + TypeScript + Three.js / R3F frontend & Web Worker
│   └── api/                # Python FastAPI analytics & optimization service + Dockerfile
├── crates/
│   └── aokira-engine/      # Rust -> WebAssembly simulation core
├── data/
│   ├── workcell/           # Canonical single-source-of-truth config (aokira-workcell.v1.json)
│   ├── scenarios/          # Preset Scenarios A-D
│   └── fixtures/           # Golden deterministic event/test fixtures
├── PRD.md                  # Product requirements & acceptance criteria (AC-01..AC-18)
├── ARCHITECTURE.md         # System topology, worker protocol & deployment
├── SIMULATION_SPEC.md      # Kinematics (DH/FK/IK), trajectories, collision & state machine
├── API_CONTRACT.md         # TypeScript <-> Python /api/v1 REST contracts
├── DATA_MODEL.md           # Canonical entity schemas, events, metrics & ownership
├── DESIGN.md               # Hybrid visual design system, pages & accessibility
├── TEST_PLAN.md            # Test suites, baseline protocol & AC verification matrix
├── flow.md                 # Phased execution roadmap (Phases 0-8)
├── constraints.md          # Engineering rules & autonomous agent guardrails
└── README.md               # Project entry point
```

---

## 4. Prerequisites & Planned Commands (Phase 1+)

### Prerequisites
- **Node.js** `>= 20` and npm/pnpm
- **Rust** stable toolchain + `wasm-pack` (`rustup target add wasm32-unknown-unknown`)
- **Python** `>= 3.12` (with `uv` or `venv` + `pip`)
- **Docker** (optional, for containerized API verification)

### Planned Development, Test & Build Workflow
*(Commands below apply once Phases 1–5 scaffold `crates/aokira-engine`, `apps/web`, and `apps/api` as specified in [flow.md](file:///Users/orl123456/Documents/AoKira/flow.md).)*

```bash
# 1. Build & test Rust/WASM simulation core
cd crates/aokira-engine
cargo test
cargo clippy --all-targets -- -D warnings
wasm-pack build --target web --out-dir ../../apps/web/src/wasm

# 2. Install & run Python FastAPI analytics service
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
uvicorn app.main:app --reload --port 8000

# 3. Install, test & run Web frontend
cd apps/web
npm install
npm run test          # Vitest unit/integration suite
npm run dev           # Vite local server (http://localhost:5173)
npm run build         # Production static + WASM bundle (dist/)
```

---

## 5. Deployment Overview

- **Frontend + Rust/WASM**: Automated build via GitHub Actions deploying `apps/web/dist` (with `VITE_BASE_PATH=/AoKira/`) to **GitHub Pages** (`https://orls967.github.io/AoKira/`).
- **Python Analytics Service**: Built from `apps/api/Dockerfile` and deployed to a standalone container host configured via `VITE_API_BASE_URL` (CORS restricted to local dev and GitHub Pages origins). When `VITE_API_BASE_URL` is unset or unreachable, the browser application operates cleanly in offline local-simulation mode.

---

## 6. Documentation Index (Canonical Sources of Truth)

| Document | Canonical Authority For |
|---|---|
| [PRD.md](file:///Users/orl123456/Documents/AoKira/PRD.md) | Vision, personas, user journeys, functional/non-functional scope, exclusions, `AC-01`–`AC-18` |
| [DATA_MODEL.md](file:///Users/orl123456/Documents/AoKira/DATA_MODEL.md) | Canonical entities, units, `aokira-workcell.v1.json` authority, events, metrics, ownership |
| [SIMULATION_SPEC.md](file:///Users/orl123456/Documents/AoKira/SIMULATION_SPEC.md) | Coordinate frames, workcell coordinates, DH/FK/IK, quintic planning, collision, 8-stage SM, energy |
| [ARCHITECTURE.md](file:///Users/orl123456/Documents/AoKira/ARCHITECTURE.md) | 3-tier system topology, Worker messages, Rust/Python/React module structure, deployment, performance |
| [API_CONTRACT.md](file:///Users/orl123456/Documents/AoKira/API_CONTRACT.md) | `/api/v1` endpoints, Pydantic/TS request/response schemas, error envelopes, offline rules |
| [DESIGN.md](file:///Users/orl123456/Documents/AoKira/DESIGN.md) | Hybrid visual tokens, typography, 5-page layouts, camera presets, responsive, reduced-motion, WebGL fallback |
| [TEST_PLAN.md](file:///Users/orl123456/Documents/AoKira/TEST_PLAN.md) | Rust/Python/Frontend/E2E test specs, baseline protocol, `AC-01`–`AC-18` verification matrix |
| [flow.md](file:///Users/orl123456/Documents/AoKira/flow.md) | Phases 0–8 execution sequence, dependencies, validation gates, Definition of Done |
| [constraints.md](file:///Users/orl123456/Documents/AoKira/constraints.md) | Architectural invariants, simulation rules, Git rules, prohibited shortcuts, agent escalation rules |

---

## 7. Known Limitations

1. **Synthetic Physics & Energy**: Conveyor transport, rigid grasp attachment, capsule/box collision checking, and power estimates are simplified demonstrator models — not full rigid-body physics, CAD mesh-exact contact, or calibrated industrial metering.
2. **Pre-Implementation Status**: Only Phase 0 documentation exists in this repository at present; no application runtime code or measured benchmarks exist yet.
3. **Stateless API**: No user accounts, cloud persistence, or multi-user collaboration exist in this release.
