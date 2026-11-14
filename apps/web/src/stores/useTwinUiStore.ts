import { create } from 'zustand';
import type { ComponentId } from '@/types/workcell';
import { COMPONENT_REGISTRY } from '@/config/workcell';

export type CameraPreset = 'ISOMETRIC' | 'FRONT' | 'SIDE' | 'TOP';

interface TwinUiState {
  selectedComponentId: ComponentId | null;
  hoveredComponentId: ComponentId | null;
  hiddenComponentIds: Record<ComponentId, boolean>;
  isolatedComponentId: ComponentId | null;
  explodedFactor: number;
  showReachEnvelope: boolean;
  showCollisionVolumes: boolean;
  showCoordinateFrames: boolean;
  showTrajectoryTrace: boolean;
  cameraPreset: CameraPreset;
  cameraPresetNonce: number;
  webglSupported: boolean | null;

  selectComponent: (id: ComponentId | null) => void;
  hoverComponent: (id: ComponentId | null) => void;
  toggleComponentVisibility: (id: ComponentId) => void;
  isolateComponent: (id: ComponentId | null) => void;
  resetVisibility: () => void;
  setExplodedFactor: (factor: number) => void;
  setOverlayFlag: (
    key:
      | 'showReachEnvelope'
      | 'showCollisionVolumes'
      | 'showCoordinateFrames'
      | 'showTrajectoryTrace',
    value: boolean,
  ) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setWebglSupported: (supported: boolean) => void;
}

function buildInitialVisibility(): Record<ComponentId, boolean> {
  const out = {} as Record<ComponentId, boolean>;
  for (const item of COMPONENT_REGISTRY) {
    out[item.id] = false;
  }
  return out;
}

export const useTwinUiStore = create<TwinUiState>((set) => ({
  selectedComponentId: 'robot-arm',
  hoveredComponentId: null,
  hiddenComponentIds: buildInitialVisibility(),
  isolatedComponentId: null,
  explodedFactor: 0,
  showReachEnvelope: false,
  showCollisionVolumes: false,
  showCoordinateFrames: true,
  showTrajectoryTrace: true,
  cameraPreset: 'ISOMETRIC',
  cameraPresetNonce: 0,
  webglSupported: null,

  selectComponent: (id) => set({ selectedComponentId: id }),
  hoverComponent: (id) => set({ hoveredComponentId: id }),
  toggleComponentVisibility: (id) =>
    set((s) => ({
      hiddenComponentIds: {
        ...s.hiddenComponentIds,
        [id]: !s.hiddenComponentIds[id],
      },
      isolatedComponentId: s.isolatedComponentId === id ? null : s.isolatedComponentId,
    })),
  isolateComponent: (id) =>
    set((s) => ({
      isolatedComponentId: s.isolatedComponentId === id ? null : id,
      selectedComponentId: id ?? s.selectedComponentId,
    })),
  resetVisibility: () =>
    set({
      hiddenComponentIds: buildInitialVisibility(),
      isolatedComponentId: null,
      explodedFactor: 0,
    }),
  setExplodedFactor: (factor) =>
    set({ explodedFactor: Math.max(0, Math.min(1, factor)) }),
  setOverlayFlag: (key, value) => set({ [key]: value }),
  setCameraPreset: (preset) =>
    set((s) => ({ cameraPreset: preset, cameraPresetNonce: s.cameraPresetNonce + 1 })),
  setWebglSupported: (supported) => set({ webglSupported: supported }),
}));
