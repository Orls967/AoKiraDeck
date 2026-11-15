# AoKira — Design System & UI/UX Specification

**Document Role:** Canonical source of truth for `AoKira`'s visual identity, 3-layer hybrid aesthetic, color and typography tokens, layout system, navigation, detailed UI/interaction specs for all 5 pages, 3D viewport & camera behavior, animation principles, responsiveness, accessibility, `prefers-reduced-motion`, and WebGL fallback.
**Related Canonical Docs:** [PRD.md](PRD.md), [SIMULATION_SPEC.md](SIMULATION_SPEC.md), [DATA_MODEL.md](DATA_MODEL.md).

---

## 1. Visual Identity & Hybrid Aesthetic

`AoKira` blends precision Japanese-inspired cybernetic clarity (`Ao` 蒼 = azure/cyan precision on obsidian) with industrial automation rigor across three deliberate layers:

1. **Cinematic Layer (`Overview`)**: Hero 3D robotic cell with dramatic dark-studio lighting, subtle rim highlights, controlled camera sweep, and live animated production showcase.
2. **Industrial Layer (`Simulation Lab`, `Performance Analytics`, `Optimization Center`)**: High-density, low-glare control decks, structured status hierarchies, crisp borders, and unambiguous operational colors (`Green`, `Amber`, `Red`).
3. **Engineering Layer (`Digital Twin` & 3D Overlays)**: CAD-grade reference grid, XYZ coordinate triads, component ID callouts, joint axis indicators, exploded assembly spacing, and bounding collision wireframes.

### Design Principles
- **3D First, HUD Never Obscures**: Viewport owns center stage (`>= 65%` canvas area on desktop 3D views); inspector panels hug edges cleanly with collapsible drawers.
- **No Unnecessary Chrome**: Every animation, indicator, or chart reflects live simulation truth.
- **Zero Thermal Aesthetics**: No heat-map/thermal rainbow gradients; thermal physics is out of scope.

---

## 2. Color Palette & Material Tokens

### 2.1 UI Color System (Locked)

| Token Name | Hex | Role & Usage Rules |
|---|---|---|
| `--bg-canvas` | `#0B0F14` | Primary application background & 3D studio clear color |
| `--bg-surface` | `#141B23` | Sidebars, inspector panels, analytics cards (`1px solid #233040`) |
| `--bg-elevated` | `#1C2631` | Floating HUD bars, dropdowns, modal dialogs, active hover surfaces |
| `--accent-cyan` | `#36C5D9` | Primary interactive focus, active selection rings, camera preset active state (`Ao` signature) |
| `--accent-blue` | `#3B82F6` | Informational telemetry, trajectory trace lines, primary chart series |
| `--status-green` | `#22C55E` | `RUNNING` state, `OK` clearance, cycle completion, healthy backend badge |
| `--status-amber` | `#F59E0B` | `PAUSED`, `NEAR_COLLISION` warning, `Backend Unavailable` non-fatal degraded banner |
| `--status-red` | `#EF4444` | `FAULT`, `COLLISION`, `UNREACHABLE_TARGET`, `E-STOP` active |
| `--text-primary` | `#F1F5F9` | Primary headings, KPI readouts, component titles (`>= 12:1` contrast on `#141B23`) |
| `--text-secondary` | `#94A3B8` | Labels, units, metadata, axis ticks (`>= 4.8:1` contrast on `#141B23`) |
| `--border-subtle` | `#243242` | Hairline panel dividers and grid separators |

### 2.2 3D Robot & Workcell Material Palette
- **Robot Articulated Links (`link-1`..`link-5`)**: Matte/satin **Industrial Orange** (`#EA580C`, roughness `0.42`, metalness `0.20`).
- **Joint Housings, Pedestal & Base (`link-0`, `link-6`)**: Dark **Anodized Graphite** (`#1E242B`, roughness `0.55`, metalness `0.65`).
- **Gripper Jaws, Linear Rails & Fixture Clamps**: Brushed **Metallic Gray / Steel** (`#94A3B8`, roughness `0.28`, metalness `0.85`).
- **Conveyor Belts**: Dark textured elastomer (`#181C22`) with subtle moving chevron/tick strips driven by belt speed.
- **Workpiece (`60 x 60 x 60 mm`)**: Brushed aluminum billet (`#CBD5E1`) switching subtly on grasp/processed state with a cyan (`#36C5D9`) laser-etched status marker after `PROCESS_WORKPIECE`.
- **Collision & Selection Highlight Overrides**:
  - Selected component: `#36C5D9` wireframe/emissive edge rim.
  - Near-collision volume: translucent `#F59E0B` (`opacity: 0.35`).
  - Active collision volume: translucent `#EF4444` (`opacity: 0.55`) + solid red warning outline.

---

## 3. Typography & Spacing Scale

| Role | Font Stack | Weight & Features |
|---|---|---|
| **Display & Headings** | `'Space Grotesk', system-ui, sans-serif` | `600`–`700`, tight tracking (`-0.02em`) |
| **UI Body & Controls** | `'Inter', system-ui, sans-serif` | `400`–`500`, standard legibility |
| **Telemetry & Numeric Readouts** | `'JetBrains Mono', ui-monospace, monospace` | `font-variant-numeric: tabular-nums` mandatory on all live joint angles, timers, KPIs, and coordinates |
| **3D Engineering Labels** | Compact uppercase `11px`–`12px` mono/sans pill | High-contrast `#0B0F14/85` backing with `1px solid #36C5D9/40` border |

**Spacing & Radii**: `4px` base unit (`4 / 8 / 12 / 16 / 24 / 32px`). Industrial crisp corners: `4px` (`rounded`) for inputs/badges, `8px` (`rounded-lg`) for panels/cards, `9999px` for status pills.

---

## 4. Navigation & Application Shell

Top persistent header (`56px` height on desktop) displaying:
- **Left**: `AoKira` wordmark + subtle geometric twin glyph + `"SIMULATION ONLY"` pill.
- **Center Navigation (5 Routes)**:
  1. `01 Overview` (`/`)
  2. `02 Digital Twin` (`/digital-twin`)
  3. `03 Simulation Lab` (`/simulation`)
  4. `04 Performance Analytics` (`/analytics`)
  5. `05 Optimization Center` (`/optimization`)
- **Right System Pill Cluster**:
  - Rust/WASM Worker Status dot (`READY` / `RUNNING` / `FAULT`)
  - Python API Health badge (`API Online` / `API Offline`)

---

## 5. Page-by-Page Structure & Interaction Behavior

### 5.1 `01. Overview` (`/`)
- **Layout**: Full-bleed hero 3D viewport (`min-height: calc(100vh - 56px)`) with floating left editorial/technical intro card and bottom floating live workcell telemetry strip.
- **Content**:
  - Brand title **`AoKira`** + subtitle *"Industrial Robotic Workcell Digital Twin"* + tagline *"Design. Simulate. Optimize. Operate."*
  - Live animated manufacturing cycle executed via the Rust/WASM Worker (`Scenario A: Baseline` showcase loop) so displayed showcase metrics derive strictly from genuine simulation ticks rather than fake numbers.
  - System status strip (Engine `Rust/WASM 20ms`, DOF `6-Axis`, Backend status).
  - Live snapshot counters (`Completed Units`, `Active Stage`, `Avg Cycle Time` — synced with engine state).
  - Primary CTAs: **`Open Digital Twin`** (`/digital-twin`) and **`Launch Simulation Lab`** (`/simulation`).
- **Interaction**: Pointer hover parallax or drag orbit gently available; auto-orbit pauses immediately on user interaction.

### 5.2 `02. Digital Twin` (`/digital-twin`)
- **Layout**: Full-viewport 3D CAD workbench with:
  - **Left Dock (`280px`)**: Component Tree (all 10 canonical components) with visibility eye toggles, Isolate toggle, Reset Workcell button, and View Overlays (`Grid & Axes`, `Labels & Sensors`, `Collision Geometry`, `Exploded View` slider `0%–100%`).
  - **Center (`flex-1`)**: 3D Viewport + top-center Camera Preset toolbar (`Front`, `Side`, `Top`, `Isometric`, `Reset Camera`).
  - **Right Dock (`320px`)**: Context-sensitive **Component Information Panel**:
    - Shows name, `ComponentId`, category, physical dimensions, world coordinates, and live status.
    - **When `robot-arm` is selected (`AC-04`)**: Displays an interactive **6-Joint Inspector** listing `J1` through `J6` separately, each with current angle (`deg`), min/max angle limit bar, max velocity/acceleration specs, and interactive jog slider (enabled when simulation is idle/stopped, disabled with tooltip during active cycle) plus a quick **Cartesian TCP Target Test** input calling `SOLVE_IK`.

### 5.3 `03. Simulation Lab` (`/simulation`)
- **Layout**:
  - **Top/Left Control Deck (`340px`)**:
    - Transport Bar: `Start`, `Pause` / `Resume`, `Stop`, `Reset`, plus `E-Stop` trigger.
    - Mode & Parameters: `Single Cycle` vs `Continuous` vs `Fixed Quantity` (`targetQuantity` input), `Simulation Speed` (`0.25x`–`4.0x`), `Robot Motion Speed` (`20%`–`150%`), `Input/Output Conveyor Speed` (`0.05`–`0.60 m/s`), `Processing Dwell` (`ms`), and manual `Gripper Open/Close` test button.
  - **Center**: Live 3D Workcell Viewport showing real-time trajectory trace, active sensor beams, workpiece travel, and collision warning/fault meshes.
  - **Bottom / Right Telemetry Panel (`340px`)**:
    - **8-Stage Process Pipeline Stepper** highlighting current stage (`DETECT_OBJECT` ... `CYCLE_COMPLETE` or `FAULT`).
    - **Fault Banner** when `activeFault != null` displaying fault code, offending component, and `Reset` recovery CTA.
    - **Live Event Log** streaming timestamped `SimulationEvent` rows (`seq`, `simTimeMs`, `severity`, `stage`, `message`) with severity filter (`ALL`, `WARN/ERR`).

### 5.4 `04. Performance Analytics` (`/analytics`)
- **Layout**: Responsive industrial dashboard grid strictly populated from `SimulationEvent[]` and `ProductionMetrics` (`AC-12`):
  - **Zero-Data State**: If no simulation ticks/events exist yet, displays an explicit empty-state card prompting the user to run a cycle in `Simulation Lab` (never fake static KPIs).
  - **KPI Grid (10 Core Metrics)**: Total Units Produced, Units/Hour, Average Cycle Time, Robot Utilization %, Conveyor Utilization %, Idle Time, Downtime, Collision Events, Estimated Energy (`Wh` + synthetic disclaimer), Production Efficiency %.
  - **Charts (Recharts)**:
    1. Per-Cycle Breakdown Stacked Bar Chart (`robotMoveMs` vs `processDwellMs` vs `waitTimeMs`).
    2. Throughput & Energy per Unit Trend Line Chart across cycles.
    3. Time Allocation Donut/Bar (`Active`, `Processing Wait`, `Idle`, `Downtime`).
  - **Backend Enrichment Section**: Bottleneck Diagnostic Card, 8-Hour Deterministic Projection, Energy Sub-Component Breakdown, and Client–Server Consistency Check badge — displaying a clean `Backend Unavailable` card with retry action when `/api/v1` is offline (`AC-15`).

### 5.5 `05. Optimization Center` (`/optimization`)
- **Layout**: Split workbench:
  - **Left Configuration & Constraints Panel (`360px`)**:
    - Preset loader (`Scenario A: Baseline`, `Scenario B: Faster Robot Motion`, `Scenario C: Optimized Trajectory`, `Scenario D: Adjusted Conveyor Speed`) + custom scenario editor.
    - Optimization Objective selector (`Min Cycle Time`, `Min Energy/Unit`, `Balanced`) and constraint bounds (`minThroughputUnitsPerHour`, zero collisions locked).
    - Action buttons: **`Compare Scenarios`** (`/scenarios/compare`) and **`Run Optimization`** (`/optimization/run`).
  - **Right Comparison & Recommendation Canvas (`flex-1`)**:
    - Side-by-side Scenario Comparison Table (Cycle Time, Throughput, Idle %, Energy Estimate, Collisions, Bottleneck, Rank).
    - Multi-Scenario Comparison Charts (Throughput vs Energy scatter/bar).
    - **Recommended Configuration Card** showing percentage deltas vs Baseline and a **`Load into Simulation Lab`** button applying `recommendedScenario` directly to the Rust/WASM worker.
    - When backend is offline, displays an explicit `Optimization Service Unavailable` status banner without blocking scenario creation or local single-scenario simulation.

---

## 6. 3D Viewport & Camera Specifications

| Camera Preset | Position (`WorldFrame`, `m`) | LookAt Target (`m`) | Purpose |
|---|---|---|---|
| `Isometric` (Default) | `(2.05, 1.65, 2.20)` | `(0.00, 0.72, -0.05)` | Full workcell 3/4 view showing input, station, output, fence, E-stop |
| `Front` | `(0.00, 1.05, 2.65)` | `(0.00, 0.75, 0.00)` | Unobstructed frontal view of robot arm & conveyors |
| `Side` | `(2.65, 1.05, 0.05)` | `(0.00, 0.75, -0.10)` | Profile view of arm reach & rear processing station |
| `Top` | `(0.00, 3.30, 0.01)` | `(0.00, 0.00, -0.05)` | Plan CAD layout showing `Input (-X)` -> `Station (-Z)` -> `Output (+X)` |

- **OrbitControls Limits**: Polar angle `minPolarAngle = 0.05 rad`, `maxPolarAngle = Math.PI / 2 - 0.03` (prevents going under the floor), `minDistance = 0.80 m`, `maxDistance = 6.50 m`, damping enabled (`dampingFactor = 0.08`).

---

## 7. Animation, Responsiveness, Accessibility & Fallbacks

### 7.1 Animation Rules
- **Overview**: Slow sinusoidal/orbital camera drift (`<= 0.06 rad/s`), paused immediately on drag/wheel/focus.
- **Digital Twin**: Smooth damped interpolation (`300 ms` ease-out) when snapping between camera presets; smooth `250 ms` guided transitions on Exploded View slider updates.
- **Simulation Lab**: Purely engine-driven at fixed `20 ms` steps; no artificial CSS/spring smoothing that masks real joint or collision timing.

### 7.2 Responsive Breakpoints (`AC-16`)
- **Desktop (`>= 1280px`)**: Full persistent sidebars + `65%+` central 3D canvas + multi-column analytics grid.
- **Tablet (`768px`–`1279px`)**: Collapsible left/right slide-over drawers over `100%` width 3D canvas; 2-column analytics grid.
- **Mobile (`< 768px`)**: Stacked layout with fixed `42vh` 3D canvas above scrollable tabbed control/inspector sheet and single-column KPI cards; hamburger navigation drawer.

### 7.3 Accessibility & Reduced Motion (`AC-17`)
- Keyboard shortcuts (when canvas/app focused, non-input): `1`–`4` camera presets, `Space` Start/Pause, `R` Reset camera/view (explicitly documented in UI tooltip).
- Semantic landmarks (`<header>`, `<nav>`, `<main>`), `aria-live="polite"` for production stage updates, `aria-live="assertive"` for `FAULT` / `COLLISION` alerts.
- **`prefers-reduced-motion: reduce`**:
  - Disables `Overview` automatic camera orbit.
  - Camera preset transitions and exploded view slider offsets snap instantly (`0 ms` transition).
  - Pulsing sensor/beacon CSS animations render as steady solid indicators.

### 7.4 WebGL Context Loss & Fallback (`AC-17`)
- Before mounting Three.js `<Canvas>` and on `webglcontextlost`:
  - Check WebGL2/WebGL1 capability cleanly.
  - If unsupported or context lost unrecoverably, render **`WebGLFallbackView`**: a clean, interactive 2D SVG engineering schematic (`Top Plan` + `Front Elevation`) animated directly from `SimulationSnapshot` coordinates (`linkWorldPoses`, conveyor belts, workpiece positions, collision highlight indicators), keeping 100% of joint controls, simulation controls, event log, analytics, and optimization usable.
