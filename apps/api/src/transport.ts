import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  Injectable,
  type ExceptionFilter,
  type NestMiddleware,
} from '@nestjs/common';
import { ZodError } from 'zod';

export class ApiProblemError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiProblemError';
  }
}

const APP_STATUS: Readonly<Record<string, number>> = {
  AUTHENTICATION_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  CLAIM_NOT_FOUND: 404,
  EVIDENCE_NOT_FOUND: 404,
  INVALID_STATE_TRANSITION: 409,
  CLAIM_STATE_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  VALIDATION_ERROR: 422,
  POLICY_VEHICLE_NOT_ELIGIBLE: 422,
  EVIDENCE_VALIDATION_FAILED: 422,
  SERVICE_DEPENDENCY_UNAVAILABLE: 503,
  AUTHENTICATION_TEMPORARILY_UNAVAILABLE: 503,
  CLAIM_SUBMISSION_TEMPORARILY_UNAVAILABLE: 503,
  CLAIM_TRANSITION_TEMPORARILY_UNAVAILABLE: 503,
};

const TITLES: Record<number, string> = {
  400: 'Malformed request', 401: 'Authentication failed', 403: 'Forbidden', 404: 'Not found',
  409: 'Conflict', 413: 'Payload too large', 415: 'Unsupported content type', 422: 'Validation failed',
  429: 'Rate limited', 500: 'Internal server error', 503: 'Service temporarily unavailable',
};

function isKnownApplicationError(exception: unknown): exception is Error & { code: string; details?: Record<string, unknown> } {
  if (!exception || typeof exception !== 'object') return false;
  const candidate = exception as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'string'
    && Object.hasOwn(APP_STATUS, candidate.code)
    && typeof candidate.message === 'string';
}

function safeUnknownError(exception: unknown): { name: string; message: string } {
  if (exception instanceof Error) {
    return { name: exception.name.slice(0, 120), message: exception.message.slice(0, 500) };
  }
  return { name: 'UnknownError', message: 'Non-Error exception reached the HTTP boundary.' };
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void): void {
    const supplied = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : '';
    const requestId = /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let detail = 'An unexpected error occurred.';
    let errors: Record<string, string[]> | undefined;
    let retryAfter: number | undefined;
    let classified = false;

    if (isKnownApplicationError(exception)) {
      status = APP_STATUS[exception.code]!;
      code = exception.code;
      detail = exception.message;
      classified = true;
    } else if (exception instanceof ApiProblemError) {
      status = exception.status;
      code = exception.code;
      detail = exception.message;
      retryAfter = exception.retryAfterSeconds;
      classified = true;
    } else if (exception instanceof ZodError) {
      status = 422;
      code = 'VALIDATION_ERROR';
      detail = 'One or more fields are invalid.';
      errors = {};
      for (const issue of exception.issues) {
        const key = issue.path.join('.') || 'request';
        (errors[key] ??= []).push(issue.message);
      }
      classified = true;
    } else if ((exception as any)?.name === 'MulterError') {
      const multer = exception as any;
      status = multer.code === 'LIMIT_FILE_SIZE' ? 413 : 422;
      code = multer.code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'EVIDENCE_VALIDATION_FAILED';
      detail = multer.code === 'LIMIT_FILE_SIZE' ? 'Evidence payload exceeds the transport limit.' : 'Evidence upload does not satisfy the contract.';
      classified = true;
    }

    if (!classified) {
      const diagnostic = safeUnknownError(exception);
      console.error(JSON.stringify({
        level: 'error',
        event: 'UNHANDLED_API_ERROR',
        requestId: req.requestId ?? null,
        errorName: diagnostic.name,
        errorMessage: diagnostic.message,
      }));
    }

    if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
    res.status(status).type('application/problem+json').send({
      type: `urn:insuranceclaims:problem:${code.toLowerCase().replaceAll('_', '-')}`,
      title: TITLES[status] ?? 'Request failed',
      status,
      detail,
      instance: req.url ?? '',
      code,
      requestId: req.requestId ?? randomUUID(),
      ...(errors ? { errors } : {}),
    });
  }
}

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, number[]>();
  consume(key: string, limit: number, windowSeconds: number): void {
    const now = Date.now();
    const cutoff = now - windowSeconds * 1000;
    const active = (this.buckets.get(key) ?? []).filter((value) => value > cutoff);
    if (active.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((active[0]! + windowSeconds * 1000 - now) / 1000));
      throw new ApiProblemError(429, 'RATE_LIMITED', 'Too many requests. Retry later.', retryAfter);
    }
    active.push(now);
    this.buckets.set(key, active);
  }
}

export function callerIp(req: any): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
