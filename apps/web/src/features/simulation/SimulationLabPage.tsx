import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  OctagonAlert,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Square,
} from 'lucide-react';
import { WorkcellCanvas } from '@/components/scene/WorkcellCanvas';
import { CameraPresetBar } from '@/components/scene/CameraPresetBar';
import { PRESET_SCENARIOS } from '@/config/scenarios';
import { useSimulationStore } from '@/stores/useSimulationStore';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import type { CycleMode, ProductionStage, ScenarioConfig } from '@/types/simulation';

const ORDERED_STAGES: { id: ProductionStage; label: string }[] = [
  { id: 'DETECT_OBJECT', label: '01 Detect Object' },
  { id: 'APPROACH_PICK', label: '02 Approach Pick' },
  { id: 'PICK_WORKPIECE', label: '03 Pick Workpiece' },
  { id: 'TRANSFER_TO_STATION', label: '04 Transfer Station' },
  { id: 'PROCESS_WORKPIECE', label: '05 Process Dwell' },
  { id: 'PICK_FINISHED', label: '06 Pick Finished' },
  { id: 'TRANSFER_TO_OUTPUT', label: '07 Transfer Output' },
  { id: 'PLACE_WORKPIECE', label: '08 Place Workpiece' },
];

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

type EventSeverityFilter = 'ALL' | 'WARNING' | 'ERROR';

export function SimulationLabPage() {
  const workerStatus = useSimulationStore((s) => s.workerStatus);
  const workerError = useSimulationStore((s) => s.workerError);
  const activeScenario = useSimulationStore((s) => s.activeScenario);
  const playbackSpeed = useSimulationStore((s) => s.playbackSpeed);
  const snapshot = useSimulationStore((s) => s.snapshot);
  const events = useSimulationStore((s) => s.events);
  const metrics = useSimulationStore((s) => s.metrics);

  const loadScenario = useSimulationStore((s) => s.loadScenario);
  const sendCommand = useSimulationStore((s) => s.sendCommand);
  const stepSingleTick = useSimulationStore((s) => s.stepSingleTick);
  const setPlaybackSpeed = useSimulationStore((s) => s.setPlaybackSpeed);
  const setGripper = useSimulationStore((s) => s.setGripper);
  const clearError = useSimulationStore((s) => s.clearError);

  const showCollisionVolumes = useTwinUiStore((s) => s.showCollisionVolumes);
  const showTrajectoryTrace = useTwinUiStore((s) => s.showTrajectoryTrace);
  const setOverlayFlag = useTwinUiStore((s) => s.setOverlayFlag);

  const [severityFilter, setSeverityFilter] = useState<EventSeverityFilter>('ALL');

  const runStatus = snapshot?.runStatus ?? workerStatus;
  const isRunning = runStatus === 'RUNNING';
  const isPaused = runStatus === 'PAUSED';
  const isFaulted = runStatus === 'FAULTED';
  const paramsLocked = isRunning || isPaused || isFaulted;
  const gripperOpen = snapshot?.gripper.actuationState !== 'CLOSED';
  const activeStage = snapshot?.stage ?? 'IDLE';

  // Keyboard shortcuts: Space -> Start/Pause/Resume, R -> Reset
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'BUTTON')
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (isRunning) {
          sendCommand('PAUSE');
        } else if (isPaused) {
          sendCommand('RESUME');
        } else if (!isFaulted) {
          sendCommand('START');
        }
      } else if (e.key === 'r' || e.key === 'R') {
        sendCommand('RESET');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFaulted, isPaused, isRunning, sendCommand]);

  const updateScenario = (patch: Partial<ScenarioConfig>) => {
    const next: ScenarioConfig = {
      ...activeScenario,
      ...patch,
    };
    loadScenario(next);
  };

  const handleCycleModeChange = (mode: CycleMode) => {
    updateScenario({
      cycleMode: mode,
      targetQuantity: mode === 'FIXED_COUNT' ? activeScenario.targetQuantity ?? 3 : null,
    });
  };

  const filteredEvents = useMemo(() => {
    const list =
      severityFilter === 'ALL'
        ? events
        : events.filter((ev) => ev.severity === severityFilter);
    return [...list].reverse();
  }, [events, severityFilter]);

  const activeStageOrderIdx = ORDERED_STAGES.findIndex((s) => s.id === activeStage);
  const clearanceMm = snapshot ? snapshot.collision.minClearanceMeters * 1000 : null;
  const tcp = snapshot?.tcpWorldPose.position;

  return (
    <section className="flex min-h-[calc(100vh-56px)] flex-col bg-[#0B0F14] lg:h-[calc(100vh-56px)] lg:flex-row lg:overflow-hidden">
      {/* Left Control Deck */}
      <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-[#243242] bg-[#141B23] p-4 lg:w-[350px] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#36C5D9]">
            03 / Simulation Lab
          </p>
          <h1 className="mt-0.5 font-display text-lg font-bold text-[#F1F5F9]">
            Production Cycle Runner
          </h1>
        </div>

        {/* Transport Deck */}
        <div className="elevated-surface space-y-2.5 p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#94A3B8]">
              Transport Control
            </span>
            <span className="font-mono text-[11px] text-[#36C5D9] tabular-nums">
              {runStatus}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {isRunning ? (
              <button
                type="button"
                onClick={() => sendCommand('PAUSE')}
                className="flex items-center justify-center gap-1.5 rounded bg-[#F59E0B] px-3 py-2 text-xs font-semibold text-[#0B0F14] transition-colors hover:bg-[#FBBF24]"
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            ) : isPaused ? (
              <button
                type="button"
                onClick={() => sendCommand('RESUME')}
                className="flex items-center justify-center gap-1.5 rounded bg-[#22C55E] px-3 py-2 text-xs font-semibold text-[#0B0F14] transition-colors hover:bg-[#4ADE80]"
              >
                <Play className="h-3.5 w-3.5" /> Resume
              </button>
            ) : (
              <button
                type="button"
                disabled={isFaulted || runStatus === 'BOOTING' || runStatus === 'ERROR'}
                onClick={() => sendCommand('START')}
                className="flex items-center justify-center gap-1.5 rounded bg-[#22C55E] px-3 py-2 text-xs font-semibold text-[#0B0F14] transition-colors hover:bg-[#4ADE80] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Play className="h-3.5 w-3.5" /> Start
              </button>
            )}

            <button
              type="button"
              disabled={!isRunning && !isPaused}
              onClick={() => sendCommand('STOP')}
              className="flex items-center justify-center gap-1.5 rounded border border-[#243242] bg-[#0B0F14] px-3 py-2 text-xs font-semibold text-[#F1F5F9] transition-colors hover:border-[#36C5D9]/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </button>

            <button
              type="button"
              disabled={isRunning || isFaulted || runStatus === 'BOOTING'}
              onClick={stepSingleTick}
              className="flex items-center justify-center gap-1.5 rounded border border-[#243242] bg-[#0B0F14] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] transition-colors hover:border-[#36C5D9]/40 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <SkipForward className="h-3.5 w-3.5" /> Step 20ms
            </button>

            <button
              type="button"
              onClick={() => sendCommand('RESET')}
              className="flex items-center justify-center gap-1.5 rounded border border-[#243242] bg-[#0B0F14] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] transition-colors hover:border-[#36C5D9]/40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>

          <button
            type="button"
            onClick={() => sendCommand('ESTOP')}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-[#EF4444]/60 bg-[#EF4444]/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-[#FCA5A5] transition-colors hover:bg-[#EF4444]/25"
          >
            <OctagonAlert className="h-4 w-4 text-[#EF4444]" /> E-Stop Fault Trigger
          </button>

          {/* Playback Speed Multiplier */}
          <div className="pt-1">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-[#94A3B8]">Playback Speed</span>
              <span className="font-mono text-[#36C5D9] tabular-nums">{playbackSpeed}x</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {PLAYBACK_SPEEDS.map((spd) => {
                const active = playbackSpeed === spd;
                return (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setPlaybackSpeed(spd)}
                    aria-pressed={active}
                    className={`rounded border px-1.5 py-1 font-mono text-[11px] transition-colors ${
                      active
                        ? 'border-[#36C5D9]/60 bg-[#36C5D9]/20 text-[#36C5D9]'
                        : 'border-[#243242] bg-[#0B0F14] text-[#94A3B8] hover:text-[#F1F5F9]'
                    }`}
                  >
                    {spd}x
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scenario Preset & Cycle Mode */}
        <div className="space-y-3 border-t border-[#243242] pt-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[#F1F5F9]">
              Scenario & Cycle Mode
            </h2>
            {paramsLocked && (
              <span className="font-mono text-[10px] text-[#F59E0B]">Stop/Reset to edit</span>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] text-[#94A3B8]">Preset Configuration</span>
            <select
              aria-label="Scenario Preset"
              disabled={paramsLocked}
              value={activeScenario.scenarioId}
              onChange={(e) => {
                const match = PRESET_SCENARIOS.find((p) => p.scenarioId === e.target.value);
                if (match) loadScenario(match);
              }}
              className="w-full rounded border border-[#243242] bg-[#0B0F14] px-2.5 py-1.5 text-xs text-[#F1F5F9] focus:border-[#36C5D9] focus:outline-none disabled:opacity-45"
            >
              {PRESET_SCENARIOS.map((sc) => (
                <option key={sc.scenarioId} value={sc.scenarioId}>
                  {sc.name}
                </option>
              ))}
              {!PRESET_SCENARIOS.some((p) => p.scenarioId === activeScenario.scenarioId) && (
                <option value={activeScenario.scenarioId}>{activeScenario.name}</option>
              )}
            </select>
          </label>

          <div>
            <span className="mb-1 block text-[11px] text-[#94A3B8]">Execution Mode</span>
            <div className="grid grid-cols-3 gap-1">
              {(['SINGLE', 'FIXED_COUNT', 'CONTINUOUS'] as CycleMode[]).map((mode) => {
                const active = activeScenario.cycleMode === mode;
                const shortLabel =
                  mode === 'SINGLE' ? 'Single' : mode === 'FIXED_COUNT' ? 'Fixed' : 'Continuous';
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={paramsLocked}
                    onClick={() => handleCycleModeChange(mode)}
                    aria-pressed={active}
                    className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors disabled:opacity-45 ${
                      active
                        ? 'border-[#36C5D9]/60 bg-[#36C5D9]/20 text-[#36C5D9]'
                        : 'border-[#243242] bg-[#0B0F14] text-[#94A3B8] hover:text-[#F1F5F9]'
                    }`}
                  >
                    {shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {activeScenario.cycleMode === 'FIXED_COUNT' && (
            <label className="block">
              <span className="mb-1 block text-[11px] text-[#94A3B8]">Target Quantity</span>
              <input
                type="number"
                min={1}
                max={100}
                disabled={paramsLocked}
                value={activeScenario.targetQuantity ?? 3}
                onChange={(e) =>
                  updateScenario({
                    targetQuantity: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                  })
                }
                className="w-full rounded border border-[#243242] bg-[#0B0F14] px-2.5 py-1.5 font-mono text-xs text-[#F1F5F9] tabular-nums focus:border-[#36C5D9] focus:outline-none disabled:opacity-45"
              />
            </label>
          )}
        </div>

        {/* Tunable Simulation Parameters */}
        <div className="space-y-2.5 border-t border-[#243242] pt-3">
          <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[#F1F5F9]">
            Workcell Parameters
          </h2>

          <div>
            <div className="flex justify-between text-[11px]">
              <label htmlFor="param-robot-speed" className="text-[#CBD5E1]">
                Robot Speed Scale
              </label>
              <span className="font-mono text-[#36C5D9] tabular-nums">
                {(activeScenario.robotSpeedScale * 100).toFixed(0)}%
              </span>
            </div>
            <input
              id="param-robot-speed"
              type="range"
              min={0.25}
              max={1.5}
              step={0.05}
              disabled={paramsLocked}
              value={activeScenario.robotSpeedScale}
              onChange={(e) => updateScenario({ robotSpeedScale: Number(e.target.value) })}
              className="w-full accent-[#36C5D9] disabled:opacity-45"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px]">
              <label htmlFor="param-robot-accel" className="text-[#CBD5E1]">
                Robot Accel Scale
              </label>
              <span className="font-mono text-[#36C5D9] tabular-nums">
                {(activeScenario.robotAccelScale * 100).toFixed(0)}%
              </span>
            </div>
            <input
              id="param-robot-accel"
              type="range"
              min={0.25}
              max={1.5}
              step={0.05}
              disabled={paramsLocked}
              value={activeScenario.robotAccelScale}
              onChange={(e) => updateScenario({ robotAccelScale: Number(e.target.value) })}
              className="w-full accent-[#36C5D9] disabled:opacity-45"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px]">
              <label htmlFor="param-in-conv" className="text-[#CBD5E1]">
                Input Conveyor Speed
              </label>
              <span className="font-mono text-[#36C5D9] tabular-nums">
                {activeScenario.inputConveyorSpeedMps.toFixed(2)} m/s
              </span>
            </div>
            <input
              id="param-in-conv"
              type="range"
              min={0.05}
              max={0.6}
              step={0.01}
              disabled={paramsLocked}
              value={activeScenario.inputConveyorSpeedMps}
              onChange={(e) => updateScenario({ inputConveyorSpeedMps: Number(e.target.value) })}
              className="w-full accent-[#36C5D9] disabled:opacity-45"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px]">
              <label htmlFor="param-out-conv" className="text-[#CBD5E1]">
                Output Conveyor Speed
              </label>
              <span className="font-mono text-[#36C5D9] tabular-nums">
                {activeScenario.outputConveyorSpeedMps.toFixed(2)} m/s
              </span>
            </div>
            <input
              id="param-out-conv"
              type="range"
              min={0.05}
              max={0.6}
              step={0.01}
              disabled={paramsLocked}
              value={activeScenario.outputConveyorSpeedMps}
              onChange={(e) => updateScenario({ outputConveyorSpeedMps: Number(e.target.value) })}
              className="w-full accent-[#36C5D9] disabled:opacity-45"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px]">
              <label htmlFor="param-dwell" className="text-[#CBD5E1]">
                Processing Dwell
              </label>
              <span className="font-mono text-[#36C5D9] tabular-nums">
                {activeScenario.processingDwellMs} ms
              </span>
            </div>
            <input
              id="param-dwell"
              type="range"
              min={500}
              max={10000}
              step={100}
              disabled={paramsLocked}
              value={activeScenario.processingDwellMs}
              onChange={(e) => updateScenario({ processingDwellMs: Number(e.target.value) })}
              className="w-full accent-[#36C5D9] disabled:opacity-45"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px]">
              <label htmlFor="param-mass" className="text-[#CBD5E1]">
                Workpiece Mass
              </label>
              <span className="font-mono text-[#36C5D9] tabular-nums">
                {activeScenario.workpieceMassKg.toFixed(1)} kg
              </span>
            </div>
            <input
              id="param-mass"
              type="range"
              min={0.2}
              max={5.0}
              step={0.1}
              disabled={paramsLocked}
              value={activeScenario.workpieceMassKg}
              onChange={(e) => updateScenario({ workpieceMassKg: Number(e.target.value) })}
              className="w-full accent-[#36C5D9] disabled:opacity-45"
            />
          </div>

          {/* Manual Gripper Test */}
          <div className="pt-1">
            <button
              type="button"
              disabled={isRunning || isFaulted}
              onClick={() => setGripper(!gripperOpen)}
              className="w-full rounded border border-[#243242] bg-[#0B0F14] px-3 py-1.5 font-mono text-xs text-[#CBD5E1] transition-colors hover:border-[#36C5D9]/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Gripper Actuation: {gripperOpen ? 'OPEN -> Close Jaw' : 'CLOSED -> Open Jaw'}
            </button>
          </div>
        </div>
      </aside>

      {/* Center Live 3D Workcell Viewport */}
      <div className="relative h-[420px] flex-1 bg-[#0B0F14] lg:h-full">
        <WorkcellCanvas />

        {/* Top-Center Camera & Overlay Pills */}
        <div className="pointer-events-none absolute left-3 right-3 top-3 flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setOverlayFlag('showTrajectoryTrace', !showTrajectoryTrace)}
              aria-pressed={showTrajectoryTrace}
              className={`rounded border px-2 py-1 font-mono text-[11px] backdrop-blur-sm transition-colors ${
                showTrajectoryTrace
                  ? 'border-[#36C5D9]/50 bg-[#36C5D9]/15 text-[#36C5D9]'
                  : 'border-[#243242] bg-[#0B0F14]/85 text-[#94A3B8]'
              }`}
            >
              Trace
            </button>
            <button
              type="button"
              onClick={() => setOverlayFlag('showCollisionVolumes', !showCollisionVolumes)}
              aria-pressed={showCollisionVolumes}
              className={`rounded border px-2 py-1 font-mono text-[11px] backdrop-blur-sm transition-colors ${
                showCollisionVolumes
                  ? 'border-[#36C5D9]/50 bg-[#36C5D9]/15 text-[#36C5D9]'
                  : 'border-[#243242] bg-[#0B0F14]/85 text-[#94A3B8]'
              }`}
            >
              Collisions
            </button>
          </div>
          <div className="pointer-events-auto">
            <CameraPresetBar compact />
          </div>
        </div>

        {/* Active Fault Banner */}
        {(snapshot?.activeFault || workerError) && (
          <div
            role="alert"
            data-testid="active-fault-banner"
            className="absolute bottom-14 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#EF4444] bg-[#2D1216]/95 px-4 py-3 text-xs shadow-xl backdrop-blur-md"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#EF4444]" />
              <div>
                <p className="font-mono font-bold text-[#FCA5A5]">
                  {snapshot?.activeFault?.code ?? 'WORKER_ERROR'}
                  {snapshot?.activeFault?.componentId
                    ? ` · ${snapshot.activeFault.componentId}`
                    : ''}
                </p>
                <p className="mt-0.5 text-[#F1F5F9]">
                  {snapshot?.activeFault?.message ?? workerError}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                clearError();
                sendCommand('RESET');
              }}
              className="rounded bg-[#EF4444] px-3 py-1.5 font-mono text-xs font-semibold text-white transition-colors hover:bg-[#DC2626]"
            >
              Reset Fault
            </button>
          </div>
        )}

        {/* Bottom-Left Live Collision & Clock Badge */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
          <div className="rounded border border-[#243242] bg-[#0B0F14]/90 px-3 py-1.5 font-mono text-[11px] text-[#CBD5E1] backdrop-blur-sm tabular-nums">
            t: {snapshot ? `${(snapshot.simTimeMs / 1000).toFixed(2)}s` : '0.00s'} ·{' '}
            {tcp
              ? `TCP [${tcp.x.toFixed(3)}, ${tcp.y.toFixed(3)}, ${tcp.z.toFixed(3)}]m`
              : 'TCP ready'}{' '}
            ·{' '}
            <span
              className={
                snapshot?.collision.severity === 'COLLISION'
                  ? 'text-[#EF4444]'
                  : snapshot?.collision.severity === 'NEAR_COLLISION'
                    ? 'text-[#F59E0B]'
                    : 'text-[#22C55E]'
              }
            >
              Clearance: {clearanceMm !== null ? `${clearanceMm.toFixed(1)} mm` : '—'}
            </span>
          </div>
          <div className="hidden rounded border border-[#243242] bg-[#0B0F14]/85 px-2.5 py-1 font-mono text-[10px] text-[#64748B] backdrop-blur-sm sm:block">
            Keys: Space Play/Pause · R Reset · 1–4 Camera
          </div>
        </div>
      </div>

      {/* Right Stage Stepper & Live Event Stream */}
      <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-[#243242] bg-[#141B23] p-4 lg:w-[360px] lg:overflow-y-auto lg:border-l lg:border-t-0">
        {/* KPI Quick Summary */}
        <div className="elevated-surface grid grid-cols-2 gap-2.5 p-3">
          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Units Produced</p>
            <p className="font-mono text-base font-bold text-[#F1F5F9] tabular-nums">
              {metrics?.totalUnitsProduced ?? snapshot?.completedUnits ?? 0}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Throughput</p>
            <p className="font-mono text-sm font-semibold text-[#36C5D9] tabular-nums">
              {metrics && metrics.unitsPerHour > 0
                ? `${metrics.unitsPerHour.toFixed(1)} u/h`
                : '—'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Robot Util</p>
            <p className="font-mono text-xs font-medium text-[#F1F5F9] tabular-nums">
              {metrics ? `${metrics.robotUtilizationPct.toFixed(1)}%` : '0.0%'}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Energy Est.</p>
            <p className="font-mono text-xs font-medium text-[#F1F5F9] tabular-nums">
              {snapshot ? `${snapshot.cumulativeEnergyWh.toFixed(3)} Wh` : '0.000 Wh'}
            </p>
          </div>

          {(events.length > 0 || (metrics?.totalUnitsProduced ?? 0) > 0) && (
            <Link
              to="/analytics"
              className="col-span-2 mt-1 flex items-center justify-center gap-1.5 rounded border border-[#36C5D9]/40 bg-[#36C5D9]/10 py-1.5 text-xs font-semibold text-[#36C5D9] transition-colors hover:bg-[#36C5D9]/20"
            >
              Open Performance Analytics <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {/* 8-Stage Process Pipeline Stepper */}
        <div data-testid="stage-stepper" className="space-y-1.5 border-t border-[#243242] pt-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[#F1F5F9]">
              8-Stage Process Pipeline
            </h2>
            <span className="font-mono text-[10px] text-[#36C5D9]">{activeStage}</span>
          </div>

          <ol className="space-y-1">
            {ORDERED_STAGES.map((stage, idx) => {
              const isCurrent = activeStage === stage.id;
              const isCompleted =
                activeStage === 'CYCLE_COMPLETE' ||
                (activeStageOrderIdx > idx && activeStage !== 'FAULT');
              return (
                <li
                  key={stage.id}
                  data-active={isCurrent ? 'true' : 'false'}
                  className={`flex items-center justify-between rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    isCurrent
                      ? 'border-[#36C5D9]/70 bg-[#36C5D9]/15 text-[#F1F5F9]'
                      : isCompleted
                        ? 'border-[#22C55E]/30 bg-[#22C55E]/5 text-[#86EFAC]'
                        : 'border-[#243242]/70 bg-[#0B0F14]/60 text-[#64748B]'
                  }`}
                >
                  <span>{stage.label}</span>
                  {isCurrent && (
                    <span className="h-2 w-2 rounded-full bg-[#36C5D9]" aria-hidden="true" />
                  )}
                  {isCompleted && !isCurrent && (
                    <CheckCircle2 className="h-3 w-3 text-[#22C55E]" aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Rolling Color-Coded Event Log */}
        <div className="flex min-h-[220px] flex-1 flex-col border-t border-[#243242] pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-[#F1F5F9]">
              Event Log ({filteredEvents.length})
            </h2>
            <div className="flex items-center gap-1">
              {(['ALL', 'WARNING', 'ERROR'] as EventSeverityFilter[]).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  aria-pressed={severityFilter === sev}
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                    severityFilter === sev
                      ? 'bg-[#36C5D9]/20 text-[#36C5D9]'
                      : 'text-[#64748B] hover:text-[#CBD5E1]'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <div
            data-testid="simulation-event-log"
            className="flex-1 overflow-y-auto rounded border border-[#243242] bg-[#0B0F14] p-2 font-mono text-[11px]"
          >
            {filteredEvents.length === 0 ? (
              <p className="p-2 text-center text-[#64748B]">
                No matching simulation events yet. Press Start to execute cycles.
              </p>
            ) : (
              <ul className="space-y-1">
                {filteredEvents.map((ev) => {
                  const badgeColor =
                    ev.severity === 'ERROR'
                      ? 'text-[#EF4444]'
                      : ev.severity === 'WARNING'
                        ? 'text-[#F59E0B]'
                        : 'text-[#36C5D9]';
                  return (
                    <li
                      key={`${ev.seq}-${ev.simTimeMs}`}
                      className="rounded border border-[#1C2631] bg-[#141B23]/70 px-2 py-1"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={badgeColor}>
                          #{ev.seq} · {ev.severity} · {ev.eventType}
                        </span>
                        <span className="text-[#64748B] tabular-nums">
                          {(ev.simTimeMs / 1000).toFixed(2)}s
                        </span>
                      </div>
                      <p className="mt-0.5 text-[#CBD5E1]">{ev.message}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}
