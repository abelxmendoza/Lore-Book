import { describe, it, expect } from 'vitest';
import { matchCertifiedEntities } from './certifiedEntityMatch';
import type { CertifiedEntity } from '../types/certifiedEntity';

const INDEX: CertifiedEntity[] = [
  { id: 'uuid-abel', name: 'Abel', type: 'character', aliases: [], mentionKeys: ['abel'], status: 'confirmed' },
  { id: 'uuid-sol', name: 'Sam Chen', type: 'character', aliases: [], mentionKeys: ['sol'], status: 'confirmed' },
  { id: 'uuid-kforce', name: 'TechStaff', type: 'organization', aliases: ['KForce'], mentionKeys: ['k-force', 'kforce'], status: 'confirmed' },
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
});
