import { describe, expect, it } from 'vitest';

import { hashInputVersion, isProjectionStale } from '../../src/services/projectionVersion';

describe('projectionVersion', () => {
  it('hashInputVersion is stable for the same parts', () => {
    const a = hashInputVersion(['entry-1:2024-01-01', 'mut:2024-02-01']);
    const b = hashInputVersion(['entry-1:2024-01-01', 'mut:2024-02-01']);
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });

  it('isProjectionStale returns false when version is missing', () => {
    expect(isProjectionStale(undefined, 'abc')).toBe(false);
  });

  it('isProjectionStale detects version drift', () => {
    expect(isProjectionStale('old-version', 'new-version')).toBe(true);
    expect(isProjectionStale('same', 'same')).toBe(false);
  });
});
