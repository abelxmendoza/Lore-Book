import { describe, it, expect } from 'vitest';

import {
  aggregateCastActivity,
  classifyCastTrends,
  type CastMemberActivity,
} from './castTrendsService';

const NOW = new Date('2026-07-11T00:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const member = (
  entityId: string,
  overrides: Partial<CastMemberActivity> = {},
): CastMemberActivity => ({
  entityId,
  name: entityId,
  kind: 'character',
  threadCount: 3,
  totalMentions: 6,
  firstSeen: daysAgo(120),
  lastSeen: daysAgo(2),
  ...overrides,
});

describe('castTrendsService — pure helpers', () => {
  describe('classifyCastTrends', () => {
    it('classifies new faces, rising, and dormant deterministically', () => {
      const trends = classifyCastTrends(
        [
          member('new-face', { firstSeen: daysAgo(3), lastSeen: daysAgo(1) }),
          member('rising', { firstSeen: daysAgo(90), lastSeen: daysAgo(5), threadCount: 4 }),
          member('dormant', { firstSeen: daysAgo(200), lastSeen: daysAgo(60), totalMentions: 10 }),
          member('quiet-but-minor', { firstSeen: daysAgo(200), lastSeen: daysAgo(60), totalMentions: 2 }),
          member('steady-recent-single-thread', { lastSeen: daysAgo(3), threadCount: 1 }),
        ],
        NOW,
      );

      expect(trends.newFaces.map((m) => m.entityId)).toEqual(['new-face']);
      expect(trends.rising.map((m) => m.entityId)).toEqual(['rising']);
      expect(trends.dormant.map((m) => m.entityId)).toEqual(['dormant']);
    });

    it('sorts dormant by weight of history then silence length', () => {
      const trends = classifyCastTrends(
        [
          member('a', { lastSeen: daysAgo(40), totalMentions: 5, firstSeen: daysAgo(300) }),
          member('b', { lastSeen: daysAgo(90), totalMentions: 12, firstSeen: daysAgo(300) }),
          member('c', { lastSeen: daysAgo(120), totalMentions: 12, firstSeen: daysAgo(300) }),
        ],
        NOW,
      );
      expect(trends.dormant.map((m) => m.entityId)).toEqual(['c', 'b', 'a']);
    });

    it('skips unparsable dates', () => {
      const trends = classifyCastTrends([member('bad', { firstSeen: 'not-a-date', lastSeen: 'nope' })], NOW);
      expect(trends).toEqual({ newFaces: [], rising: [], dormant: [] });
    });
  });

  describe('aggregateCastActivity', () => {
    it('folds link rows per entity across sessions', () => {
      const activity = aggregateCastActivity([
        {
          entity_id: 'e1',
          entity_type: 'character',
          session_id: 's1',
          mention_count: 3,
          first_linked_at: daysAgo(30),
          last_linked_at: daysAgo(20),
          metadata: { entity_name: 'Nova' },
        },
        {
          entity_id: 'e1',
          entity_type: 'character',
          session_id: 's2',
          mention_count: 2,
          first_linked_at: daysAgo(10),
          last_linked_at: daysAgo(5),
          metadata: null,
        },
      ]);
      const nova = activity.get('e1')!;
      expect(nova.threadCount).toBe(2);
      expect(nova.totalMentions).toBe(5);
      expect(nova.firstSeen).toBe(daysAgo(30));
      expect(nova.lastSeen).toBe(daysAgo(5));
      expect(nova.name).toBe('Nova');
    });

    it('drops rows without timestamps', () => {
      const activity = aggregateCastActivity([
        {
          entity_id: 'e1',
          entity_type: 'character',
          session_id: 's1',
          mention_count: 1,
          first_linked_at: null,
          last_linked_at: null,
          metadata: null,
        },
      ]);
      expect(activity.size).toBe(0);
    });
  });
});
