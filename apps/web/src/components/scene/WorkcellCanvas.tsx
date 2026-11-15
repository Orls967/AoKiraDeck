import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import {
  WebGLErrorBoundary,
  detectSoftwareRenderer,
  detectWebGLSupport,
} from '@/components/WebGLErrorBoundary';
import { WebGLFallbackView } from '@/components/WebGLFallbackView';
import { useSimulationStore } from '@/stores/useSimulationStore';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import { CameraRig } from './CameraRig';
import { ConveyorModels } from './ConveyorModels';
import { EnvironmentRig } from './EnvironmentRig';
import { GripperModel } from './GripperModel';
import { ProcessingStationModel } from './ProcessingStationModel';
import { RobotArmModel } from './RobotArmModel';
import { WorkpieceMeshes } from './WorkpieceMeshes';

interface WorkcellCanvasProps {
  autoOrbit?: boolean;
  className?: string;
}

export function WorkcellCanvas({ autoOrbit = false, className = '' }: WorkcellCanvasProps) {
  const [webglOk, setWebglOk] = useState<boolean>(() => detectWebGLSupport());
  const setWebglSupported = useTwinUiStore((s) => s.setWebglSupported);
  const selectComponent = useTwinUiStore((s) => s.selectComponent);
  const snapshot = useSimulationStore((s) => s.snapshot);
  // CPU-rasterised WebGL (VMs, CI, GPU acceleration off): skip the environment map and
  // shadows, which cost ~10x frame time there, so the scene stays interactive.
  const [lowQuality] = useState<boolean>(() => detectSoftwareRenderer());

  useEffect(() => {
    const supported = detectWebGLSupport();
    setWebglOk(supported);
    setWebglSupported(supported);
  }, [setWebglSupported]);

  if (!webglOk) {
    return (
      <div className={`h-full w-full ${className}`}>
        <WebGLFallbackView snapshot={snapshot} />
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${className}`}>
      <WebGLErrorBoundary
        fallback={<WebGLFallbackView snapshot={snapshot} />}
        onError={() => {
          setWebglOk(false);
          setWebglSupported(false);
        }}
      >
        <Canvas
          shadows={!lowQuality}
          dpr={lowQuality ? 1 : [1, 2]}
          data-quality={lowQuality ? 'low' : 'high'}
          camera={{ fov: 42, near: 0.05, far: 45, position: [2.25, 1.8, 2.4] }}
          onPointerMissed={() => selectComponent(null)}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#0B0F14']} />
          <fog attach="fog" args={['#0B0F14', 8.5, 22]} />

          {/* Studio lighting. The procedural Lightformer environment (no HDR download, works
              offline) gives the metallic graphite/steel parts something to reflect; without it
              PBR metals render near-black. Neutral fill keeps the safety-orange links true. */}
          {!lowQuality && (
            <Environment resolution={256} frames={1}>
              <Lightformer
                form="rect"
                intensity={3.0}
                color="#F8FAFC"
                position={[0, 5, 0]}
                rotation-x={Math.PI / 2}
                scale={[8, 8, 1]}
              />
              <Lightformer
                form="rect"
                intensity={1.1}
                color="#E2E8F0"
                position={[-5, 2.2, 2]}
                rotation-y={Math.PI / 2}
                scale={[5, 2.5, 1]}
              />
              <Lightformer
                form="rect"
                intensity={0.9}
                color="#36C5D9"
                position={[5, 1.6, -3]}
                rotation-y={-Math.PI / 2}
                scale={[4, 1.6, 1]}
              />
              <Lightformer
                form="rect"
                intensity={0.6}
                color="#FDBA74"
                position={[0, 1.5, -6]}
                scale={[6, 2, 1]}
              />
            </Environment>
          )}
          <ambientLight intensity={lowQuality ? 0.55 : 0.18} color="#F1F5F9" />
          <hemisphereLight args={['#E2E8F0', '#111827', 0.35]} />
          <directionalLight
            position={[3.8, 5.6, 3.2]}
            intensity={2.1}
            color="#FFF7ED"
            castShadow={!lowQuality}
            shadow-bias={-0.0004}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={0.5}
            shadow-camera-far={16}
            shadow-camera-left={-2.8}
            shadow-camera-right={2.8}
            shadow-camera-top={2.8}
            shadow-camera-bottom={-2.8}
          />
          <directionalLight position={[-3.5, 2.8, -2.5]} intensity={0.6} color="#36C5D9" />
          <directionalLight position={[0.0, 2.0, -4.0]} intensity={0.45} color="#FDBA74" />

          <RobotArmModel />
          <GripperModel />
          <ConveyorModels />
          <ProcessingStationModel />
          <WorkpieceMeshes />
          <EnvironmentRig />

          <CameraRig autoOrbit={autoOrbit} />
        </Canvas>
      </WebGLErrorBoundary>
    </div>
  );
}
