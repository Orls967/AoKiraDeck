import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { WebGLErrorBoundary, detectWebGLSupport } from '@/components/WebGLErrorBoundary';
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
          shadows
          dpr={[1, 2]}
          camera={{ fov: 42, near: 0.05, far: 45, position: [2.25, 1.80, 2.40] }}
          onPointerMissed={() => selectComponent(null)}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#0B0F14']} />
          <fog attach="fog" args={['#0B0F14', 8.5, 22]} />

          {/* Calibrated 3-point studio lighting with zero external HDR dependencies */}
          <ambientLight intensity={0.42} color="#CBD5E1" />
          <hemisphereLight args={['#38BDF8', '#0F172A', 0.48]} />
          <directionalLight
            position={[3.8, 5.6, 3.2]}
            intensity={1.55}
            color="#F8FAFC"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-near={0.5}
            shadow-camera-far={16}
            shadow-camera-left={-2.8}
            shadow-camera-right={2.8}
            shadow-camera-top={2.8}
            shadow-camera-bottom={-2.8}
          />
          <directionalLight position={[-3.5, 2.8, -2.5]} intensity={0.55} color="#36C5D9" />
          <directionalLight position={[0.0, 2.0, -4.0]} intensity={0.35} color="#FDBA74" />

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
