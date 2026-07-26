import { describe, expect, it } from 'vitest';
import { buildClientSourcesWithRejected } from './clientSourcesBuilder';

describe('buildClientSourcesWithRejected', () => {
  it('labels rejected evidence with usage: rejected and a rejection reason', () => {
    const sources = [{ type: 'character' as const, id: 'ravi', title: 'Ravi' }];
    const rejected = [
      {
        type: 'entry',
        id: 'ska-world',
        title: 'Ska World episode',
        relevanceScore: 0,
        relevanceReasons: ['current_story_entity_mismatch'],
      },
    ];

    const result = buildClientSourcesWithRejected(sources, rejected);

    expect(result).toHaveLength(2);
    const rejectedSource = result.find((s) => s.id === 'ska-world');
    expect(rejectedSource).toMatchObject({
      usage: 'rejected',
      rejectionReason: 'current_story_entity_mismatch',
    });
  });

  it('never labels a rejected item as background', () => {
    const rejected = [
      { id: 'x', title: 'X', relevanceScore: 0, relevanceReasons: ['current_story_entity_mismatch'] },
    ];
    const result = buildClientSourcesWithRejected([], rejected);
    expect(result.every((s) => s.usage !== 'background')).toBe(true);
  });

  it('preserves accepted sources unchanged and respects the limit', () => {
    const sources = Array.from({ length: 15 }, (_, i) => ({
      type: 'entry' as const,
      id: `s${i}`,
      title: `Source ${i}`,
    }));
    const result = buildClientSourcesWithRejected(sources, []);
    expect(result).toHaveLength(10);
    expect(result[0]).toEqual(sources[0]);
  });
});
