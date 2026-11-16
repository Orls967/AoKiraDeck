> 🌐 [English](../../API_CONTRACT.md) | **Bahasa Indonesia**

# AoKira — Kontrak API TypeScript–Python

**Peran Dokumen:** Spesifikasi kanonis untuk komunikasi HTTP/REST, pemberian versi, rute endpoint, skema Pydantic/TypeScript, aturan validasi, envelope error, konvensi serialisasi, contoh payload, dan perilaku fallback saat backend tidak tersedia antara `apps/web` dan `apps/api`.
**Tipe Entitas yang Dirujuk:** Didefinisikan di [DATA_MODEL.md](DATA_MODEL.md).

---

## 1. Aturan Transport, Versi & Serialisasi

| Aspek | Kontrak |
|---|---|
| **Protokol** | HTTP/1.1 atau HTTP/2 melalui HTTPS (TLS di produksi, HTTP di dev localhost) |
| **Base Path & Versi** | Prefiks URI `/api/v1` (`v1` terkunci; perubahan skema yang merusak menaikkan ke `/api/v2`) |
| **Media Type** | `application/json; charset=utf-8` |
| **Penulisan Field** | `camelCase` di kabel (model Pydantic v2 Python mendefinisikan atribut `snake_case` dengan `alias_generator=to_camel` dan `populate_by_name=True`) |
| **Presisi Numerik** | Float IEEE-754 yang finit (`NaN` dan `Infinity` ditolak ketat dengan `422`); timestamp dan durasi simulasi dalam milidetik bilangan bulat (`ms`) |
| **Timestamp Metadata HTTP** | String UTC ISO-8601 berakhiran `Z` (misalnya `"2026-11-15T05:00:00Z"`) |
| **Timeout Request (Klien)** | `3000 ms` untuk `/health`, `10000 ms` untuk `/analytics/evaluate` dan `/scenarios/compare`, `20000 ms` untuk `/optimization/run` |
| **Autentikasi** | Tidak ada (demonstrator pengguna tunggal; dilindungi lewat allowlist CORS + batas payload `<= 5 MB`) |

---

## 2. Envelope Respons Error yang Seragam

Semua respons `4xx` dan `5xx` mengembalikan envelope terstruktur yang sama:

```ts
export interface ApiErrorDetail {
  field: string;    // misalnya "scenario.robotSpeedScale" atau "events[4].simTimeMs"
  issue: string;    // error validasi atau domain yang dapat dibaca manusia
}

export interface ApiErrorResponse {
  error: {
    code:
      | 'VALIDATION_ERROR'
      | 'INVALID_EVENT_SEQUENCE'
      | 'INFEASIBLE_OPTIMIZATION'
      | 'INTERNAL_ERROR'
      | 'SERVICE_UNAVAILABLE';
    message: string;
    requestId: string;
    details: ApiErrorDetail[];
  };
}
```

| Status HTTP | Kondisi Pemicu |
|---|---|
| `400 Bad Request` | Body JSON cacat atau invarian domain yang tidak konsisten (misalnya total waktu negatif, `simTimeMs` tidak monoton) |
| `422 Unprocessable Entity` | Pelanggaran skema Pydantic atau rentang parameter (misalnya `robotSpeedScale > 1.50` atau `workpieceMassKg > 5.0`) |
| `413 Content Too Large` | Request melebihi batas pengaman payload `5 MB` |
| `500 Internal Server Error` | Exception backend yang tidak tertangani (`details: []`) |
| `503 Service Unavailable` | Layanan sedang dimatikan atau sementara tidak mampu menjalankan komputasi |

---

## 3. Spesifikasi Endpoint

### 3.1 `GET /api/v1/health`
Dipakai oleh `apps/web` untuk menentukan apakah fitur analytics dan optimasi Python berstatus `ONLINE` atau `UNAVAILABLE`.

**Respons `200 OK`:**
```json
{
  "status": "ok",
  "service": "aokira-api",
  "apiVersion": "1.0.0",
  "engineContractVersion": "1.0.0",
  "timestampUtc": "2026-11-15T05:00:00Z"
}
```

---

### 3.2 `POST /api/v1/analytics/evaluate`
Menerima sebuah run simulasi (`ScenarioConfig`, `SimulationEvent[]`, dan `ProductionMetrics` hasil hitungan klien yang opsional) untuk menghitung validasi KPI independen, klasifikasi bottleneck, rincian komponen energi, dan prakiraan throughput deterministik.

#### Skema Request
```ts
export interface AnalyticsEvaluateRequest {
  scenario: ScenarioConfig;
  events: SimulationEvent[];              // minItems: 1
  clientMetrics?: ProductionMetrics;      // opsional untuk validasi silang
  totalSimTimeMs: number;                 // bilangan bulat > 0
  cumulativeEnergyWh: number;             // >= 0
}
```

#### Skema Respons (`200 OK`)
```ts
export interface BottleneckSummary {
  primaryStage: string;                   // misalnya "PROCESS_WORKPIECE" | "ROBOT_TRANSIT" | "INPUT_CONVEYOR_FEED"
  shareOfCyclePct: number;                // 0..100
  idleWaitRatioPct: number;               // 0..100
  explanation: string;
  severity: 'LOW' | 'MODERATE' | 'HIGH';
}

export interface EnergyBreakdown {
  totalWh: number;
  perUnitWh: number;
  robotMotionWh: number;
  processingStationWh: number;
  conveyorWh: number;
  idleStandbyWh: number;
  disclaimer: 'Synthetic engineering estimate only; not real electrical metering.';
}

export interface ConsistencyValidation {
  isValid: boolean;
  monotonicEventsOk: boolean;
  clientServerDeltaPct: number | null;
  warnings: string[];
}

export interface AnalyticsEvaluateResponse {
  runId: string;
  computedMetrics: ProductionMetrics;
  bottleneck: BottleneckSummary;
  energyBreakdown: EnergyBreakdown;
  forecast: {
    projectedUnitsPerHour: number;
    projectedUnitsPer8hShift: number;
    targetAttainmentPct: number;
  };
  validation: ConsistencyValidation;
}
```

#### Contoh Request
```json
{
  "scenario": {
    "scenarioId": "baseline-a",
    "name": "Scenario A: Baseline",
    "description": "Default workcell parameters",
    "seed": 42,
    "timestepMs": 20,
    "cycleMode": "FIXED_COUNT",
    "targetQuantity": 5,
    "targetProductionRatePerHour": 330,
    "robotSpeedScale": 1.0,
    "robotAccelScale": 1.0,
    "inputConveyorSpeedMps": 0.2,
    "outputConveyorSpeedMps": 0.2,
    "processingDwellMs": 2500,
    "workpieceMassKg": 1.2,
    "trajectorySmoothnessFactor": 1.0
  },
  "totalSimTimeMs": 48500,
  "cumulativeEnergyWh": 3.42,
  "events": [
    {
      "seq": 1,
      "runId": "run-001",
      "simTimeMs": 0,
      "eventType": "SIM_STARTED",
      "stage": "IDLE",
      "cycleIndex": 0,
      "workpieceId": null,
      "componentId": null,
      "severity": "INFO",
      "message": "Simulation started",
      "payload": {}
    }
  ]
}
```

#### Contoh Respons (`200 OK`)
```json
{
  "runId": "run-001",
  "computedMetrics": {
    "runId": "run-001",
    "scenarioId": "baseline-a",
    "totalSimTimeMs": 48500,
    "totalUnitsProduced": 5,
    "unitsPerHour": 371.13,
    "averageCycleTimeMs": 9700,
    "minCycleTimeMs": 9520,
    "maxCycleTimeMs": 9940,
    "robotActiveTimeMs": 33000,
    "robotUtilizationPct": 68.04,
    "conveyorActiveTimeMs": 24100,
    "conveyorUtilizationPct": 49.69,
    "idleTimeMs": 15500,
    "downtimeMs": 0,
    "collisionEventCount": 0,
    "nearCollisionEventCount": 0,
    "estimatedEnergyWh": 3.42,
    "energyPerUnitWh": 0.684,
    "productionEfficiencyPct": 92.4,
    "perCycleHistory": []
  },
  "bottleneck": {
    "primaryStage": "PROCESS_WORKPIECE",
    "shareOfCyclePct": 25.77,
    "idleWaitRatioPct": 31.96,
    "explanation": "Robot idles 2500 ms per cycle awaiting processing station dwell completion.",
    "severity": "MODERATE"
  },
  "energyBreakdown": {
    "totalWh": 3.42,
    "perUnitWh": 0.684,
    "robotMotionWh": 1.54,
    "processingStationWh": 0.63,
    "conveyorWh": 0.44,
    "idleStandbyWh": 0.81,
    "disclaimer": "Synthetic engineering estimate only; not real electrical metering."
  },
  "forecast": {
    "projectedUnitsPerHour": 371.13,
    "projectedUnitsPer8hShift": 2969,
    "targetAttainmentPct": 618.55
  },
  "validation": {
    "isValid": true,
    "monotonicEventsOk": true,
    "clientServerDeltaPct": 0.0,
    "warnings": []
  }
}
```

---

### 3.3 `POST /api/v1/scenarios/compare`
Mengevaluasi dan membandingkan 2 sampai 8 skenario secara deterministik (memakai ringkasan/event run yang diberikan dari run WASM atau pemodelan waktu siklus analitis yang dibatasi oleh batas kinematik `WorkcellConfig` kanonis) untuk menghasilkan metrik berdampingan dan peringkat bottleneck.

#### Skema Request
```ts
export interface ScenarioComparisonItem {
  scenario: ScenarioConfig;
  observedMetrics?: ProductionMetrics;    // diberikan bila sudah dieksekusi di WASM
}

export interface ScenariosCompareRequest {
  items: ScenarioComparisonItem[];        // minItems: 2, maxItems: 8
  rankingObjective: 'MIN_CYCLE_TIME' | 'MAX_THROUGHPUT' | 'MIN_ENERGY' | 'BALANCED';
}
```

#### Skema Respons (`200 OK`)
```ts
export interface ScenarioComparisonResult {
  scenarioId: string;
  name: string;
  source: 'WASM_OBSERVED' | 'ANALYTICAL_ESTIMATE';
  cycleTimeMs: number;
  throughputUnitsPerHour: number;
  idleTimeRatioPct: number;
  estimatedEnergyPerUnitWh: number;
  collisionCount: number;
  bottleneckStage: string;
  compositeScore: number;
  rank: number;
}

export interface ScenariosCompareResponse {
  rankingObjective: string;
  bestScenarioId: string;
  comparisons: ScenarioComparisonResult[];
  summaryNote: string;
}
```

---

### 3.4 `POST /api/v1/optimization/run`
Mencari ruang parameter yang layak di sekitar `ScenarioConfig` baseline di bawah kendala kinematik, clearance tabrakan, dan konveyor yang eksplisit untuk mengembalikan konfigurasi yang direkomendasikan (`AC-14`).

#### Skema Request
```ts
export interface OptimizationBounds {
  robotSpeedScale: [number, number];          // himpunan bagian dari [0.20, 1.50]
  robotAccelScale: [number, number];          // himpunan bagian dari [0.20, 1.50]
  inputConveyorSpeedMps: [number, number];    // himpunan bagian dari [0.05, 0.60]
  outputConveyorSpeedMps: [number, number];   // himpunan bagian dari [0.05, 0.60]
  processingDwellMs: [number, number];        // himpunan bagian dari [500, 10000]
}

export interface OptimizationRunRequest {
  baseScenario: ScenarioConfig;
  bounds: OptimizationBounds;
  objective: 'MIN_CYCLE_TIME' | 'MIN_ENERGY_PER_UNIT' | 'BALANCED';
  weights?: {
    cycleTimeWeight: number;                  // default 0.50
    energyWeight: number;                     // default 0.30
    idleRatioWeight: number;                  // default 0.20
  };
  constraints: {
    minThroughputUnitsPerHour: number;        // misalnya 60
    requireZeroCollisions: boolean;           // divalidasi true di v1
    maxEnergyPerUnitWh?: number;
  };
  maxEvaluations?: number;                    // [10, 500], default 120
}
```

#### Skema Respons (`200 OK`)
```ts
export interface OptimizationRunResponse {
  feasible: boolean;
  evaluationsRun: number;
  baselineProjected: {
    cycleTimeMs: number;
    throughputUnitsPerHour: number;
    energyPerUnitWh: number;
    idleRatioPct: number;
  };
  recommendedScenario: ScenarioConfig;
  recommendedProjected: {
    cycleTimeMs: number;
    throughputUnitsPerHour: number;
    energyPerUnitWh: number;
    idleRatioPct: number;
    bottleneckStage: string;
  };
  deltas: {
    cycleTimePct: number;                     // negatif berarti lebih cepat
    throughputPct: number;                    // positif berarti throughput lebih tinggi
    energyPerUnitPct: number;                 // negatif berarti energi lebih rendah
  };
  topCandidates: Array<{
    rank: number;
    scenario: ScenarioConfig;
    cycleTimeMs: number;
    throughputUnitsPerHour: number;
    energyPerUnitWh: number;
    score: number;
  }>;
  note: string;
}
```

*(Jika tidak ada kandidat yang memenuhi semua kendala pengguna, mengembalikan `400 Bad Request` atau `422` dengan `error.code = 'INFEASIBLE_OPTIMIZATION'` dan rincian yang jelas yang menjelaskan kendala mana yang menghalangi kelayakan.)*

---

## 4. Ringkasan Aturan Validasi

1. **Integritas Urutan Event (`/analytics/evaluate`)**:
   - `events[k].seq` harus naik secara ketat (`seq[k] > seq[k-1]`).
   - `events[k].simTimeMs` harus monoton tidak menurun (`simTimeMs[k] >= simTimeMs[k-1]`).
   - Semua durasi dan energi numerik harus `>= 0` dan finit.
2. **Batas Parameter Skenario**:
   - `timestepMs` harus sama dengan `20`.
   - `robotSpeedScale ∈ [0.20, 1.50]`, `robotAccelScale ∈ [0.20, 1.50]`.
   - `inputConveyorSpeedMps`, `outputConveyorSpeedMps ∈ [0.05, 0.60]`.
   - `workpieceMassKg ∈ [0.10, 5.00]`.
   - `processingDwellMs ∈ [500, 10000]`.
   - Ketika `cycleMode === 'FIXED_COUNT'`, `targetQuantity` harus bilangan bulat `>= 1`.
3. **Batas Optimasi**:
   - Untuk setiap interval berbatas `[lo, hi]`, `lo <= hi` dan `[lo, hi]` harus berada di dalam batas global `ScenarioConfig` yang valid.

---

## 5. Perilaku Saat Backend Tidak Tersedia (`AC-15`)

- `apps/web/src/services/apiClient.ts` memperlakukan `TypeError` apa pun (kegagalan jaringan/CORS), timeout (`AbortError`), `5xx`, atau `VITE_API_BASE_URL` yang tidak diatur sebagai **`BACKEND_UNAVAILABLE`**.
- Transisi state:
  - `analyticsStore.backendStatus` menjadi `'UNAVAILABLE'` dengan alasan yang dapat dibaca manusia (misalnya `"Python analytics service offline — local Rust/WASM simulation continues uninterrupted."`).
  - `Overview`, `Digital Twin`, `Simulation Lab`, dan `ProductionMetrics` sisi klien tetap 100% responsif.
  - Tombol yang memanggil `/analytics/evaluate`, `/scenarios/compare`, atau `/optimization/run` menampilkan indikator nonaktif/terdegradasi + kontrol `Retry Connection`, bukan gagal secara diam-diam.
