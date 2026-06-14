import { describe, it, expect } from 'vitest';
import {
  matchCertifiedEntitiesInText,
  type CertifiedEntity,
} from '../../../src/services/entities/certifiedEntityIndexService';

const INDEX: CertifiedEntity[] = [
  { id: 'c1', name: 'Abel', type: 'character', aliases: [], mentionKeys: ['abel'] },
  { id: 'c2', name: 'Sol', type: 'character', aliases: ['Soleil'], mentionKeys: ['sol', 'soleil'] },
  { id: 'c3', name: 'Abuela', type: 'character', aliases: [], mentionKeys: ['abuela'] },
  { id: 'l1', name: 'Anaheim', type: 'location', aliases: [], mentionKeys: ['anaheim'] },
];

describe('matchCertifiedEntitiesInText', () => {
  it('matches certified characters by name with word boundaries', () => {
    const matches = matchCertifiedEntitiesInText('I talked to Sol and Abuela today', INDEX);
    expect(matches.map((m) => m.name).sort()).toEqual(['Abuela', 'Sol']);
  });

  it('matches aliases', () => {
    const matches = matchCertifiedEntitiesInText('Soleil called me back', INDEX);
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Sol');
  });

  it('does not match substrings inside other words', () => {
    const matches = matchCertifiedEntitiesInText('absolute solution', INDEX);
    expect(matches).toHaveLength(0);
  });

  it('returns stable ids for every match', () => {
    const matches = matchCertifiedEntitiesInText('Abel met Abuela in Anaheim', INDEX);
    expect(matches.every((m) => m.id && m.type)).toBe(true);
    expect(matches).toHaveLength(3);
  });
});
