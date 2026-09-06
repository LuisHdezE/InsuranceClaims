import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../api/types';
import { describeOperatorApiFailure } from './OperatorApiErrorNotice';

function failure(status: number, code: string): ApiFailure {
  return Object.assign(new Error(`failure ${status}`), {
    problem: {
      type: 'urn:test',
      title: 'Test',
      status,
      detail: `failure ${status}`,
      code,
    },
    requestId: 'req-test',
    network: false,
  });
}

describe('operator API error presentation', () => {
  it('treats stale claim state as an authoritative refresh conflict', () => {
    const result = describeOperatorApiFailure(failure(409, 'CLAIM_STATE_CONFLICT'));
    expect(result.title).toContain('cambió');
    expect(result.recovery).toContain('estado actual');
  });

  it('keeps authorization server-authoritative', () => {
    const result = describeOperatorApiFailure(failure(403, 'FORBIDDEN'));
    expect(result.title).toContain('no autorizado');
    expect(result.recovery).toContain('API');
  });

  it('does not fabricate cached truth when offline', () => {
    const offline = Object.assign(new Error('offline'), { network: true }) as ApiFailure;
    const result = describeOperatorApiFailure(offline);
    expect(result.detail).toContain('datos locales');
  });
});
