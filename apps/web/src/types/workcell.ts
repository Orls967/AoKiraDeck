export type ComponentId =
  | 'robot-arm'
  | 'gripper'
  | 'input-conveyor'
  | 'output-conveyor'
  | 'processing-station'
  | 'workpiece'
  | 'robot-pedestal'
  | 'safety-fence'
  | 'estop-station'
  | 'sensor-array';

export interface ComponentMeta {
  id: ComponentId;
  displayName: string;
  category: string;
  description: string;
  subTargets: string[];
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Pose3D {
  position: Vec3;
  orientation: Quat;
}

export interface CapsuleVolume {
  kind: 'capsule';
  ownerId: string;
  localStart: Vec3;
  localEnd: Vec3;
  radius: number;
}

export interface BoxVolume {
  kind: 'box';
  ownerId: string;
  center: Vec3;
  halfExtents: Vec3;
  orientation: Quat;
}

export type CollisionPrimitive = CapsuleVolume | BoxVolume;

export type JointId = 'J1' | 'J2' | 'J3' | 'J4' | 'J5' | 'J6';

export interface DhParameters {
  thetaOffsetRad: number;
  dMeters: number;
  aMeters: number;
  alphaRad: number;
}

export interface JointConfig {
  id: JointId;
  index: 0 | 1 | 2 | 3 | 4 | 5;
  name: string;
  axisLocal: [number, number, number];
  dh: DhParameters;
  minAngleRad: number;
  maxAngleRad: number;
  maxVelocityRadPerSec: number;
  maxAccelerationRadPerSec2: number;
  homeAngleRad: number;
  ratedTorqueNm: number;
}

export interface RobotConfig {
  modelId: string;
  dof: 6;
  payloadLimitKg: number;
  baseMountPose: Pose3D;
  toolTcpOffsetMeters: Vec3;
  joints: [
    JointConfig,
    JointConfig,
    JointConfig,
    JointConfig,
    JointConfig,
    JointConfig,
  ];
  collisionCapsules: CapsuleVolume[];
}

export interface ConveyorConfig {
  id: 'input-conveyor' | 'output-conveyor';
  originWorld: Vec3;
  directionUnit: Vec3;
  lengthMeters: number;
  widthMeters: number;
  beltTopY: number;
  defaultSpeedMetersPerSec: number;
  minSpeedMetersPerSec: number;
  maxSpeedMetersPerSec: number;
  targetZoneWorld: Vec3;
  collisionBox: BoxVolume;
}

export interface ProcessingStationConfig {
  id: 'processing-station';
  originWorld: Vec3;
  fixtureTopY: number;
  targetPoseWorld: Pose3D;
  defaultProcessTimeMs: number;
  collisionBoxes: BoxVolume[];
}

export interface WorkcellConfig {
  schemaVersion: '1.0.0';
  workcellId: 'aokira-cell-v1';
  robot: RobotConfig;
  gripper: {
    id: 'gripper';
    maxOpeningMeters: number;
    minOpeningMeters: number;
    closedWidthForPartMeters: number;
    actuationTimeMs: number;
    massKg: number;
  };
  inputConveyor: ConveyorConfig;
  outputConveyor: ConveyorConfig;
  processingStation: ProcessingStationConfig;
  workpieceTemplate: {
    dimensionsMeters: Vec3;
    defaultMassKg: number;
  };
  staticObstacles: BoxVolume[];
  nearCollisionThresholdMeters: number;
}
