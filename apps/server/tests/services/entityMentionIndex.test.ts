import { describe, it, expect } from 'vitest';

import {
  matchMentionableEntitiesInText,
  sanitizeComposerEntities,
  type MentionableEntity,
} from '../../src/services/entities/entityMentionIndexService';
import {
  buildCertifiedEntityMatchIndex,
  matchCertifiedEntitiesInTextDetailed,
} from '../../src/services/entities/certifiedEntityIndexService';

const INDEX: MentionableEntity[] = [
  {
    id: 'uuid-abel',
    name: 'Abel',
    type: 'character',
    aliases: ['Abe'],
    mentionKeys: ['abel', 'abe'],
    status: 'confirmed',
  },
  {
    id: 'sug:character:kelly',
    name: 'Kelly',
    type: 'character',
    aliases: [],
    mentionKeys: ['kelly'],
    status: 'suggestion',
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

describe('certified entity match index', () => {
  it('precompiles patterns and matches full mentions', () => {
    const matchIndex = buildCertifiedEntityMatchIndex(INDEX);
    expect(matchIndex.entries).toHaveLength(3);
    const matches = matchCertifiedEntitiesInTextDetailed('Abel visited San Diego', INDEX);
    expect(matches.map((m) => m.name).sort()).toEqual(['Abel', 'San Diego']);
    expect(matches.every((m) => m.matchKind === 'full')).toBe(true);
  });

  it('prefix-matches the last token while typing', () => {
    const matches = matchCertifiedEntitiesInTextDetailed('talked to Kel', INDEX);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Kelly');
    expect(matches[0].matchKind).toBe('prefix');
  });
});

describe('matchMentionableEntitiesInText', () => {
  it('includes suggestions when mentioned', () => {
    const matches = matchMentionableEntitiesInText('Kelly called', INDEX);
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('suggestion');
  });
});

describe('sanitizeComposerEntities', () => {
  it('keeps entities that re-match in the draft text', () => {
    const kept = sanitizeComposerEntities(
      'Tell me about Abel and Kel',
      [
        { id: 'uuid-abel', name: 'Abel', type: 'character', status: 'confirmed' },
        { id: 'sug:character:kelly', name: 'Kelly', type: 'character', status: 'suggestion' },
      ],
      INDEX
    );
    expect(kept.map((e) => e.id).sort()).toEqual(['sug:character:kelly', 'uuid-abel']);
  });

  it('strips spoofed ids not in the user index', () => {
    const kept = sanitizeComposerEntities(
      'Abel',
      [{ id: 'fake-id', name: 'Abel', type: 'character', status: 'confirmed' }],
      INDEX
    );
    expect(kept).toHaveLength(0);
  });

  it('strips entities not supported by server-side re-match', () => {
    const kept = sanitizeComposerEntities(
      'hello world',
      [{ id: 'uuid-abel', name: 'Abel', type: 'character', status: 'confirmed' }],
      INDEX
    );
    expect(kept).toHaveLength(0);
  });

  it('deduplicates submitted slots', () => {
    const kept = sanitizeComposerEntities(
      'Abel',
      [
        { id: 'uuid-abel', name: 'Abel', type: 'character', status: 'confirmed' },
        { id: 'uuid-abel', name: 'Abel', type: 'character', status: 'confirmed' },
      ],
      INDEX
    );
    expect(kept).toHaveLength(1);
  });
});
