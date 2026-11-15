import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { WORKCELL_CONFIG } from '@/config/workcell';
import { liveSnapshotRef, liveTracePointsRef } from '@/stores/useSimulationStore';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import type { ComponentId } from '@/types/workcell';
import { isComponentVisible } from './sceneHelpers';

const MAX_TRACE = 180;

export function EnvironmentRig() {
  const selectedId = useTwinUiStore((s) => s.selectedComponentId);
  const hoveredId = useTwinUiStore((s) => s.hoveredComponentId);
  const hiddenMap = useTwinUiStore((s) => s.hiddenComponentIds);
  const isolatedId = useTwinUiStore((s) => s.isolatedComponentId);
  const explodedFactor = useTwinUiStore((s) => s.explodedFactor);
  const showReachEnvelope = useTwinUiStore((s) => s.showReachEnvelope);
  const showCollisionVolumes = useTwinUiStore((s) => s.showCollisionVolumes);
  const showCoordinateFrames = useTwinUiStore((s) => s.showCoordinateFrames);
  const showTrajectoryTrace = useTwinUiStore((s) => s.showTrajectoryTrace);
  const selectComponent = useTwinUiStore((s) => s.selectComponent);
  const hoverComponent = useTwinUiStore((s) => s.hoverComponent);

  const pedestalVisible = isComponentVisible('robot-pedestal', hiddenMap, isolatedId);
  const fenceVisible = isComponentVisible('safety-fence', hiddenMap, isolatedId);
  const estopVisible = isComponentVisible('estop-station', hiddenMap, isolatedId);
  const sensorVisible = isComponentVisible('sensor-array', hiddenMap, isolatedId);

  const inputLedRef = useRef<THREE.MeshStandardMaterial>(null);
  const stationLedRef = useRef<THREE.MeshStandardMaterial>(null);
  const outputLedRef = useRef<THREE.MeshStandardMaterial>(null);
  const beaconMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const contactMarkerRef = useRef<THREE.Mesh>(null);
  const traceLineRef = useRef<THREE.Line>(null);

  const traceBuffer = useMemo(() => new Float32Array(MAX_TRACE * 3), []);
  const { traceGeo, traceLineObj } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(traceBuffer, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: '#36C5D9' });
    const line = new THREE.Line(geo, mat);
    return { traceGeo: geo, traceLineObj: line };
  }, [traceBuffer]);

  useEffect(() => {
    return () => {
      traceGeo.dispose();
      (traceLineObj.material as THREE.Material).dispose();
    };
  }, [traceGeo, traceLineObj]);

  const { pedestalBox, estopBox, fenceBoxes } = useMemo(() => {
    const pedestal = WORKCELL_CONFIG.staticObstacles.find((b) => b.ownerId === 'robot-pedestal');
    const estop = WORKCELL_CONFIG.staticObstacles.find((b) => b.ownerId === 'estop-station');
    const fences = WORKCELL_CONFIG.staticObstacles.filter((b) =>
      b.ownerId.startsWith('safety-fence'),
    );
    return { pedestalBox: pedestal, estopBox: estop, fenceBoxes: fences };
  }, []);

  useFrame((state) => {
    const snap = liveSnapshotRef.current;

    if (inputLedRef.current) {
      const active = Boolean(snap?.inputConveyor.sensorTriggered);
      inputLedRef.current.color.set(active ? '#22C55E' : '#334155');
      inputLedRef.current.emissive.set(active ? '#22C55E' : '#000000');
      inputLedRef.current.emissiveIntensity = active ? 1.4 : 0;
    }
    if (stationLedRef.current) {
      const occ = Boolean(snap?.station.occupied);
      stationLedRef.current.color.set(occ ? '#36C5D9' : '#334155');
      stationLedRef.current.emissive.set(occ ? '#36C5D9' : '#000000');
      stationLedRef.current.emissiveIntensity = occ ? 1.4 : 0;
    }
    if (outputLedRef.current) {
      const outTrig = Boolean(snap?.outputConveyor.sensorTriggered);
      outputLedRef.current.color.set(outTrig ? '#22C55E' : '#334155');
      outputLedRef.current.emissive.set(outTrig ? '#22C55E' : '#000000');
      outputLedRef.current.emissiveIntensity = outTrig ? 1.4 : 0;
    }

    if (beaconMatRef.current) {
      let beaconColor = '#36C5D9';
      if (snap?.runStatus === 'FAULTED' || snap?.collision.severity === 'COLLISION') {
        beaconColor = '#EF4444';
      } else if (
        snap?.runStatus === 'PAUSED' ||
        snap?.collision.severity === 'NEAR_COLLISION'
      ) {
        beaconColor = '#F59E0B';
      } else if (snap?.runStatus === 'RUNNING') {
        beaconColor = '#22C55E';
      }
      beaconMatRef.current.color.set(beaconColor);
      beaconMatRef.current.emissive.set(beaconColor);
      beaconMatRef.current.emissiveIntensity =
        snap?.runStatus === 'FAULTED'
          ? 0.6 + 0.8 * Math.abs(Math.sin(state.clock.elapsedTime * 7))
          : 1.0;
    }

    if (contactMarkerRef.current) {
      const cp = snap?.collision.contactPointWorld;
      const sev = snap?.collision.severity;
      if (cp && (sev === 'NEAR_COLLISION' || sev === 'COLLISION')) {
        contactMarkerRef.current.visible = true;
        contactMarkerRef.current.position.set(cp.x, cp.y, cp.z);
        const s = 1.0 + 0.25 * Math.sin(state.clock.elapsedTime * 10);
        contactMarkerRef.current.scale.setScalar(s);
        const m = contactMarkerRef.current.material as THREE.MeshBasicMaterial;
        m.color.set(sev === 'COLLISION' ? '#EF4444' : '#F59E0B');
      } else {
        contactMarkerRef.current.visible = false;
      }
    }

    if (traceLineRef.current) {
      const pts = liveTracePointsRef.current;
      if (showTrajectoryTrace && pts.length >= 2) {
        traceLineRef.current.visible = true;
        const count = Math.min(pts.length, MAX_TRACE);
        for (let i = 0; i < count; i += 1) {
          traceBuffer[i * 3] = pts[i].x;
          traceBuffer[i * 3 + 1] = pts[i].y;
          traceBuffer[i * 3 + 2] = pts[i].z;
        }
        traceGeo.attributes.position.needsUpdate = true;
        traceGeo.setDrawRange(0, count);
      } else {
        traceLineRef.current.visible = false;
      }
    }
  });

  const bindSelect = (id: ComponentId) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      hoverComponent(id);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      hoverComponent(null);
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      selectComponent(id);
    },
  });

  return (
    <group>
      {/* Matte Industrial Factory Floor + Precision 0.25 m / 1.0 m Grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#151C26" roughness={0.9} metalness={0.05} />
      </mesh>
      <gridHelper args={[6.4, 16, '#2D3C4E', '#18212C']} position={[0, 0.001, 0]} />
      {showCoordinateFrames && <axesHelper args={[0.45]} />}

      {/* Robot Mounting Pedestal */}
      {pedestalVisible && pedestalBox && (
        <group
          position={[0, -0.10 * explodedFactor, 0]}
          {...bindSelect('robot-pedestal')}
        >
          <mesh
            position={[pedestalBox.center.x, pedestalBox.center.y, pedestalBox.center.z]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[
                pedestalBox.halfExtents.x * 2,
                pedestalBox.halfExtents.y * 2,
                pedestalBox.halfExtents.z * 2,
              ]}
            />
            <meshStandardMaterial
              color="#3A4552"
              roughness={0.48}
              metalness={0.55}
              emissive={
                selectedId === 'robot-pedestal' || hoveredId === 'robot-pedestal'
                  ? '#36C5D9'
                  : '#000000'
              }
              emissiveIntensity={0.2}
            />
          </mesh>
          {/* Anchoring Base Flange Plate */}
          <mesh position={[0, 0.015, 0]} receiveShadow>
            <boxGeometry args={[0.52, 0.03, 0.52]} />
            <meshStandardMaterial color="#4B5A6B" roughness={0.45} metalness={0.65} />
          </mesh>
        </group>
      )}

      {/* Perimeter Safety Fence Panels & Structural Posts */}
      {fenceVisible && (
        <group
          position={[0, 0.14 * explodedFactor, 0]}
          {...bindSelect('safety-fence')}
        >
          {fenceBoxes.map((bx) => (
            <group key={bx.ownerId} position={[bx.center.x, bx.center.y, bx.center.z]}>
              <mesh>
                <boxGeometry
                  args={[bx.halfExtents.x * 2, bx.halfExtents.y * 2, bx.halfExtents.z * 2]}
                />
                <meshStandardMaterial
                  color="#4B5A6B"
                  transparent
                  opacity={
                    selectedId === 'safety-fence' || hoveredId === 'safety-fence' ? 0.26 : 0.12
                  }
                  roughness={0.3}
                  metalness={0.4}
                  // Transparent panels must not write depth, otherwise they occlude everything
                  // behind them and render as solid dark slabs.
                  depthWrite={false}
                />
              </mesh>
              <mesh>
                <boxGeometry
                  args={[bx.halfExtents.x * 2, bx.halfExtents.y * 2, bx.halfExtents.z * 2]}
                />
                <meshBasicMaterial
                  color={
                    selectedId === 'safety-fence' || showCollisionVolumes ? '#36C5D9' : '#243242'
                  }
                  wireframe
                  transparent
                  opacity={0.48}
                />
              </mesh>
            </group>
          ))}
          {/* Corner Stanchion Posts */}
          {[
            [-1.6, -1.2],
            [1.6, -1.2],
            [-1.6, 1.2],
            [1.6, 1.2],
          ].map(([px, pz]) => (
            <mesh key={`${px}-${pz}`} position={[px, 0.75, pz]} castShadow>
              <boxGeometry args={[0.07, 1.5, 0.07]} />
              {/* Powder-coated safety-yellow guard posts, as on real robot cell fencing */}
              <meshStandardMaterial color="#CA8A04" roughness={0.55} metalness={0.25} />
            </mesh>
          ))}
        </group>
      )}

      {/* Emergency Stop Console */}
      {estopVisible && estopBox && (
        <group
          position={[
            estopBox.center.x + 0.15 * explodedFactor,
            0,
            estopBox.center.z,
          ]}
          {...bindSelect('estop-station')}
        >
          <mesh position={[0, estopBox.center.y, 0]} castShadow receiveShadow>
            <boxGeometry
              args={[
                estopBox.halfExtents.x * 2,
                estopBox.halfExtents.y * 2,
                estopBox.halfExtents.z * 2,
              ]}
            />
            <meshStandardMaterial
              color="#3A4552"
              roughness={0.45}
              metalness={0.55}
              emissive={
                selectedId === 'estop-station' || hoveredId === 'estop-station'
                  ? '#36C5D9'
                  : '#000000'
              }
              emissiveIntensity={0.22}
            />
          </mesh>
          {/* Yellow Safety Collar */}
          <mesh position={[0, 1.06, 0]} castShadow>
            <cylinderGeometry args={[0.065, 0.075, 0.02, 24]} />
            <meshStandardMaterial color="#F59E0B" roughness={0.35} metalness={0.2} />
          </mesh>
          {/* Crimson Mushroom Button */}
          <mesh position={[0, 1.09, 0]} castShadow>
            <cylinderGeometry args={[0.048, 0.042, 0.04, 24]} />
            <meshStandardMaterial
              color="#EF4444"
              emissive="#EF4444"
              emissiveIntensity={0.45}
              roughness={0.3}
            />
          </mesh>
        </group>
      )}

      {/* Photoelectric Zone Sensors & Status Stack Beacon */}
      {sensorVisible && (
        <group {...bindSelect('sensor-array')}>
          {/* Input Zone Photoelectric Sensor */}
          <mesh position={[-0.56, 0.72, 0.22]} castShadow>
            <boxGeometry args={[0.04, 0.05, 0.025]} />
            <meshStandardMaterial
              ref={inputLedRef}
              color="#4B5A6B"
              roughness={0.3}
              metalness={0.6}
            />
          </mesh>
          {/* Station Sensor */}
          <mesh position={[-0.21, 0.75, -0.56]} castShadow>
            <boxGeometry args={[0.025, 0.05, 0.04]} />
            <meshStandardMaterial
              ref={stationLedRef}
              color="#4B5A6B"
              roughness={0.3}
              metalness={0.6}
            />
          </mesh>
          {/* Output Zone Photoelectric Sensor */}
          <mesh position={[0.56, 0.72, 0.22]} castShadow>
            <boxGeometry args={[0.04, 0.05, 0.025]} />
            <meshStandardMaterial
              ref={outputLedRef}
              color="#4B5A6B"
              roughness={0.3}
              metalness={0.6}
            />
          </mesh>
          {/* Stack Beacon Tower on North-West Post */}
          <mesh position={[-1.6, 1.65, -1.2]} castShadow>
            <cylinderGeometry args={[0.015, 0.015, 0.30, 16]} />
            <meshStandardMaterial color="#94A3B8" roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh position={[-1.6, 1.85, -1.2]}>
            <cylinderGeometry args={[0.042, 0.042, 0.14, 20]} />
            <meshStandardMaterial
              ref={beaconMatRef}
              color="#36C5D9"
              emissive="#36C5D9"
              emissiveIntensity={1.0}
              roughness={0.2}
            />
          </mesh>
        </group>
      )}

      {/* Optional 6-Axis Reach Envelope Overlay (~1.02 m hemisphere centered on J2 shoulder) */}
      {showReachEnvelope && (
        <mesh position={[0, 0.79, -0.08]}>
          <sphereGeometry args={[1.02, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.72]} />
          <meshBasicMaterial color="#36C5D9" wireframe transparent opacity={0.14} />
        </mesh>
      )}

      {/* Closest Collision / Near-Collision Contact Sphere */}
      <mesh ref={contactMarkerRef} visible={false}>
        <sphereGeometry args={[0.036, 16, 16]} />
        <meshBasicMaterial color="#EF4444" transparent opacity={0.85} />
      </mesh>

      {/* Live TCP Trajectory Trace */}
      <primitive object={traceLineObj} ref={traceLineRef} />
    </group>
  );
}
