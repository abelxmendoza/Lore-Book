import { describe, it, expect } from 'vitest';
import { matchCertifiedEntities, mergeThreadEntities, sortCertifiedMatches, toComposerThreadEntity, buildEntityMatchIndex, matchCertifiedEntitiesWithIndex } from './certifiedEntityMatch';
import type { CertifiedEntity } from '../types/certifiedEntity';

const INDEX: CertifiedEntity[] = [
  { id: 'uuid-abel', name: 'Abel', type: 'character', aliases: ['Abe'], mentionKeys: ['abel'], status: 'confirmed' },
  { id: 'uuid-sol', name: 'Sam Chen', type: 'character', aliases: [], mentionKeys: ['sam'], status: 'confirmed' },
  { id: 'uuid-sd', name: 'San Diego', type: 'location', aliases: [], mentionKeys: ['san diego'], status: 'confirmed' },
  { id: 'uuid-kforce', name: 'TechStaff', type: 'organization', aliases: ['KForce'], mentionKeys: ['k-force', 'kforce'], status: 'confirmed' },
  { id: 'uuid-cello', name: 'Cello', type: 'skill', aliases: [], mentionKeys: ['cello'], status: 'confirmed' },
  { id: 'uuid-launch', name: 'Product Launch', type: 'event', aliases: [], mentionKeys: ['product launch'], status: 'confirmed' },
  { id: 'sug:character:kelly', name: 'Kelly', type: 'character', aliases: [], mentionKeys: ['kelly'], status: 'suggestion' },
];

describe('matchCertifiedEntities', () => {
  it('detects confirmed entities while typing', () => {
    const matches = matchCertifiedEntities('Tell me about Sam Chen and TechStaff', INDEX);
    expect(matches.map((m) => m.name).sort()).toEqual(['Sam Chen', 'TechStaff']);
    expect(matches.every((m) => m.id.startsWith('uuid-'))).toBe(true);
  });

  it('deduplicates by id', () => {
    const matches = matchCertifiedEntities('Sam Chen said Sam Chen is coming', INDEX);
    expect(matches).toHaveLength(1);
  });

  it('matches pending suggestions by full name', () => {
    const matches = matchCertifiedEntities('I talked to Kelly today', INDEX);
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('suggestion');
    expect(matches[0].id).toBe('sug:character:kelly');
  });

  it('prefix-matches while typing partial names', () => {
    const matches = matchCertifiedEntities('talked to Kel', INDEX);
    expect(matches.some((m) => m.name === 'Kelly' && m.matchKind === 'prefix')).toBe(true);
  });

  it('matches aliases and mention keys', () => {
    expect(matchCertifiedEntities('Abe called me', INDEX).some((m) => m.name === 'Abel')).toBe(true);
    expect(matchCertifiedEntities('KForce hired me', INDEX).some((m) => m.name === 'TechStaff')).toBe(true);
    expect(matchCertifiedEntities('typing k-for', INDEX).some((m) => m.name === 'TechStaff')).toBe(true);
  });

  it('detects locations, skills, and events', () => {
    const text = 'In San Diego I practiced Cello before the Product Launch';
    const names = matchCertifiedEntities(text, INDEX).map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(['San Diego', 'Cello', 'Product Launch']));
  });

  it('ignores single-character tokens and substring false positives', () => {
    expect(matchCertifiedEntities('a', INDEX)).toHaveLength(0);
    expect(matchCertifiedEntities('technical staff meeting', INDEX).some((m) => m.name === 'TechStaff')).toBe(false);
  });

  it('does not prefix-match short names from common English ("in" → Ink)', () => {
    const withInk: CertifiedEntity[] = [
      ...INDEX,
      {
        id: 'uuid-ink',
        name: 'Ink',
        type: 'character',
        aliases: [],
        mentionKeys: ['ink'],
        status: 'confirmed',
      },
    ];
    // Mid-typing common words must not surface Ink.
    expect(matchCertifiedEntities('I am in', withInk).some((m) => m.name === 'Ink')).toBe(false);
    expect(matchCertifiedEntities('In', withInk).some((m) => m.name === 'Ink')).toBe(false);
    expect(matchCertifiedEntities('talked to In', withInk).some((m) => m.name === 'Ink')).toBe(false);
    // Full word mention still works.
    expect(matchCertifiedEntities('Ink called me', withInk).some((m) => m.name === 'Ink' && m.matchKind === 'full')).toBe(
      true,
    );
    expect(matchCertifiedEntities('What about Ink?', withInk).some((m) => m.name === 'Ink')).toBe(true);
  });

  it('sorts confirmed full mentions before prefix and suggestions', () => {
    const matches = matchCertifiedEntities('Kel and Kelly', INDEX);
    expect(matches[0].name).toBe('Kelly');
    expect(sortCertifiedMatches(
      { id: '1', name: 'A', type: 'character', aliases: [], mentionKeys: [], status: 'suggestion', matchedLabel: 'A' },
      { id: '2', name: 'B', type: 'character', aliases: [], mentionKeys: [], status: 'confirmed', matchedLabel: 'B', matchKind: 'full' }
    )).toBeGreaterThan(0);
  });
});

describe('toComposerThreadEntity', () => {
  it('maps book entities and skips events', () => {
    expect(toComposerThreadEntity(INDEX[0])).toEqual({ id: 'uuid-abel', name: 'Abel', type: 'character' });
    expect(toComposerThreadEntity(INDEX[5])).toBeNull();
  });
});

describe('mergeThreadEntities', () => {
  it('merges thread and composer entities without duplicates', () => {
    const merged = mergeThreadEntities(
      [{ id: 'uuid-abel', name: 'Abel', type: 'character' }],
      [{ id: 'uuid-sd', name: 'San Diego', type: 'location' }, { id: 'uuid-abel', name: 'Abel', type: 'character' }]
    );
    expect(merged).toHaveLength(2);
  });
});

describe('EntityMatchIndex performance', () => {
  it('matches a large index within a reasonable budget', () => {
    const largeIndex: CertifiedEntity[] = Array.from({ length: 500 }, (_, i) => ({
      id: `uuid-${i}`,
      name: `Character ${i}`,
      type: 'character' as const,
      aliases: [`Alias ${i}`],
      mentionKeys: [`character ${i}`, `alias ${i}`],
      status: 'confirmed' as const,
    }));
    largeIndex.push({
      id: 'uuid-target',
      name: 'Target Person',
      type: 'character',
      aliases: [],
      mentionKeys: ['target person'],
      status: 'confirmed',
    });

    const matchIndex = buildEntityMatchIndex(largeIndex);
    const text = 'I met Target Person and Character 42 yesterday';

    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      matchCertifiedEntitiesWithIndex(text, matchIndex);
    }
    const elapsed = performance.now() - start;

    const matches = matchCertifiedEntitiesWithIndex(text, matchIndex);
    expect(matches.map((m) => m.name)).toEqual(expect.arrayContaining(['Target Person', 'Character 42']));
    expect(elapsed).toBeLessThan(500);
  });
});
