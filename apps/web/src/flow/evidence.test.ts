import { describe, expect, it } from 'vitest';
import { MAX_EVIDENCE_BYTES, validateEvidence } from './evidence';

describe('validateEvidence', () => {
  it('accepts up to five JPEG, PNG or PDF files within 5 MiB', () => {
    const files = [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new File(['c'], 'c.pdf', { type: 'application/pdf' }),
    ];

    const result = validateEvidence(files);
    expect(result.errors).toEqual([]);
    expect(result.accepted).toHaveLength(3);
  });

  it('rejects unsupported formats and excessive file count', () => {
    const files = Array.from({ length: 6 }, (_, index) =>
      new File(['x'], `${index}.txt`, { type: 'text/plain' }),
    );

    const result = validateEvidence(files);
    expect(result.accepted).toEqual([]);
    expect(result.errors.some((message) => message.includes('máximo 5 archivos'))).toBe(true);
    expect(result.errors.some((message) => message.includes('formato no admitido'))).toBe(true);
  });

  it('rejects a file larger than the client feedback limit', () => {
    const large = new File([new Uint8Array(MAX_EVIDENCE_BYTES + 1)], 'large.pdf', {
      type: 'application/pdf',
    });

    const result = validateEvidence([large]);
    expect(result.accepted).toEqual([]);
    expect(result.errors[0]).toContain('supera el máximo');
  });
});
