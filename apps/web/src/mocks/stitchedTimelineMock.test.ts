import { describe, expect, it } from 'vitest';

import { buildMockStitchedTimeline } from './stitchedTimelineMock';

describe('buildMockStitchedTimeline', () => {
  it('returns themed demo items for a scoped label', () => {
    const result = buildMockStitchedTimeline({ scopeLabel: '2024 career' });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.scope_label).toBe('2024 career');
    expect(result.items.some((item) => /career|job|promotion|internship|bet on yourself/i.test(item.body))).toBe(true);
  });
});
