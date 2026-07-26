import { describe, expect, it } from 'vitest';

import { buildProfileSummary, rankFactsForSummary } from '../../../src/services/selfCharacterService';

describe('buildProfileSummary ranking', () => {
  it('prefers career/goals over appearance noise', () => {
    const facts = [
      {
        id: '1',
        user_id: 'u',
        entity_id: 'c',
        entity_type: 'character' as const,
        fact: 'Is pictured in the image wearing a black shirt',
        category: 'appearance' as const,
        confidence: 0.99,
        mention_count: 5,
        status: 'active' as const,
        previous_value: null,
        first_seen_at: '2024-01-01T00:00:00.000Z',
        last_confirmed_at: '2024-01-01T00:00:00.000Z',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        user_id: 'u',
        entity_id: 'c',
        entity_type: 'character' as const,
        fact: 'Works at Vanguard Robotics',
        category: 'career' as const,
        confidence: 0.9,
        mention_count: 2,
        status: 'active' as const,
        previous_value: null,
        first_seen_at: '2024-01-01T00:00:00.000Z',
        last_confirmed_at: '2024-01-01T00:00:00.000Z',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        metadata: { evidence_ids: ['m1', 'm2'] },
      },
      {
        id: '3',
        user_id: 'u',
        entity_id: 'c',
        entity_type: 'character' as const,
        fact: 'Building MemoVault',
        category: 'goals' as const,
        confidence: 0.88,
        mention_count: 2,
        status: 'active' as const,
        previous_value: null,
        first_seen_at: '2024-01-01T00:00:00.000Z',
        last_confirmed_at: '2024-01-01T00:00:00.000Z',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      },
    ];

    const ranked = rankFactsForSummary(facts as any);
    expect(ranked[0]?.category).toBe('career');
    expect(ranked.some((f) => /pictured in the image/i.test(f.fact))).toBe(false);

    const summary = buildProfileSummary([], facts as any);
    expect(summary).toContain('Works at Vanguard Robotics');
    expect(summary).toContain('Building MemoVault');
    expect(summary).not.toMatch(/pictured in the image/i);
  });
});
