import { describe, it, expect } from 'vitest';
import { strengthIsStale, STRENGTH_RECOMPUTE_TTL_MS } from './identityStrengthService';

describe('strengthIsStale', () => {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  it('is stale when there is no current strength at all', () => {
    expect(strengthIsStale(null, now)).toBe(true);
    expect(strengthIsStale(undefined, now)).toBe(true);
  });

  it('is stale when the score has never been computed', () => {
    expect(strengthIsStale({ identity_strength_score: null }, now)).toBe(true);
    expect(strengthIsStale({ identity_strength_score: undefined }, now)).toBe(true);
  });

  it('is stale when a score exists but has no timestamp', () => {
    expect(strengthIsStale({ identity_strength_score: 70, identity_strength: {} }, now)).toBe(true);
    expect(strengthIsStale({ identity_strength_score: 70, identity_strength: null }, now)).toBe(true);
  });

  it('is stale when the timestamp is invalid', () => {
    expect(
      strengthIsStale({ identity_strength_score: 70, identity_strength: { computed_at: 'not-a-date' } }, now)
    ).toBe(true);
  });

  it('is NOT stale when a score was computed within the TTL', () => {
    const fresh = iso(now - (STRENGTH_RECOMPUTE_TTL_MS - 60_000));
    expect(strengthIsStale({ identity_strength_score: 70, identity_strength: { computed_at: fresh } }, now)).toBe(false);
  });

  it('is stale once the score is older than the TTL', () => {
    const old = iso(now - (STRENGTH_RECOMPUTE_TTL_MS + 60_000));
    expect(strengthIsStale({ identity_strength_score: 70, identity_strength: { computed_at: old } }, now)).toBe(true);
  });

  it('is stale exactly at the TTL boundary', () => {
    const boundary = iso(now - STRENGTH_RECOMPUTE_TTL_MS);
    expect(strengthIsStale({ identity_strength_score: 70, identity_strength: { computed_at: boundary } }, now)).toBe(true);
  });
});
