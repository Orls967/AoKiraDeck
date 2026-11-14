import { useEffect, useState } from 'react';
import { Crosshair, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { CameraPresetBar } from '@/components/scene/CameraPresetBar';
import { WorkcellCanvas } from '@/components/scene/WorkcellCanvas';
import { COMPONENT_BY_ID, COMPONENT_REGISTRY, WORKCELL_CONFIG } from '@/config/workcell';
import { useSimulationStore } from '@/stores/useSimulationStore';
import { useTwinUiStore } from '@/stores/useTwinUiStore';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

const IK_QUICK_PRESETS = [
  { label: 'Home TCP', x: 0.0, y: 0.827, z: -0.524 },
  { label: 'Input Hover', x: -0.56, y: 0.89, z: 0.08 },
  { label: 'Station Fixture', x: 0.0, y: 0.75, z: -0.56 },
  { label: 'Output Hover', x: 0.56, y: 0.89, z: 0.08 },
];

export function DigitalTwinPage() {
  const selectedId = useTwinUiStore((s) => s.selectedComponentId);
  const hiddenMap = useTwinUiStore((s) => s.hiddenComponentIds);
  const isolatedId = useTwinUiStore((s) => s.isolatedComponentId);
  const explodedFactor = useTwinUiStore((s) => s.explodedFactor);
  const showReachEnvelope = useTwinUiStore((s) => s.showReachEnvelope);
  const showCollisionVolumes = useTwinUiStore((s) => s.showCollisionVolumes);
  const showCoordinateFrames = useTwinUiStore((s) => s.showCoordinateFrames);
  const showTrajectoryTrace = useTwinUiStore((s) => s.showTrajectoryTrace);

  const selectComponent = useTwinUiStore((s) => s.selectComponent);
  const toggleVisibility = useTwinUiStore((s) => s.toggleComponentVisibility);
  const isolateComponent = useTwinUiStore((s) => s.isolateComponent);
  const resetVisibility = useTwinUiStore((s) => s.resetVisibility);
  const setExplodedFactor = useTwinUiStore((s) => s.setExplodedFactor);
  const setOverlayFlag = useTwinUiStore((s) => s.setOverlayFlag);

  const snapshot = useSimulationStore((s) => s.snapshot);
  const workerStatus = useSimulationStore((s) => s.workerStatus);
  const setJoints = useSimulationStore((s) => s.setJoints);
  const solveIk = useSimulationStore((s) => s.solveIk);
  const lastIkResult = useSimulationStore((s) => s.lastIkResult);

  const [localJointsRad, setLocalJointsRad] = useState<number[]>(() =>
    WORKCELL_CONFIG.robot.joints.map((j) => j.homeAngleRad),
  );
  const [ikInput, setIkInput] = useState({ x: '0.000', y: '0.890', z: '-0.560' });
  const [ikPending, setIkPending] = useState(false);

  useEffect(() => {
    if (snapshot?.joints) {
      setLocalJointsRad(snapshot.joints.map((j) => j.angleRad));
    }
  }, [snapshot]);

  const jogDisabled = workerStatus === 'RUNNING' || workerStatus === 'BOOTING';
  const selectedMeta = selectedId ? COMPONENT_BY_ID[selectedId] : COMPONENT_BY_ID['robot-arm'];

  const handleJointChange = (index: number, nextRad: number) => {
    const updated = [...localJointsRad];
    updated[index] = nextRad;
    setLocalJointsRad(updated);
    setJoints(updated);
  };

  const handleHomePose = () => {
    const home = WORKCELL_CONFIG.robot.joints.map((j) => j.homeAngleRad);
    setLocalJointsRad(home);
    setJoints(home);
  };

  const handleSolveIk = async (e: React.FormEvent) => {
    e.preventDefault();
    const x = Number.parseFloat(ikInput.x);
    const y = Number.parseFloat(ikInput.y);
    const z = Number.parseFloat(ikInput.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    setIkPending(true);
    try {
      await solveIk(
        {
          position: { x, y, z },
          orientation: WORKCELL_CONFIG.processingStation.targetPoseWorld.orientation,
        },
        true,
      );
    } finally {
      setIkPending(false);
    }
  };

  const tcp = snapshot?.tcpWorldPose.position ?? { x: 0, y: 0.827, z: -0.524 };
  const clearanceMm = snapshot ? (snapshot.collision.minClearanceMeters * 1000).toFixed(1) : '—';

  return (
    <section className="mx-auto grid max-w-[1920px] grid-cols-1 gap-4 p-4 xl:grid-cols-[290px_minmax(0,1fr)_350px]">
      {/* Left Dock: Workcell Component Tree, Exploded View & Overlays */}
      <aside className="panel-surface flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#36C5D9]">
              02 / Digital Twin
            </p>
            <h1 className="font-display text-base font-bold text-[#F1F5F9]">Workcell Tree</h1>
          </div>
          <button
            type="button"
            onClick={resetVisibility}
            className="inline-flex items-center gap-1 rounded border border-[#243242] bg-[#1C2631] px-2 py-1 font-mono text-[11px] text-[#94A3B8] hover:text-[#F1F5F9]"
          >
            <RotateCcw className="h-3 w-3" /> Reset View
          </button>
        </div>

        <ul className="space-y-1" aria-label="Workcell Component Tree">
          {COMPONENT_REGISTRY.map((comp) => {
            const isSelected = selectedId === comp.id;
            const isHidden = Boolean(hiddenMap[comp.id]);
            const isIsolated = isolatedId === comp.id;

            return (
              <li
                key={comp.id}
                className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs transition-colors ${
                  isSelected
                    ? 'border-[#36C5D9]/50 bg-[#1C2631] text-[#F1F5F9]'
                    : 'border-transparent text-[#94A3B8] hover:border-[#243242] hover:bg-[#141B23]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectComponent(comp.id)}
                  className="flex min-w-0 flex-1 flex-col text-left focus:outline-none"
                >
                  <span className="truncate font-medium">{comp.displayName}</span>
                  <span className="font-mono text-[10px] text-[#64748B]">{comp.category}</span>
                </button>
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Isolate ${comp.displayName}`}
                    aria-pressed={isIsolated}
                    onClick={() => isolateComponent(comp.id)}
                    className={`rounded p-1 transition-colors ${
                      isIsolated
                        ? 'bg-[#36C5D9]/20 text-[#36C5D9]'
                        : 'text-[#64748B] hover:text-[#F1F5F9]'
                    }`}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Toggle visibility for ${comp.displayName}`}
                    aria-pressed={isHidden}
                    onClick={() => toggleVisibility(comp.id)}
                    className={`rounded p-1 transition-colors ${
                      isHidden ? 'text-[#EF4444]' : 'text-[#64748B] hover:text-[#F1F5F9]'
                    }`}
                  >
                    {isHidden ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-[#243242] pt-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <label htmlFor="exploded-slider" className="font-medium text-[#F1F5F9]">
              Exploded View
            </label>
            <span className="font-mono tabular-nums text-[#36C5D9]">
              {Math.round(explodedFactor * 100)}%
            </span>
          </div>
          <input
            id="exploded-slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(explodedFactor * 100)}
            onChange={(e) => setExplodedFactor(Number(e.target.value) / 100)}
            className="w-full accent-[#36C5D9]"
          />
        </div>

        <div className="space-y-2 border-t border-[#243242] pt-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[#94A3B8]">
            Scene Overlays
          </p>
          {(
            [
              ['showCoordinateFrames', 'Coordinate Frames', showCoordinateFrames],
              ['showCollisionVolumes', 'Collision Volumes', showCollisionVolumes],
              ['showReachEnvelope', 'Reach Envelope', showReachEnvelope],
              ['showTrajectoryTrace', 'TCP Trajectory Trace', showTrajectoryTrace],
            ] as const
          ).map(([key, label, checked]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center justify-between text-xs text-[#CBD5E1]"
            >
              <span>{label}</span>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setOverlayFlag(key, e.target.checked)}
                className="h-3.5 w-3.5 accent-[#36C5D9]"
              />
            </label>
          ))}
        </div>
      </aside>

      {/* Center 3D Workcell Viewport */}
      <div className="panel-surface relative flex min-h-[480px] flex-col overflow-hidden xl:min-h-[680px]">
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
          <div className="pointer-events-auto">
            <CameraPresetBar />
          </div>
          <div className="rounded border border-[#243242] bg-[#0B0F14]/90 px-2.5 py-1 font-mono text-[11px] tabular-nums text-[#94A3B8]">
            TCP ({tcp.x.toFixed(3)}, {tcp.y.toFixed(3)}, {tcp.z.toFixed(3)}) m
            <span className="mx-2 text-[#243242]">|</span>
            Clearance{' '}
            <span
              className={
                snapshot?.collision.severity === 'COLLISION'
                  ? 'text-[#EF4444]'
                  : snapshot?.collision.severity === 'NEAR_COLLISION'
                    ? 'text-[#F59E0B]'
                    : 'text-[#22C55E]'
              }
            >
              {clearanceMm} mm
            </span>
          </div>
        </div>

        <div className="h-full min-h-[480px] flex-1 xl:min-h-[680px]">
          <WorkcellCanvas />
        </div>
      </div>

      {/* Right Dock: Component Details + 6-Joint Inspector + Cartesian IK Probe */}
      <aside className="panel-surface flex flex-col gap-4 p-4">
        <div className="elevated-surface p-3" data-testid="component-info-panel">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-[#F1F5F9]">
              {selectedMeta.displayName}
            </h2>
            <span className="rounded bg-[#0B0F14] px-2 py-0.5 font-mono text-[10px] text-[#36C5D9]">
              {selectedMeta.id}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{selectedMeta.description}</p>
        </div>

        {/* 6-Joint Inspector */}
        <div className="space-y-3 border-t border-[#243242] pt-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-[#F1F5F9]">
              6-Joint Inspector (J1–J6)
            </h3>
            <button
              type="button"
              disabled={jogDisabled}
              onClick={handleHomePose}
              className="rounded border border-[#243242] bg-[#1C2631] px-2 py-0.5 font-mono text-[11px] text-[#36C5D9] hover:border-[#36C5D9]/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Home Pose
            </button>
          </div>

          {jogDisabled && (
            <p className="rounded border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-2.5 py-1.5 text-[11px] text-[#F59E0B]">
              Pause or stop simulation to manually jog joints or solve IK.
            </p>
          )}

          <div className="space-y-2.5">
            {WORKCELL_CONFIG.robot.joints.map((j, idx) => {
              const rad = localJointsRad[idx] ?? j.homeAngleRad;
              const deg = rad * RAD_TO_DEG;
              const minDeg = Math.round(j.minAngleRad * RAD_TO_DEG);
              const maxDeg = Math.round(j.maxAngleRad * RAD_TO_DEG);
              const atLimit = snapshot?.joints[idx]?.atLimit ?? false;

              return (
                <div key={j.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor={`joint-slider-${j.id}`} className="font-medium text-[#CBD5E1]">
                      <span className="font-mono text-[#36C5D9]">{j.id}</span> {j.name}
                    </label>
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        atLimit ? 'text-[#F59E0B]' : 'text-[#F1F5F9]'
                      }`}
                    >
                      {deg.toFixed(1)}° ({rad.toFixed(2)} rad)
                    </span>
                  </div>
                  <input
                    id={`joint-slider-${j.id}`}
                    type="range"
                    min={minDeg}
                    max={maxDeg}
                    step={0.5}
                    disabled={jogDisabled}
                    value={Number(deg.toFixed(1))}
                    onChange={(e) => handleJointChange(idx, Number(e.target.value) * DEG_TO_RAD)}
                    className="w-full accent-[#36C5D9] disabled:opacity-45"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Cartesian IK Probe */}
        <form onSubmit={handleSolveIk} className="space-y-2.5 border-t border-[#243242] pt-3">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-[#F1F5F9]">
            Cartesian IK Target Probe
          </h3>
          <div className="flex flex-wrap gap-1">
            {IK_QUICK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  setIkInput({
                    x: p.x.toFixed(3),
                    y: p.y.toFixed(3),
                    z: p.z.toFixed(3),
                  })
                }
                className="rounded border border-[#243242] bg-[#0B0F14] px-2 py-0.5 font-mono text-[10px] text-[#94A3B8] hover:border-[#36C5D9]/40 hover:text-[#F1F5F9]"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <label key={axis} className="block">
                <span className="mb-1 block font-mono text-[10px] uppercase text-[#94A3B8]">
                  {axis} (m)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={ikInput[axis]}
                  onChange={(e) => setIkInput((prev) => ({ ...prev, [axis]: e.target.value }))}
                  className="w-full rounded border border-[#243242] bg-[#0B0F14] px-2 py-1 font-mono text-xs tabular-nums text-[#F1F5F9] focus:border-[#36C5D9] focus:outline-none"
                />
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={jogDisabled || ikPending}
            className="w-full rounded bg-[#36C5D9] px-3 py-1.5 font-display text-xs font-semibold text-[#0B0F14] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {ikPending ? 'Solving DLS IK…' : 'Solve & Apply IK'}
          </button>

          {lastIkResult && (
            <div
              className={`rounded border px-2.5 py-2 text-[11px] ${
                lastIkResult.ok
                  ? 'border-[#22C55E]/35 bg-[#22C55E]/10 text-[#86EFAC]'
                  : 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#FCA5A5]'
              }`}
            >
              {lastIkResult.ok
                ? `Solved within ≤0.5 mm (` +
                  `${lastIkResult.anglesRad?.map((v) => (v * RAD_TO_DEG).toFixed(1)).join('°, ')}°)`
                : `${lastIkResult.fault ?? 'IK_ERROR'}: ${lastIkResult.message}`}
            </div>
          )}
        </form>
      </aside>
    </section>
  );
}
