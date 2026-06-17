import { describe, expect, it } from 'vitest';

import { matchCharacterName, parseCharacterName, kinshipRoleKey } from '../../src/utils/characterNameMatching';
import { characterDeduplicationService } from '../../src/services/characterDeduplicationService';

describe('characterNameMatching', () => {
  describe('title-aware matching (Phase 4)', () => {
    it('does NOT match different people who share kinship title', () => {
      const r = matchCharacterName('Tía Grace', 'Tía Lourdes');
      expect(r.matches).toBe(false);
      expect(r.reason).toBe('same_title_different_core');
    });

    it('matches accent variants of same titled person', () => {
      const r = matchCharacterName('Tío Juan', 'Tio Juan');
      expect(r.matches).toBe(true);
      expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('kinship role synonyms', () => {
    it('matches Mom and Mother', () => {
      expect(matchCharacterName('Mom', 'Mother').matches).toBe(true);
      expect(matchCharacterName('Abuela', 'Grandma').matches).toBe(true);
    });

    it('assigns same kinship role key', () => {
      expect(kinshipRoleKey('Mom')).toBe('mother');
      expect(kinshipRoleKey('Mother')).toBe('mother');
      expect(kinshipRoleKey('Abuela')).toBe('grandmother');
    });
  });

  describe('name containment', () => {
    it('matches Maria to Maria Del Rio', () => {
      const r = matchCharacterName('Maria', 'Maria Del Rio');
      expect(r.matches).toBe(true);
      expect(['containment', 'core_name']).toContain(r.method);
    });

    it('does NOT match Sol to Solomon (token equality guard)', () => {
      const r = matchCharacterName('Sol', 'Solomon');
      expect(r.matches).toBe(false);
    });
  });

  describe('parseCharacterName', () => {
    it('extracts core name after kinship title', () => {
      const p = parseCharacterName('Tío Juan');
      expect(p.coreName).toBe('juan');
    });

    it('handles step-parent with given name', () => {
      const p = parseCharacterName('Step Dad Ben');
      expect(p.coreName).toBe('ben');
      expect(p.kinshipRole).toBe('stepfather');
    });
  });
});

describe('characterDeduplicationService', () => {
  const roster = [
    { id: 'c1', name: 'Tío Juan', alias: ['Tio Juan'] },
    { id: 'c2', name: 'Mom', alias: ['Mother'] },
    { id: 'c3', name: 'Abuela', alias: ['Grandma'] },
    { id: 'c4', name: 'Maria Del Rio', alias: ['Maria'] },
    { id: 'c5', name: 'Sol', alias: [] },
    { id: 'c6', name: 'Tía Grace', alias: [] },
    { id: 'c7', name: 'Step Dad Ben', alias: ['Ben'] },
  ];

  it('resolves Tio Juan alias to canonical Tío Juan', () => {
    const hits = characterDeduplicationService.findCandidates('Tio Juan', roster);
    expect(hits[0]?.characterId).toBe('c1');
  });

  it('resolves Mother alias to Mom', () => {
    const hits = characterDeduplicationService.findCandidates('Mother', roster);
    expect(hits[0]?.characterId).toBe('c2');
  });

  it('resolves Maria fragment to full name', () => {
    const hits = characterDeduplicationService.findCandidates('Maria', roster);
    expect(hits[0]?.characterId).toBe('c4');
  });

  it('does not merge Sol with Solomon', () => {
    const extended = [...roster, { id: 'c8', name: 'Solomon', alias: [] }];
    const hits = characterDeduplicationService.findCandidates('Sol', extended);
    expect(hits.find(h => h.characterId === 'c8')).toBeUndefined();
  });

  it('does not merge Tía Grace with Tía Lourdes', () => {
    const extended = [...roster, { id: 'c9', name: 'Tía Lourdes', alias: [] }];
    const pair = characterDeduplicationService.scorePair(
      { id: 'c6', name: 'Tía Grace' },
      { id: 'c9', name: 'Tía Lourdes' }
    );
    expect(pair.confidence).toBeLessThan(0.85);
  });

  it('resolves Ben to Step Dad Ben', () => {
    const hits = characterDeduplicationService.findCandidates('Ben', roster);
    expect(hits[0]?.characterId).toBe('c7');
  });
});

describe('single canonical ID invariant', () => {
  it('all alias variants resolve to same character id in roster', () => {
    const roster = [{ id: 'canonical-juan', name: 'Tío Juan', alias: ['Tio Juan', 'Uncle Juan'] }];
    for (const variant of ['Tío Juan', 'Tio Juan', 'Uncle Juan']) {
      const hits = characterDeduplicationService.findCandidates(variant, roster);
      expect(hits[0]?.characterId).toBe('canonical-juan');
    }
  });
});
