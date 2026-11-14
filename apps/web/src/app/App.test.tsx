import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '@/app/App';
import { COMPONENT_REGISTRY, WORKCELL_CONFIG } from '@/config/workcell';
import { PRESET_SCENARIOS } from '@/config/scenarios';

describe('Phase 1 Foundation & Shell', () => {
  it('renders persistent navigation across all 5 routes', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    );

    expect(screen.getAllByText('AoKira').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('heading', { name: 'AoKira', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('SIMULATION ONLY')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /01 Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /02 Digital Twin/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /03 Simulation Lab/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /04 Performance Analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /05 Optimization Center/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/API Offline/i)).toBeInTheDocument();
    });
  });

  it('loads canonical workcell JSON and all 10 components + 4 scenarios', () => {
    expect(WORKCELL_CONFIG.workcellId).toBe('aokira-cell-v1');
    expect(WORKCELL_CONFIG.robot.dof).toBe(6);
    expect(WORKCELL_CONFIG.robot.joints).toHaveLength(6);
    expect(COMPONENT_REGISTRY).toHaveLength(10);
    expect(PRESET_SCENARIOS).toHaveLength(4);
  });
});
