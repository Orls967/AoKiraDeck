import type {
  AnalyticsEvaluateRequest,
  AnalyticsEvaluateResponse,
  ApiErrorDetail,
  ApiErrorResponse,
  ApiHealthResponse,
  OptimizationRunRequest,
  OptimizationRunResponse,
  ScenariosCompareRequest,
  ScenariosCompareResponse,
} from '@/types/api';

const HEALTH_TIMEOUT_MS = 3000;
const ANALYTICS_TIMEOUT_MS = 10000;
const OPTIMIZATION_TIMEOUT_MS = 20000;

export class BackendUnavailableError extends Error {
  readonly code = 'BACKEND_UNAVAILABLE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

export class ApiDomainError extends Error {
  readonly status: number;
  readonly code: ApiErrorResponse['error']['code'];
  readonly details: ApiErrorDetail[];

  constructor(
    status: number,
    code: ApiErrorResponse['error']['code'],
    message: string,
    details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiDomainError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getApiBaseUrl(): string | null {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    throw new BackendUnavailableError(
      'Analytics backend URL is not configured — local Rust/WASM simulation continues uninterrupted.',
    );
  }

  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (err) {
    globalThis.clearTimeout(timerId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new BackendUnavailableError(
        `Python analytics backend timed out after ${timeoutMs / 1000}s — local Rust/WASM simulation continues uninterrupted.`,
      );
    }
    throw new BackendUnavailableError(
      'Python analytics service offline or unreachable — local Rust/WASM simulation continues uninterrupted.',
    );
  } finally {
    globalThis.clearTimeout(timerId);
  }

  if (response.status >= 500) {
    throw new BackendUnavailableError(
      `Python analytics service returned HTTP ${response.status} — local Rust/WASM simulation continues uninterrupted.`,
    );
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiDomainError(
        response.status,
        'INTERNAL_ERROR',
        `Invalid JSON payload from server (HTTP ${response.status})`,
      );
    }
  }

  if (!response.ok) {
    const errPayload = parsed as Partial<ApiErrorResponse> | null;
    if (errPayload?.error) {
      throw new ApiDomainError(
        response.status,
        errPayload.error.code,
        errPayload.error.message,
        errPayload.error.details ?? [],
      );
    }
    throw new ApiDomainError(
      response.status,
      'VALIDATION_ERROR',
      `Request rejected with HTTP ${response.status}`,
    );
  }

  return parsed as T;
}

export const apiClient = {
  checkHealth: () =>
    requestJson<ApiHealthResponse>('/api/v1/health', { method: 'GET' }, HEALTH_TIMEOUT_MS),

  evaluateAnalytics: (payload: AnalyticsEvaluateRequest) =>
    requestJson<AnalyticsEvaluateResponse>(
      '/api/v1/analytics/evaluate',
      { method: 'POST', body: JSON.stringify(payload) },
      ANALYTICS_TIMEOUT_MS,
    ),

  compareScenarios: (payload: ScenariosCompareRequest) =>
    requestJson<ScenariosCompareResponse>(
      '/api/v1/scenarios/compare',
      { method: 'POST', body: JSON.stringify(payload) },
      ANALYTICS_TIMEOUT_MS,
    ),

  runOptimization: (payload: OptimizationRunRequest) =>
    requestJson<OptimizationRunResponse>(
      '/api/v1/optimization/run',
      { method: 'POST', body: JSON.stringify(payload) },
      OPTIMIZATION_TIMEOUT_MS,
    ),
};
