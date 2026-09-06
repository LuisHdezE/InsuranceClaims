import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/types';
import { describeApiFailure } from './ApiErrorNotice';

function failure(message: string, overrides: Partial<ApiFailure> = {}): ApiFailure {
  return Object.assign(new Error(message), overrides) as ApiFailure;
}

describe('describeApiFailure', () => {
  it('presents an explicit offline/network recovery state without inventing local success', () => {
    const presentation = describeApiFailure(failure('network', { network: true }));

    expect(presentation.tone).toBe('warning');
    expect(presentation.title).toContain('conectar');
    expect(presentation.recovery).toContain('No asumimos');
  });

  it('presents rate limiting with Retry-After guidance', () => {
    const presentation = describeApiFailure(failure('rate limited', {
      retryAfter: '17',
      problem: {
        type: 'about:blank',
        title: 'Rate limited',
        status: 429,
        detail: 'Demasiados intentos.',
      },
    }));

    expect(presentation.tone).toBe('warning');
    expect(presentation.title).toContain('demasiados intentos');
    expect(presentation.recovery).toContain('17');
  });

  it('preserves a conflict as a recoverable explicit submission state', () => {
    const presentation = describeApiFailure(failure('conflict', {
      problem: {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'Conflicto de idempotencia.',
      },
    }));

    expect(presentation.tone).toBe('warning');
    expect(presentation.title).toContain('revisión');
    expect(presentation.recovery).toContain('No generaremos');
  });
});
