# AoKira — Canonical Data Model Specification

**Document Role:** Canonical source of truth for all domain entities, single-source-of-truth configuration artifacts, data types, unit conventions, event schemas, metrics structures, data ownership, and lifecycle rules across TypeScript, Rust/WASM, and Python.
**Status:** Locked for Implementation (Phase 0 Documentation Baseline)

---

## 1. Global Conventions & Single Source of Truth

### 1.1 Canonical Units
All computational, persistence, and wire schemas use **SI base units and integer milliseconds**:

| Quantity | Canonical Wire / Compute Unit | UI Display Unit (Formatted Only) |
|---|---|---|
| Length / Position | `m` (meters, `f64`) | `mm` or `m` |
| Angle | `rad` (radians, `f64`) | `deg` (`°`) |
| Angular Velocity | `rad/s` (`f64`) | `deg/s` |
| Angular Acceleration | `rad/s^2` (`f64`) | `deg/s^2` |
| Linear Velocity | `m/s` (`f64`) | `m/s` |
| Mass | `kg` (`f64`) | `kg` |
| Simulation Time | `ms` (unsigned integer `u64` / `int`) | `s` or `mm:ss.ms` |
| Energy | `Wh` (Watt-hours, `f64`) and `J` (Joules, `f64`) | `Wh` / `kWh` |

### 1.2 Single Source of Truth for Physical Parameters
All robot geometry, DH parameters, joint bounds, collision primitives, and workcell station coordinates live in **one versioned JSON file**:
- **Canonical Asset Path:** `data/workcell/aokira-workcell.v1.json`
- **Rust Consumption:** Embedded at compile time via `include_str!` (with optional validated override for unit tests) inside `crates/aokira-engine`.
- **TypeScript Consumption:** Imported directly as a static typed JSON module by `apps/web` to instantiate Three.js link meshes, pedestals, conveyors, sensors, and safety boundaries.
- **Python Consumption:** Validated via Pydantic models in `apps/api` when receiving scenario configs or simulation runs.

No component in `apps/web`, `crates/aokira-engine`, or `apps/api` may hardcode competing dimensions, joint limits, or station positions.

---

## 2. Canonical Component Registry

All 10 selectable workcell assemblies use fixed string IDs across 3D raycasting, UI inspection, collision reporting, and event logging:

| Component ID (`ComponentId`) | Display Name | Category | Selectable Sub-Targets |
|---|---|---|---|
| `robot-arm` | 6-Axis Articulated Robot | Manipulator | `link-0`..`link-6`, `J1`..`J6` |
| `gripper` | Two-Finger Parallel Gripper | EndEffector | `gripper-body`, `jaw-left`, `jaw-right` |
| `input-conveyor` | Input Belt Conveyor | Transport | `input-belt`, `input-frame` |
| `output-conveyor` | Output Belt Conveyor | Transport | `output-belt`, `output-frame` |
| `processing-station` | Processing & Assembly Station | Workstation | `station-fixture`, `station-head` |
| `workpiece` | Synthetic Cubic Workpiece | Material | `workpiece:<uuid-or-seq>` |
| `robot-pedestal` | Robot Mounting Pedestal | Structure | — |
| `safety-fence` | Perimeter Safety Enclosure | SafetyBoundary | — |
| `estop-station` | Emergency Stop Console | Control | — |
| `sensor-array` | Presence Sensors & Status Beacons | Instrumentation | `sensor-input`, `sensor-station`, `sensor-output`, `beacon-tower` |

---

## 3. Core Entity Definitions

*(Types below are written in canonical language-neutral TypeScript/JSON notation; Rust `serde` structs and Python `Pydantic v2` models must preserve exact field names in `camelCase` on JSON wire boundaries.)*

### 3.1 Transform & Geometry Primitives

```ts
export interface Vec3 {
  x: number; // meters
  y: number; // meters
  z: number; // meters
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Pose3D {
  position: Vec3;
  orientation: Quat;
}

export interface CapsuleVolume {
  kind: 'capsule';
  ownerId: string;        // e.g. "link-2", "gripper"
  localStart: Vec3;       // relative to owner frame
  localEnd: Vec3;
  radius: number;         // meters
}

export interface BoxVolume {
  kind: 'box';
  ownerId: string;        // e.g. "input-conveyor", "safety-fence-north"
  center: Vec3;           // WorldFrame or owner local frame
  halfExtents: Vec3;      // meters
  orientation: Quat;
}

export type CollisionPrimitive = CapsuleVolume | BoxVolume;
```

### 3.2 Robot & Joint Models

```ts
export type JointId = 'J1' | 'J2' | 'J3' | 'J4' | 'J5' | 'J6';

export interface DhParameters {
  thetaOffsetRad: number; // added to joint angle q_i
  dMeters: number;        // link offset along Z_{i-1}
  aMeters: number;        // link length along X_i
  alphaRad: number;       // link twist around X_i
}

export interface JointConfig {
  id: JointId;
  index: 0 | 1 | 2 | 3 | 4 | 5;
  name: string;                  // e.g. "Base Yaw", "Shoulder Pitch"
  axisLocal: [number, number, number]; // [0, 0, 1] in DH local frame
  dh: DhParameters;
  minAngleRad: number;
  maxAngleRad: number;
  maxVelocityRadPerSec: number;
  maxAccelerationRadPerSec2: number;
  homeAngleRad: number;
  ratedTorqueNm: number;         // synthetic parameter for energy model
}

export interface RobotConfig {
  modelId: string;               // "aokira-6dof-generic-v1"
  dof: 6;
  payloadLimitKg: number;        // 5.0
  baseMountPose: Pose3D;         // BaseFrame -> WorldFrame transform
  toolTcpOffsetMeters: Vec3;     // [0, 0, 0.120] in FlangeFrame
  joints: [JointConfig, JointConfig, JointConfig, JointConfig, JointConfig, JointConfig];
  collisionCapsules: CapsuleVolume[];
}

export interface JointState {
  id: JointId;
  angleRad: number;
  velocityRadPerSec: number;
  accelerationRadPerSec2: number;
  atLimit: boolean;
  utilizationRatio: number;      // |angle| / limit span or |vel| / maxVel
}
```

### 3.3 Workcell Station & Component Models

```ts
export interface ConveyorConfig {
  id: 'input-conveyor' | 'output-conveyor';
  originWorld: Vec3;
  directionUnit: Vec3;           // [+1, 0, 0]
  lengthMeters: number;
  widthMeters: number;
  beltTopY: number;              // 0.720 m
  defaultSpeedMetersPerSec: number; // 0.20
  minSpeedMetersPerSec: number;     // 0.05
  maxSpeedMetersPerSec: number;     // 0.60
  targetZoneWorld: Vec3;         // Pick point (input) or Place point (output)
  collisionBox: BoxVolume;
}

export interface ProcessingStationConfig {
  id: 'processing-station';
  originWorld: Vec3;
  fixtureTopY: number;           // 0.720 m
  targetPoseWorld: Pose3D;
  defaultProcessTimeMs: number;  // 2500 ms
  collisionBoxes: BoxVolume[];
}

export interface WorkcellConfig {
  schemaVersion: '1.0.0';
  workcellId: 'aokira-cell-v1';
  robot: RobotConfig;
  gripper: {
    id: 'gripper';
    maxOpeningMeters: number;    // 0.080 m
    minOpeningMeters: number;    // 0.000 m
    closedWidthForPartMeters: number; // 0.060 m
    actuationTimeMs: number;     // 300 ms
    massKg: number;              // 0.85 kg
  };
  inputConveyor: ConveyorConfig;
  outputConveyor: ConveyorConfig;
  processingStation: ProcessingStationConfig;
  workpieceTemplate: {
    dimensionsMeters: Vec3;      // [0.060, 0.060, 0.060]
    defaultMassKg: number;       // 1.20 kg (<= 5.0 kg payloadLimitKg)
  };
  staticObstacles: BoxVolume[];  // pedestal, safety-fence, estop-station
  nearCollisionThresholdMeters: number; // 0.025 m (25 mm)
}
```

### 3.4 Runtime Workpiece, Gripper, Conveyor & Sensor States

```ts
export type WorkpieceStatus =
  | 'SPAWNED_ON_INPUT'
  | 'READY_FOR_PICK'
  | 'GRASPED'
  | 'AT_STATION'
  | 'PROCESSING'
  | 'PROCESSED_READY'
  | 'ON_OUTPUT_CONVEYOR'
  | 'COMPLETED'
  | 'FAULTED';

export interface WorkpieceState {
  id: string;                    // deterministic sequential ID, e.g. "WP-0001"
  massKg: number;
  dimensionsMeters: Vec3;
  poseWorld: Pose3D;
  status: WorkpieceStatus;
  spawnTimeMs: number;
  completedTimeMs: number | null;
}

export type GripperActuationState = 'OPEN' | 'CLOSING' | 'CLOSED' | 'OPENING' | 'FAULT';

export interface GripperState {
  actuationState: GripperActuationState;
  jawOpeningMeters: number;      // [0.000, 0.080]
  heldWorkpieceId: string | null;
  clampForceNormalized: number;  // [0.0, 1.0] synthetic
}

export interface ConveyorRuntimeState {
  id: 'input-conveyor' | 'output-conveyor';
  running: boolean;
  speedMetersPerSec: number;
  sensorTriggered: boolean;      // true when workpiece occupies target zone
  workpieceCountOnBelt: number;
}

export interface StationRuntimeState {
  occupied: boolean;
  activeWorkpieceId: string | null;
  processingProgress: number;    // [0.0, 1.0]
  clampEngaged: boolean;
}
```

---

## 4. Production State Machine, Events & Snapshots

### 4.1 State & Fault Enums

```ts
export type ProductionStage =
  | 'IDLE'
  | 'DETECT_OBJECT'
  | 'APPROACH_PICK'
  | 'PICK_WORKPIECE'
  | 'TRANSFER_TO_STATION'
  | 'PROCESS_WORKPIECE'
  | 'PICK_FINISHED'
  | 'TRANSFER_TO_OUTPUT'
  | 'PLACE_WORKPIECE'
  | 'CYCLE_COMPLETE'
  | 'FAULT';

export type SimulationRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'COMPLETED'
  | 'FAULTED';

export type FaultCode =
  | 'COLLISION'
  | 'UNREACHABLE_TARGET'
  | 'JOINT_LIMIT_VIOLATION'
  | 'OBJECT_UNAVAILABLE'
  | 'GRIPPER_FAILURE'
  | 'PAYLOAD_EXCEEDED'
  | 'ESTOP_ACTIVE';

export type CollisionSeverity = 'NONE' | 'NEAR_COLLISION' | 'COLLISION';

export interface CollisionReport {
  severity: CollisionSeverity;
  minClearanceMeters: number;    // negative indicates penetration depth
  pairA: string;                 // primitive ownerId
  pairB: string;                 // primitive ownerId
  contactPointWorld: Vec3 | null;
}
```

### 4.2 Simulation Snapshot (Worker -> UI per Tick / Frame)

```ts
export interface SimulationSnapshot {
  runId: string;
  simTimeMs: number;
  tickIndex: number;
  runStatus: SimulationRunStatus;
  stage: ProductionStage;
  activeCycleIndex: number;
  completedUnits: number;
  targetUnits: number | null;    // null when continuous unlimited
  joints: [JointState, JointState, JointState, JointState, JointState, JointState];
  linkWorldPoses: Pose3D[];      // 7 frames: base + link1..link6 + TCP
  tcpWorldPose: Pose3D;
  gripper: GripperState;
  inputConveyor: ConveyorRuntimeState;
  outputConveyor: ConveyorRuntimeState;
  station: StationRuntimeState;
  workpieces: WorkpieceState[];
  collision: CollisionReport;
  activeFault: { code: FaultCode; message: string; componentId: string | null } | null;
  cumulativeEnergyWh: number;
}
```

### 4.3 Simulation & Production Event Model (Single Analytics Input)

Every state change, cycle transition, fault, or collision emits an immutable deterministic `SimulationEvent`:

```ts
export type SimulationEventType =
  | 'SIM_STARTED'
  | 'SIM_PAUSED'
  | 'SIM_RESUMED'
  | 'SIM_STOPPED'
  | 'SIM_RESET'
  | 'STAGE_ENTERED'
  | 'CYCLE_STARTED'
  | 'CYCLE_COMPLETED'
  | 'WORKPIECE_SPAWNED'
  | 'GRIPPER_GRASPED'
  | 'GRIPPER_RELEASED'
  | 'NEAR_COLLISION_WARNING'
  | 'COLLISION_DETECTED'
  | 'IK_TARGET_UNREACHABLE'
  | 'JOINT_LIMIT_VIOLATED'
  | 'GRIPPER_FAULT'
  | 'OBJECT_UNAVAILABLE';

export interface SimulationEvent {
  seq: number;                   // strictly monotonic 1, 2, 3...
  runId: string;
  simTimeMs: number;             // deterministic simulation clock
  eventType: SimulationEventType;
  stage: ProductionStage;
  cycleIndex: number;
  workpieceId: string | null;
  componentId: string | null;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  payload: Record<string, number | string | boolean | null>;
}
```

---

## 5. Scenario Configuration & Metrics Models

### 5.1 Scenario Configuration (`ScenarioConfig`)

```ts
export type CycleMode = 'SINGLE' | 'FIXED_COUNT' | 'CONTINUOUS';

export interface ScenarioConfig {
  scenarioId: string;
  name: string;                         // e.g. "Scenario A: Baseline"
  description: string;
  seed: number;                         // deterministic RNG seed (default 42)
  timestepMs: 20;                       // locked fixed timestep
  cycleMode: CycleMode;
  targetQuantity: number | null;        // 1 for SINGLE, N for FIXED_COUNT, null for CONTINUOUS
  targetProductionRatePerHour: number;  // default 60
  robotSpeedScale: number;              // [0.20, 1.50], default 1.00 (clamped by joint limits)
  robotAccelScale: number;              // [0.20, 1.50], default 1.00
  inputConveyorSpeedMps: number;        // [0.05, 0.60], default 0.20
  outputConveyorSpeedMps: number;       // [0.05, 0.60], default 0.20
  processingDwellMs: number;            // [500, 10000], default 2500
  workpieceMassKg: number;              // [0.10, 5.00], default 1.20
  trajectorySmoothnessFactor: number;   // [0.80, 1.25], waypoint blend / dwell trim
}
```

### 5.2 Production Metrics (`ProductionMetrics`)

Every KPI displayed in `Performance Analytics`, `Overview`, and `Optimization Center` maps to this exact structure, derived solely from the run's `SimulationEvent[]` + cumulative energy sample stream:

```ts
export interface ProductionMetrics {
  runId: string;
  scenarioId: string;
  totalSimTimeMs: number;
  totalUnitsProduced: number;
  unitsPerHour: number;
  averageCycleTimeMs: number;
  minCycleTimeMs: number;
  maxCycleTimeMs: number;
  robotActiveTimeMs: number;
  robotUtilizationPct: number;       // 0..100
  conveyorActiveTimeMs: number;
  conveyorUtilizationPct: number;    // 0..100
  idleTimeMs: number;
  downtimeMs: number;                // fault + paused/stopped fault recovery duration
  collisionEventCount: number;
  nearCollisionEventCount: number;
  estimatedEnergyWh: number;
  energyPerUnitWh: number;
  productionEfficiencyPct: number;   // weighted throughput-to-target & uptime indicator (0..100)
  perCycleHistory: Array<{
    cycleIndex: number;
    cycleTimeMs: number;
    robotMoveMs: number;
    processDwellMs: number;
    waitTimeMs: number;
    energyWh: number;
    hadNearCollision: boolean;
    hadFault: boolean;
  }>;
}
```

---

## 6. Data Ownership, Lifecycle & Source-of-Truth Matrix

| Data Artifact | Canonical Owner (Creator / Mutator) | Read Consumers | Persistence / Lifecycle |
|---|---|---|---|
| `WorkcellConfig` (`aokira-workcell.v1.json`) | Repository static config (versioned in Git) | Rust/WASM (`include_str!`), Three.js Scene Builder, Python Pydantic validator | Immutable at runtime; versioned in repo. |
| `ScenarioConfig` | TypeScript Zustand store (`Simulation Lab` / `Optimization Center`) | Rust Worker (at run init), Python API (`/scenarios/compare`, `/optimization/run`) | Ephemeral in browser memory + optional browser `localStorage` presets (`P2`). |
| `SimulationSnapshot` | Rust/WASM engine inside Web Worker | React UI + Three.js render loop (read-only mirror) | Overwritten each simulation tick (`20 ms`) / animation frame; destroyed on `Reset`. |
| `SimulationEvent[]` | Rust/WASM engine inside Web Worker | TypeScript Event Store, `Performance Analytics` charts, Python `/analytics/evaluate` | Append-only per `runId`; cleared on `Reset` or new `Start`. |
| `ProductionMetrics` (local live) | Derived deterministically in Rust/TS from `SimulationEvent[]` + tick energy integral | `Overview`, `Performance Analytics` | Recomputed incrementally as events append; verified by Python `/analytics/evaluate`. |
| `BottleneckReport` & `OptimizationResult` | Python FastAPI (`apps/api`) | `Performance Analytics`, `Optimization Center` | Stateless per HTTP request; cached client-side per `scenarioId`/config hash until inputs change. |
| 3D Selection, Camera Preset, Exploded Slider, Visibility Toggles | TypeScript UI Store (`Digital Twin` store) | Three.js Viewport & Inspector Panels | Ephemeral UI state; never mutates Rust simulation kinematics or production state. |
