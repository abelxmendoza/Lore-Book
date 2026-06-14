import { describe, it, expect } from 'vitest';
import { matchCertifiedEntities } from './certifiedEntityMatch';
import type { CertifiedEntity } from '../types/certifiedEntity';

const INDEX: CertifiedEntity[] = [
  { id: 'uuid-abel', name: 'Abel', type: 'character', aliases: [], mentionKeys: ['abel'] },
  { id: 'uuid-sol', name: 'Sol', type: 'character', aliases: [], mentionKeys: ['sol'] },
  { id: 'uuid-kforce', name: 'K-Force', type: 'organization', aliases: ['KForce'], mentionKeys: ['k-force', 'kforce'] },
];

describe('matchCertifiedEntities', () => {
  it('detects certified entities while typing', () => {
    const matches = matchCertifiedEntities('Tell me about Sol and K-Force', INDEX);
    expect(matches.map((m) => m.name).sort()).toEqual(['K-Force', 'Sol']);
    expect(matches.every((m) => m.id.startsWith('uuid-'))).toBe(true);
  });

  it('deduplicates by id', () => {
    const matches = matchCertifiedEntities('Sol said Sol is coming', INDEX);
    expect(matches).toHaveLength(1);
  });
});
