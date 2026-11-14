# AoKira — TypeScript–Python API Contract

**Document Role:** Canonical specification for HTTP/REST communication, versioning, endpoint routes, Pydantic/TypeScript schemas, validation rules, error envelopes, serialization conventions, example payloads, and backend-unavailable fallback behavior between `apps/web` and `apps/api`.
**Referenced Entity Types:** Defined in [DATA_MODEL.md](file:///Users/orl123456/Documents/AoKira/DATA_MODEL.md).

---

## 1. Transport, Versioning & Serialization Rules

| Aspect | Contract |
|---|---|
| **Protocol** | HTTP/1.1 or HTTP/2 over HTTPS (TLS in production, HTTP on localhost dev) |
| **Base Path & Versioning** | `/api/v1` URI prefix (`v1` locked; breaking schema changes increment to `/api/v2`) |
| **Media Type** | `application/json; charset=utf-8` |
| **Field Casing** | `camelCase` on the wire (Python Pydantic v2 models define `snake_case` attributes with `alias_generator=to_camel` and `populate_by_name=True`) |
| **Numeric Precision** | Finite IEEE-754 floats (`NaN` and `Infinity` strictly rejected with `422`); simulation timestamps and durations in integer milliseconds (`ms`) |
| **HTTP Metadata Timestamps** | ISO-8601 UTC strings ending in `Z` (e.g. `"2026-11-15T05:00:00Z"`) |
| **Request Timeout (Client)** | `3000 ms` for `/health`, `10000 ms` for `/analytics/evaluate` and `/scenarios/compare`, `20000 ms` for `/optimization/run` |
| **Authentication** | None (single-user demonstrator; protected via CORS allowlist + bounded payload limits `<= 5 MB`) |

---

## 2. Uniform Error Response Envelope

All `4xx` and `5xx` responses return the same structured envelope:

```ts
export interface ApiErrorDetail {
  field: string;    // e.g. "scenario.robotSpeedScale" or "events[4].simTimeMs"
  issue: string;    // human-readable validation or domain error
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

| HTTP Status | Trigger Condition |
|---|---|
| `400 Bad Request` | Malformed JSON body or inconsistent domain invariant (e.g., negative total time, non-monotonic `simTimeMs`) |
| `422 Unprocessable Entity` | Pydantic schema or parameter range violation (e.g., `robotSpeedScale > 1.50` or `workpieceMassKg > 5.0`) |
| `413 Content Too Large` | Request exceeds `5 MB` payload safety cap |
| `500 Internal Server Error` | Unhandled backend exception (`details: []`) |
| `503 Service Unavailable` | Service shutting down or temporarily unable to execute compute |

---

## 3. Endpoint Specifications

### 3.1 `GET /api/v1/health`
Used by `apps/web` to determine whether Python analytics and optimization features are `ONLINE` or `UNAVAILABLE`.

**Response `200 OK`:**
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
Ingests a simulation run (`ScenarioConfig`, `SimulationEvent[]`, and optional client-computed `ProductionMetrics`) to compute independent KPI validation, bottleneck classification, energy component breakdown, and deterministic throughput forecasting.

#### Request Schema
```ts
export interface AnalyticsEvaluateRequest {
  scenario: ScenarioConfig;
  events: SimulationEvent[];              // minItems: 1
  clientMetrics?: ProductionMetrics;      // optional for cross-validation
  totalSimTimeMs: number;                 // integer > 0
  cumulativeEnergyWh: number;             // >= 0
}
```

#### Response Schema (`200 OK`)
```ts
export interface BottleneckSummary {
  primaryStage: string;                   // e.g. "PROCESS_WORKPIECE" | "ROBOT_TRANSIT" | "INPUT_CONVEYOR_FEED"
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

#### Example Request
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
    "targetProductionRatePerHour": 60,
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

#### Example Response (`200 OK`)
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
Evaluates and compares 2 to 8 scenarios deterministically (using either supplied simulation run summaries/events from WASM runs or analytical cycle-time modeling constrained to the canonical `WorkcellConfig` kinematic bounds) to produce side-by-side metrics and bottleneck rankings.

#### Request Schema
```ts
export interface ScenarioComparisonItem {
  scenario: ScenarioConfig;
  observedMetrics?: ProductionMetrics;    // supplied when already executed in WASM
}

export interface ScenariosCompareRequest {
  items: ScenarioComparisonItem[];        // minItems: 2, maxItems: 8
  rankingObjective: 'MIN_CYCLE_TIME' | 'MAX_THROUGHPUT' | 'MIN_ENERGY' | 'BALANCED';
}
```

#### Response Schema (`200 OK`)
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
Searches the feasible parameter space around a baseline `ScenarioConfig` under explicit kinematic, collision-clearance, and conveyor constraints to return a recommended configuration (`AC-14`).

#### Request Schema
```ts
export interface OptimizationBounds {
  robotSpeedScale: [number, number];          // subset of [0.20, 1.50]
  robotAccelScale: [number, number];          // subset of [0.20, 1.50]
  inputConveyorSpeedMps: [number, number];    // subset of [0.05, 0.60]
  outputConveyorSpeedMps: [number, number];   // subset of [0.05, 0.60]
  processingDwellMs: [number, number];        // subset of [500, 10000]
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
    minThroughputUnitsPerHour: number;        // e.g. 60
    requireZeroCollisions: boolean;           // validated true in v1
    maxEnergyPerUnitWh?: number;
  };
  maxEvaluations?: number;                    // [10, 500], default 120
}
```

#### Response Schema (`200 OK`)
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
    cycleTimePct: number;                     // negative means faster
    throughputPct: number;                    // positive means higher throughput
    energyPerUnitPct: number;                 // negative means lower energy
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

*(If no candidate satisfies all user constraints, returns `400 Bad Request` or `422` with `error.code = 'INFEASIBLE_OPTIMIZATION'` and clear details explaining which constraint blocked feasibility.)*

---

## 4. Validation Rules Summary

1. **Event Sequence Integrity (`/analytics/evaluate`)**:
   - `events[k].seq` must be strictly increasing (`seq[k] > seq[k-1]`).
   - `events[k].simTimeMs` must be monotonically non-decreasing (`simTimeMs[k] >= simTimeMs[k-1]`).
   - All numeric durations and energies must be `>= 0` and finite.
2. **Scenario Parameter Bounds**:
   - `timestepMs` must equal `20`.
   - `robotSpeedScale ∈ [0.20, 1.50]`, `robotAccelScale ∈ [0.20, 1.50]`.
   - `inputConveyorSpeedMps`, `outputConveyorSpeedMps ∈ [0.05, 0.60]`.
   - `workpieceMassKg ∈ [0.10, 5.00]`.
   - `processingDwellMs ∈ [500, 10000]`.
   - When `cycleMode === 'FIXED_COUNT'`, `targetQuantity` must be an integer `>= 1`.
3. **Optimization Bounds**:
   - For every bounded interval `[lo, hi]`, `lo <= hi` and `[lo, hi]` must lie inside global valid `ScenarioConfig` limits.

---

## 5. Backend Unavailability Behavior (`AC-15`)

- `apps/web/src/services/apiClient.ts` treats any `TypeError` (network/CORS failure), timeout (`AbortError`), `5xx`, or unset `VITE_API_BASE_URL` as **`BACKEND_UNAVAILABLE`**.
- State transitions:
  - `analyticsStore.backendStatus` becomes `'UNAVAILABLE'` with human-readable reason (e.g., `"Python analytics service offline — local Rust/WASM simulation continues uninterrupted."`).
  - `Overview`, `Digital Twin`, `Simulation Lab`, and client-side `ProductionMetrics` remain 100% responsive.
  - Buttons calling `/analytics/evaluate`, `/scenarios/compare`, or `/optimization/run` show disabled/degraded indicator + `Retry Connection` control rather than failing silently.
