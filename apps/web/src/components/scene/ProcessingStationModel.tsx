import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { WORKCELL_CONFIG } from '@/config/workcell';
import { liveSnapshotRef } from '@/stores/useSimulationStore';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import { isComponentVisible } from './sceneHelpers';

export function ProcessingStationModel() {
  const selectedId = useTwinUiStore((s) => s.selectedComponentId);
  const hoveredId = useTwinUiStore((s) => s.hoveredComponentId);
  const hiddenMap = useTwinUiStore((s) => s.hiddenComponentIds);
  const isolatedId = useTwinUiStore((s) => s.isolatedComponentId);
  const explodedFactor = useTwinUiStore((s) => s.explodedFactor);
  const showCollisionVolumes = useTwinUiStore((s) => s.showCollisionVolumes);
  const selectComponent = useTwinUiStore((s) => s.selectComponent);
  const hoverComponent = useTwinUiStore((s) => s.hoverComponent);

  const visible = isComponentVisible('processing-station', hiddenMap, isolatedId);

  const rearClampRef = useRef<THREE.Mesh>(null);
  const frontClampRef = useRef<THREE.Mesh>(null);
  const scanBeamRef = useRef<THREE.Mesh>(null);
  const scanMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    const snap = liveSnapshotRef.current;
    const engaged = Boolean(snap?.station.clampEngaged);
    const progress = snap?.station.processingProgress ?? 0;

    if (rearClampRef.current && frontClampRef.current) {
      rearClampRef.current.position.z = engaged ? -0.605 : -0.640;
      frontClampRef.current.position.z = engaged ? -0.515 : -0.480;
    }

    if (scanBeamRef.current && scanMatRef.current) {
      const scanning = engaged && progress > 0 && progress < 1;
      scanBeamRef.current.visible = scanning;
      if (scanning) {
        const sweep = Math.sin(state.clock.elapsedTime * 8.0) * 0.025;
        scanBeamRef.current.position.x = sweep;
        scanMatRef.current.opacity = 0.35 + 0.35 * Math.abs(Math.cos(state.clock.elapsedTime * 6.0));
      }
    }
  });

  if (!visible) return null;

  const isHighlighted = selectedId === 'processing-station' || hoveredId === 'processing-station';
  const station = WORKCELL_CONFIG.processingStation;
  const explodeZ = -0.22 * explodedFactor;

  return (
    <group
      position={[0, 0, explodeZ]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hoverComponent('processing-station');
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hoverComponent(null);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        selectComponent('processing-station');
      }}
    >
      {/* Main Precision Fixture Table Cabinet */}
      <mesh position={[station.originWorld.x, station.originWorld.y, station.originWorld.z]} castShadow receiveShadow>
        <boxGeometry args={[0.40, 0.72, 0.36]} />
        <meshStandardMaterial
          color="#1E242B"
          roughness={0.44}
          metalness={0.55}
          emissive={isHighlighted ? '#36C5D9' : '#000000'}
          emissiveIntensity={isHighlighted ? 0.18 : 0}
        />
      </mesh>

      {/* Top Machined Nest Plate */}
      <mesh position={[0, 0.722, -0.56]} receiveShadow>
        <boxGeometry args={[0.32, 0.006, 0.24]} />
        <meshStandardMaterial color="#334155" roughness={0.32} metalness={0.78} />
      </mesh>

      {/* Rear Optical Scanner Column Head */}
      <mesh position={[0, 0.84, -0.71]} castShadow>
        <boxGeometry args={[0.16, 0.24, 0.06]} />
        <meshStandardMaterial color="#334155" roughness={0.40} metalness={0.62} />
      </mesh>

      {/* Scanner Emitter Visor */}
      <mesh position={[0, 0.90, -0.64]} rotation={[0.25, 0, 0]} castShadow>
        <boxGeometry args={[0.14, 0.035, 0.14]} />
        <meshStandardMaterial color="#1E242B" roughness={0.35} metalness={0.70} />
      </mesh>

      {/* Active Etch / Optical Scan Laser Curtain */}
      <mesh ref={scanBeamRef} position={[0, 0.81, -0.56]} visible={false}>
        <cylinderGeometry args={[0.004, 0.032, 0.16, 12]} />
        <meshBasicMaterial ref={scanMatRef} color="#36C5D9" transparent opacity={0.55} />
      </mesh>

      {/* Rear Pneumatic Fixture Clamp */}
      <mesh ref={rearClampRef} position={[0, 0.7375, -0.64]} castShadow>
        <boxGeometry args={[0.06, 0.035, 0.03]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.30} metalness={0.80} />
      </mesh>

      {/* Front Pneumatic Fixture Clamp */}
      <mesh ref={frontClampRef} position={[0, 0.7375, -0.48]} castShadow>
        <boxGeometry args={[0.06, 0.035, 0.03]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.30} metalness={0.80} />
      </mesh>

      {showCollisionVolumes &&
        station.collisionBoxes.map((bx) => (
          <mesh key={bx.ownerId} position={[bx.center.x, bx.center.y, bx.center.z]}>
            <boxGeometry
              args={[bx.halfExtents.x * 2, bx.halfExtents.y * 2, bx.halfExtents.z * 2]}
            />
            <meshBasicMaterial color="#36C5D9" wireframe transparent opacity={0.42} />
          </mesh>
        ))}
    </group>
  );
}
