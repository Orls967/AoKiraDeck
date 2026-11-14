import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { WORKCELL_CONFIG } from '@/config/workcell';
import { liveSnapshotRef } from '@/stores/useSimulationStore';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import {
  applyPoseToObject,
  computeCapsuleTransform,
  getComponentHighlightColor,
  isComponentVisible,
  resolveSnapshotOrDefault,
} from './sceneHelpers';

const EXPLODE_VECTORS = [
  new THREE.Vector3(0, 0.0, 0),
  new THREE.Vector3(0, 0.05, -0.04),
  new THREE.Vector3(-0.08, 0.08, 0),
  new THREE.Vector3(0, 0.12, -0.05),
  new THREE.Vector3(0, 0.08, -0.14),
  new THREE.Vector3(0, 0.02, -0.18),
  new THREE.Vector3(0, -0.06, -0.22),
];

export function RobotArmModel() {
  const selectedId = useTwinUiStore((s) => s.selectedComponentId);
  const hoveredId = useTwinUiStore((s) => s.hoveredComponentId);
  const hiddenMap = useTwinUiStore((s) => s.hiddenComponentIds);
  const isolatedId = useTwinUiStore((s) => s.isolatedComponentId);
  const explodedFactor = useTwinUiStore((s) => s.explodedFactor);
  const showFrames = useTwinUiStore((s) => s.showCoordinateFrames);
  const showCollisionVolumes = useTwinUiStore((s) => s.showCollisionVolumes);
  const selectComponent = useTwinUiStore((s) => s.selectComponent);
  const hoverComponent = useTwinUiStore((s) => s.hoverComponent);

  const visible = isComponentVisible('robot-arm', hiddenMap, isolatedId);

  const frameRefs = [
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
    useRef<THREE.Group>(null),
  ];

  const orangeMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const capsuleMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const capsulesByFrame = useMemo(() => {
    const map: Record<number, { midpoint: [number, number, number]; length: number; quaternion: THREE.Quaternion; radius: number; ownerId: string }[]> = {};
    for (const cap of WORKCELL_CONFIG.robot.collisionCapsules) {
      if (cap.ownerId === 'gripper') continue;
      const frameIdx =
        cap.ownerId === 'link-1'
          ? 1
          : cap.ownerId === 'link-2'
            ? 2
            : cap.ownerId === 'link-3'
              ? 3
              : cap.ownerId === 'link-4'
                ? 4
                : 6;
      const xf = computeCapsuleTransform(cap.localStart, cap.localEnd);
      map[frameIdx] = map[frameIdx] || [];
      map[frameIdx].push({
        ...xf,
        radius: cap.radius,
        ownerId: cap.ownerId,
      });
    }
    return map;
  }, []);

  useFrame(() => {
    const snap = liveSnapshotRef.current;
    const poses = resolveSnapshotOrDefault(snap);

    for (let i = 0; i < 7; i += 1) {
      const grp = frameRefs[i].current;
      if (grp) {
        applyPoseToObject(grp, poses[i], EXPLODE_VECTORS[i], explodedFactor);
      }
    }

    const col = snap?.collision;
    const emissiveHex = getComponentHighlightColor(
      'robot-arm',
      selectedId,
      hoveredId,
      col?.severity,
      col?.pairA,
      col?.pairB,
    );
    const emissiveIntensity =
      col?.severity === 'COLLISION'
        ? 0.65
        : col?.severity === 'NEAR_COLLISION'
          ? 0.42
          : selectedId === 'robot-arm' || hoveredId === 'robot-arm'
            ? 0.20
            : 0.0;
    for (const mat of orangeMatRefs.current) {
      if (mat) {
        mat.emissive.set(emissiveHex);
        mat.emissiveIntensity = emissiveIntensity;
      }
    }
    const capColor =
      col?.severity === 'COLLISION'
        ? '#EF4444'
        : col?.severity === 'NEAR_COLLISION'
          ? '#F59E0B'
          : '#36C5D9';
    for (const mat of capsuleMatRefs.current) {
      if (mat) {
        mat.color.set(capColor);
      }
    }
  });

  if (!visible) return null;

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoverComponent('robot-arm');
  };
  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoverComponent(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    selectComponent('robot-arm');
  };

  const renderCapsules = (idx: number) =>
    showCollisionVolumes
      ? (capsulesByFrame[idx] || []).map((c) => (
          <mesh
            key={c.ownerId}
            position={c.midpoint}
            quaternion={c.quaternion}
          >
            <capsuleGeometry args={[c.radius, c.length, 6, 12]} />
            <meshBasicMaterial
              ref={(el) => {
                capsuleMatRefs.current[idx] = el;
              }}
              color="#36C5D9"
              wireframe
              transparent
              opacity={0.45}
            />
          </mesh>
        ))
      : null;

  return (
    <group
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      {/* Frame 0: Base Mounting Flange & Fixed Pedestal Interface (+Z_b up along robot base) */}
      <group ref={frameRefs[0]}>
        <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.145, 0.165, 0.10, 28]} />
          <meshStandardMaterial color="#1E242B" roughness={0.40} metalness={0.60} />
        </mesh>
        <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.115, 0.135, 0.10, 24]} />
          <meshStandardMaterial color="#27313D" roughness={0.35} metalness={0.65} />
        </mesh>
        {showFrames && <axesHelper args={[0.20]} />}
      </group>

      {/* Frame 1: Rotating Turret Waist -> Shoulder Pivot at (0,0,0), base collar back (-0.08, -0.21, 0) */}
      <group ref={frameRefs[1]}>
        <mesh position={[-0.04, -0.105, 0]} rotation={[0, 0, -0.36]} castShadow receiveShadow>
          <cylinderGeometry args={[0.085, 0.105, 0.23, 24]} />
          <meshStandardMaterial
            ref={(el) => {
              orangeMatRefs.current[0] = el;
            }}
            color="#EA580C"
            roughness={0.42}
            metalness={0.25}
          />
        </mesh>
        {/* J2 Shoulder Servo Drum */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.095, 0.095, 0.16, 24]} />
          <meshStandardMaterial color="#1E242B" roughness={0.38} metalness={0.62} />
        </mesh>
        <mesh position={[0, 0, 0.082]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.072, 0.008, 12, 24]} />
          <meshStandardMaterial color="#36C5D9" emissive="#36C5D9" emissiveIntensity={0.35} />
        </mesh>
        {renderCapsules(1)}
      </group>

      {/* Frame 2: Upper Arm Link (L2 = 0.420 m along -X2 back to shoulder) */}
      <group ref={frameRefs[2]}>
        <mesh position={[-0.21, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <boxGeometry args={[0.11, 0.42, 0.12]} />
          <meshStandardMaterial
            ref={(el) => {
              orangeMatRefs.current[1] = el;
            }}
            color="#EA580C"
            roughness={0.40}
            metalness={0.28}
          />
        </mesh>
        {/* Side strut ribbing */}
        <mesh position={[-0.21, 0, 0.064]} castShadow>
          <boxGeometry args={[0.32, 0.05, 0.012]} />
          <meshStandardMaterial color="#1E242B" roughness={0.45} metalness={0.55} />
        </mesh>
        {/* J3 Elbow Pivot */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.075, 0.145, 24]} />
          <meshStandardMaterial color="#1E242B" roughness={0.38} metalness={0.60} />
        </mesh>
        {renderCapsules(2)}
      </group>

      {/* Frame 3: Elbow Offset Bracket (a3 = 0.050 m) */}
      <group ref={frameRefs[3]}>
        <mesh position={[-0.025, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.062, 0.068, 0.065, 20]} />
          <meshStandardMaterial color="#1E242B" roughness={0.4} metalness={0.6} />
        </mesh>
        {renderCapsules(3)}
      </group>

      {/* Frame 4: Forearm Link (d4 = 0.400 m extending from -Y4 toward wrist center) */}
      <group ref={frameRefs[4]}>
        <mesh position={[0, -0.20, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.048, 0.064, 0.36, 22]} />
          <meshStandardMaterial
            ref={(el) => {
              orangeMatRefs.current[2] = el;
            }}
            color="#EA580C"
            roughness={0.40}
            metalness={0.28}
          />
        </mesh>
        {/* Forearm dark motor housing near elbow */}
        <mesh position={[0, -0.35, 0]} castShadow>
          <cylinderGeometry args={[0.068, 0.068, 0.09, 20]} />
          <meshStandardMaterial color="#1E242B" roughness={0.42} metalness={0.62} />
        </mesh>
        {/* Wrist pitch servo drum */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.052, 0.052, 0.105, 20]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.30} metalness={0.80} />
        </mesh>
        {renderCapsules(4)}
      </group>

      {/* Frame 5: Wrist Pitch Collar */}
      <group ref={frameRefs[5]}>
        <mesh castShadow>
          <sphereGeometry args={[0.046, 18, 18]} />
          <meshStandardMaterial color="#1E242B" roughness={0.40} metalness={0.60} />
        </mesh>
      </group>

      {/* Frame 6: Wrist Roll Extension (d6 = 0.100 m along +Z6 to Tool Flange) */}
      <group ref={frameRefs[6]}>
        <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.040, 0.045, 0.085, 20]} />
          <meshStandardMaterial color="#1E242B" roughness={0.38} metalness={0.65} />
        </mesh>
        {/* ISO Tool Flange */}
        <mesh position={[0, 0, -0.005]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.046, 0.046, 0.012, 24]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.25} metalness={0.85} />
        </mesh>
        {showFrames && <axesHelper args={[0.14]} />}
        {renderCapsules(6)}
      </group>
    </group>
  );
}
