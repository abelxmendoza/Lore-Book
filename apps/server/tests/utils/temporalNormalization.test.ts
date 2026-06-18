import { describe, expect, it } from 'vitest';

import {
  detectTemporalConflicts,
  normalizeTimestamp,
  parseStoredTimestamp,
} from '../../src/utils/temporalNormalization';

describe('temporalNormalization', () => {
  it('parseStoredTimestamp parses ISO date strings', () => {
    const ref = parseStoredTimestamp('2024-03-15T10:30:00.000Z');
    expect(ref.timestamp.getUTCFullYear()).toBe(2024);
    expect(ref.precision).toBe('second');
    expect(ref.confidence).toBe(0.95);
  });

  it('normalizeTimestamp floors to day precision', () => {
    const input = new Date('2024-06-18T15:45:30.000Z');
    const normalized = normalizeTimestamp(input, 'day');
    expect(normalized.getHours()).toBe(0);
    expect(normalized.getMinutes()).toBe(0);
  });

  it('detectTemporalConflicts finds near-duplicate timestamps', () => {
    const a = new Date('2024-01-01T10:00:00.000Z');
    const b = new Date('2024-01-01T10:30:00.000Z');
    const conflicts = detectTemporalConflicts([a, b], 60);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflict).toBe(true);
  });
});
