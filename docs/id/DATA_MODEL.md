> 🌐 [English](../../DATA_MODEL.md) | **Bahasa Indonesia**

# AoKira — Spesifikasi Model Data Kanonis

**Peran Dokumen:** Sumber kebenaran kanonis untuk semua entitas domain, artefak konfigurasi sumber-kebenaran-tunggal, tipe data, konvensi satuan, skema event, struktur metrik, kepemilikan data, dan aturan siklus hidup di TypeScript, Rust/WASM, dan Python.
**Status:** Terkunci untuk Implementasi (Baseline Dokumentasi Phase 0)

---

## 1. Konvensi Global & Sumber Kebenaran Tunggal

### 1.1 Satuan Kanonis
Semua skema komputasi, persistensi, dan kabel memakai **satuan dasar SI dan milidetik bilangan bulat**:

| Besaran | Satuan Kabel / Komputasi Kanonis | Satuan Tampilan UI (Hanya Format) |
|---|---|---|
| Panjang / Posisi | `m` (meter, `f64`) | `mm` atau `m` |
| Sudut | `rad` (radian, `f64`) | `deg` (`°`) |
| Kecepatan Angular | `rad/s` (`f64`) | `deg/s` |
| Akselerasi Angular | `rad/s^2` (`f64`) | `deg/s^2` |
| Kecepatan Linear | `m/s` (`f64`) | `m/s` |
| Massa | `kg` (`f64`) | `kg` |
| Waktu Simulasi | `ms` (bilangan bulat tak bertanda `u64` / `int`) | `s` atau `mm:ss.ms` |
| Energi | `Wh` (Watt-jam, `f64`) dan `J` (Joule, `f64`) | `Wh` / `kWh` |

### 1.2 Sumber Kebenaran Tunggal untuk Parameter Fisik
Semua geometri robot, parameter DH, batas sendi, primitif tabrakan, dan koordinat stasiun workcell berada di **satu file JSON berversi**:
- **Path Aset Kanonis:** `data/workcell/aokira-workcell.v1.json`
- **Konsumsi Rust:** Disematkan saat kompilasi lewat `include_str!` (dengan override tervalidasi opsional untuk unit test) di dalam `crates/aokira-engine`.
- **Konsumsi TypeScript:** Diimpor langsung sebagai modul JSON statis bertipe oleh `apps/web` untuk menginstansiasi mesh link Three.js, pedestal, konveyor, sensor, dan batas pengaman.
- **Konsumsi Python:** Divalidasi lewat model Pydantic di `apps/api` ketika menerima konfigurasi skenario atau run simulasi.

Tidak ada komponen di `apps/web`, `crates/aokira-engine`, atau `apps/api` yang boleh meng-hardcode dimensi, batas sendi, atau posisi stasiun yang bersaing.

---

## 2. Registry Komponen Kanonis

Ke-10 rakitan workcell yang dapat dipilih memakai ID string tetap di seluruh raycasting 3D, inspeksi UI, pelaporan tabrakan, dan pencatatan event:

| ID Komponen (`ComponentId`) | Nama Tampilan | Kategori | Sub-Target yang Dapat Dipilih |
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

## 3. Definisi Entitas Inti

*(Tipe di bawah ditulis dalam notasi TypeScript/JSON yang netral bahasa; struct Rust `serde` dan model Python `Pydantic v2` harus mempertahankan nama field `camelCase` yang persis sama pada batas kabel JSON.)*

### 3.1 Primitif Transform & Geometri

```ts
export interface Vec3 {
  x: number; // meter
  y: number; // meter
  z: number; // meter
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
  ownerId: string;        // misalnya "link-2", "gripper"
  localStart: Vec3;       // relatif terhadap frame pemilik
  localEnd: Vec3;
  radius: number;         // meter
}

export interface BoxVolume {
  kind: 'box';
  ownerId: string;        // misalnya "input-conveyor", "safety-fence-north"
  center: Vec3;           // WorldFrame atau frame lokal pemilik
  halfExtents: Vec3;      // meter
  orientation: Quat;
}

export type CollisionPrimitive = CapsuleVolume | BoxVolume;
```

### 3.2 Model Robot & Sendi

```ts
export type JointId = 'J1' | 'J2' | 'J3' | 'J4' | 'J5' | 'J6';

export interface DhParameters {
  thetaOffsetRad: number; // ditambahkan ke sudut sendi q_i
  dMeters: number;        // offset link sepanjang Z_{i-1}
  aMeters: number;        // panjang link sepanjang X_i
  alphaRad: number;       // twist link di sekitar X_i
}

export interface JointConfig {
  id: JointId;
  index: 0 | 1 | 2 | 3 | 4 | 5;
  name: string;                  // misalnya "Base Yaw", "Shoulder Pitch"
  axisLocal: [number, number, number]; // [0, 0, 1] pada frame lokal DH
  dh: DhParameters;
  minAngleRad: number;
  maxAngleRad: number;
  maxVelocityRadPerSec: number;
  maxAccelerationRadPerSec2: number;
  homeAngleRad: number;
  ratedTorqueNm: number;         // parameter sintetis untuk model energi
}

export interface RobotConfig {
  modelId: string;               // "aokira-6dof-generic-v1"
  dof: 6;
  payloadLimitKg: number;        // 5.0
  baseMountPose: Pose3D;         // transform BaseFrame -> WorldFrame
  toolTcpOffsetMeters: Vec3;     // [0, 0, 0.120] di FlangeFrame
  joints: [JointConfig, JointConfig, JointConfig, JointConfig, JointConfig, JointConfig];
  collisionCapsules: CapsuleVolume[];
}

export interface JointState {
  id: JointId;
  angleRad: number;
  velocityRadPerSec: number;
  accelerationRadPerSec2: number;
  atLimit: boolean;
  utilizationRatio: number;      // |sudut| / rentang batas atau |kecepatan| / maxVel
}
```

### 3.3 Model Stasiun & Komponen Workcell

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
  targetZoneWorld: Vec3;         // Titik pick (input) atau titik place (output)
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

### 3.4 State Runtime Workpiece, Gripper, Konveyor & Sensor

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
  id: string;                    // ID berurutan deterministik, misalnya "WP-0001"
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
  clampForceNormalized: number;  // [0.0, 1.0] sintetis
}

export interface ConveyorRuntimeState {
  id: 'input-conveyor' | 'output-conveyor';
  running: boolean;
  speedMetersPerSec: number;
  sensorTriggered: boolean;      // true ketika workpiece menempati zona target
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

## 4. State Machine Produksi, Event & Snapshot

### 4.1 Enum State & Fault

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
  minClearanceMeters: number;    // negatif menunjukkan kedalaman penetrasi
  pairA: string;                 // ownerId primitif
  pairB: string;                 // ownerId primitif
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
  targetUnits: number | null;    // null saat kontinu tanpa batas
  joints: [JointState, JointState, JointState, JointState, JointState, JointState];
  linkWorldPoses: Pose3D[];      // 7 frame: base + link1..link6 + TCP
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

### 4.3 Model Event Simulasi & Produksi (Input Analytics Tunggal)

Setiap perubahan state, transisi siklus, fault, atau tabrakan memancarkan `SimulationEvent` deterministik yang tidak dapat diubah:

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
  seq: number;                   // monoton ketat 1, 2, 3...
  runId: string;
  simTimeMs: number;             // jam simulasi deterministik
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

## 5. Model Konfigurasi Skenario & Metrik

### 5.1 Konfigurasi Skenario (`ScenarioConfig`)

```ts
export type CycleMode = 'SINGLE' | 'FIXED_COUNT' | 'CONTINUOUS';

export interface ScenarioConfig {
  scenarioId: string;
  name: string;                         // misalnya "Scenario A: Baseline"
  description: string;
  seed: number;                         // seed RNG deterministik (default 42)
  timestepMs: 20;                       // langkah waktu tetap yang terkunci
  cycleMode: CycleMode;
  targetQuantity: number | null;        // 1 untuk SINGLE, N untuk FIXED_COUNT, null untuk CONTINUOUS
  targetProductionRatePerHour: number;  // default 330 (takt ≈ 10,9 s)
  robotSpeedScale: number;              // [0.20, 1.50], default 1.00 (dibatasi oleh batas sendi)
  robotAccelScale: number;              // [0.20, 1.50], default 1.00
  inputConveyorSpeedMps: number;        // [0.05, 0.60], default 0.20
  outputConveyorSpeedMps: number;       // [0.05, 0.60], default 0.20
  processingDwellMs: number;            // [500, 10000], default 2500
  workpieceMassKg: number;              // [0.10, 5.00], default 1.20
  trajectorySmoothnessFactor: number;   // [0.80, 1.25], blend waypoint / pemangkasan dwell
}
```

### 5.2 Metrik Produksi (`ProductionMetrics`)

Setiap KPI yang ditampilkan di `Performance Analytics`, `Overview`, dan `Optimization Center` dipetakan ke struktur yang persis ini, diturunkan semata-mata dari `SimulationEvent[]` run + aliran sampel energi kumulatif:

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
  downtimeMs: number;                // durasi pemulihan fault + paused/stopped fault
  collisionEventCount: number;
  nearCollisionEventCount: number;
  estimatedEnergyWh: number;
  energyPerUnitWh: number;
  productionEfficiencyPct: number;   // indikator berbobot throughput-terhadap-target & uptime (0..100)
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

## 6. Kepemilikan Data, Siklus Hidup & Matriks Sumber Kebenaran

| Artefak Data | Pemilik Kanonis (Pembuat / Pengubah) | Konsumen Baca | Persistensi / Siklus Hidup |
|---|---|---|---|
| `WorkcellConfig` (`aokira-workcell.v1.json`) | Konfigurasi statis repositori (berversi di Git) | Rust/WASM (`include_str!`), Scene Builder Three.js, validator Pydantic Python | Tidak dapat diubah saat runtime; berversi di repo. |
| `ScenarioConfig` | Store Zustand TypeScript (`Simulation Lab` / `Optimization Center`) | Worker Rust (saat init run), API Python (`/scenarios/compare`, `/optimization/run`) | Sementara di memori browser + preset `localStorage` browser opsional (`P2`). |
| `SimulationSnapshot` | Engine Rust/WASM di dalam Web Worker | UI React + loop render Three.js (cermin hanya-baca) | Ditimpa setiap tick simulasi (`20 ms`) / frame animasi; dihancurkan saat `Reset`. |
| `SimulationEvent[]` | Engine Rust/WASM di dalam Web Worker | Event Store TypeScript, grafik `Performance Analytics`, Python `/analytics/evaluate` | Hanya-tambah per `runId`; dibersihkan saat `Reset` atau `Start` baru. |
| `ProductionMetrics` (lokal langsung) | Diturunkan secara deterministik di Rust/TS dari `SimulationEvent[]` + integral energi per tick | `Overview`, `Performance Analytics` | Dihitung ulang secara inkremental saat event bertambah; diverifikasi oleh Python `/analytics/evaluate`. |
| `BottleneckReport` & `OptimizationResult` | Python FastAPI (`apps/api`) | `Performance Analytics`, `Optimization Center` | Stateless per request HTTP; di-cache di sisi klien per `scenarioId`/hash konfigurasi hingga input berubah. |
| Seleksi 3D, Preset Kamera, Slider Exploded, Toggle Visibilitas | Store UI TypeScript (store `Digital Twin`) | Viewport Three.js & Panel Inspektor | State UI sementara; tidak pernah mengubah kinematika simulasi Rust atau state produksi. |
