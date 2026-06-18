import { describe, it, expect } from 'vitest';

import { parseMessageTimestamp, resolveTemporalWindow } from '../../src/utils/temporalResolver';

/**
 * Integration tests for temporalResolver replacing legacy timeEngine call sites.
 */
describe('temporalResolver migration integration', () => {
  const now = new Date('2026-06-18T12:00:00Z');

  it('action-logging relative layer: yesterday resolves as relative with high confidence', () => {
    const parsed = parseMessageTimestamp('I called her yesterday afternoon', now, false);
    expect(parsed.type).toBe('relative');
    expect(parsed.confidence).toBeGreaterThan(0.85);
    expect(parsed.timestamp.getTime()).toBeLessThan(now.getTime());
  });

  it('action-logging explicit layer: absolute calendar date resolves', () => {
    const parsed = parseMessageTimestamp('Meeting on March 15, 2024', now, false);
    expect(parsed.type).toBe('absolute');
    expect(parsed.confidence).toBeGreaterThan(0.7);
    expect(parsed.timestamp.getFullYear()).toBe(2024);
  });

  it('chat continuity: chrono fallback for ISO-like fragments', () => {
    const window = resolveTemporalWindow('Follow up on June 10, 2025', now);
    expect(window).not.toBeNull();
    expect(window!.start.getFullYear()).toBe(2025);
  });

  it('returns low-confidence fuzzy result when no temporal cue exists', () => {
    const parsed = parseMessageTimestamp('I like sushi', now, false);
    expect(parsed.type).toBe('fuzzy');
    expect(parsed.confidence).toBeLessThan(0.5);
  });
});
