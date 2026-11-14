import * as THREE from 'three';
import type { ComponentId, Pose3D } from '@/types/workcell';
import type { CameraPreset } from '@/stores/useTwinUiStore';
import type { CollisionSeverity, SimulationSnapshot } from '@/types/simulation';

export const CAMERA_PRESETS: Record<
  CameraPreset,
  { position: [number, number, number]; target: [number, number, number]; label: string }
> = {
  ISOMETRIC: {
    position: [2.25, 1.80, 2.40],
    target: [0.0, 0.68, -0.10],
    label: 'Isometric',
  },
  FRONT: {
    position: [0.0, 1.10, 3.05],
    target: [0.0, 0.70, -0.10],
    label: 'Front',
  },
  SIDE: {
    position: [3.10, 1.10, -0.12],
    target: [0.0, 0.70, -0.12],
    label: 'Side',
  },
  TOP: {
    position: [0.0, 3.75, 0.02],
    target: [0.0, 0.65, -0.18],
    label: 'Top',
  },
};

export function isComponentVisible(
  id: ComponentId,
  hiddenMap: Record<ComponentId, boolean>,
  isolatedId: ComponentId | null,
): boolean {
  if (hiddenMap[id]) {
    return false;
  }
  if (isolatedId !== null && isolatedId !== id) {
    return false;
  }
  return true;
}

export function getComponentHighlightColor(
  id: ComponentId,
  selectedId: ComponentId | null,
  hoveredId: ComponentId | null,
  severity: CollisionSeverity | undefined,
  collidingPairA?: string,
  collidingPairB?: string,
): string {
  const pairMatch =
    (collidingPairA && collidingPairA.includes(id)) ||
    (collidingPairB && collidingPairB.includes(id));

  if (severity === 'COLLISION' && (pairMatch || id === 'robot-arm')) {
    return '#EF4444';
  }
  if (severity === 'NEAR_COLLISION' && pairMatch) {
    return '#F59E0B';
  }
  if (selectedId === id) {
    return '#36C5D9';
  }
  if (hoveredId === id) {
    return '#3B82F6';
  }
  return '#000000';
}

export function applyPoseToObject(
  obj: THREE.Object3D,
  pose: Pose3D,
  explodeVec?: THREE.Vector3,
  explodeFactor = 0,
): void {
  obj.position.set(pose.position.x, pose.position.y, pose.position.z);
  obj.quaternion.set(
    pose.orientation.x,
    pose.orientation.y,
    pose.orientation.z,
    pose.orientation.w,
  );
  if (explodeVec && explodeFactor > 0) {
    obj.position.addScaledVector(explodeVec, explodeFactor);
  }
}

export function computeCapsuleTransform(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
): { midpoint: [number, number, number]; length: number; quaternion: THREE.Quaternion } {
  const p1 = new THREE.Vector3(start.x, start.y, start.z);
  const p2 = new THREE.Vector3(end.x, end.y, end.z);
  const diff = new THREE.Vector3().subVectors(p2, p1);
  const length = diff.length();
  const midpoint: [number, number, number] = [
    (p1.x + p2.x) * 0.5,
    (p1.y + p2.y) * 0.5,
    (p1.z + p2.z) * 0.5,
  ];
  const quaternion = new THREE.Quaternion();
  if (length > 1e-6) {
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.clone().normalize());
  }
  return { midpoint, length, quaternion };
}

/** Fallback home link poses matching canonical workcell Home = [0, 10°, 20°, 0, 60°, 0] prior to worker boot. */
export const INITIAL_HOME_LINK_POSES: Pose3D[] = [
  { position: { x: 0, y: 0.45, z: 0 }, orientation: { x: -0.5, y: 0.5, z: 0.5, w: 0.5 } },
  { position: { x: 0, y: 0.79, z: -0.08 }, orientation: { x: -0.7071068, y: 0, z: 0.7071068, w: 0 } },
  {
    position: { x: 0, y: 1.203619, z: -0.152932 },
    orientation: { x: 0.541675, y: 0.454519, z: -0.541675, w: -0.454519 },
  },
  {
    position: { x: 0, y: 1.246921, z: -0.177932 },
    orientation: { x: 0.683013, y: 0.683013, z: -0.183013, w: 0.183013 },
  },
  {
    position: { x: 0, y: 1.046921, z: -0.524342 },
    orientation: { x: 0.612372, y: 0.353553, z: -0.612372, w: -0.353553 },
  },
  {
    position: { x: 0, y: 1.046921, z: -0.524342 },
    orientation: { x: 0.5, y: 0.5, z: -0.5, w: 0.5 },
  },
  {
    position: { x: 0, y: 0.946921, z: -0.524342 },
    orientation: { x: 0.5, y: 0.5, z: -0.5, w: 0.5 },
  },
];

export function resolveSnapshotOrDefault(snap: SimulationSnapshot | null): Pose3D[] {
  return snap?.linkWorldPoses?.length === 7 ? snap.linkWorldPoses : INITIAL_HOME_LINK_POSES;
}
