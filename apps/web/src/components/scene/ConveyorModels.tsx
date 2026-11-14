import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { WORKCELL_CONFIG } from '@/config/workcell';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { liveSnapshotRef } from '@/stores/useSimulationStore';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import type { ComponentId, ConveyorConfig } from '@/types/workcell';
import { isComponentVisible } from './sceneHelpers';

const TREAD_COUNT = 8;

interface SingleConveyorProps {
  componentId: Extract<ComponentId, 'input-conveyor' | 'output-conveyor'>;
  config: ConveyorConfig;
  explodeOffsetX: number;
}

function SingleConveyorMesh({ componentId, config, explodeOffsetX }: SingleConveyorProps) {
  const selectedId = useTwinUiStore((s) => s.selectedComponentId);
  const hoveredId = useTwinUiStore((s) => s.hoveredComponentId);
  const hiddenMap = useTwinUiStore((s) => s.hiddenComponentIds);
  const isolatedId = useTwinUiStore((s) => s.isolatedComponentId);
  const explodedFactor = useTwinUiStore((s) => s.explodedFactor);
  const showCollisionVolumes = useTwinUiStore((s) => s.showCollisionVolumes);
  const selectComponent = useTwinUiStore((s) => s.selectComponent);
  const hoverComponent = useTwinUiStore((s) => s.hoverComponent);
  const reducedMotion = useReducedMotion();

  const visible = isComponentVisible(componentId, hiddenMap, isolatedId);

  const treadRefs = useRef<(THREE.Mesh | null)[]>([]);
  const phaseRef = useRef(0);
  const zoneRingMatRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    const snap = liveSnapshotRef.current;
    const convState =
      componentId === 'input-conveyor' ? snap?.inputConveyor : snap?.outputConveyor;
    const isRunning = Boolean(convState?.running && snap?.runStatus === 'RUNNING');

    if (isRunning && !reducedMotion) {
      const speed = convState?.speedMetersPerSec ?? config.defaultSpeedMetersPerSec;
      phaseRef.current = (phaseRef.current + speed * Math.min(delta, 0.05)) % (config.lengthMeters / TREAD_COUNT);
    }

    const spacing = config.lengthMeters / TREAD_COUNT;
    for (let i = 0; i < TREAD_COUNT; i += 1) {
      const mesh = treadRefs.current[i];
      if (mesh) {
        const localX = -config.lengthMeters * 0.5 + spacing * 0.5 + i * spacing + phaseRef.current;
        const wrappedX = localX > config.lengthMeters * 0.5 ? localX - config.lengthMeters : localX;
        mesh.position.x = wrappedX;
      }
    }

    if (zoneRingMatRef.current) {
      const triggered = Boolean(convState?.sensorTriggered);
      zoneRingMatRef.current.color.set(triggered ? '#22C55E' : '#36C5D9');
      zoneRingMatRef.current.opacity = triggered ? 0.95 : 0.45;
    }
  });

  if (!visible) return null;

  const isHighlighted = selectedId === componentId || hoveredId === componentId;
  const cx = config.originWorld.x + explodeOffsetX * explodedFactor;
  const cy = config.originWorld.y;
  const cz = config.originWorld.z;
  const localZoneX = config.targetZoneWorld.x - config.originWorld.x;
  const boxH = config.collisionBox.halfExtents.y * 2;

  return (
    <group
      position={[cx, cy, cz]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hoverComponent(componentId);
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hoverComponent(null);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        selectComponent(componentId);
      }}
    >
      {/* Main Belt Core Body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[config.lengthMeters, boxH, config.widthMeters]} />
        <meshStandardMaterial
          color="#181C22"
          roughness={0.78}
          metalness={0.15}
          emissive={isHighlighted ? '#36C5D9' : '#000000'}
          emissiveIntensity={isHighlighted ? 0.16 : 0}
        />
      </mesh>

      {/* Anodized Slate Side Rails */}
      <mesh position={[0, 0.015, config.widthMeters * 0.5 + 0.012]} castShadow>
        <boxGeometry args={[config.lengthMeters + 0.02, boxH + 0.03, 0.022]} />
        <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.55} />
      </mesh>
      <mesh position={[0, 0.015, -config.widthMeters * 0.5 - 0.012]} castShadow>
        <boxGeometry args={[config.lengthMeters + 0.02, boxH + 0.03, 0.022]} />
        <meshStandardMaterial color="#334155" roughness={0.45} metalness={0.55} />
      </mesh>

      {/* Support Legs down to y = 0 */}
      {[-0.38, 0.38].map((lx) =>
        [-0.09, 0.09].map((lz) => (
          <mesh key={`${lx}-${lz}`} position={[lx, -cy * 0.5 - 0.025, lz]} castShadow receiveShadow>
            <boxGeometry args={[0.045, cy - 0.05, 0.045]} />
            <meshStandardMaterial color="#1E242B" roughness={0.5} metalness={0.55} />
          </mesh>
        )),
      )}

      {/* Animated Belt Treads */}
      {Array.from({ length: TREAD_COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            treadRefs.current[i] = el;
          }}
          position={[0, boxH * 0.5 + 0.002, 0]}
        >
          <boxGeometry args={[0.016, 0.004, config.widthMeters - 0.02]} />
          <meshStandardMaterial color="#27313D" roughness={0.6} metalness={0.2} />
        </mesh>
      ))}

      {/* Pick / Place Optical Target Reticle on Belt Top */}
      <mesh
        position={[localZoneX, boxH * 0.5 + 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.042, 0.054, 24]} />
        <meshBasicMaterial
          ref={zoneRingMatRef}
          color="#36C5D9"
          transparent
          opacity={0.55}
        />
      </mesh>

      {showCollisionVolumes && (
        <mesh>
          <boxGeometry
            args={[
              config.collisionBox.halfExtents.x * 2,
              config.collisionBox.halfExtents.y * 2,
              config.collisionBox.halfExtents.z * 2,
            ]}
          />
          <meshBasicMaterial color="#36C5D9" wireframe transparent opacity={0.45} />
        </mesh>
      )}
    </group>
  );
}

export function ConveyorModels() {
  return (
    <>
      <SingleConveyorMesh
        componentId="input-conveyor"
        config={WORKCELL_CONFIG.inputConveyor}
        explodeOffsetX={-0.18}
      />
      <SingleConveyorMesh
        componentId="output-conveyor"
        config={WORKCELL_CONFIG.outputConveyor}
        explodeOffsetX={0.18}
      />
    </>
  );
}
