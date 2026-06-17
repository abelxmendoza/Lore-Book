import { describe, expect, it } from 'vitest';

import { detectMentionedEntities, isEntityQuery } from './entityScopedRetriever';

const characters = [
  { id: 'c1', name: 'Tía Maria', alias: ['Maria', 'Tia'] },
  { id: 'c2', name: 'Alex Rivera', alias: [] },
];

const locations = [
  { id: 'l1', name: 'San Diego' },
  { id: 'l2', name: 'LA' }, // too short — should be skipped
];

describe('detectMentionedEntities', () => {
  it('detects a character by exact name in chat text', () => {
    const hits = detectMentionedEntities(
      'I had lunch with Tía Maria yesterday.',
      characters,
      locations
    );
    expect(hits).toEqual([
      { id: 'c1', type: 'character', name: 'Tía Maria', matchScore: 1.0 },
    ]);
  });

  it('detects a character by alias with lower match score', () => {
    const hits = detectMentionedEntities('Maria called me back.', characters, locations);
    expect(hits).toEqual([
      { id: 'c1', type: 'character', name: 'Tía Maria', matchScore: 0.8 },
    ]);
  });

  it('detects multiple entity types mentioned in one message', () => {
    const hits = detectMentionedEntities(
      'Alex Rivera and I drove to San Diego for the weekend.',
      characters,
      locations
    );
    expect(hits.map((h) => h.name).sort()).toEqual(['Alex Rivera', 'San Diego']);
    expect(hits.find((h) => h.id === 'c2')?.matchScore).toBe(1.0);
    expect(hits.find((h) => h.id === 'l1')?.matchScore).toBe(1.0);
  });

  it('is case-insensitive', () => {
    const hits = detectMentionedEntities('san diego was sunny', characters, locations);
    expect(hits).toEqual([
      { id: 'l1', type: 'location', name: 'San Diego', matchScore: 1.0 },
    ]);
  });

  it('ignores names shorter than three characters', () => {
    const hits = detectMentionedEntities('We went to LA.', characters, locations);
    expect(hits).toEqual([]);
  });

  it('dedupes by entity id', () => {
    const hits = detectMentionedEntities(
      'Tía Maria said Maria would join.',
      characters,
      locations
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('c1');
  });
});

describe('isEntityQuery', () => {
  it('recognizes tell-me-about style entity questions', () => {
    expect(isEntityQuery('Tell me about Tía Maria')).toBe(true);
    expect(isEntityQuery('What do you know about San Diego?')).toBe(true);
  });

  it('does not flag casual mentions as entity queries', () => {
    expect(isEntityQuery('I saw Tía Maria at the park.')).toBe(false);
  });
});
