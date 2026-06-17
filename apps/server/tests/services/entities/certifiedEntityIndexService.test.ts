import { describe, it, expect } from 'vitest';
import {
  matchCertifiedEntitiesInText,
  type CertifiedEntity,
} from '../../../src/services/entities/certifiedEntityIndexService';

const INDEX: CertifiedEntity[] = [
  { id: 'c1', name: 'Abel', type: 'character', aliases: [], mentionKeys: ['abel'] },
  { id: 'c2', name: 'Sam Chen', type: 'character', aliases: ['Sam Chen'], mentionKeys: ['sol', 'samchen'] },
  { id: 'c3', name: 'Grandma Rose', type: 'character', aliases: [], mentionKeys: ['abuela'] },
  { id: 'l1', name: 'Anaheim', type: 'location', aliases: [], mentionKeys: ['anaheim'] },
];

describe('matchCertifiedEntitiesInText', () => {
  it('matches certified characters by name with word boundaries', () => {
    const matches = matchCertifiedEntitiesInText('I talked to Sam Chen and Grandma Rose today', INDEX);
    expect(matches.map((m) => m.name).sort()).toEqual(['Grandma Rose', 'Sam Chen']);
  });

  it('matches aliases', () => {
    const matches = matchCertifiedEntitiesInText('Sam Chen called me back', INDEX);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Sam Chen');
  });

  it('does not match substrings inside other words', () => {
    const matches = matchCertifiedEntitiesInText('absolute solution', INDEX);
    expect(matches).toHaveLength(0);
  });

  it('returns stable ids for every match', () => {
    const matches = matchCertifiedEntitiesInText('Abel met Grandma Rose in Anaheim', INDEX);
    expect(matches.every((m) => m.id && m.type)).toBe(true);
    expect(matches).toHaveLength(3);
  });
});
