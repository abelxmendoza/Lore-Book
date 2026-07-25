import { describe, expect, it } from 'vitest';
import {
  reconcileProvisionalTimelineItems,
  threadMessagesToTimelineItems,
} from '../../src/services/timeline/threadTimelineEvidence';
import type { StitchedTimelineItem } from '../../src/services/chronologyV2/stitchedTimelineService';

describe('current-thread timeline evidence', () => {
  it('creates sequence-only provisional items from subject-bearing autobiographical facts', () => {
    const items = threadMessagesToTimelineItems({
      query: 'Show my Midnight Harbor timeline',
      subjectTerms: ['Midnight Harbor'],
      rows: [
        {
          id: 'message-a',
          created_at: '2026-07-20T10:00:00.000Z',
          content: 'My stage name is Midnight Harbor. I recorded two songs with a new microphone.',
        },
        {
          id: 'message-b',
          created_at: '2026-07-20T10:01:00.000Z',
          content: 'I bought lunch near Vanguard Robotics.',
        },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.timePrecision === 'sequence_only')).toBe(true);
    expect(items.every((item) => item.tags?.includes('provisional'))).toBe(true);
    expect(items.some((item) => item.body.includes('lunch'))).toBe(false);
  });

  it('prefers canonical representation and retains thread provenance', () => {
    const canonical: StitchedTimelineItem = {
      id: 'event-1',
      kind: 'event',
      sourceId: 'canonical-1',
      sourceIds: ['canonical-1'],
      sortTime: '2026-07-21T00:00:00.000Z',
      userSortIndex: null,
      title: 'Recorded two songs with a new microphone',
      body: 'Recorded two songs with a new microphone.',
      sourceKind: 'resolved_event',
      sourceType: 'resolved_event',
      timePrecision: 'date',
      timeConfidence: 0.9,
    };
    const provisional = threadMessagesToTimelineItems({
      query: 'timeline',
      subjectTerms: ['Midnight Harbor'],
      rows: [{
        id: 'message-a',
        created_at: '2026-07-20T10:00:00.000Z',
        content: 'As Midnight Harbor, I recorded two songs with a new microphone.',
      }],
    });
    const merged = reconcileProvisionalTimelineItems([canonical], provisional);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('event-1');
    expect(merged[0].sourceIds).toContain('message-a');
  });
});
