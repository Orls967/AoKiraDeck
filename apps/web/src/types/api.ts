import type { ProductionMetrics, ScenarioConfig, SimulationEvent } from './simulation';

export interface ApiHealthResponse {
  status: 'ok';
  service: string;
  apiVersion: string;
  engineContractVersion: string;
  timestampUtc: string;
}

export interface ApiErrorDetail {
  field: string;
  issue: string;
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

export interface AnalyticsEvaluateRequest {
  scenario: ScenarioConfig;
  events: SimulationEvent[];
  clientMetrics?: ProductionMetrics;
  totalSimTimeMs: number;
  cumulativeEnergyWh: number;
}

export interface BottleneckSummary {
  primaryStage: string;
  shareOfCyclePct: number;
  idleWaitRatioPct: number;
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

export type RankingObjective = 'MIN_CYCLE_TIME' | 'MAX_THROUGHPUT' | 'MIN_ENERGY' | 'BALANCED';

export interface ScenarioComparisonItem {
  scenario: ScenarioConfig;
  observedMetrics?: ProductionMetrics;
}

export interface ScenariosCompareRequest {
  items: ScenarioComparisonItem[];
  rankingObjective: RankingObjective;
}

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

export interface OptimizationBounds {
  robotSpeedScale: [number, number];
  robotAccelScale: [number, number];
  inputConveyorSpeedMps: [number, number];
  outputConveyorSpeedMps: [number, number];
  processingDwellMs: [number, number];
}

export type OptimizationObjective = 'MIN_CYCLE_TIME' | 'MIN_ENERGY_PER_UNIT' | 'BALANCED';

export interface OptimizationRunRequest {
  baseScenario: ScenarioConfig;
  bounds: OptimizationBounds;
  objective: OptimizationObjective;
  weights?: {
    cycleTimeWeight: number;
    energyWeight: number;
    idleRatioWeight: number;
  };
  constraints: {
    minThroughputUnitsPerHour: number;
    requireZeroCollisions: boolean;
    maxEnergyPerUnitWh?: number;
  };
  maxEvaluations?: number;
}

export interface OptimizationCandidate {
  rank: number;
  scenario: ScenarioConfig;
  cycleTimeMs: number;
  throughputUnitsPerHour: number;
  energyPerUnitWh: number;
  score: number;
}

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
    cycleTimePct: number;
    throughputPct: number;
    energyPerUnitPct: number;
  };
  topCandidates: OptimizationCandidate[];
  note: string;
}
