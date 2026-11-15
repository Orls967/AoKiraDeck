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
  it('locks process dwell by default and compares all three objectives side by side', async () => {
    const bodies: Array<{ objective: string; bounds: { processingDwellMs: [number, number] } }> =
      [];
    const projected: Record<string, { cycle: number; energy: number; speed: number }> = {
      MIN_CYCLE_TIME: { cycle: 8860, energy: 0.802, speed: 1.4 },
      MIN_ENERGY_PER_UNIT: { cycle: 10780, energy: 0.765, speed: 1.19 },
      BALANCED: { cycle: 9380, energy: 0.78, speed: 1.4 },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const p = projected[body.objective];
      const scenario = {
        ...DEFAULT_SCENARIO,
        scenarioId: `baseline-a-optimized`,
        description: `Optimized under ${body.objective} (40 surrogate evaluations).`,
        robotSpeedScale: p.speed,
      };
      return new Response(
        JSON.stringify({
          feasible: true,
          evaluationsRun: 40,
          baselineProjected: {
            cycleTimeMs: 11580,
            throughputUnitsPerHour: 310.9,
            energyPerUnitWh: 0.936,
            idleRatioPct: 0.2,
          },
          recommendedScenario: scenario,
          recommendedProjected: {
            cycleTimeMs: p.cycle,
            throughputUnitsPerHour: 3_600_000 / p.cycle,
            energyPerUnitWh: p.energy,
            idleRatioPct: 0.2,
            bottleneckStage: 'ROBOT_TRANSIT',
          },
          deltas: { cycleTimePct: -10, throughputPct: 10, energyPerUnitPct: -10 },
          topCandidates: [],
          note: 'ok',
        }),
        { status: 200 },
      );
    });

    render(
      <MemoryRouter>
        <OptimizationPage />
      </MemoryRouter>,
    );

    // Dwell bounds are pinned to the base scenario until the user opts in.
    expect(screen.getByLabelText('Process Dwell (ms) Min')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Compare Objectives/i }));
    await waitFor(() => {
      expect(screen.getByTestId('objective-comparison')).toBeInTheDocument();
    });
    expect(bodies.map((b) => b.objective).sort()).toEqual([
      'BALANCED',
      'MIN_CYCLE_TIME',
      'MIN_ENERGY_PER_UNIT',
    ]);
    for (const b of bodies) {
      expect(b.bounds.processingDwellMs).toEqual([
        DEFAULT_SCENARIO.processingDwellMs,
        DEFAULT_SCENARIO.processingDwellMs,
      ]);
    }
    const table = screen.getByTestId('objective-comparison');
    expect(table).toHaveTextContent('10780 ms');
    expect(table).toHaveTextContent('0.765 Wh');
    expect(screen.getByTestId('tradeoff-map')).toBeInTheDocument();

    // Opting in releases the dwell bounds.
    fireEvent.click(screen.getByLabelText(/Optimize process dwell/i));
    expect(screen.getByLabelText('Process Dwell (ms) Min')).toBeEnabled();
  });
});

