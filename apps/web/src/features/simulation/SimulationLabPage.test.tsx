import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SimulationLabPage } from './SimulationLabPage';
import { DEFAULT_SCENARIO } from '@/config/scenarios';
import { WORKCELL_CONFIG } from '@/config/workcell';
import { useSimulationStore } from '@/stores/useSimulationStore';
import type { SimulationSnapshot } from '@/types/simulation';

function makeSnapshot(overrides: Partial<SimulationSnapshot> = {}): SimulationSnapshot {
  const zeroPose = {
    position: { x: 0.45, y: 0.85, z: 0.1 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
  };
  const joints = WORKCELL_CONFIG.robot.joints.map((j) => ({
    id: j.id,
    angleRad: j.homeAngleRad,
    velocityRadPerSec: 0,
    atLimit: false,
  })) as SimulationSnapshot['joints'];

  return {
    runId: 'run-test',
    simTimeMs: 0,
    tickIndex: 0,
    runStatus: 'READY',
    stage: 'IDLE',
    activeCycleIndex: 0,
    completedUnits: 0,
    targetUnits: 1,
    joints,
    linkWorldPoses: [zeroPose, zeroPose, zeroPose, zeroPose, zeroPose, zeroPose],
    tcpWorldPose: zeroPose,
    gripper: {
      actuationState: 'OPEN',
      jawOpeningMeters: 0.08,
      heldWorkpieceId: null,
      clampForceNormalized: 0,
    },
    inputConveyor: {
      id: 'input-conveyor',
      running: false,
      speedMetersPerSec: 0.25,
      sensorTriggered: false,
      workpieceCountOnBelt: 0,
    },
    outputConveyor: {
      id: 'output-conveyor',
      running: false,
      speedMetersPerSec: 0.25,
      sensorTriggered: false,
      workpieceCountOnBelt: 0,
    },
    station: {
      occupied: false,
      activeWorkpieceId: null,
      processingProgress: 0,
      clampEngaged: false,
    },
    workpieces: [],
    collision: {
      severity: 'NONE',
      minClearanceMeters: 0.15,
      pairA: 'link-5',
      pairB: 'station',
      contactPointWorld: null,
    },
    activeFault: null,
    cumulativeEnergyWh: 0,
    ...overrides,
  };
}

describe('SimulationLabPage (FE-01)', () => {
  const sendCommandSpy = vi.fn();
  const loadScenarioSpy = vi.fn();
  const stepSingleTickSpy = vi.fn();
  const setPlaybackSpeedSpy = vi.fn();

  beforeEach(() => {
    sendCommandSpy.mockReset();
    loadScenarioSpy.mockReset();
    stepSingleTickSpy.mockReset();
    setPlaybackSpeedSpy.mockReset();

    useSimulationStore.setState({
      workerStatus: 'READY',
      workerError: null,
      activeScenario: DEFAULT_SCENARIO,
      playbackSpeed: 1,
      snapshot: makeSnapshot(),
      events: [],
      metrics: null,
      sendCommand: sendCommandSpy,
      loadScenario: loadScenarioSpy,
      stepSingleTick: stepSingleTickSpy,
      setPlaybackSpeed: setPlaybackSpeedSpy,
    });
  });

  it('FE-01: dispatches transport commands, updates playback speed, and shows active stage & fault banners', () => {
    render(
      <MemoryRouter>
        <SimulationLabPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Start$/i }));
    expect(sendCommandSpy).toHaveBeenCalledWith('START');

    fireEvent.click(screen.getByRole('button', { name: /Step 20ms/i }));
    expect(stepSingleTickSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^2x$/i }));
    expect(setPlaybackSpeedSpy).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: /E-Stop Fault Trigger/i }));
    expect(sendCommandSpy).toHaveBeenCalledWith('ESTOP');

    // Stage stepper lists all 8 stages
    const stepper = screen.getByTestId('stage-stepper');
    expect(stepper).toHaveTextContent('01 Detect Object');
    expect(stepper).toHaveTextContent('08 Place Workpiece');
  });

  it('FE-01b: renders fault banner and event log when worker enters FAULTED state', () => {
    useSimulationStore.setState({
      workerStatus: 'FAULTED',
      snapshot: makeSnapshot({
        runStatus: 'FAULTED',
        stage: 'TRANSFER_TO_STATION',
        simTimeMs: 4200,
        activeFault: {
          code: 'ESTOP_ACTIVE',
          message: 'Emergency stop engaged by operator.',
          componentId: 'estop-station',
        },
      }),
      events: [
        {
          seq: 1,
          runId: 'run-test',
          simTimeMs: 4200,
          eventType: 'SIM_STOPPED',
          stage: 'TRANSFER_TO_STATION',
          cycleIndex: 0,
          workpieceId: 'WP-0001',
          componentId: 'estop-station',
          severity: 'ERROR',
          message: 'Emergency stop engaged by operator.',
          payload: {},
        },
      ],
    });

    render(
      <MemoryRouter>
        <SimulationLabPage />
      </MemoryRouter>,
    );

    const faultBanner = screen.getByTestId('active-fault-banner');
    expect(faultBanner).toHaveTextContent('ESTOP_ACTIVE');
    expect(faultBanner).toHaveTextContent('estop-station');

    const log = screen.getByTestId('simulation-event-log');
    expect(log).toHaveTextContent('SIM_STOPPED');

    fireEvent.click(screen.getByRole('button', { name: /Reset Fault/i }));
    expect(sendCommandSpy).toHaveBeenCalledWith('RESET');
  });
});
