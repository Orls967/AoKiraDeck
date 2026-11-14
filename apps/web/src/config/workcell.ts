import workcellJson from '@data/workcell/aokira-workcell.v1.json';
import type { ComponentId, ComponentMeta, WorkcellConfig } from '@/types/workcell';

export const WORKCELL_CONFIG: WorkcellConfig = workcellJson as WorkcellConfig;

export const COMPONENT_REGISTRY: ComponentMeta[] = [
  {
    id: 'robot-arm',
    displayName: '6-Axis Articulated Robot',
    category: 'Manipulator',
    description:
      'Generic 6-DOF industrial manipulator (aokira-6dof-generic-v1) governed by Standard DH kinematics.',
    subTargets: ['link-0', 'link-1', 'link-2', 'link-3', 'link-4', 'link-5', 'link-6'],
  },
  {
    id: 'gripper',
    displayName: 'Two-Finger Parallel Gripper',
    category: 'EndEffector',
    description: 'Parallel jaw actuator with 0-80 mm opening span and 300 ms nominal actuation.',
    subTargets: ['gripper-body', 'jaw-left', 'jaw-right'],
  },
  {
    id: 'input-conveyor',
    displayName: 'Input Belt Conveyor',
    category: 'Transport',
    description: '1.0 m infeed belt transporting synthetic workpieces toward (-0.560, 0.750, +0.080).',
    subTargets: ['input-belt', 'input-frame'],
  },
  {
    id: 'output-conveyor',
    displayName: 'Output Belt Conveyor',
    category: 'Transport',
    description: '1.0 m outfeed belt conveying processed workpieces from (+0.560, 0.750, +0.080).',
    subTargets: ['output-belt', 'output-frame'],
  },
  {
    id: 'processing-station',
    displayName: 'Processing & Assembly Station',
    category: 'Workstation',
    description: 'Precision fixture table with rear optical scanner head and ±Z side clamps.',
    subTargets: ['station-fixture', 'station-head'],
  },
  {
    id: 'workpiece',
    displayName: 'Synthetic Cubic Workpiece',
    category: 'Material',
    description: '60 × 60 × 60 mm synthetic aluminum billet (1.20 kg nominal, 5.0 kg max payload).',
    subTargets: ['workpiece'],
  },
  {
    id: 'robot-pedestal',
    displayName: 'Robot Mounting Pedestal',
    category: 'Structure',
    description: '0.450 m steel mounting riser aligning Robot BaseFrame (+Z up) above floor.',
    subTargets: [],
  },
  {
    id: 'safety-fence',
    displayName: 'Perimeter Safety Enclosure',
    category: 'SafetyBoundary',
    description: '3.20 × 2.40 m safety cell perimeter with pass-through cutouts at conveyor belts.',
    subTargets: [],
  },
  {
    id: 'estop-station',
    displayName: 'Emergency Stop Console',
    category: 'Control',
    description: 'External operator E-Stop pedestal at (+1.720, 0.525, +1.050) for fault latch testing.',
    subTargets: [],
  },
  {
    id: 'sensor-array',
    displayName: 'Presence Sensors & Status Beacons',
    category: 'Instrumentation',
    description: 'Photoelectric zone sensors (Input/Station/Output) and RGBY stack beacon tower.',
    subTargets: ['sensor-input', 'sensor-station', 'sensor-output', 'beacon-tower'],
  },
];

export const COMPONENT_BY_ID: Record<ComponentId, ComponentMeta> = Object.fromEntries(
  COMPONENT_REGISTRY.map((c) => [c.id, c])
) as Record<ComponentId, ComponentMeta>;
