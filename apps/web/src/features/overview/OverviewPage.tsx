import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Cpu, Pause, Play, ShieldCheck, Sliders } from 'lucide-react';
import { WorkcellCanvas } from '@/components/scene/WorkcellCanvas';
import { CameraPresetBar } from '@/components/scene/CameraPresetBar';
import { DEFAULT_SCENARIO } from '@/config/scenarios';
import { WORKCELL_CONFIG } from '@/config/workcell';
import { useSimulationStore } from '@/stores/useSimulationStore';

export function OverviewPage() {
  const workerStatus = useSimulationStore((s) => s.workerStatus);
  const engineVersion = useSimulationStore((s) => s.engineVersion);
  const snapshot = useSimulationStore((s) => s.snapshot);
  const metrics = useSimulationStore((s) => s.metrics);
  const loadScenario = useSimulationStore((s) => s.loadScenario);
  const sendCommand = useSimulationStore((s) => s.sendCommand);
  const setPlaybackSpeed = useSimulationStore((s) => s.setPlaybackSpeed);

  const [showcasePaused, setShowcasePaused] = useState(false);
  const showcaseOwnedRef = useRef(false);
  const showcaseStartedRef = useRef(false);

  // Start a genuine continuous Baseline cycle showcase on first visit when idle
  useEffect(() => {
    if (showcaseStartedRef.current || showcasePaused) {
      return;
    }
    if (workerStatus !== 'READY') {
      return;
    }
    const simTime = snapshot?.simTimeMs ?? 0;
    const produced = metrics?.totalUnitsProduced ?? 0;
    if (simTime === 0 && produced === 0) {
      showcaseStartedRef.current = true;
      showcaseOwnedRef.current = true;
      setPlaybackSpeed(1);
      loadScenario({
        ...DEFAULT_SCENARIO,
        cycleMode: 'CONTINUOUS',
        targetQuantity: null,
      });
      sendCommand('START');
    }
  }, [
    loadScenario,
    metrics?.totalUnitsProduced,
    sendCommand,
    setPlaybackSpeed,
    showcasePaused,
    snapshot?.simTimeMs,
    workerStatus,
  ]);

  // Reset only the showcase preview upon leaving Overview so Digital Twin / Lab open cleanly READY
  useEffect(() => {
    return () => {
      if (showcaseOwnedRef.current) {
        showcaseOwnedRef.current = false;
        useSimulationStore.getState().sendCommand('RESET');
      }
    };
  }, []);

  const handleToggleShowcase = () => {
    if (snapshot?.runStatus === 'RUNNING') {
      setShowcasePaused(true);
      sendCommand('PAUSE');
    } else if (snapshot?.runStatus === 'PAUSED') {
      setShowcasePaused(false);
      sendCommand('RESUME');
    } else {
      setShowcasePaused(false);
      showcaseOwnedRef.current = true;
      sendCommand('START');
    }
  };

  const tcp = snapshot?.tcpWorldPose.position;
  const clearanceMm = snapshot ? snapshot.collision.minClearanceMeters * 1000 : null;
  const clearanceColor =
    snapshot?.collision.severity === 'COLLISION'
      ? 'text-[#EF4444]'
      : snapshot?.collision.severity === 'NEAR_COLLISION'
        ? 'text-[#F59E0B]'
        : 'text-[#22C55E]';

  return (
    <section className="relative flex min-h-[calc(100vh-56px)] w-full flex-col justify-between overflow-hidden bg-[#0B0F14]">
      {/* Interactive Full-Bleed 3D Hero Viewport */}
      <div className="relative h-[52vh] min-h-[380px] w-full lg:absolute lg:inset-0 lg:h-full">
        <WorkcellCanvas autoOrbit />
        {/* Gradient vignette so hero typography stays razor-sharp without hiding 3D arm */}
        <div
          aria-hidden="true"
          className="pointer-events-none hidden lg:block lg:absolute lg:inset-0 lg:bg-gradient-to-r lg:from-[#0B0F14]/90 lg:via-[#0B0F14]/35 lg:to-transparent"
        />

        {/* Top-Right Showcase Camera & Play/Pause Controls */}
        <div className="pointer-events-auto absolute right-3 top-3 z-10 flex flex-wrap items-center gap-2">
          <CameraPresetBar compact />
          <button
            type="button"
            onClick={handleToggleShowcase}
            className="flex items-center gap-1.5 rounded-full border border-[#243242] bg-[#0B0F14]/85 px-3 py-1.5 font-mono text-[11px] font-medium text-[#CBD5E1] backdrop-blur-md transition-colors hover:border-[#36C5D9]/50 hover:text-[#F1F5F9]"
          >
            {snapshot?.runStatus === 'RUNNING' ? (
              <>
                <Pause className="h-3 w-3 text-[#36C5D9]" /> Pause Demo
              </>
            ) : (
              <>
                <Play className="h-3 w-3 text-[#22C55E]" />{' '}
                {snapshot?.runStatus === 'PAUSED' ? 'Resume Demo' : 'Start Demo'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Left Editorial & Engineering Launch Card */}
      <div className="pointer-events-none relative z-10 mx-auto flex w-full max-w-[1920px] flex-1 flex-col justify-between gap-6 p-4 sm:p-6">
        <div className="pointer-events-auto max-w-md rounded-lg border border-[#243242] bg-[#141B23]/90 p-5 shadow-2xl backdrop-blur-md sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-[#36C5D9]/15 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#36C5D9]">
              01 / Workcell Overview
            </span>
            <span className="rounded border border-[#243242] bg-[#0B0F14] px-2 py-0.5 font-mono text-[10px] text-[#94A3B8]">
              {WORKCELL_CONFIG.robot.dof}-Axis · {WORKCELL_CONFIG.workcellId}
            </span>
          </div>

          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#F1F5F9] sm:text-4xl">
            AoKira
          </h1>
          <p className="mt-1 font-display text-sm font-semibold text-[#CBD5E1]">
            Industrial Robotic Workcell Digital Twin
          </p>
          <p className="mt-1 font-mono text-xs uppercase tracking-widest text-[#36C5D9]">
            Design. Simulate. Optimize. Operate.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[#94A3B8]">
            Deterministic 20 ms Rust/WASM kinematics, capsule/OBB collision verification, conveyor
            coordination, and SciPy constrained throughput optimization running offline in your
            browser.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 border-y border-[#243242] py-3 text-[11px]">
            <div className="flex items-center gap-2 text-[#CBD5E1]">
              <Cpu className="h-3.5 w-3.5 shrink-0 text-[#36C5D9]" />
              <span>DH FK + 3-Seed IK</span>
            </div>
            <div className="flex items-center gap-2 text-[#CBD5E1]">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
              <span>Exact Clearance Check</span>
            </div>
            <div className="flex items-center gap-2 text-[#CBD5E1]">
              <Activity className="h-3.5 w-3.5 shrink-0 text-[#36C5D9]" />
              <span>8-Stage Cycle Engine</span>
            </div>
            <div className="flex items-center gap-2 text-[#CBD5E1]">
              <Sliders className="h-3.5 w-3.5 shrink-0 text-[#F59E0B]" />
              <span>SLSQP Optimization</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              to="/digital-twin"
              className="inline-flex items-center gap-1.5 rounded bg-[#36C5D9] px-4 py-2 text-xs font-semibold text-[#0B0F14] transition-colors hover:bg-[#57D4E6]"
            >
              Open Digital Twin <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/simulation"
              className="inline-flex items-center gap-1.5 rounded border border-[#243242] bg-[#1C2631] px-4 py-2 text-xs font-semibold text-[#F1F5F9] transition-colors hover:border-[#36C5D9]/50"
            >
              Launch Simulation Lab
            </Link>
            <Link
              to="/analytics"
              className="inline-flex items-center rounded border border-[#243242] bg-transparent px-3 py-2 text-xs font-medium text-[#94A3B8] transition-colors hover:text-[#F1F5F9]"
            >
              Analytics
            </Link>
          </div>
        </div>

        {/* Bottom Floating Live Telemetry Strip */}
        <div
          data-testid="overview-telemetry-strip"
          className="pointer-events-auto grid grid-cols-2 gap-2.5 rounded-lg border border-[#243242] bg-[#141B23]/92 p-3.5 shadow-xl backdrop-blur-md sm:grid-cols-3 lg:grid-cols-6"
        >
          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Engine Core</p>
            <p className="mt-0.5 font-mono text-xs font-semibold text-[#F1F5F9] tabular-nums">
              WASM {engineVersion ? `v${engineVersion}` : '20ms'}
            </p>
            <p className="font-mono text-[10px] text-[#36C5D9]">{workerStatus}</p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Active Stage</p>
            <p className="mt-0.5 truncate font-mono text-xs font-semibold text-[#F1F5F9]">
              {snapshot?.stage ?? 'IDLE'}
            </p>
            <p className="font-mono text-[10px] text-[#94A3B8]">
              t = {snapshot ? `${(snapshot.simTimeMs / 1000).toFixed(2)}s` : '0.00s'}
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Completed Units</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-[#F1F5F9] tabular-nums">
              {snapshot?.completedUnits ?? 0}
            </p>
            <p className="font-mono text-[10px] text-[#94A3B8]">
              Cycle #{snapshot?.activeCycleIndex ?? 0}
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Live Throughput</p>
            <p className="mt-0.5 font-mono text-xs font-semibold text-[#36C5D9] tabular-nums">
              {metrics && metrics.unitsPerHour > 0
                ? `${metrics.unitsPerHour.toFixed(1)} u/h`
                : 'Warmup'}
            </p>
            <p className="font-mono text-[10px] text-[#94A3B8]">
              Util {metrics ? `${metrics.robotUtilizationPct.toFixed(1)}%` : '0.0%'}
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Tool TCP (m)</p>
            <p className="mt-0.5 font-mono text-xs font-medium text-[#F1F5F9] tabular-nums">
              {tcp
                ? `${tcp.x.toFixed(2)}, ${tcp.y.toFixed(2)}, ${tcp.z.toFixed(2)}`
                : '—'}
            </p>
            <p className="font-mono text-[10px] text-[#94A3B8]">
              Gripper: {snapshot?.gripper.actuationState ?? 'OPEN'}
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase text-[#64748B]">Min Clearance</p>
            <p className={`mt-0.5 font-mono text-xs font-semibold tabular-nums ${clearanceColor}`}>
              {clearanceMm !== null ? `${clearanceMm.toFixed(1)} mm` : '—'}
            </p>
            <p className="font-mono text-[10px] text-[#94A3B8]">
              {snapshot?.collision.severity ?? 'NONE'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
