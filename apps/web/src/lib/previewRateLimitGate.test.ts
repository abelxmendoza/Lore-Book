import { describe, expect, it } from 'vitest';

import { PreviewRateLimitGate } from './previewRateLimitGate';

describe('PreviewRateLimitGate', () => {
  it('stays open for non-429 errors', () => {
    const gate = new PreviewRateLimitGate();
    expect(gate.noteError(new Error('boom'))).toBe(false);
    expect(gate.noteError({ status: 500 })).toBe(false);
    expect(gate.isCoolingDown()).toBe(false);
  });

  it('arms cooldown from retryAfter on 429', () => {
    const gate = new PreviewRateLimitGate();
    const now = 1_000_000;
    expect(gate.noteError({ status: 429, retryAfter: 120 }, now)).toBe(true);
    expect(gate.isCoolingDown(now + 119_000)).toBe(true);
    expect(gate.isCoolingDown(now + 121_000)).toBe(false);
  });

  it('uses default cooldown when retryAfter missing and caps at 15 minutes', () => {
    const gate = new PreviewRateLimitGate();
    const now = 0;
    gate.noteError({ status: 429 }, now);
    expect(gate.isCoolingDown(59_000)).toBe(true);
    expect(gate.isCoolingDown(61_000)).toBe(false);

    gate.noteError({ status: 429, retryAfter: 99_999 }, now);
    expect(gate.isCoolingDown(15 * 60 * 1000 - 1000)).toBe(true);
    expect(gate.isCoolingDown(15 * 60 * 1000 + 1000)).toBe(false);
  });

  it('reset clears the cooldown', () => {
    const gate = new PreviewRateLimitGate();
    gate.noteError({ status: 429, retryAfter: 300 }, 0);
    gate.reset();
    expect(gate.isCoolingDown(1)).toBe(false);
  });
});
