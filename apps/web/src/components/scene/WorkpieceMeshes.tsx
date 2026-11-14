import { useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { liveSnapshotRef } from '@/stores/useSimulationStore';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import { isComponentVisible } from './sceneHelpers';

const POOL_SIZE = 12;

export function WorkpieceMeshes() {
  const selectedId = useTwinUiStore((s) => s.selectedComponentId);
  const hoveredId = useTwinUiStore((s) => s.hoveredComponentId);
  const hiddenMap = useTwinUiStore((s) => s.hiddenComponentIds);
  const isolatedId = useTwinUiStore((s) => s.isolatedComponentId);
  const showCollisionVolumes = useTwinUiStore((s) => s.showCollisionVolumes);
  const selectComponent = useTwinUiStore((s) => s.selectComponent);
  const hoverComponent = useTwinUiStore((s) => s.hoverComponent);

  const visible = isComponentVisible('workpiece', hiddenMap, isolatedId);

  const groupRefs = useRef<(THREE.Group | null)[]>([]);
  const matRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const colWireRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(() => {
    const workpieces = liveSnapshotRef.current?.workpieces ?? [];
    for (let i = 0; i < POOL_SIZE; i += 1) {
      const grp = groupRefs.current[i];
      const mat = matRefs.current[i];
      const wire = colWireRefs.current[i];
      const wp = workpieces[i];

      if (!grp || !mat) continue;
      if (!wp || wp.status === 'COMPLETED') {
        grp.visible = false;
        continue;
      }

      grp.visible = true;
      grp.position.set(
        wp.poseWorld.position.x,
        wp.poseWorld.position.y,
        wp.poseWorld.position.z,
      );
      grp.quaternion.set(
        wp.poseWorld.orientation.x,
        wp.poseWorld.orientation.y,
        wp.poseWorld.orientation.z,
        wp.poseWorld.orientation.w,
      );

      if (wp.status === 'FAULTED') {
        mat.color.set('#EF4444');
        mat.emissive.set('#EF4444');
        mat.emissiveIntensity = 0.45;
      } else if (wp.status === 'PROCESSING') {
        mat.color.set('#67E8F9');
        mat.emissive.set('#36C5D9');
        mat.emissiveIntensity = 0.50;
      } else if (
        wp.status === 'PROCESSED_READY' ||
        wp.status === 'ON_OUTPUT_CONVEYOR'
      ) {
        mat.color.set('#36C5D9');
        mat.emissive.set('#0891B2');
        mat.emissiveIntensity = 0.25;
      } else {
        mat.color.set('#CBD5E1');
        mat.emissive.set(
          selectedId === 'workpiece' || hoveredId === 'workpiece' ? '#3B82F6' : '#000000',
        );
        mat.emissiveIntensity = selectedId === 'workpiece' || hoveredId === 'workpiece' ? 0.2 : 0;
      }

      if (wire) {
        wire.visible = showCollisionVolumes;
      }
    }
  });

  if (!visible) return null;

  return (
    <group
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hoverComponent('workpiece');
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hoverComponent(null);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        selectComponent('workpiece');
      }}
    >
      {Array.from({ length: POOL_SIZE }).map((_, idx) => (
        <group
          key={idx}
          ref={(el) => {
            groupRefs.current[idx] = el;
          }}
          visible={false}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.06, 0.06, 0.06]} />
            <meshStandardMaterial
              ref={(el) => {
                matRefs.current[idx] = el;
              }}
              color="#CBD5E1"
              roughness={0.28}
              metalness={0.78}
            />
          </mesh>
          {/* Chamfered top etching groove plate */}
          <mesh position={[0, 0.031, 0]}>
            <boxGeometry args={[0.038, 0.002, 0.038]} />
            <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh
            ref={(el) => {
              colWireRefs.current[idx] = el;
            }}
            visible={false}
          >
            <boxGeometry args={[0.062, 0.062, 0.062]} />
            <meshBasicMaterial color="#36C5D9" wireframe transparent opacity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
