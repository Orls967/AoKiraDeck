import { create } from 'zustand';
import { DEFAULT_SCENARIO } from '@/config/scenarios';
import { WORKCELL_CONFIG } from '@/config/workcell';
import type { Pose3D } from '@/types/workcell';
import type {
  ProductionMetrics,
  ScenarioConfig,
  SimulationEvent,
  SimulationRunStatus,
  SimulationSnapshot,
  WorkerAction,
  WorkerRequest,
  WorkerResponse,
} from '@/types/simulation';

const MAX_EVENT_LOG = 500;
const MAX_TRACE_POINTS = 180;
const FIXED_TIMESTEP_MS = 20;
const MAX_FRAME_DT_MS = 200;

export interface TrajectoryPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Shared mutable ref read directly inside R3F `useFrame` callbacks so 3D mesh transforms
 * never trigger React re-renders per 20 ms tick (`constraints.md`).
 */
export const liveSnapshotRef: { current: SimulationSnapshot | null } = { current: null };
export const liveTracePointsRef: { current: TrajectoryPoint[] } = { current: [] };

export interface IkSolveOutcome {
  ok: boolean;
  anglesRad?: number[];
  fault?: string;
  message?: string;
}

interface SimulationStoreState {
  workerStatus: SimulationRunStatus | 'BOOTING' | 'ERROR';
  engineVersion: string | null;
  workerError: string | null;
  activeScenario: ScenarioConfig;
  snapshot: SimulationSnapshot | null;
  events: SimulationEvent[];
  metrics: ProductionMetrics | null;
  lastIkResult: IkSolveOutcome | null;

  initWorker: () => void;
  loadScenario: (scenario: ScenarioConfig) => void;
  sendCommand: (action: WorkerAction) => void;
  stepSingleTick: () => void;
  setJoints: (anglesRad: number[]) => void;
  solveIk: (targetPose: Pose3D, apply?: boolean) => Promise<IkSolveOutcome>;
  setGripper: (open: boolean) => void;
  clearError: () => void;
}

let workerInstance: Worker | null = null;
let rafId: number | null = null;
let lastFrameTimeMs = 0;
let accumulatorMs = 0;
let inFlightStep = false;
let pendingIkResolvers = new Map<string, (res: IkSolveOutcome) => void>();
let ikSeq = 0;

function stopLoop(): void {
  if (rafId !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafId);
  }
  rafId = null;
  lastFrameTimeMs = 0;
  accumulatorMs = 0;
  inFlightStep = false;
}

function appendTracePoint(snap: SimulationSnapshot): void {
  const pos = snap.tcpWorldPose.position;
  const pts = liveTracePointsRef.current;
  const last = pts[pts.length - 1];
  if (
    !last ||
    (pos.x - last.x) ** 2 + (pos.y - last.y) ** 2 + (pos.z - last.z) ** 2 > 0.0001
  ) {
    pts.push({ x: pos.x, y: pos.y, z: pos.z });
    if (pts.length > MAX_TRACE_POINTS) {
      pts.shift();
    }
  }
}

function postToWorker(msg: WorkerRequest): void {
  workerInstance?.postMessage(msg);
}

export const useSimulationStore = create<SimulationStoreState>((set, get) => {
  const ensureLoop = (status: SimulationRunStatus) => {
    if (status !== 'RUNNING') {
      stopLoop();
      return;
    }
    if (rafId !== null || typeof requestAnimationFrame !== 'function') {
      return;
    }
    lastFrameTimeMs = performance.now();
    const tickFrame = (now: number) => {
      const state = get();
      if (state.snapshot?.runStatus !== 'RUNNING' || !workerInstance) {
        stopLoop();
        return;
      }
      const rawDt = now - lastFrameTimeMs;
      lastFrameTimeMs = now;
      const clampedDt = Math.max(0, Math.min(rawDt, MAX_FRAME_DT_MS));
      accumulatorMs += clampedDt;

      const ticksReady = Math.floor(accumulatorMs / FIXED_TIMESTEP_MS);
      if (ticksReady > 0 && !inFlightStep) {
        accumulatorMs -= ticksReady * FIXED_TIMESTEP_MS;
        inFlightStep = true;
        postToWorker({
          type: 'STEP_TICKS',
          payload: { tickCount: Math.min(ticksReady, 10) },
        });
      }
      rafId = requestAnimationFrame(tickFrame);
    };
    rafId = requestAnimationFrame(tickFrame);
  };

  return {
    workerStatus: 'BOOTING',
    engineVersion: null,
    workerError: null,
    activeScenario: DEFAULT_SCENARIO,
    snapshot: null,
    events: [],
    metrics: null,
    lastIkResult: null,

    initWorker: () => {
      if (workerInstance) {
        return;
      }
      if (typeof Worker === 'undefined') {
        set({
          workerStatus: 'READY',
          workerError: null,
        });
        return;
      }

      try {
        workerInstance = new Worker(
          new URL('../workers/simulation.worker.ts', import.meta.url),
          { type: 'module' },
        );

        workerInstance.onmessage = (ev: MessageEvent<WorkerResponse>) => {
          const msg = ev.data;
          if (msg.type === 'READY') {
            liveSnapshotRef.current = msg.payload.initialSnapshot;
            liveTracePointsRef.current = [];
            set({
              workerStatus: msg.payload.initialSnapshot.runStatus,
              engineVersion: msg.payload.engineVersion,
              snapshot: msg.payload.initialSnapshot,
              workerError: null,
            });
            // Load active scenario once worker is ready
            postToWorker({
              type: 'LOAD_SCENARIO',
              payload: { scenario: get().activeScenario },
            });
            return;
          }

          if (msg.type === 'TICK_RESULT') {
            inFlightStep = false;
            const { snapshot, newEvents, metrics } = msg.payload;
            liveSnapshotRef.current = snapshot;
            if (snapshot.runStatus === 'RUNNING') {
              appendTracePoint(snapshot);
            } else if (snapshot.simTimeMs === 0 && snapshot.runStatus === 'READY') {
              liveTracePointsRef.current = [];
            }

            set((prev) => {
              const combined =
                newEvents.length > 0
                  ? [...prev.events, ...newEvents].slice(-MAX_EVENT_LOG)
                  : prev.events;
              return {
                snapshot,
                metrics,
                events: combined,
                workerStatus: snapshot.runStatus,
              };
            });
            ensureLoop(snapshot.runStatus);
            return;
          }

          if (msg.type === 'IK_RESULT') {
            const { requestId, ok, anglesRad, fault, message, snapshot } = msg.payload;
            if (snapshot) {
              liveSnapshotRef.current = snapshot;
              set({ snapshot, workerStatus: snapshot.runStatus });
            }
            const outcome: IkSolveOutcome = { ok, anglesRad, fault, message };
            set({ lastIkResult: outcome });
            const resolver = pendingIkResolvers.get(requestId);
            if (resolver) {
              pendingIkResolvers.delete(requestId);
              resolver(outcome);
            }
            return;
          }

          if (msg.type === 'WORKER_ERROR') {
            inFlightStep = false;
            set({ workerError: msg.payload.message });
          }
        };

        workerInstance.onerror = (err) => {
          inFlightStep = false;
          stopLoop();
          set({
            workerStatus: 'ERROR',
            workerError: err.message || 'Web Worker crashed unexpectedly',
          });
        };

        postToWorker({
          type: 'INIT',
          payload: { workcellConfigJson: JSON.stringify(WORKCELL_CONFIG) },
        });
      } catch (err) {
        set({
          workerStatus: 'ERROR',
          workerError: err instanceof Error ? err.message : 'Failed to create simulation worker',
        });
      }
    },

    loadScenario: (scenario) => {
      stopLoop();
      liveTracePointsRef.current = [];
      set({ activeScenario: scenario, events: [], workerError: null });
      postToWorker({ type: 'LOAD_SCENARIO', payload: { scenario } });
    },

    sendCommand: (action) => {
      if (action === 'PAUSE' || action === 'STOP' || action === 'RESET' || action === 'ESTOP') {
        stopLoop();
      }
      if (action === 'RESET') {
        liveTracePointsRef.current = [];
        set({ events: [], workerError: null });
      }
      postToWorker({ type: 'COMMAND', payload: { action } });
    },

    stepSingleTick: () => {
      postToWorker({ type: 'STEP_TICKS', payload: { tickCount: 1 } });
    },

    setJoints: (anglesRad) => {
      postToWorker({ type: 'SET_JOINTS', payload: { anglesRad } });
    },

    solveIk: (targetPose, apply = true) => {
      if (!workerInstance) {
        return Promise.resolve({
          ok: false,
          fault: 'WORKER_UNAVAILABLE',
          message: 'Simulation worker is not initialized',
        });
      }
      ikSeq += 1;
      const requestId = `ik-${ikSeq}`;
      return new Promise<IkSolveOutcome>((resolve) => {
        pendingIkResolvers.set(requestId, resolve);
        postToWorker({
          type: 'SOLVE_IK',
          payload: { requestId, targetPose, apply },
        });
      });
    },

    setGripper: (open) => {
      postToWorker({ type: 'SET_GRIPPER', payload: { open } });
    },

    clearError: () => set({ workerError: null }),
  };
});
