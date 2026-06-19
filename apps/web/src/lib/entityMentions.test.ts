import { describe, it, expect } from 'vitest';
import { splitTextWithEntityMentions } from './entityMentions';

describe('splitTextWithEntityMentions', () => {
  it('splits text around known entity names', () => {
    const segments = splitTextWithEntityMentions('Abel went to Anaheim.', [
      { id: 'c1', name: 'Abel', type: 'character', status: 'confirmed' },
      { id: 'l1', name: 'Anaheim', type: 'location', status: 'confirmed' },
    ]);

    expect(segments.filter((s) => s.kind === 'entity').map((s) => s.value)).toEqual(['Abel', 'Anaheim']);
  });
});
