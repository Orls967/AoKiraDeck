/// <reference lib="webworker" />

import initWasm, { AokiraSimEngine, engine_version } from '@/wasm/aokira_engine';
import type {
  FaultCode,
  ProductionMetrics,
  SimulationEvent,
  SimulationSnapshot,
  WorkerRequest,
  WorkerResponse,
} from '@/types/simulation';

interface RawTickOutput {
  snapshot: SimulationSnapshot;
  newEvents: SimulationEvent[];
  metrics: ProductionMetrics;
}

interface RawIkOutput {
  ok: boolean;
  anglesRad?: number[] | null;
  fault?: FaultCode | null;
  message?: string | null;
  snapshot?: SimulationSnapshot | null;
}

let engine: AokiraSimEngine | null = null;

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

function postErr(code: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  post({ type: 'WORKER_ERROR', payload: { code, message } });
}

function handleTickJson(json: string): void {
  const parsed = JSON.parse(json) as RawTickOutput;
  post({
    type: 'TICK_RESULT',
    payload: {
      snapshot: parsed.snapshot,
      newEvents: parsed.newEvents,
      metrics: parsed.metrics,
    },
  });
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'INIT') {
      await initWasm();
      engine = new AokiraSimEngine(msg.payload.workcellConfigJson);
      const initialSnapshot = JSON.parse(engine.get_snapshot_json()) as SimulationSnapshot;
      post({
        type: 'READY',
        payload: {
          engineVersion: engine_version(),
          initialSnapshot,
        },
      });
      return;
    }

    if (!engine) {
      postErr('NOT_INITIALIZED', 'Simulation engine has not been initialized yet');
      return;
    }

    switch (msg.type) {
      case 'LOAD_SCENARIO': {
        handleTickJson(engine.load_scenario(JSON.stringify(msg.payload.scenario)));
        break;
      }
      case 'COMMAND': {
        handleTickJson(engine.command(msg.payload.action));
        break;
      }
      case 'STEP_TICKS': {
        handleTickJson(engine.step_ticks(msg.payload.tickCount));
        break;
      }
      case 'SET_JOINTS': {
        handleTickJson(engine.set_joints(JSON.stringify(msg.payload.anglesRad)));
        break;
      }
      case 'SOLVE_IK': {
        const res = JSON.parse(
          engine.solve_ik(JSON.stringify(msg.payload.targetPose), Boolean(msg.payload.apply)),
        ) as RawIkOutput;
        post({
          type: 'IK_RESULT',
          payload: {
            requestId: msg.payload.requestId,
            ok: res.ok,
            anglesRad: res.anglesRad ?? undefined,
            fault: res.fault ?? undefined,
            message: res.message ?? undefined,
            snapshot: res.snapshot ?? undefined,
          },
        });
        break;
      }
      case 'SET_GRIPPER': {
        handleTickJson(engine.set_gripper(msg.payload.open));
        break;
      }
    }
  } catch (err) {
    postErr('WASM_EXECUTION_ERROR', err);
  }
};
