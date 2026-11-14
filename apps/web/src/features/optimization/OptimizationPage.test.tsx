import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OptimizationPage } from './OptimizationPage';
import { DEFAULT_SCENARIO } from '@/config/scenarios';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useSimulationStore } from '@/stores/useSimulationStore';

describe('OptimizationPage', () => {
  const loadScenarioSpy = vi.fn();

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:8000');
    loadScenarioSpy.mockReset();

    useSimulationStore.setState({
      activeScenario: DEFAULT_SCENARIO,
      metrics: null,
      loadScenario: loadScenarioSpy,
    });
    useAnalyticsStore.setState({
      backendStatus: 'ONLINE',
      backendReason: null,
      isComparing: false,
      comparison: null,
      comparisonError: null,
      isOptimizing: false,
      optimization: null,
      optimizationError: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('compares presets, runs constrained optimization, and loads recommended config into Simulation Lab', async () => {
    const recommendedScenario = {
      ...DEFAULT_SCENARIO,
      scenarioId: 'optimized-test',
      name: 'Balanced Optimal Run',
      robotSpeedScale: 1.28,
      robotAccelScale: 1.25,
      inputConveyorSpeedMps: 0.42,
      outputConveyorSpeedMps: 0.4,
      processingDwellMs: 1400,
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/api/v1/scenarios/compare')) {
          return new Response(
            JSON.stringify({
              rankingObjective: 'BALANCED',
              bestScenarioId: 'faster-robot-b',
              comparisons: [
                {
                  scenarioId: 'faster-robot-b',
                  name: 'Scenario B: Faster Robot Motion',
                  source: 'ANALYTICAL_ESTIMATE',
                  cycleTimeMs: 9800,
                  throughputUnitsPerHour: 367.3,
                  idleTimeRatioPct: 12.1,
                  estimatedEnergyPerUnitWh: 0.88,
                  collisionCount: 0,
                  bottleneckStage: 'PROCESS_WORKPIECE',
                  compositeScore: 0.89,
                  rank: 1,
                },
              ],
              summaryNote: 'Ranked 4 presets on BALANCED.',
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            feasible: true,
            evaluationsRun: 42,
            baselineProjected: {
              cycleTimeMs: 13013,
              throughputUnitsPerHour: 276.6,
              energyPerUnitWh: 0.9,
              idleRatioPct: 14.5,
            },
            recommendedScenario,
            recommendedProjected: {
              cycleTimeMs: 9200,
              throughputUnitsPerHour: 391.3,
              energyPerUnitWh: 0.78,
              idleRatioPct: 9.8,
              bottleneckStage: 'PROCESS_WORKPIECE',
            },
            deltas: {
              cycleTimePct: -29.3,
              throughputPct: 41.5,
              energyPerUnitPct: -13.3,
            },
            topCandidates: [
              {
                rank: 1,
                scenario: recommendedScenario,
                cycleTimeMs: 9200,
                throughputUnitsPerHour: 391.3,
                energyPerUnitWh: 0.78,
                score: 0.92,
              },
            ],
            note: 'SciPy SLSQP converged cleanly.',
          }),
          { status: 200 },
        );
      });

    render(
      <MemoryRouter initialEntries={['/optimization']}>
        <Routes>
          <Route path="/optimization" element={<OptimizationPage />} />
          <Route path="/simulation" element={<div data-testid="sim-lab-route">Lab Route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Compare Scenarios/i }));
    await waitFor(() => {
      expect(screen.getByTestId('scenario-comparison-table')).toBeInTheDocument();
    });
    expect(screen.getByTestId('scenario-comparison-table')).toHaveTextContent('367.3 u/h');

    fireEvent.click(screen.getByRole('button', { name: /Run Optimization/i }));
    await waitFor(() => {
      expect(screen.getByTestId('recommended-config-card')).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByTestId('load-optimized-btn'));
    expect(loadScenarioSpy).toHaveBeenCalledWith(recommendedScenario);
    expect(screen.getByTestId('sim-lab-route')).toBeInTheDocument();
  });

  it('displays structured error diagnostic banner when optimizer returns INFEASIBLE_OPTIMIZATION', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'INFEASIBLE_OPTIMIZATION',
            message: 'Minimum throughput constraint 100000 u/h cannot be satisfied inside bounds.',
            requestId: 'req-123',
            details: [],
          },
        }),
        { status: 422 },
      ),
    );

    render(
      <MemoryRouter>
        <OptimizationPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Run Optimization/i }));
    await waitFor(() => {
      expect(screen.getByTestId('optimization-error-banner')).toBeInTheDocument();
    });
    expect(screen.getByTestId('optimization-error-banner')).toHaveTextContent(
      'INFEASIBLE_OPTIMIZATION',
    );
  });
});
