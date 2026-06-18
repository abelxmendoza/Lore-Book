import { describe, it, expect } from 'vitest';

import { sanitizeComposerEntities } from '../../src/services/entities/entityMentionIndexService';
import type { MentionableEntity } from '../../src/services/entities/entityMentionIndexService';

const INDEX: MentionableEntity[] = [
  {
    id: 'uuid-abel',
    name: 'Abel',
    type: 'character',
    aliases: [],
    mentionKeys: ['abel'],
    status: 'confirmed',
  },
  {
    id: 'uuid-sd',
    name: 'San Diego',
    type: 'location',
    aliases: [],
    mentionKeys: ['san diego'],
    status: 'confirmed',
  },
];

describe('composer entity chat integration', () => {
  it('validates a realistic composer submit payload end-to-end', () => {
    const message = 'I visited Abel in San Diego last weekend.';
    const submitted = [
      { id: 'uuid-abel', name: 'Abel', type: 'character' as const, status: 'confirmed' as const },
      { id: 'uuid-sd', name: 'San Diego', type: 'location' as const, status: 'confirmed' as const },
      { id: 'spoof', name: 'Abel', type: 'character' as const, status: 'confirmed' as const },
    ];

    const validated = sanitizeComposerEntities(message, submitted, INDEX);
    expect(validated.map((e) => e.id).sort()).toEqual(['uuid-abel', 'uuid-sd']);
  });

  it('drops prefix-only matches when the draft no longer contains the prefix token', () => {
    const validated = sanitizeComposerEntities(
      'hello there',
      [{ id: 'uuid-abel', name: 'Abel', type: 'character', status: 'confirmed' }],
      INDEX
    );
    expect(validated).toHaveLength(0);
  });
});
