import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AnalyticsPage } from './AnalyticsPage';
import { DEFAULT_SCENARIO } from '@/config/scenarios';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useSimulationStore } from '@/stores/useSimulationStore';
import type { ProductionMetrics, SimulationEvent } from '@/types/simulation';

const SAMPLE_EVENTS: SimulationEvent[] = [
  {
    seq: 1,
    runId: 'run-a1',
    simTimeMs: 0,
    eventType: 'SIM_STARTED',
    stage: 'IDLE',
    cycleIndex: 0,
    workpieceId: null,
    componentId: null,
    severity: 'INFO',
    message: 'Started run',
    payload: {},
  },
  {
    seq: 2,
    runId: 'run-a1',
    simTimeMs: 12800,
    eventType: 'CYCLE_COMPLETED',
    stage: 'CYCLE_COMPLETE',
    cycleIndex: 1,
    workpieceId: 'WP-0001',
    componentId: 'output-conveyor',
    severity: 'INFO',
    message: 'Delivered WP-0001',
    payload: { cycleTimeMs: 12800 },
  },
];

const SAMPLE_METRICS: ProductionMetrics = {
  runId: 'run-a1',
  scenarioId: DEFAULT_SCENARIO.scenarioId,
  totalSimTimeMs: 12800,
  totalUnitsProduced: 1,
  unitsPerHour: 281.25,
  averageCycleTimeMs: 12800,
  minCycleTimeMs: 12800,
  maxCycleTimeMs: 12800,
  robotActiveTimeMs: 8800,
  robotUtilizationPct: 68.75,
  conveyorActiveTimeMs: 3200,
  conveyorUtilizationPct: 25.0,
  idleTimeMs: 1600,
  downtimeMs: 0,
  collisionEventCount: 0,
  nearCollisionEventCount: 0,
  estimatedEnergyWh: 0.91,
  energyPerUnitWh: 0.91,
  productionEfficiencyPct: 87.5,
  perCycleHistory: [
    {
      cycleIndex: 1,
      cycleTimeMs: 12800,
      robotMoveMs: 8800,
      processDwellMs: 2400,
      waitTimeMs: 1600,
      energyWh: 0.91,
      hadNearCollision: false,
      hadFault: false,
    },
  ],
};

describe('AnalyticsPage (FE-03 & FE-04)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    useSimulationStore.setState({
      workerStatus: 'READY',
      activeScenario: DEFAULT_SCENARIO,
      snapshot: null,
      events: [],
      metrics: null,
    });
    useAnalyticsStore.setState({
      backendStatus: 'CHECKING',
      backendReason: null,
      healthInfo: null,
      isEvaluating: false,
      evaluation: null,
      evaluationError: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('FE-03: renders explicit empty-state prompt with zero fake KPIs when no simulation data exists', () => {
    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>,
    );

    const emptyCard = screen.getByTestId('analytics-empty-state');
    expect(emptyCard).toBeInTheDocument();
    expect(emptyCard).toHaveTextContent(/No simulation cycles or events recorded yet/i);
    expect(screen.queryByTestId('analytics-kpi-grid')).not.toBeInTheDocument();
  });

  it('FE-04: handles backend 503/network failure cleanly while keeping local event-derived KPIs visible', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:8000');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ detail: 'Service down' }), { status: 503 }));

    useSimulationStore.setState({
      events: SAMPLE_EVENTS,
      metrics: SAMPLE_METRICS,
    });

    await useAnalyticsStore.getState().probeHealth();
    expect(useAnalyticsStore.getState().backendStatus).toBe('UNAVAILABLE');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>,
    );

    // Offline banner is visible with Retry Connection button
    const banner = screen.getByTestId('backend-unavailable-banner');
    expect(banner).toHaveTextContent(/Backend Unavailable/i);

    // Client KPIs remain populated strictly from SAMPLE_METRICS
    const kpiGrid = screen.getByTestId('analytics-kpi-grid');
    expect(kpiGrid).toHaveTextContent('281.3 u/h');
    expect(kpiGrid).toHaveTextContent('12800 ms');
    expect(kpiGrid).toHaveTextContent('0.910 Wh');

    // Retry probes health again
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'aokira-analytics',
          apiVersion: '1.0.0',
          engineContractVersion: '1.0.0',
          timestampUtc: '2026-11-15T00:00:00Z',
        }),
        { status: 200 },
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: /Retry Connection/i }));
    await waitFor(() => {
      expect(useAnalyticsStore.getState().backendStatus).toBe('ONLINE');
    });
  });
});
