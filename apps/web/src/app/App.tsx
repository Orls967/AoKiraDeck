import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { DigitalTwinPage } from '@/features/digital-twin/DigitalTwinPage';
import { SimulationLabPage } from '@/features/simulation/SimulationLabPage';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useSimulationStore } from '@/stores/useSimulationStore';

// Analytics and Optimization are the only Recharts consumers: load them (and the ~400 kB
// charting chunk) on first visit instead of on every landing.
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const OptimizationPage = lazy(() =>
  import('@/features/optimization/OptimizationPage').then((m) => ({
    default: m.OptimizationPage,
  })),
);

function RouteFallback() {
  return (
    <div role="status" className="p-6 font-mono text-xs text-[#94A3B8]">
      Loading module…
    </div>
  );
}

export function AppRoutes() {
  const initWorker = useSimulationStore((s) => s.initWorker);
  const workerStatus = useSimulationStore((s) => s.workerStatus);
  const backendStatus = useAnalyticsStore((s) => s.backendStatus);
  const probeHealth = useAnalyticsStore((s) => s.probeHealth);

  useEffect(() => {
    initWorker();
    void probeHealth();
  }, [initWorker, probeHealth]);

  return (
    <AppShell workerStatus={workerStatus} backendStatus={backendStatus}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/digital-twin" element={<DigitalTwinPage />} />
          <Route path="/simulation" element={<SimulationLabPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/optimization" element={<OptimizationPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppRoutes />
    </BrowserRouter>
  );
}
