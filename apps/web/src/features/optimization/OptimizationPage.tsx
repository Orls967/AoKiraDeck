import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  GitCompare,
  PlayCircle,
  RefreshCw,
  Scale,
  ServerOff,
  Sparkles,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { PRESET_SCENARIOS } from '@/config/scenarios';
import { apiClient } from '@/services/apiClient';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useSimulationStore } from '@/stores/useSimulationStore';
import type {
  OptimizationBounds,
  OptimizationObjective,
  OptimizationRunRequest,
  OptimizationRunResponse,
  RankingObjective,
} from '@/types/api';

const DEFAULT_BOUNDS: OptimizationBounds = {
  robotSpeedScale: [0.5, 1.4],
  robotAccelScale: [0.5, 1.4],
  inputConveyorSpeedMps: [0.15, 0.5],
  outputConveyorSpeedMps: [0.15, 0.5],
  processingDwellMs: [1200, 3500],
};

const OBJECTIVES: { id: OptimizationObjective; label: string; hint: string; color: string }[] = [
  {
    id: 'MIN_CYCLE_TIME',
    label: 'Min Cycle',
    hint: 'Fastest cycle: pushes speed and acceleration to their bounds.',
    color: '#EF4444',
  },
  {
    id: 'MIN_ENERGY_PER_UNIT',
    label: 'Min Energy',
    hint: 'Least Wh per part: gentler acceleration avoids I²R drive losses.',
    color: '#22C55E',
  },
  {
    id: 'BALANCED',
    label: 'Balanced',
    hint: 'Compromise between the two extremes, weighted 45 % time / 35 % energy.',
    color: '#36C5D9',
  },
];

const OBJECTIVE_BY_ID = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o])) as Record<
  OptimizationObjective,
  (typeof OBJECTIVES)[number]
>;

interface TradeoffPoint {
  name: string;
  cycleMs: number;
  energyWh: number;
  throughput: number;
}

function TradeoffTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TradeoffPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded border border-[#243242] bg-[#141B23] px-2.5 py-1.5 font-mono text-[11px] text-[#CBD5E1]">
      <p className="font-sans font-semibold text-[#F1F5F9]">{p.name}</p>
      <p>{p.cycleMs.toFixed(0)} ms · {p.throughput.toFixed(1)} u/h</p>
      <p>{p.energyWh.toFixed(3)} Wh/unit</p>
    </div>
  );
}

function mapObjectiveToRanking(obj: OptimizationObjective): RankingObjective {
  if (obj === 'MIN_CYCLE_TIME') return 'MIN_CYCLE_TIME';
  if (obj === 'MIN_ENERGY_PER_UNIT') return 'MIN_ENERGY';
  return 'BALANCED';
}

export function OptimizationPage() {
  const navigate = useNavigate();

  const activeScenario = useSimulationStore((s) => s.activeScenario);
  const metrics = useSimulationStore((s) => s.metrics);
  const loadScenario = useSimulationStore((s) => s.loadScenario);

  const backendStatus = useAnalyticsStore((s) => s.backendStatus);
  const backendReason = useAnalyticsStore((s) => s.backendReason);
  const isComparing = useAnalyticsStore((s) => s.isComparing);
  const comparison = useAnalyticsStore((s) => s.comparison);
  const comparisonError = useAnalyticsStore((s) => s.comparisonError);
  const isOptimizing = useAnalyticsStore((s) => s.isOptimizing);
  const optimization = useAnalyticsStore((s) => s.optimization);
  const optimizationError = useAnalyticsStore((s) => s.optimizationError);
  const probeHealth = useAnalyticsStore((s) => s.probeHealth);
  const compareScenarios = useAnalyticsStore((s) => s.compareScenarios);
  const runOptimization = useAnalyticsStore((s) => s.runOptimization);

  const [baseScenarioId, setBaseScenarioId] = useState<string>(activeScenario.scenarioId);
  const [objective, setObjective] = useState<OptimizationObjective>('BALANCED');
  const [bounds, setBounds] = useState<OptimizationBounds>(DEFAULT_BOUNDS);
  const [minThroughput, setMinThroughput] = useState<number>(240);
  const [maxEnergyPerUnitWh, setMaxEnergyPerUnitWh] = useState<string>('');
  // Process dwell is usually dictated by the process (curing, machining), so it is held at
  // the base scenario's value unless the user explicitly opts in to tuning it.
  const [tuneDwell, setTuneDwell] = useState<boolean>(false);
  const [objectiveRuns, setObjectiveRuns] = useState<
    Partial<Record<OptimizationObjective, OptimizationRunResponse>>
  >({});
  const [isComparingObjectives, setIsComparingObjectives] = useState(false);
  const [objectiveRunsError, setObjectiveRunsError] = useState<string | null>(null);

  const availableScenarios = useMemo(() => {
    const existsInPresets = PRESET_SCENARIOS.some(
      (s) => s.scenarioId === activeScenario.scenarioId,
    );
    return existsInPresets ? PRESET_SCENARIOS : [...PRESET_SCENARIOS, activeScenario];
  }, [activeScenario]);

  const selectedBaseScenario =
    availableScenarios.find((s) => s.scenarioId === baseScenarioId) ?? PRESET_SCENARIOS[0];

  const handleCompareScenarios = () => {
    void compareScenarios({
      items: availableScenarios.map((sc) => ({
        scenario: sc,
        observedMetrics:
          metrics &&
          metrics.totalUnitsProduced > 0 &&
          metrics.scenarioId === sc.scenarioId
            ? metrics
            : undefined,
      })),
      rankingObjective: mapObjectiveToRanking(objective),
    });
  };

  const effectiveBounds: OptimizationBounds = tuneDwell
    ? bounds
    : {
        ...bounds,
        processingDwellMs: [
          selectedBaseScenario.processingDwellMs,
          selectedBaseScenario.processingDwellMs,
        ],
      };

  const buildRequest = (obj: OptimizationObjective): OptimizationRunRequest => {
    const parsedMaxEnergy = maxEnergyPerUnitWh.trim()
      ? Number(maxEnergyPerUnitWh.trim())
      : undefined;
    return {
      baseScenario: selectedBaseScenario,
      bounds: effectiveBounds,
      objective: obj,
      weights:
        obj === 'BALANCED'
          ? { cycleTimeWeight: 0.45, energyWeight: 0.35, idleRatioWeight: 0.2 }
          : undefined,
      constraints: {
        minThroughputUnitsPerHour: minThroughput,
        requireZeroCollisions: true,
        maxEnergyPerUnitWh:
          parsedMaxEnergy !== undefined && !Number.isNaN(parsedMaxEnergy)
            ? parsedMaxEnergy
            : undefined,
      },
      maxEvaluations: 120,
    };
  };

  const handleRunOptimization = () => {
    void runOptimization(buildRequest(objective));
  };

  const handleCompareObjectives = async () => {
    setIsComparingObjectives(true);
    setObjectiveRunsError(null);
    try {
      const results = await Promise.all(
        OBJECTIVES.map(async (o) => [o.id, await apiClient.runOptimization(buildRequest(o.id))] as const),
      );
      setObjectiveRuns(Object.fromEntries(results));
    } catch (err) {
      setObjectiveRuns({});
      setObjectiveRunsError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsComparingObjectives(false);
    }
  };

  const handleLoadIntoSimulationLab = (scenario = optimization?.recommendedScenario) => {
    if (!scenario) return;
    loadScenario(scenario);
    navigate('/simulation');
  };

  const updateBound = (
    key: keyof OptimizationBounds,
    idx: 0 | 1,
    val: number,
  ) => {
    setBounds((prev) => {
      const pair: [number, number] = [...prev[key]] as [number, number];
      pair[idx] = val;
      if (pair[0] > pair[1]) {
        if (idx === 0) pair[1] = val;
        else pair[0] = val;
      }
      return { ...prev, [key]: pair };
    });
  };

  const presetPoints = useMemo<TradeoffPoint[]>(
    () =>
      (comparison?.comparisons ?? []).map((c) => ({
        name: c.name,
        cycleMs: c.cycleTimeMs,
        energyWh: c.estimatedEnergyPerUnitWh,
        throughput: c.throughputUnitsPerHour,
      })),
    [comparison],
  );

  const objectivePoints = useMemo(() => {
    const runs: Partial<Record<OptimizationObjective, OptimizationRunResponse>> = {
      ...objectiveRuns,
    };
    if (optimization && !runs[objective]) {
      // Show the single run on the map too, under the objective it was launched with.
      const launched = optimization.recommendedScenario.description.match(
        /MIN_CYCLE_TIME|MIN_ENERGY_PER_UNIT|BALANCED/,
      )?.[0] as OptimizationObjective | undefined;
      if (launched && !runs[launched]) runs[launched] = optimization;
    }
    return OBJECTIVES.filter((o) => runs[o.id]).map((o) => {
      const r = runs[o.id]!;
      return {
        objective: o,
        run: r,
        point: {
          name: `${o.label} (optimized)`,
          cycleMs: r.recommendedProjected.cycleTimeMs,
          energyWh: r.recommendedProjected.energyPerUnitWh,
          throughput: r.recommendedProjected.throughputUnitsPerHour,
        } satisfies TradeoffPoint,
      };
    });
  }, [objectiveRuns, optimization, objective]);

  const baselinePoint = useMemo<TradeoffPoint | null>(() => {
    const r = objectivePoints[0]?.run ?? optimization;
    if (!r) return null;
    return {
      name: `${selectedBaseScenario.name} (baseline)`,
      cycleMs: r.baselineProjected.cycleTimeMs,
      energyWh: r.baselineProjected.energyPerUnitWh,
      throughput: r.baselineProjected.throughputUnitsPerHour,
    };
  }, [objectivePoints, optimization, selectedBaseScenario.name]);

  const hasTradeoffData = presetPoints.length > 0 || objectivePoints.length > 0;

  return (
    <section className="mx-auto flex w-full max-w-[1920px] flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-[#36C5D9]">
            05 / Optimization Center
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#F1F5F9]">
            Multi-Scenario Comparison &amp; SciPy SLSQP Optimization
          </h1>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            Compare preset and custom workcell recipes, enforce zero-collision bounds, and deploy
            optimal parameters directly into Simulation Lab.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void probeHealth()}
          className="inline-flex items-center gap-1.5 rounded border border-[#243242] bg-[#141B23] px-3 py-2 text-xs font-medium text-[#CBD5E1] transition-colors hover:border-[#36C5D9]/50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Check API Status
        </button>
      </header>

      {/* Backend Unavailable Degraded Banner */}
      {backendStatus === 'UNAVAILABLE' && (
        <div
          role="status"
          data-testid="optimization-unavailable-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-4 py-3 text-xs"
        >
          <div className="flex items-start gap-2.5">
            <ServerOff className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
            <div>
              <p className="font-mono font-semibold text-[#FDE68A]">
                Optimization Service Unavailable
              </p>
              <p className="mt-0.5 text-[#CBD5E1]">
                {backendReason ??
                  'Python optimization backend offline — you can still inspect presets and load any scenario locally into Simulation Lab.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void probeHealth()}
            className="rounded border border-[#F59E0B]/50 bg-[#0B0F14] px-3 py-1.5 font-mono text-xs font-medium text-[#FDE68A] hover:bg-[#1C2631]"
          >
            Retry Connection
          </button>
        </div>
      )}

      {(optimizationError || comparisonError) && (
        <div
          role="alert"
          data-testid="optimization-error-banner"
          className="flex items-start gap-2.5 rounded-lg border border-[#EF4444]/60 bg-[#EF4444]/10 px-4 py-3 text-xs text-[#FCA5A5]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#EF4444]" />
          <div>
            <p className="font-mono font-semibold">Optimization / Comparison Error</p>
            <p className="mt-0.5 text-[#F1F5F9]">{optimizationError || comparisonError}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* Left Configuration & Constraints Workbench */}
        <aside className="panel-surface flex w-full shrink-0 flex-col gap-4 p-4 lg:w-[370px]">
          <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
            Configuration &amp; Bounds
          </h2>

          <label className="block">
            <span className="mb-1 block text-xs text-[#94A3B8]">Base Scenario</span>
            <select
              aria-label="Base Scenario"
              value={selectedBaseScenario.scenarioId}
              onChange={(e) => setBaseScenarioId(e.target.value)}
              className="w-full rounded border border-[#243242] bg-[#0B0F14] px-2.5 py-1.5 text-xs text-[#F1F5F9] focus:border-[#36C5D9] focus:outline-none"
            >
              {availableScenarios.map((sc) => (
                <option key={sc.scenarioId} value={sc.scenarioId}>
                  {sc.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1 block text-xs text-[#94A3B8]">Objective Function</span>
            <div className="grid grid-cols-3 gap-1.5">
              {OBJECTIVES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setObjective(item.id)}
                  aria-pressed={objective === item.id}
                  className={`rounded border px-2 py-1.5 font-mono text-[11px] transition-colors ${
                    objective === item.id
                      ? 'border-[#36C5D9]/60 bg-[#36C5D9]/20 text-[#36C5D9]'
                      : 'border-[#243242] bg-[#0B0F14] text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-[#94A3B8]">
              {OBJECTIVE_BY_ID[objective].hint}
            </p>
          </div>

          <div className="space-y-2.5 border-t border-[#243242] pt-3">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#94A3B8]">
              Search Bounds
            </h3>

            {(
              [
                { key: 'robotSpeedScale', label: 'Robot Speed Scale', step: 0.05 },
                { key: 'robotAccelScale', label: 'Robot Accel Scale', step: 0.05 },
                { key: 'inputConveyorSpeedMps', label: 'Input Belt (m/s)', step: 0.01 },
                { key: 'outputConveyorSpeedMps', label: 'Output Belt (m/s)', step: 0.01 },
                { key: 'processingDwellMs', label: 'Process Dwell (ms)', step: 100 },
              ] as { key: keyof OptimizationBounds; label: string; step: number }[]
            ).map((row) => {
              const locked = row.key === 'processingDwellMs' && !tuneDwell;
              const pair = locked ? effectiveBounds.processingDwellMs : bounds[row.key];
              return (
                <div key={row.key} className="grid grid-cols-12 items-center gap-2 text-xs">
                  <span className="col-span-6 text-[#CBD5E1]">{row.label}</span>
                  <input
                    type="number"
                    aria-label={`${row.label} Min`}
                    step={row.step}
                    disabled={locked}
                    value={pair[0]}
                    onChange={(e) => updateBound(row.key, 0, Number(e.target.value))}
                    className="col-span-3 rounded border border-[#243242] bg-[#0B0F14] px-2 py-1 font-mono text-[11px] text-[#F1F5F9] tabular-nums disabled:opacity-50"
                  />
                  <input
                    type="number"
                    aria-label={`${row.label} Max`}
                    step={row.step}
                    disabled={locked}
                    value={pair[1]}
                    onChange={(e) => updateBound(row.key, 1, Number(e.target.value))}
                    className="col-span-3 rounded border border-[#243242] bg-[#0B0F14] px-2 py-1 font-mono text-[11px] text-[#F1F5F9] tabular-nums disabled:opacity-50"
                  />
                </div>
              );
            })}
            <label className="flex items-start gap-2 pt-1 text-[11px] text-[#CBD5E1]">
              <input
                type="checkbox"
                checked={tuneDwell}
                onChange={(e) => setTuneDwell(e.target.checked)}
                className="mt-0.5 accent-[#36C5D9]"
              />
              <span>
                Optimize process dwell
                <span className="block text-[10px] text-[#94A3B8]">
                  Off: dwell stays at the base scenario's {selectedBaseScenario.processingDwellMs} ms
                  (set by the process, not the robot).
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-2.5 border-t border-[#243242] pt-3">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#94A3B8]">
              Constraints
            </h3>
            <label className="block">
              <span className="mb-1 block text-xs text-[#CBD5E1]">
                Min Throughput (units/h)
              </span>
              <input
                type="number"
                min={1}
                step={10}
                value={minThroughput}
                onChange={(e) => setMinThroughput(Number(e.target.value) || 0)}
                className="w-full rounded border border-[#243242] bg-[#0B0F14] px-2.5 py-1.5 font-mono text-xs text-[#F1F5F9] tabular-nums"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[#CBD5E1]">
                Max Energy / Unit (Wh, optional)
              </span>
              <input
                type="number"
                step={0.05}
                placeholder="No limit"
                value={maxEnergyPerUnitWh}
                onChange={(e) => setMaxEnergyPerUnitWh(e.target.value)}
                className="w-full rounded border border-[#243242] bg-[#0B0F14] px-2.5 py-1.5 font-mono text-xs text-[#F1F5F9] tabular-nums"
              />
            </label>
            <p className="font-mono text-[10px] text-[#22C55E]">
              Zero-Collision Safety Constraint: ENFORCED
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#243242] pt-3">
            <button
              type="button"
              disabled={isComparing || backendStatus !== 'ONLINE'}
              onClick={handleCompareScenarios}
              className="flex items-center justify-center gap-1.5 rounded border border-[#36C5D9]/50 bg-[#1C2631] px-3 py-2 text-xs font-semibold text-[#36C5D9] transition-colors hover:bg-[#36C5D9]/15 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <GitCompare className="h-3.5 w-3.5" />
              {isComparing ? 'Comparing Scenarios...' : 'Compare Scenarios (A–D)'}
            </button>

            <button
              type="button"
              disabled={isOptimizing || backendStatus !== 'ONLINE'}
              onClick={handleRunOptimization}
              className="flex items-center justify-center gap-1.5 rounded bg-[#36C5D9] px-3 py-2 text-xs font-semibold text-[#0B0F14] transition-colors hover:bg-[#57D4E6] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isOptimizing ? 'Running SLSQP Solver...' : 'Run Optimization'}
            </button>

            <button
              type="button"
              disabled={isComparingObjectives || backendStatus !== 'ONLINE'}
              onClick={() => void handleCompareObjectives()}
              className="flex items-center justify-center gap-1.5 rounded border border-[#36C5D9]/50 bg-[#1C2631] px-3 py-2 text-xs font-semibold text-[#36C5D9] transition-colors hover:bg-[#36C5D9]/15 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Scale className="h-3.5 w-3.5" />
              {isComparingObjectives ? 'Running 3 Objectives...' : 'Compare Objectives'}
            </button>

            <button
              type="button"
              onClick={() => handleLoadIntoSimulationLab(selectedBaseScenario)}
              className="flex items-center justify-center gap-1.5 rounded border border-[#243242] bg-[#0B0F14] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] hover:border-[#36C5D9]/40"
            >
              <PlayCircle className="h-3.5 w-3.5" /> Load Base Preset Locally
            </button>
          </div>
        </aside>

        {/* Right Comparison & Recommended Configuration Canvas */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* Recommended Optimization Card */}
          {optimization && (
            <div
              data-testid="recommended-config-card"
              className="panel-surface space-y-4 border-[#36C5D9]/50 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="rounded bg-[#22C55E]/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#22C55E]">
                    SLSQP OPTIMAL · {optimization.evaluationsRun} EVALUATIONS
                  </span>
                  {(() => {
                    const launched = optimization.recommendedScenario.description.match(
                      /MIN_CYCLE_TIME|MIN_ENERGY_PER_UNIT|BALANCED/,
                    )?.[0] as OptimizationObjective | undefined;
                    return launched ? (
                      <span className="ml-1.5 rounded bg-[#36C5D9]/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#36C5D9]">
                        {OBJECTIVE_BY_ID[launched].label.toUpperCase()}
                      </span>
                    ) : null;
                  })()}
                  <h2 className="mt-1 font-display text-lg font-bold text-[#F1F5F9]">
                    Recommended Workcell Tuning
                  </h2>
                </div>
                <button
                  type="button"
                  data-testid="load-optimized-btn"
                  onClick={() => handleLoadIntoSimulationLab(optimization.recommendedScenario)}
                  className="inline-flex items-center gap-1.5 rounded bg-[#22C55E] px-4 py-2 text-xs font-bold text-[#0B0F14] transition-colors hover:bg-[#4ADE80]"
                >
                  Load into Simulation Lab <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="elevated-surface p-3">
                  <p className="font-mono text-[10px] uppercase text-[#94A3B8]">
                    Projected Cycle Time
                  </p>
                  <p className="mt-1 font-mono text-base font-bold text-[#F1F5F9] tabular-nums">
                    {optimization.recommendedProjected.cycleTimeMs.toFixed(0)} ms
                  </p>
                  <p className="font-mono text-[11px] text-[#36C5D9] tabular-nums">
                    vs {optimization.baselineProjected.cycleTimeMs.toFixed(0)} ms (
                    {optimization.deltas.cycleTimePct >= 0 ? '+' : ''}
                    {optimization.deltas.cycleTimePct.toFixed(1)}%)
                  </p>
                </div>

                <div className="elevated-surface p-3">
                  <p className="font-mono text-[10px] uppercase text-[#94A3B8]">
                    Projected Throughput
                  </p>
                  <p className="mt-1 font-mono text-base font-bold text-[#F1F5F9] tabular-nums">
                    {optimization.recommendedProjected.throughputUnitsPerHour.toFixed(1)} u/h
                  </p>
                  <p className="font-mono text-[11px] text-[#22C55E] tabular-nums">
                    {optimization.deltas.throughputPct >= 0 ? '+' : ''}
                    {optimization.deltas.throughputPct.toFixed(1)}% vs baseline
                  </p>
                </div>

                <div className="elevated-surface p-3">
                  <p className="font-mono text-[10px] uppercase text-[#94A3B8]">
                    Energy / Unit Estimate
                  </p>
                  <p className="mt-1 font-mono text-base font-bold text-[#F1F5F9] tabular-nums">
                    {optimization.recommendedProjected.energyPerUnitWh.toFixed(3)} Wh
                  </p>
                  <p className="font-mono text-[11px] text-[#36C5D9] tabular-nums">
                    {optimization.deltas.energyPerUnitPct >= 0 ? '+' : ''}
                    {optimization.deltas.energyPerUnitPct.toFixed(1)}% vs baseline
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded border border-[#243242] bg-[#0B0F14] p-3 font-mono text-xs sm:grid-cols-5">
                <div>
                  <p className="text-[10px] text-[#64748B]">Robot Speed</p>
                  <p className="text-[#36C5D9] tabular-nums">
                    {optimization.recommendedScenario.robotSpeedScale.toFixed(2)}x
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748B]">Robot Accel</p>
                  <p className="text-[#36C5D9] tabular-nums">
                    {optimization.recommendedScenario.robotAccelScale.toFixed(2)}x
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748B]">Input Belt</p>
                  <p className="text-[#F1F5F9] tabular-nums">
                    {optimization.recommendedScenario.inputConveyorSpeedMps.toFixed(2)} m/s
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748B]">Output Belt</p>
                  <p className="text-[#F1F5F9] tabular-nums">
                    {optimization.recommendedScenario.outputConveyorSpeedMps.toFixed(2)} m/s
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748B]">Process Dwell</p>
                  <p className="text-[#F1F5F9] tabular-nums">
                    {optimization.recommendedScenario.processingDwellMs} ms
                  </p>
                </div>
              </div>

              <p className="text-xs text-[#94A3B8]">{optimization.note}</p>
            </div>
          )}

          {/* Objective comparison + trade-off map */}
          {(objectivePoints.length > 0 || objectiveRunsError) && (
            <div data-testid="objective-comparison" className="panel-surface space-y-3 p-4 sm:p-5">
              <div>
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  Objective Trade-off
                </h2>
                <p className="text-[11px] text-[#94A3B8]">
                  Same bounds and constraints, three objectives. Faster cycles cost energy:
                  aggressive acceleration adds resistive (I²R) drive losses.
                </p>
              </div>
              {objectiveRunsError && (
                <p className="font-mono text-xs text-[#FCA5A5]">{objectiveRunsError}</p>
              )}
              {objectivePoints.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#243242] text-[10px] uppercase text-[#94A3B8]">
                        <th className="py-2 pr-3">Objective</th>
                        <th className="py-2 pr-3">Speed / Accel</th>
                        <th className="py-2 pr-3">Belts</th>
                        <th className="py-2 pr-3">Dwell</th>
                        <th className="py-2 pr-3">Cycle</th>
                        <th className="py-2 pr-3">Throughput</th>
                        <th className="py-2 pr-3">Energy/Unit</th>
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {objectivePoints.map(({ objective: o, run }) => (
                        <tr key={o.id} className="border-b border-[#1C2631] text-[#CBD5E1]">
                          <td className="py-2 pr-3">
                            <span
                              className="mr-1.5 inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: o.color }}
                            />
                            <span className="font-sans font-medium text-[#F1F5F9]">{o.label}</span>
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {run.recommendedScenario.robotSpeedScale.toFixed(2)}x /{' '}
                            {run.recommendedScenario.robotAccelScale.toFixed(2)}x
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {run.recommendedScenario.inputConveyorSpeedMps.toFixed(2)} /{' '}
                            {run.recommendedScenario.outputConveyorSpeedMps.toFixed(2)} m/s
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {run.recommendedScenario.processingDwellMs} ms
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {run.recommendedProjected.cycleTimeMs.toFixed(0)} ms
                          </td>
                          <td className="py-2 pr-3 font-semibold text-[#F1F5F9] tabular-nums">
                            {run.recommendedProjected.throughputUnitsPerHour.toFixed(1)} u/h
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {run.recommendedProjected.energyPerUnitWh.toFixed(3)} Wh
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => handleLoadIntoSimulationLab(run.recommendedScenario)}
                              className="rounded border border-[#243242] bg-[#0B0F14] px-2 py-1 text-[10px] text-[#36C5D9] hover:border-[#36C5D9]"
                            >
                              Load
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {hasTradeoffData && (
            <div data-testid="tradeoff-map" className="panel-surface space-y-2 p-4 sm:p-5">
              <div>
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  Cycle Time vs Energy per Unit
                </h2>
                <p className="text-[11px] text-[#94A3B8]">
                  Lower-left is better. Preset scenarios, the baseline, and optimized results on one
                  map.
                </p>
              </div>
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 16, bottom: 18, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#243242" />
                    <XAxis
                      type="number"
                      dataKey="cycleMs"
                      name="Cycle time"
                      unit=" ms"
                      domain={['auto', 'auto']}
                      stroke="#94A3B8"
                      fontSize={11}
                      tickFormatter={(v: number) => v.toFixed(0)}
                      label={{
                        value: 'Cycle time (ms)',
                        position: 'insideBottom',
                        offset: -10,
                        fill: '#94A3B8',
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="energyWh"
                      name="Energy"
                      domain={['auto', 'auto']}
                      stroke="#94A3B8"
                      fontSize={11}
                      width={56}
                      tickFormatter={(v: number) => v.toFixed(2)}
                      label={{
                        value: 'Wh / unit',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#94A3B8',
                        fontSize: 11,
                      }}
                    />
                    <ZAxis range={[90, 90]} />
                    <Tooltip content={<TradeoffTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} verticalAlign="top" height={24} />
                    {presetPoints.length > 0 && (
                      <Scatter
                        name="Preset scenarios"
                        data={presetPoints}
                        fill="#94A3B8"
                        isAnimationActive={false}
                      />
                    )}
                    {baselinePoint && (
                      <Scatter
                        name="Baseline"
                        data={[baselinePoint]}
                        fill="#F59E0B"
                        shape="diamond"
                        isAnimationActive={false}
                      />
                    )}
                    {objectivePoints.map(({ objective: o, point }) => (
                      <Scatter
                        key={o.id}
                        name={o.label}
                        data={[point]}
                        fill={o.color}
                        shape="star"
                        isAnimationActive={false}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Side-by-Side Scenario Comparison Table & Chart */}
          <div className="panel-surface space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                  Scenario Comparison Matrix
                </h2>
                <p className="text-[11px] text-[#94A3B8]">
                  {comparison
                    ? comparison.summaryNote
                    : 'Click Compare Scenarios (A–D) to rank workcell configurations via Python analytics.'}
                </p>
              </div>
              {comparison && (
                <span className="rounded bg-[#36C5D9]/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#36C5D9]">
                  Best: {comparison.bestScenarioId}
                </span>
              )}
            </div>

            {comparison ? (
              <>
                <div className="overflow-x-auto">
                  <table
                    data-testid="scenario-comparison-table"
                    className="w-full min-w-[680px] border-collapse text-left font-mono text-xs"
                  >
                    <thead>
                      <tr className="border-b border-[#243242] text-[10px] uppercase text-[#94A3B8]">
                        <th className="py-2 pr-3">Rank</th>
                        <th className="py-2 pr-3">Scenario</th>
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Cycle Time</th>
                        <th className="py-2 pr-3">Throughput</th>
                        <th className="py-2 pr-3">Idle %</th>
                        <th className="py-2 pr-3">Energy/Unit</th>
                        <th className="py-2 pr-3">Bottleneck</th>
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.comparisons.map((row) => {
                        const matchScenario = availableScenarios.find(
                          (s) => s.scenarioId === row.scenarioId,
                        );
                        return (
                          <tr
                            key={row.scenarioId}
                            className="border-b border-[#1C2631] text-[#CBD5E1]"
                          >
                            <td className="py-2 pr-3 font-bold text-[#36C5D9]">#{row.rank}</td>
                            <td className="py-2 pr-3 font-sans font-medium text-[#F1F5F9]">
                              {row.name}
                            </td>
                            <td className="py-2 pr-3 text-[10px] text-[#94A3B8]">{row.source}</td>
                            <td className="py-2 pr-3 tabular-nums">
                              {row.cycleTimeMs.toFixed(0)} ms
                            </td>
                            <td className="py-2 pr-3 font-semibold text-[#F1F5F9] tabular-nums">
                              {row.throughputUnitsPerHour.toFixed(1)} u/h
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {row.idleTimeRatioPct.toFixed(1)}%
                            </td>
                            <td className="py-2 pr-3 tabular-nums">
                              {row.estimatedEnergyPerUnitWh.toFixed(3)} Wh
                            </td>
                            <td className="py-2 pr-3 text-[11px]">{row.bottleneckStage}</td>
                            <td className="py-2">
                              {matchScenario && (
                                <button
                                  type="button"
                                  onClick={() => handleLoadIntoSimulationLab(matchScenario)}
                                  className="rounded border border-[#243242] bg-[#0B0F14] px-2 py-1 text-[10px] text-[#36C5D9] hover:border-[#36C5D9]"
                                >
                                  Load
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {availableScenarios.map((sc) => (
                  <div
                    key={sc.scenarioId}
                    className="elevated-surface flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-xs font-semibold text-[#F1F5F9]">
                        {sc.name}
                      </p>
                      <p className="truncate font-mono text-[10px] text-[#94A3B8]">
                        Speed {sc.robotSpeedScale}x · Belt {sc.inputConveyorSpeedMps} m/s · Dwell{' '}
                        {sc.processingDwellMs} ms
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLoadIntoSimulationLab(sc)}
                      className="shrink-0 rounded border border-[#243242] bg-[#0B0F14] px-2.5 py-1 font-mono text-[10px] text-[#36C5D9] hover:border-[#36C5D9]/60"
                    >
                      Load
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
