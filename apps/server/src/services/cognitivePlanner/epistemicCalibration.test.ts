import { describe, expect, it } from 'vitest';

import { assessEpistemicState, formatEpistemicBlock } from './epistemicCalibration';

function source(type: string, relevanceScore: number) {
  return { type, relevanceScore };
}

describe('assessEpistemicState', () => {
  it('observed: a relevant crystallized claim supports a direct answer', () => {
    const a = assessEpistemicState({
      strategy: 'general',
      sources: [source('knowledge', 75), source('entry', 55)],
      claims: [{ confidence: 0.9 }],
      threadsAvailable: false,
    });
    expect(a.tier).toBe('observed');
    expect(a.confidence).toBeGreaterThanOrEqual(70);
    expect(a.directive).toMatch(/no hedging/i);
  });

  it('observed: structured thread state answers inspect strategies directly', () => {
    const a = assessEpistemicState({
      strategy: 'current_focus',
      sources: [],
      claims: [],
      threadsAvailable: true,
    });
    expect(a.tier).toBe('observed');
  });

  it('inferred: several medium sources justify derivation language only', () => {
    const a = assessEpistemicState({
      strategy: 'why',
      sources: [source('entry', 55), source('entry', 48), source('character', 40)],
      claims: [],
      threadsAvailable: false,
    });
    expect(a.tier).toBe('inferred');
    expect(a.confidence).toBeLessThan(70);
    expect(a.directive).toMatch(/evidence suggests/i);
  });

  it('hypothesis: a single thin source must be offered tentatively', () => {
    const a = assessEpistemicState({
      strategy: 'why',
      sources: [source('entry', 35)],
      claims: [],
      threadsAvailable: false,
    });
    expect(a.tier).toBe('hypothesis');
    expect(a.directive).toMatch(/it may be that/i);
  });

  it('unknown: no evidence means saying so, never speculating', () => {
    const a = assessEpistemicState({
      strategy: 'why',
      sources: [],
      claims: [],
      threadsAvailable: false,
    });
    expect(a.tier).toBe('unknown');
    expect(a.confidence).toBeLessThanOrEqual(20);
    expect(a.directive).toMatch(/do not speculate/i);
  });

  it('contested: conflicting evidence is never averaged', () => {
    const a = assessEpistemicState({
      strategy: 'emotional_reflection',
      sources: [source('entry', 70), source('entry', 65)],
      claims: [],
      threadsAvailable: false,
      contradictionCount: 4,
    });
    expect(a.tier).toBe('contested');
    expect(a.directive).toMatch(/both sides/i);
    expect(a.directive).toMatch(/trend/i);
  });
});

describe('formatEpistemicBlock', () => {
  it('exposes tier, confidence, and support counts', () => {
    const block = formatEpistemicBlock(
      assessEpistemicState({
        strategy: 'general',
        sources: [source('knowledge', 80)],
        claims: [{ confidence: 0.9 }],
        threadsAvailable: false,
      }),
    );
    expect(block).toContain('OBSERVED');
    expect(block).toContain('1 knowledge');
    expect(block).toMatch(/confidence: \d+/);
  });
});
