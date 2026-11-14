import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { DigitalTwinPage } from '@/features/digital-twin/DigitalTwinPage';
import { SimulationLabPage } from '@/features/simulation/SimulationLabPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { OptimizationPage } from '@/features/optimization/OptimizationPage';
import { useAnalyticsStore } from '@/stores/useAnalyticsStore';
import { useSimulationStore } from '@/stores/useSimulationStore';

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
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/digital-twin" element={<DigitalTwinPage />} />
        <Route path="/simulation" element={<SimulationLabPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/optimization" element={<OptimizationPage />} />
      </Routes>
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
