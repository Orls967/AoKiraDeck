# AoKira

**Industrial Robotic Workcell Digital Twin**
*Interactive 3D Manufacturing Simulation, Robot Motion Planning & Production Optimization Platform*
Tagline: **Design. Simulate. Optimize. Operate.**

> **Project Status:** **Implemented (Phases 1–8 Complete)** — Rust/WASM kinematic & production simulation core (`crates/aokira-engine`), Python/FastAPI analytics & SciPy optimization backend (`apps/api`), interactive React + Three.js/R3F frontend (`apps/web`), Playwright E2E suite, and GitHub Actions CI/Pages deployment workflow (`.github/workflows/ci-deploy.yml`).
>
> **Simulation-Only Disclaimer:** `AoKira` is a deterministic synthetic engineering demonstrator. It is **not** physical robot control firmware, PLC/ROS 2 middleware, a certified industrial safety system, or calibrated electrical metering hardware. All energy numbers carry the explicit label: *"Synthetic engineering estimate only; not real electrical metering."*

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

## 3. Repository Structure

*(Implemented workspace layout matching [ARCHITECTURE.md](file:///Users/orl123456/Documents/AoKira/ARCHITECTURE.md).)*

```text
AoKira/
├── .github/workflows/
│   └── ci-deploy.yml       # Rust/WASM, FastAPI/Docker, Vitest, Playwright E2E & Pages deploy
├── apps/
│   ├── web/                # React + TypeScript + Three.js/R3F frontend, Worker & Playwright E2E
│   └── api/                # Python FastAPI analytics & SciPy optimization service + Dockerfile
├── crates/
│   └── aokira-engine/      # Rust -> WebAssembly simulation core + perf_bench example
├── data/
│   ├── workcell/           # Canonical single-source-of-truth config (aokira-workcell.v1.json)
│   ├── scenarios/          # Preset Scenarios A-D
│   └── fixtures/           # Golden deterministic event/test fixtures
├── scripts/
│   ├── build-wasm.sh       # Builds WASM artifacts into apps/web/src/wasm
│   └── test-all.sh         # Unified Rust, Python & Web verification runner
├── PRD.md                  # Product requirements & acceptance criteria (AC-01..AC-18)
├── ARCHITECTURE.md         # System topology, worker protocol & deployment
├── SIMULATION_SPEC.md      # Kinematics (DH/FK/IK), trajectories, collision & state machine
├── API_CONTRACT.md         # TypeScript <-> Python /api/v1 REST contracts
├── DATA_MODEL.md           # Canonical entity schemas, events, metrics & ownership
├── DESIGN.md               # Hybrid visual design system, pages & accessibility
├── TEST_PLAN.md            # Test suites, baseline protocol & AC verification matrix
├── flow.md                 # Phased execution roadmap (Phases 0-8)
├── constraints.md          # Engineering rules & autonomous agent guardrails
├── IMPLEMENTATION_PROGRESS.md
└── README.md               # Project entry point
```

---

## 4. Prerequisites, Setup & Verification Commands

### Prerequisites
- **Node.js** `>= 20` and `npm`
- **Rust** stable toolchain + `wasm-pack` (`rustup target add wasm32-unknown-unknown`)
- **Python** `>= 3.12` (`venv` + `pip`)
- **Google Chrome / Playwright** (for WebGL browser E2E verification)
- **Docker** (optional locally; automated in CI for `apps/api/Dockerfile`)

### Local Development, Test & Build Workflow

```bash
# 1. Build & test Rust/WASM simulation core
./scripts/build-wasm.sh
cd crates/aokira-engine
cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
cargo run --release --example perf_bench

# 2. Install, verify & run Python FastAPI analytics service
cd apps/api
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
ruff check . && pytest
uvicorn app.main:app --reload --port 8000

# 3. Install, test, build & E2E-verify Web frontend
cd apps/web
npm install
npm run typecheck
npm run test          # Vitest unit/component suite (13 tests)
npm run dev           # Vite local server (http://localhost:5173)
VITE_API_BASE_URL="http://127.0.0.1:8000" npm run build
npm run test:e2e      # Playwright Chrome WebGL E2E suite (E2E-01..05, requires API + preview)

# 4. Run full unified verification (Rust + Python + Web)
./scripts/test-all.sh

# 5. Optional Docker image build for FastAPI backend
docker build -t aokira-api apps/api
docker run -p 8000:8000 aokira-api
```

---

## 5. Deployment Overview

- **Frontend + Rust/WASM**: Automated build via [ci-deploy.yml](file:///Users/orl123456/Documents/AoKira/.github/workflows/ci-deploy.yml) deploying `apps/web/dist` (built with `VITE_BASE_PATH=/AoKira/` and `404.html` SPA route fallback) to **GitHub Pages** (`https://orls967.github.io/AoKira/`).
- **Python Analytics Service**: Built from [Dockerfile](file:///Users/orl123456/Documents/AoKira/apps/api/Dockerfile) and configured in GitHub repository variable `VITE_API_BASE_URL` (CORS restricted to local dev and GitHub Pages origins). When `VITE_API_BASE_URL` is unset or unreachable, the browser application automatically operates in full offline Rust/WASM mode with explicit UI badges (`API Offline`).

---

## 6. Verified Test Suites & Measured Performance Baselines

| Suite / Metric | Measured Result |
|---|---|
| **Rust Engine (`cargo test`)** | `22 passed, 0 failed` (`clippy -D warnings` & `fmt --check` clean) |
| **Python FastAPI (`pytest`)** | `8 passed, 0 failed` (`ruff check .` clean) |
| **Web Frontend (`vitest run`)** | `6 files / 13 passed` (`tsc --noEmit` clean) |
| **Playwright E2E (`E2E-01`–`E2E-05`)** | `5 passed` (real Chrome WebGL + Uvicorn backend) |
| **Rust 1,000 Ticks (`perf_bench --release`)** | `22.917 ms` total (`0.0229 ms/tick`) |
| **Rust 3-Seed DLS IK (`perf_bench --release`)** | `0.0133 ms` avg / `0.0148 ms` worst (reachable); `0.0013 ms` unreachable reject |
| **FastAPI `/api/v1/analytics/evaluate` (1,000 events)** | `22.61 ms` (HTTP `200`) |
| **FastAPI `/api/v1/optimization/run` (90 evals)** | `7.77 ms` (HTTP `200`) |
| **WebGL Canvas rAF Frame Rate (`E2E-01`)** | `60.5 FPS` |
| **WASM Production Binary (`aokira_engine_bg.wasm`)** | `270.35 kB` raw / `108.62 kB` gzip (`vite build` in `2.93s`) |

---

## 7. Documentation Index (Canonical Sources of Truth)

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

## 8. Known Limitations

1. **Synthetic Physics & Energy**: Conveyor transport, rigid grasp attachment, capsule/box collision checking, and power estimates are simplified demonstrator models — not full rigid-body physics, CAD mesh-exact contact, or calibrated industrial metering.
2. **Stateless API**: No user accounts, database persistence, or multi-user collaboration exist in this release.
3. **Container Runtime Environment**: `apps/api/Dockerfile` includes a non-root Python 3.12 runtime and `/api/v1/health` check verified in CI (`.github/workflows/ci-deploy.yml`), while local macOS verification had `/usr/local/bin/docker` installed without an active Docker Desktop daemon socket.
