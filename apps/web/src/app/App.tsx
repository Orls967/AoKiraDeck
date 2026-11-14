import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { DigitalTwinPage } from '@/features/digital-twin/DigitalTwinPage';
import { SimulationLabPage } from '@/features/simulation/SimulationLabPage';
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage';
import { OptimizationPage } from '@/features/optimization/OptimizationPage';

export function AppRoutes() {
  return (
    <AppShell>
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
