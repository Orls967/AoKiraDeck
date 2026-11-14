import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DigitalTwinPage } from './DigitalTwinPage';
import { useTwinUiStore } from '@/stores/useTwinUiStore';
import { useSimulationStore } from '@/stores/useSimulationStore';

describe('DigitalTwinPage (FE-02)', () => {
  beforeEach(() => {
    useTwinUiStore.getState().resetVisibility();
    useTwinUiStore.getState().selectComponent('robot-arm');
    useTwinUiStore.getState().setCameraPreset('ISOMETRIC');
    useSimulationStore.setState({ workerStatus: 'READY', snapshot: null, lastIkResult: null });
  });

  it('FE-02: renders component tree, updates selection info, isolates/toggles visibility, and switches camera presets', () => {
    render(
      <MemoryRouter>
        <DigitalTwinPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Workcell Tree')).toBeInTheDocument();
    expect(screen.getByText('Two-Finger Parallel Gripper')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Two-Finger Parallel Gripper'));
    const infoPanel = screen.getByTestId('component-info-panel');
    expect(infoPanel).toHaveTextContent('gripper');
    expect(useTwinUiStore.getState().selectedComponentId).toBe('gripper');

    // Camera preset buttons update active store state
    fireEvent.click(screen.getByRole('button', { name: /2\s*Front/i }));
    expect(useTwinUiStore.getState().cameraPreset).toBe('FRONT');

    // Visibility toggle & Reset View
    fireEvent.click(screen.getByRole('button', { name: /Toggle visibility for Two-Finger Parallel Gripper/i }));
    expect(useTwinUiStore.getState().hiddenComponentIds.gripper).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Reset View/i }));
    expect(useTwinUiStore.getState().hiddenComponentIds.gripper).toBe(false);

    // 6 joint sliders present
    expect(screen.getByLabelText(/J1 Base Yaw/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/J6 Tool Flange Roll/i)).toBeInTheDocument();
  });
});
