import { describe, expect, it } from 'vitest';
import { dedupePromptEvidence, workingMemoryItemsToUniqueBlocks } from '../../src/services/chat/promptEvidenceDedupe';
import type { WorkingMemoryItem } from '../../src/services/chat/workingMemoryAssembler';

function item(partial: Partial<WorkingMemoryItem> & { id: string; content: string }): WorkingMemoryItem {
  return {
    type: 'event',
    title: partial.title ?? partial.id,
    source: 'resolved_events',
    confidence: 0.9,
    score: 0.8,
    reasons: [],
    ...partial,
  };
}

describe('prompt evidence dedupe', () => {
  it('keeps one copy of the same canonical event across timeline and memory', () => {
    const event = item({
      id: 'event:join-northwind',
      title: 'Joined Northwind',
      content: 'Started at Northwind in 2019.',
      metadata: { sourceId: 're-1' },
    });
    const timelineCopy = item({
      id: 'timeline:join-northwind',
      type: 'timeline',
      title: 'Joined Northwind',
      content: 'Started at Northwind in 2019.',
      metadata: { sourceId: 're-1' },
    });
    const unique = workingMemoryItemsToUniqueBlocks([[event], [timelineCopy]]);
    expect(unique).toHaveLength(1);
    expect(unique[0].id).toBe('event:join-northwind');
  });

  it('keeps distinct perspectives with different source ids', () => {
    const unique = dedupePromptEvidence([
      item({ id: 'event:a', content: 'Maya and I argued.', metadata: { sourceId: 're-a' } }),
      item({ id: 'event:b', content: 'Maya later apologized.', metadata: { sourceId: 're-b' } }),
    ]);
    expect(unique).toHaveLength(2);
  });
});
