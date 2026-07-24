import { describe, expect, it } from 'vitest';

import { computeStorylineLifecycle, type StorylineLifecycleInput } from './storylineLifecycle';

const NOW = Date.parse('2026-07-23T12:00:00.000Z');

function storyline(id: string, opts: Partial<StorylineLifecycleInput> = {}): StorylineLifecycleInput {
  return {
    id,
    timeStart: opts.timeStart ?? '2026-07-01T12:00:00.000Z',
    timeEnd: opts.timeEnd ?? opts.timeStart ?? '2026-07-01T12:00:00.000Z',
    sceneCount: opts.sceneCount ?? 3,
    significanceScore: opts.significanceScore ?? 60,
    confidence: opts.confidence ?? 0.7,
    primaryOutcome: opts.primaryOutcome ?? null,
    domain: opts.domain ?? 'creative',
    primarySubject: opts.primarySubject ?? null,
  };
}

describe('computeStorylineLifecycle', () => {
  it('is active for a recent, ongoing storyline', () => {
    const result = computeStorylineLifecycle(
      storyline('s1', { timeEnd: '2026-07-18T12:00:00.000Z' }),
      [],
      NOW,
    );
    expect(result.status).toBe('active');
    expect(result.intensityScore).toBeGreaterThan(50);
  });

  it('is emerging for a brand-new single-scene storyline', () => {
    const result = computeStorylineLifecycle(
      storyline('s1', { timeStart: '2026-07-20T12:00:00.000Z', timeEnd: '2026-07-20T12:00:00.000Z', sceneCount: 1 }),
      [],
      NOW,
    );
    expect(result.status).toBe('emerging');
  });

  it('is completed when the outcome signals resolution', () => {
    const result = computeStorylineLifecycle(
      storyline('s1', { timeEnd: '2026-05-01T12:00:00.000Z', primaryOutcome: 'No contact' }),
      [],
      NOW,
    );
    expect(result.status).toBe('completed');
  });

  it('is dormant after the storyline-level gap but before abandonment', () => {
    const result = computeStorylineLifecycle(
      storyline('s1', { timeEnd: '2026-05-01T12:00:00.000Z' }),
      [],
      NOW,
    );
    expect(result.status).toBe('dormant');
    expect(result.momentum).toBe('decreasing');
  });

  it('is abandoned after a long enough silence', () => {
    const result = computeStorylineLifecycle(
      storyline('s1', { timeEnd: '2025-01-01T12:00:00.000Z' }),
      [],
      NOW,
    );
    expect(result.status).toBe('abandoned');
    expect(result.intensityScore).toBeLessThan(55);
  });

  it('flags resurfaced when the same domain+subject thread went dormant and later resumed', () => {
    const earlier = storyline('s1', {
      domain: 'romance',
      primarySubject: 'jamie',
      timeStart: '2025-01-01T12:00:00.000Z',
      timeEnd: '2025-01-05T12:00:00.000Z',
    });
    const later = storyline('s2', {
      domain: 'romance',
      primarySubject: 'jamie',
      timeStart: '2026-07-15T12:00:00.000Z',
      timeEnd: '2026-07-18T12:00:00.000Z',
    });

    const result = computeStorylineLifecycle(later, [earlier], NOW);
    expect(result.status).toBe('resurfaced');
  });

  it('does not flag resurfaced across different subjects in the same domain', () => {
    const earlier = storyline('s1', {
      domain: 'romance',
      primarySubject: 'jamie',
      timeStart: '2025-01-01T12:00:00.000Z',
      timeEnd: '2025-01-05T12:00:00.000Z',
    });
    const later = storyline('s2', {
      domain: 'romance',
      primarySubject: 'alex',
      timeStart: '2026-07-15T12:00:00.000Z',
      timeEnd: '2026-07-18T12:00:00.000Z',
    });

    const result = computeStorylineLifecycle(later, [earlier], NOW);
    expect(result.status).not.toBe('resurfaced');
  });

  it('scores recent, significant, open-ended storylines higher than old, thin, resolved ones', () => {
    const hot = computeStorylineLifecycle(
      storyline('hot', {
        timeEnd: '2026-07-22T12:00:00.000Z',
        significanceScore: 85,
        confidence: 0.9,
        sceneCount: 5,
        primaryOutcome: null,
      }),
      [],
      NOW,
    );
    const cold = computeStorylineLifecycle(
      storyline('cold', {
        timeEnd: '2025-06-01T12:00:00.000Z',
        significanceScore: 30,
        confidence: 0.4,
        sceneCount: 1,
        primaryOutcome: 'Separation',
      }),
      [],
      NOW,
    );
    expect(hot.intensityScore).toBeGreaterThan(cold.intensityScore);
  });
});
