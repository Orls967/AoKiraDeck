import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { WORKCELL_CONFIG } from '@/config/workcell';
import { liveSnapshotRef } from '@/stores/useSimulationStore';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import {
  applyPoseToObject,
  computeCapsuleTransform,
  isComponentVisible,
  resolveSnapshotOrDefault,
} from './sceneHelpers';

const EXPLODE_GRIPPER = new THREE.Vector3(0, -0.14, -0.26);

export function GripperModel() {
  const selectedId = useTwinUiStore((s) => s.selectedComponentId);
  const hoveredId = useTwinUiStore((s) => s.hoveredComponentId);
  const hiddenMap = useTwinUiStore((s) => s.hiddenComponentIds);
  const isolatedId = useTwinUiStore((s) => s.isolatedComponentId);
  const explodedFactor = useTwinUiStore((s) => s.explodedFactor);
  const showFrames = useTwinUiStore((s) => s.showCoordinateFrames);
  const showCollisionVolumes = useTwinUiStore((s) => s.showCollisionVolumes);
  const selectComponent = useTwinUiStore((s) => s.selectComponent);
  const hoverComponent = useTwinUiStore((s) => s.hoverComponent);

  const visible = isComponentVisible('gripper', hiddenMap, isolatedId);

  const rootRef = useRef<THREE.Group>(null);
  const leftJawRef = useRef<THREE.Mesh>(null);
  const rightJawRef = useRef<THREE.Mesh>(null);
  const tcpRef = useRef<THREE.Group>(null);
  const ledMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const gripperCapsule = useMemo(() => {
    const cap = WORKCELL_CONFIG.robot.collisionCapsules.find((c) => c.ownerId === 'gripper');
    if (!cap) return null;
    return {
      ...computeCapsuleTransform(cap.localStart, cap.localEnd),
      radius: cap.radius,
    };
  }, []);

  useFrame(() => {
    const snap = liveSnapshotRef.current;
    const poses = resolveSnapshotOrDefault(snap);
    const flangePose = poses[6];

    if (rootRef.current) {
      applyPoseToObject(rootRef.current, flangePose, EXPLODE_GRIPPER, explodedFactor);
    }

    const jawOpen = snap?.gripper.jawOpeningMeters ?? WORKCELL_CONFIG.gripper.maxOpeningMeters;
    const jawCenterOffset = jawOpen * 0.5 + 0.008;
    if (leftJawRef.current) {
      leftJawRef.current.position.x = -jawCenterOffset;
    }
    if (rightJawRef.current) {
      rightJawRef.current.position.x = jawCenterOffset;
    }
    if (ledMatRef.current) {
      const held = Boolean(snap?.gripper.heldWorkpieceId);
      const fault = snap?.gripper.actuationState === 'FAULT';
      ledMatRef.current.color.set(fault ? '#EF4444' : held ? '#22C55E' : '#36C5D9');
      ledMatRef.current.emissive.set(fault ? '#EF4444' : held ? '#22C55E' : '#36C5D9');
    }
  });

  if (!visible) return null;

  const isHighlighted = selectedId === 'gripper' || hoveredId === 'gripper';

  return (
    <group
      ref={rootRef}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hoverComponent('gripper');
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hoverComponent(null);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        selectComponent('gripper');
      }}
    >
      {/* Gripper Pneumatic / Electric Carriage Housing */}
      <mesh position={[0, 0, 0.032]} castShadow>
        <boxGeometry args={[0.108, 0.056, 0.064]} />
        <meshStandardMaterial
          color="#1E242B"
          roughness={0.35}
          metalness={0.68}
          emissive={isHighlighted ? '#36C5D9' : '#000000'}
          emissiveIntensity={isHighlighted ? 0.25 : 0}
        />
      </mesh>

      {/* Status LED Strip */}
      <mesh position={[0, 0.029, 0.034]}>
        <boxGeometry args={[0.056, 0.005, 0.012]} />
        <meshStandardMaterial
          ref={ledMatRef}
          color="#36C5D9"
          emissive="#36C5D9"
          emissiveIntensity={1.2}
        />
      </mesh>

      {/* Left Parallel Steel Jaw */}
      <mesh ref={leftJawRef} position={[-0.048, 0, 0.105]} castShadow>
        <boxGeometry args={[0.016, 0.032, 0.086]} />
        <meshStandardMaterial
          color="#94A3B8"
          roughness={0.25}
          metalness={0.85}
          emissive={isHighlighted ? '#36C5D9' : '#000000'}
          emissiveIntensity={isHighlighted ? 0.2 : 0}
        />
      </mesh>

      {/* Right Parallel Steel Jaw */}
      <mesh ref={rightJawRef} position={[0.048, 0, 0.105]} castShadow>
        <boxGeometry args={[0.016, 0.032, 0.086]} />
        <meshStandardMaterial
          color="#94A3B8"
          roughness={0.25}
          metalness={0.85}
          emissive={isHighlighted ? '#36C5D9' : '#000000'}
          emissiveIntensity={isHighlighted ? 0.2 : 0}
        />
      </mesh>

      {/* TCP Coordinate Frame at z = +0.120 m */}
      {showFrames && (
        <group ref={tcpRef} position={[0, 0, 0.12]}>
          <axesHelper args={[0.11]} />
        </group>
      )}

      {showCollisionVolumes && gripperCapsule && (
        <mesh position={gripperCapsule.midpoint} quaternion={gripperCapsule.quaternion}>
          <capsuleGeometry args={[gripperCapsule.radius, gripperCapsule.length, 6, 12]} />
          <meshBasicMaterial color="#36C5D9" wireframe transparent opacity={0.45} />
        </mesh>
      )}
    </group>
  );
}
