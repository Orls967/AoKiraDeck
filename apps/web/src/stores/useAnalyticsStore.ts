import { create } from 'zustand';
import type { BackendHealthStatus } from '@/components/AppShell';
import {
  ApiDomainError,
  BackendUnavailableError,
  apiClient,
} from '@/services/apiClient';
import type {
  AnalyticsEvaluateRequest,
  AnalyticsEvaluateResponse,
  ApiHealthResponse,
  OptimizationRunRequest,
  OptimizationRunResponse,
  ScenariosCompareRequest,
  ScenariosCompareResponse,
} from '@/types/api';

interface AnalyticsStoreState {
  backendStatus: BackendHealthStatus;
  backendReason: string | null;
  healthInfo: ApiHealthResponse | null;

  isEvaluating: boolean;
  evaluation: AnalyticsEvaluateResponse | null;
  evaluationError: string | null;

  isComparing: boolean;
  comparison: ScenariosCompareResponse | null;
  comparisonError: string | null;

  isOptimizing: boolean;
  optimization: OptimizationRunResponse | null;
  optimizationError: string | null;

  probeHealth: () => Promise<BackendHealthStatus>;
  evaluateRun: (payload: AnalyticsEvaluateRequest) => Promise<void>;
  compareScenarios: (payload: ScenariosCompareRequest) => Promise<void>;
  runOptimization: (payload: OptimizationRunRequest) => Promise<void>;
  clearErrors: () => void;
}

function formatDomainError(err: ApiDomainError): string {
  if (err.details.length > 0) {
    const first = err.details[0];
    return `${err.code}: ${err.message} (${first.field}: ${first.issue})`;
  }
  return `${err.code}: ${err.message}`;
}

export const useAnalyticsStore = create<AnalyticsStoreState>((set) => ({
  backendStatus: 'CHECKING',
  backendReason: null,
  healthInfo: null,

  isEvaluating: false,
  evaluation: null,
  evaluationError: null,

  isComparing: false,
  comparison: null,
  comparisonError: null,

  isOptimizing: false,
  optimization: null,
  optimizationError: null,

  probeHealth: async () => {
    set({ backendStatus: 'CHECKING' });
    try {
      const info = await apiClient.checkHealth();
      set({
        backendStatus: 'ONLINE',
        backendReason: null,
        healthInfo: info,
      });
      return 'ONLINE';
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Python analytics service unavailable — local simulation continues normally.';
      set({
        backendStatus: 'UNAVAILABLE',
        backendReason: message,
        healthInfo: null,
      });
      return 'UNAVAILABLE';
    }
  },

  evaluateRun: async (payload) => {
    set({ isEvaluating: true, evaluationError: null });
    try {
      const res = await apiClient.evaluateAnalytics(payload);
      set({
        backendStatus: 'ONLINE',
        backendReason: null,
        evaluation: res,
        isEvaluating: false,
      });
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        set({
          backendStatus: 'UNAVAILABLE',
          backendReason: err.message,
          evaluationError: err.message,
          isEvaluating: false,
        });
        return;
      }
      const message =
        err instanceof ApiDomainError
          ? formatDomainError(err)
          : err instanceof Error
            ? err.message
            : 'Analytics request failed.';
      set({
        backendStatus: 'ONLINE',
        evaluationError: message,
        isEvaluating: false,
      });
    }
  },

  compareScenarios: async (payload) => {
    set({ isComparing: true, comparisonError: null });
    try {
      const res = await apiClient.compareScenarios(payload);
      set({
        backendStatus: 'ONLINE',
        backendReason: null,
        comparison: res,
        isComparing: false,
      });
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        set({
          backendStatus: 'UNAVAILABLE',
          backendReason: err.message,
          comparisonError: err.message,
          isComparing: false,
        });
        return;
      }
      const message =
        err instanceof ApiDomainError
          ? formatDomainError(err)
          : err instanceof Error
            ? err.message
            : 'Scenario comparison failed.';
      set({
        backendStatus: 'ONLINE',
        comparisonError: message,
        isComparing: false,
      });
    }
  },

  runOptimization: async (payload) => {
    set({ isOptimizing: true, optimizationError: null });
    try {
      const res = await apiClient.runOptimization(payload);
      set({
        backendStatus: 'ONLINE',
        backendReason: null,
        optimization: res,
        isOptimizing: false,
      });
    } catch (err) {
      if (err instanceof BackendUnavailableError) {
        set({
          backendStatus: 'UNAVAILABLE',
          backendReason: err.message,
          optimizationError: err.message,
          isOptimizing: false,
        });
        return;
      }
      const message =
        err instanceof ApiDomainError
          ? formatDomainError(err)
          : err instanceof Error
            ? err.message
            : 'Optimization request failed.';
      set({
        backendStatus: 'ONLINE',
        optimizationError: message,
        isOptimizing: false,
      });
    }
  },

  clearErrors: () =>
    set({
      evaluationError: null,
      comparisonError: null,
      optimizationError: null,
    }),
}));
