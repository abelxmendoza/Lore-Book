import { describe, it, expect } from 'vitest';
import { pickEligibleIndex } from '../../../src/services/ingestion/ingestionQueue';

/**
 * The per-user serialization invariant: at most one ingestion job per user runs
 * at a time, so two of a user's messages can't both resolve a new entity against
 * a pre-insert snapshot and each mint a duplicate.
 */
describe('ingestion queue per-user serialization (pickEligibleIndex)', () => {
  it('picks the first job whose user is not in flight', () => {
    const q = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }];
    expect(pickEligibleIndex(q, new Set(['a']))).toBe(1); // skip busy 'a'
    expect(pickEligibleIndex(q, new Set(['a', 'b']))).toBe(2);
    expect(pickEligibleIndex(q, new Set())).toBe(0);
  });

  it('preserves FIFO for a given user (skips the same user, not just any)', () => {
    // user 'a' has two queued jobs; while 'a' is busy neither is eligible.
    const q = [{ userId: 'a' }, { userId: 'a' }, { userId: 'b' }];
    expect(pickEligibleIndex(q, new Set(['a']))).toBe(2); // only 'b' is eligible
  });

  it('returns -1 when every queued job belongs to a busy user', () => {
    const q = [{ userId: 'a' }, { userId: 'a' }];
    expect(pickEligibleIndex(q, new Set(['a']))).toBe(-1);
  });

  it('returns -1 for an empty queue', () => {
    expect(pickEligibleIndex([], new Set())).toBe(-1);
  });
});
