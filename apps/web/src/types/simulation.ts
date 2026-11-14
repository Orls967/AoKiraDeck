import type { JointId, Pose3D, Vec3 } from './workcell';

export interface JointState {
  id: JointId;
  angleRad: number;
  velocityRadPerSec: number;
  accelerationRadPerSec2: number;
  atLimit: boolean;
  utilizationRatio: number;
}

export type WorkpieceStatus =
  | 'SPAWNED_ON_INPUT'
  | 'READY_FOR_PICK'
  | 'GRASPED'
  | 'AT_STATION'
  | 'PROCESSING'
  | 'PROCESSED_READY'
  | 'ON_OUTPUT_CONVEYOR'
  | 'COMPLETED'
  | 'FAULTED';

export interface WorkpieceState {
  id: string;
  massKg: number;
  dimensionsMeters: Vec3;
  poseWorld: Pose3D;
  status: WorkpieceStatus;
  spawnTimeMs: number;
  completedTimeMs: number | null;
}

export type GripperActuationState = 'OPEN' | 'CLOSING' | 'CLOSED' | 'OPENING' | 'FAULT';

export interface GripperState {
  actuationState: GripperActuationState;
  jawOpeningMeters: number;
  heldWorkpieceId: string | null;
  clampForceNormalized: number;
}

export interface ConveyorRuntimeState {
  id: 'input-conveyor' | 'output-conveyor';
  running: boolean;
  speedMetersPerSec: number;
  sensorTriggered: boolean;
  workpieceCountOnBelt: number;
}

export interface StationRuntimeState {
  occupied: boolean;
  activeWorkpieceId: string | null;
  processingProgress: number;
  clampEngaged: boolean;
}

export type ProductionStage =
  | 'IDLE'
  | 'DETECT_OBJECT'
  | 'APPROACH_PICK'
  | 'PICK_WORKPIECE'
  | 'TRANSFER_TO_STATION'
  | 'PROCESS_WORKPIECE'
  | 'PICK_FINISHED'
  | 'TRANSFER_TO_OUTPUT'
  | 'PLACE_WORKPIECE'
  | 'CYCLE_COMPLETE'
  | 'FAULT';

export type SimulationRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'STOPPED'
  | 'COMPLETED'
  | 'FAULTED';

export type FaultCode =
  | 'COLLISION'
  | 'UNREACHABLE_TARGET'
  | 'JOINT_LIMIT_VIOLATION'
  | 'OBJECT_UNAVAILABLE'
  | 'GRIPPER_FAILURE'
  | 'PAYLOAD_EXCEEDED'
  | 'ESTOP_ACTIVE';

export type CollisionSeverity = 'NONE' | 'NEAR_COLLISION' | 'COLLISION';

export interface CollisionReport {
  severity: CollisionSeverity;
  minClearanceMeters: number;
  pairA: string;
  pairB: string;
  contactPointWorld: Vec3 | null;
}

export interface ActiveFault {
  code: FaultCode;
  message: string;
  componentId: string | null;
}

export interface SimulationSnapshot {
  runId: string;
  simTimeMs: number;
  tickIndex: number;
  runStatus: SimulationRunStatus;
  stage: ProductionStage;
  activeCycleIndex: number;
  completedUnits: number;
  targetUnits: number | null;
  joints: [JointState, JointState, JointState, JointState, JointState, JointState];
  linkWorldPoses: Pose3D[];
  tcpWorldPose: Pose3D;
  gripper: GripperState;
  inputConveyor: ConveyorRuntimeState;
  outputConveyor: ConveyorRuntimeState;
  station: StationRuntimeState;
  workpieces: WorkpieceState[];
  collision: CollisionReport;
  activeFault: ActiveFault | null;
  cumulativeEnergyWh: number;
}

export type SimulationEventType =
  | 'SIM_STARTED'
  | 'SIM_PAUSED'
  | 'SIM_RESUMED'
  | 'SIM_STOPPED'
  | 'SIM_RESET'
  | 'STAGE_ENTERED'
  | 'CYCLE_STARTED'
  | 'CYCLE_COMPLETED'
  | 'WORKPIECE_SPAWNED'
  | 'GRIPPER_GRASPED'
  | 'GRIPPER_RELEASED'
  | 'NEAR_COLLISION_WARNING'
  | 'COLLISION_DETECTED'
  | 'IK_TARGET_UNREACHABLE'
  | 'JOINT_LIMIT_VIOLATED'
  | 'GRIPPER_FAULT'
  | 'OBJECT_UNAVAILABLE';

export interface SimulationEvent {
  seq: number;
  runId: string;
  simTimeMs: number;
  eventType: SimulationEventType;
  stage: ProductionStage;
  cycleIndex: number;
  workpieceId: string | null;
  componentId: string | null;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  payload: Record<string, number | string | boolean | null>;
}

export type CycleMode = 'SINGLE' | 'FIXED_COUNT' | 'CONTINUOUS';

export interface ScenarioConfig {
  scenarioId: string;
  name: string;
  description: string;
  seed: number;
  timestepMs: 20;
  cycleMode: CycleMode;
  targetQuantity: number | null;
  targetProductionRatePerHour: number;
  robotSpeedScale: number;
  robotAccelScale: number;
  inputConveyorSpeedMps: number;
  outputConveyorSpeedMps: number;
  processingDwellMs: number;
  workpieceMassKg: number;
  trajectorySmoothnessFactor: number;
}

export interface PerCycleHistoryEntry {
  cycleIndex: number;
  cycleTimeMs: number;
  robotMoveMs: number;
  processDwellMs: number;
  waitTimeMs: number;
  energyWh: number;
  hadNearCollision: boolean;
  hadFault: boolean;
}

export interface ProductionMetrics {
  runId: string;
  scenarioId: string;
  totalSimTimeMs: number;
  totalUnitsProduced: number;
  unitsPerHour: number;
  averageCycleTimeMs: number;
  minCycleTimeMs: number;
  maxCycleTimeMs: number;
  robotActiveTimeMs: number;
  robotUtilizationPct: number;
  conveyorActiveTimeMs: number;
  conveyorUtilizationPct: number;
  idleTimeMs: number;
  downtimeMs: number;
  collisionEventCount: number;
  nearCollisionEventCount: number;
  estimatedEnergyWh: number;
  energyPerUnitWh: number;
  productionEfficiencyPct: number;
  perCycleHistory: PerCycleHistoryEntry[];
}

export type WorkerAction = 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'RESET' | 'ESTOP';

export type WorkerRequest =
  | { type: 'INIT'; payload: { workcellConfigJson?: string } }
  | { type: 'LOAD_SCENARIO'; payload: { scenario: ScenarioConfig } }
  | { type: 'COMMAND'; payload: { action: WorkerAction } }
  | { type: 'STEP_TICKS'; payload: { tickCount: number } }
  | { type: 'SET_JOINTS'; payload: { anglesRad: number[] } }
  | { type: 'SOLVE_IK'; payload: { requestId: string; targetPose: Pose3D; apply?: boolean } }
  | { type: 'SET_GRIPPER'; payload: { open: boolean } };

export type WorkerResponse =
  | { type: 'READY'; payload: { engineVersion: string; initialSnapshot: SimulationSnapshot } }
  | {
      type: 'TICK_RESULT';
      payload: {
        snapshot: SimulationSnapshot;
        newEvents: SimulationEvent[];
        metrics: ProductionMetrics;
      };
    }
  | {
      type: 'IK_RESULT';
      payload: {
        requestId: string;
        ok: boolean;
        anglesRad?: number[];
        fault?: FaultCode;
        message?: string;
        snapshot?: SimulationSnapshot;
      };
    }
  | { type: 'WORKER_ERROR'; payload: { code: string; message: string } };
