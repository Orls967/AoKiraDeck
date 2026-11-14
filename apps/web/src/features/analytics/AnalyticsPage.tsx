import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ServerOff,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useSimulationStore } from '@/stores/useSimulationStore';

const SYNTHETIC_ENERGY_DISCLAIMER =
  'Synthetic engineering estimate only; not real electrical metering.';

export function AnalyticsPage() {
  const activeScenario = useSimulationStore((s) => s.activeScenario);
  const snapshot = useSimulationStore((s) => s.snapshot);
  const events = useSimulationStore((s) => s.events);
  const metrics = useSimulationStore((s) => s.metrics);

  const backendStatus = useAnalyticsStore((s) => s.backendStatus);
  const backendReason = useAnalyticsStore((s) => s.backendReason);
  const isEvaluating = useAnalyticsStore((s) => s.isEvaluating);
  const evaluation = useAnalyticsStore((s) => s.evaluation);
  const evaluationError = useAnalyticsStore((s) => s.evaluationError);
  const probeHealth = useAnalyticsStore((s) => s.probeHealth);
  const evaluateRun = useAnalyticsStore((s) => s.evaluateRun);

  const hasRunData =
    (metrics?.totalSimTimeMs ?? snapshot?.simTimeMs ?? 0) > 0 ||
    (metrics?.totalUnitsProduced ?? 0) > 0;

  const triggerBackendEvaluation = () => {
    if (!hasRunData || events.length === 0) {
      return;
    }
    void evaluateRun({
      scenario: activeScenario,
      events,
      clientMetrics: metrics ?? undefined,
      totalSimTimeMs: metrics?.totalSimTimeMs ?? snapshot?.simTimeMs ?? 0,
      cumulativeEnergyWh: metrics?.estimatedEnergyWh ?? snapshot?.cumulativeEnergyWh ?? 0,
    });
  };

  // Auto-evaluate once when arriving from Simulation Lab with online backend and fresh runId
  useEffect(() => {
    if (
      hasRunData &&
      events.length > 0 &&
      backendStatus === 'ONLINE' &&
      !isEvaluating &&
      evaluation?.runId !== metrics?.runId
    ) {
      void evaluateRun({
        scenario: activeScenario,
        events,
        clientMetrics: metrics ?? undefined,
        totalSimTimeMs: metrics?.totalSimTimeMs ?? snapshot?.simTimeMs ?? 0,
        cumulativeEnergyWh: metrics?.estimatedEnergyWh ?? snapshot?.cumulativeEnergyWh ?? 0,
      });
    }
  }, [
    activeScenario,
    backendStatus,
    evaluateRun,
    evaluation?.runId,
    events,
    hasRunData,
    isEvaluating,
    metrics,
    snapshot?.cumulativeEnergyWh,
    snapshot?.simTimeMs,
  ]);

  const cycleChartData = useMemo(() => {
    if (!metrics) return [];
    return metrics.perCycleHistory.map((c) => ({
      name: `C${c.cycleIndex}`,
      robotMoveMs: Number(c.robotMoveMs.toFixed(0)),
      processDwellMs: Number(c.processDwellMs.toFixed(0)),
      waitTimeMs: Number(c.waitTimeMs.toFixed(0)),
      energyWh: Number(c.energyWh.toFixed(4)),
      throughputUph: c.cycleTimeMs > 0 ? Number((3600000 / c.cycleTimeMs).toFixed(1)) : 0,
    }));
  }, [metrics]);

  const allocationChartData = useMemo(() => {
    if (!metrics) return [];
    return [
      { bucket: 'Robot Active (s)', seconds: Number((metrics.robotActiveTimeMs / 1000).toFixed(2)) },
      { bucket: 'Idle / Wait (s)', seconds: Number((metrics.idleTimeMs / 1000).toFixed(2)) },
      { bucket: 'Downtime (s)', seconds: Number((metrics.downtimeMs / 1000).toFixed(2)) },
    ];
  }, [metrics]);

  const kpiCards = metrics
    ? [
        {
          label: 'Total Units Produced',
          value: String(metrics.totalUnitsProduced),
          sub: `Target: ${activeScenario.targetProductionRatePerHour} u/h`,
        },
        {
          label: 'Throughput',
          value: `${metrics.unitsPerHour.toFixed(1)} u/h`,
          sub: `Efficiency ${metrics.productionEfficiencyPct.toFixed(1)}%`,
        },
        {
          label: 'Avg Cycle Time',
          value: `${metrics.averageCycleTimeMs.toFixed(0)} ms`,
          sub: `Min ${metrics.minCycleTimeMs.toFixed(0)} / Max ${metrics.maxCycleTimeMs.toFixed(0)}`,
        },
        {
          label: 'Robot Utilization',
          value: `${metrics.robotUtilizationPct.toFixed(1)}%`,
          sub: `${(metrics.robotActiveTimeMs / 1000).toFixed(2)}s active motion`,
        },
        {
          label: 'Conveyor Utilization',
          value: `${metrics.conveyorUtilizationPct.toFixed(1)}%`,
          sub: `${(metrics.conveyorActiveTimeMs / 1000).toFixed(2)}s belt feed`,
        },
        {
          label: 'Idle Time',
          value: `${(metrics.idleTimeMs / 1000).toFixed(2)} s`,
          sub: `${((metrics.idleTimeMs / Math.max(1, metrics.totalSimTimeMs)) * 100).toFixed(1)}% of run`,
        },
        {
          label: 'Downtime',
          value: `${(metrics.downtimeMs / 1000).toFixed(2)} s`,
          sub: metrics.downtimeMs > 0 ? 'Fault recovery occurred' : 'Zero fault downtime',
        },
        {
          label: 'Collision Events',
          value: String(metrics.collisionEventCount),
          sub: `Near warnings: ${metrics.nearCollisionEventCount}`,
        },
        {
          label: 'Estimated Energy',
          value: `${metrics.estimatedEnergyWh.toFixed(3)} Wh`,
          sub: `${metrics.energyPerUnitWh.toFixed(3)} Wh/unit (synthetic)`,
        },
        {
          label: 'Production Efficiency',
          value: `${metrics.productionEfficiencyPct.toFixed(1)}%`,
          sub: `Run ${(metrics.totalSimTimeMs / 1000).toFixed(2)} s total`,
        },
      ]
    : [];

  return (
    <section className="mx-auto flex w-full max-w-[1920px] flex-col gap-5 p-4 sm:p-6">
      {/* Page Header & Enrichment Controls */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-[#36C5D9]">
            04 / Performance Analytics
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#F1F5F9]">
            Event-Derived Production Telemetry &amp; Bottleneck Diagnostics
          </h1>
          <p className="mt-0.5 text-xs text-[#94A3B8]">
            Active Scenario: <span className="font-mono text-[#CBD5E1]">{activeScenario.name}</span>{' '}
            · Events Recorded: <span className="font-mono text-[#CBD5E1]">{events.length}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hasRunData || isEvaluating || backendStatus !== 'ONLINE'}
            onClick={triggerBackendEvaluation}
            className="inline-flex items-center gap-1.5 rounded bg-[#36C5D9] px-3.5 py-2 text-xs font-semibold text-[#0B0F14] transition-colors hover:bg-[#57D4E6] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Activity className="h-3.5 w-3.5" />
            {isEvaluating ? 'Evaluating...' : 'Analyze with Python Backend'}
          </button>
          <button
            type="button"
            onClick={() => void probeHealth()}
            className="inline-flex items-center gap-1.5 rounded border border-[#243242] bg-[#141B23] px-3 py-2 text-xs font-medium text-[#CBD5E1] transition-colors hover:border-[#36C5D9]/50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Check API
          </button>
        </div>
      </header>

      {/* Backend Unavailable Degraded Banner (AC-15 / FE-04) */}
      {backendStatus === 'UNAVAILABLE' && (
        <div
          role="status"
          data-testid="backend-unavailable-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#F59E0B]/50 bg-[#F59E0B]/10 px-4 py-3 text-xs"
        >
          <div className="flex items-start gap-2.5">
            <ServerOff className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
            <div>
              <p className="font-mono font-semibold text-[#FDE68A]">
                Backend Unavailable — Local Client KPIs Active
              </p>
              <p className="mt-0.5 text-[#CBD5E1]">
                {backendReason ??
                  'Python analytics service offline — local Rust/WASM metrics remain accurate and responsive.'}
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

      {evaluationError && backendStatus === 'ONLINE' && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-[#EF4444]/60 bg-[#EF4444]/10 px-4 py-3 text-xs text-[#FCA5A5]"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#EF4444]" />
          <span>{evaluationError}</span>
        </div>
      )}

      {/* Zero-Data Guard (FE-03) */}
      {!hasRunData || !metrics ? (
        <div
          data-testid="analytics-empty-state"
          className="panel-surface flex flex-col items-start gap-3 p-6 sm:p-8"
        >
          <p className="font-mono text-xs uppercase tracking-wider text-[#36C5D9]">
            Awaiting Deterministic Simulation Data
          </p>
          <h2 className="font-display text-xl font-semibold text-[#F1F5F9]">
            No simulation cycles or events recorded yet
          </h2>
          <p className="max-w-xl text-xs leading-relaxed text-[#94A3B8]">
            AoKira computes all throughput, cycle time, utilization, and energy indicators strictly
            from deterministic Rust/WASM execution events. Run at least one production cycle in{' '}
            Simulation Lab to populate charts and backend enrichment.
          </p>
          <Link
            to="/simulation"
            className="mt-1 inline-flex items-center gap-1.5 rounded bg-[#36C5D9] px-4 py-2 text-xs font-semibold text-[#0B0F14] transition-colors hover:bg-[#57D4E6]"
          >
            Go to Simulation Lab <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <>
          {/* 10 Core Client Event-Derived KPIs (AC-12) */}
          <div
            data-testid="analytics-kpi-grid"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {kpiCards.map((card) => (
              <div key={card.label} className="panel-surface p-3.5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#94A3B8]">
                  {card.label}
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-[#F1F5F9] tabular-nums">
                  {card.value}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-[#64748B]">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* 3 Recharts Analytics Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Chart 1: Per-Cycle Phase Breakdown */}
            <div className="panel-surface flex flex-col p-4">
              <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                Per-Cycle Stage Timing Breakdown (ms)
              </h2>
              <p className="mb-3 text-[11px] text-[#94A3B8]">
                Robot motion vs processing station dwell vs conveyor wait per unit
              </p>
              <div className="h-[230px] w-full min-w-0">
                {cycleChartData.length === 0 ? (
                  <p className="pt-16 text-center font-mono text-xs text-[#64748B]">
                    Complete 1 full cycle to chart per-cycle timing
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cycleChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#243242" />
                      <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} />
                      <YAxis stroke="#94A3B8" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#141B23',
                          borderColor: '#243242',
                          fontSize: '11px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar isAnimationActive={false} dataKey="robotMoveMs" stackId="a" name="Robot Motion" fill="#36C5D9" />
                      <Bar isAnimationActive={false} dataKey="processDwellMs" stackId="a" name="Process Dwell" fill="#22C55E" />
                      <Bar isAnimationActive={false} dataKey="waitTimeMs" stackId="a" name="Wait/Idle" fill="#F59E0B" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Throughput & Cycle Energy Trend */}
            <div className="panel-surface flex flex-col p-4">
              <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                Cycle Throughput &amp; Energy Trend
              </h2>
              <p className="mb-3 text-[11px] text-[#94A3B8]">
                Instantaneous throughput rate (units/h) across completed cycles
              </p>
              <div className="h-[230px] w-full min-w-0">
                {cycleChartData.length === 0 ? (
                  <p className="pt-16 text-center font-mono text-xs text-[#64748B]">
                    Complete 1 full cycle to plot trend
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cycleChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#243242" />
                      <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} />
                      <YAxis stroke="#94A3B8" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#141B23',
                          borderColor: '#243242',
                          fontSize: '11px',
                        }}
                      />
                      <Area
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="throughputUph"
                        name="Throughput (u/h)"
                        stroke="#36C5D9"
                        fill="#36C5D9"
                        fillOpacity={0.22}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 3: Time Allocation Summary */}
            <div className="panel-surface flex flex-col p-4">
              <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                Workcell Time Allocation (s)
              </h2>
              <p className="mb-3 text-[11px] text-[#94A3B8]">
                Cumulative robot active motion, idle wait, and fault downtime
              </p>
              <div className="h-[230px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={allocationChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#243242" />
                    <XAxis type="number" stroke="#94A3B8" fontSize={11} />
                    <YAxis type="category" dataKey="bucket" width={115} stroke="#94A3B8" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#141B23',
                        borderColor: '#243242',
                        fontSize: '11px',
                      }}
                    />
                    <Bar isAnimationActive={false} dataKey="seconds" name="Duration (s)" fill="#36C5D9" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Python Backend Enrichment Panel */}
          {evaluation ? (
            <div
              data-testid="backend-enrichment-panel"
              className="grid grid-cols-1 gap-4 lg:grid-cols-2"
            >
              {/* Bottleneck Diagnostic & Forecast */}
              <div className="panel-surface space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
                    Python Bottleneck &amp; 8-Hour Forecast
                  </h2>
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                      evaluation.bottleneck.severity === 'HIGH'
                        ? 'bg-[#EF4444]/15 text-[#EF4444]'
                        : evaluation.bottleneck.severity === 'MODERATE'
                          ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
                          : 'bg-[#22C55E]/15 text-[#22C55E]'
                    }`}
                  >
                    {evaluation.bottleneck.severity} BOTTLENECK
                  </span>
                </div>

                <div className="elevated-surface p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Primary Limiting Stage</span>
                    <span className="font-mono font-semibold text-[#36C5D9]">
                      {evaluation.bottleneck.primaryStage} (
                      {evaluation.bottleneck.shareOfCyclePct.toFixed(1)}%)
                    </span>
                  </div>
                  <p className="mt-1.5 leading-relaxed text-[#CBD5E1]">
                    {evaluation.bottleneck.explanation}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                  <div className="rounded border border-[#243242] bg-[#0B0F14] p-2.5">
                    <p className="text-[10px] text-[#64748B]">Projected Rate</p>
                    <p className="mt-0.5 font-bold text-[#F1F5F9] tabular-nums">
                      {evaluation.forecast.projectedUnitsPerHour.toFixed(1)} u/h
                    </p>
                  </div>
                  <div className="rounded border border-[#243242] bg-[#0B0F14] p-2.5">
                    <p className="text-[10px] text-[#64748B]">8h Shift Output</p>
                    <p className="mt-0.5 font-bold text-[#36C5D9] tabular-nums">
                      {evaluation.forecast.projectedUnitsPer8hShift} units
                    </p>
                  </div>
                  <div className="rounded border border-[#243242] bg-[#0B0F14] p-2.5">
                    <p className="text-[10px] text-[#64748B]">Target Attained</p>
                    <p className="mt-0.5 font-bold text-[#F1F5F9] tabular-nums">
                      {evaluation.forecast.targetAttainmentPct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Energy Breakdown & Client-Server Consistency Validation */}
              <div className="panel-surface space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-1.5 font-display text-sm font-semibold text-[#F1F5F9]">
                    <Zap className="h-4 w-4 text-[#36C5D9]" /> Energy Allocation &amp; Consistency
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                      evaluation.validation.isValid
                        ? 'bg-[#22C55E]/15 text-[#22C55E]'
                        : 'bg-[#F59E0B]/15 text-[#F59E0B]'
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {evaluation.validation.isValid ? 'VERIFIED PARITY' : 'WARNINGS'}
                    {evaluation.validation.clientServerDeltaPct !== null &&
                      ` (Δ ${evaluation.validation.clientServerDeltaPct.toFixed(3)}%)`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-4">
                  <div className="rounded border border-[#243242] bg-[#0B0F14] p-2">
                    <p className="text-[10px] text-[#64748B]">Robot Motion</p>
                    <p className="mt-0.5 text-[#36C5D9] tabular-nums">
                      {evaluation.energyBreakdown.robotMotionWh.toFixed(3)} Wh
                    </p>
                  </div>
                  <div className="rounded border border-[#243242] bg-[#0B0F14] p-2">
                    <p className="text-[10px] text-[#64748B]">Process Station</p>
                    <p className="mt-0.5 text-[#22C55E] tabular-nums">
                      {evaluation.energyBreakdown.processingStationWh.toFixed(3)} Wh
                    </p>
                  </div>
                  <div className="rounded border border-[#243242] bg-[#0B0F14] p-2">
                    <p className="text-[10px] text-[#64748B]">Conveyors</p>
                    <p className="mt-0.5 text-[#F59E0B] tabular-nums">
                      {evaluation.energyBreakdown.conveyorWh.toFixed(3)} Wh
                    </p>
                  </div>
                  <div className="rounded border border-[#243242] bg-[#0B0F14] p-2">
                    <p className="text-[10px] text-[#64748B]">Idle Standby</p>
                    <p className="mt-0.5 text-[#CBD5E1] tabular-nums">
                      {evaluation.energyBreakdown.idleStandbyWh.toFixed(3)} Wh
                    </p>
                  </div>
                </div>

                <p className="rounded border border-[#243242] bg-[#0B0F14] px-3 py-2 font-mono text-[11px] text-[#94A3B8]">
                  Note: {evaluation.energyBreakdown.disclaimer || SYNTHETIC_ENERGY_DISCLAIMER}
                </p>
              </div>
            </div>
          ) : (
            <div className="panel-surface flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-[#94A3B8]">
              <span>
                Synthetic Energy Disclaimer: {SYNTHETIC_ENERGY_DISCLAIMER}
              </span>
              {backendStatus === 'ONLINE' && (
                <button
                  type="button"
                  onClick={triggerBackendEvaluation}
                  className="font-mono text-[#36C5D9] hover:underline"
                >
                  Run Backend Diagnostic Evaluation
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
