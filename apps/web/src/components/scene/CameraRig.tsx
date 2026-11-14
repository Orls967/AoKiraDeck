import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import { CAMERA_PRESETS } from './sceneHelpers';

interface CameraRigProps {
  autoOrbit?: boolean;
}

export function CameraRig({ autoOrbit = false }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const cameraPreset = useTwinUiStore((s) => s.cameraPreset);
  const cameraPresetNonce = useTwinUiStore((s) => s.cameraPresetNonce);
  const reducedMotion = useReducedMotion();

  const animatingRef = useRef(false);
  const goalPosRef = useRef(new THREE.Vector3(...CAMERA_PRESETS.ISOMETRIC.position));
  const goalTargetRef = useRef(new THREE.Vector3(...CAMERA_PRESETS.ISOMETRIC.target));
  const userInteractingRef = useRef(false);

  useEffect(() => {
    const preset = CAMERA_PRESETS[cameraPreset];
    goalPosRef.current.set(...preset.position);
    goalTargetRef.current.set(...preset.target);
    if (cameraPresetNonce === 0) {
      camera.position.copy(goalPosRef.current);
      if (controlsRef.current) {
        controlsRef.current.target.copy(goalTargetRef.current);
        controlsRef.current.update();
      }
      return;
    }
    animatingRef.current = true;
  }, [camera, cameraPreset, cameraPresetNonce]);

  useFrame((_, delta) => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    if (animatingRef.current) {
      const alpha = reducedMotion ? 1.0 : Math.min(1.0, delta * 7.5);
      camera.position.lerp(goalPosRef.current, alpha);
      ctrl.target.lerp(goalTargetRef.current, alpha);
      ctrl.update();
      if (
        camera.position.distanceTo(goalPosRef.current) < 0.01 &&
        ctrl.target.distanceTo(goalTargetRef.current) < 0.01
      ) {
        camera.position.copy(goalPosRef.current);
        ctrl.target.copy(goalTargetRef.current);
        ctrl.update();
        animatingRef.current = false;
      }
      return;
    }

    if (autoOrbit && !reducedMotion && !userInteractingRef.current) {
      // Slow 0.06 rad/s horizontal camera orbit when user is not dragging
      const offset = camera.position.clone().sub(ctrl.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.06 * Math.min(delta, 0.05));
      camera.position.copy(ctrl.target).add(offset);
      ctrl.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.07}
      minDistance={1.1}
      maxDistance={7.5}
      maxPolarAngle={Math.PI * 0.485}
      onStart={() => {
        animatingRef.current = false;
        userInteractingRef.current = true;
      }}
      onEnd={() => {
        userInteractingRef.current = false;
      }}
    />
  );
}
