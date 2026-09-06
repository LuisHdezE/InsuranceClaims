import axios, { AxiosError } from 'axios';
import type { ApiFailure, ProblemDetails } from './types';

export function createApiClient(baseURL = '') {
  const client = axios.create({
    baseURL,
    timeout: 15_000,
    headers: { Accept: 'application/json, application/problem+json' },
  });

  client.interceptors.request.use((config) => {
    config.headers.set('X-Request-Id', crypto.randomUUID());
    return config;
  });

  return client;
}

export function toApiFailure(error: unknown): ApiFailure {
  if (!(error instanceof AxiosError)) {
    return Object.assign(new Error('No fue posible completar la solicitud.'), {
      requestId: null,
    }) as ApiFailure;
  }

  const data = error.response?.data;
  const problem = isProblemDetails(data) ? data : undefined;
  const requestId =
    problem?.requestId ??
    headerValue(error.response?.headers?.['x-request-id']) ??
    null;
  const retryAfter = headerValue(error.response?.headers?.['retry-after']) ?? null;
  const message = problem?.detail || problem?.title || 'No fue posible completar la solicitud.';

  return Object.assign(new Error(message), {
    problem,
    requestId,
    retryAfter,
  }) as ApiFailure;
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProblemDetails>;
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.detail === 'string'
  );
}

function headerValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}
