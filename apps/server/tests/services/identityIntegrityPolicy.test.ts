import { describe, it, expect } from 'vitest';

import {
  evaluateCharacterIdentity,
  evaluateProjectIdentity,
  identityTierToRedirectDisposition,
} from '../../src/services/identityIntegrityPolicy';

describe('identityIntegrityPolicy', () => {
  it('auto-merges characters only on exact normalized match', () => {
    const { verdict, matched } = evaluateCharacterIdentity('Hell Fairy', [
      { id: '1', name: 'Hell Fairy', aliases: [] },
    ]);
    expect(verdict.tier).toBe('identity_equivalent');
    expect(matched?.id).toBe('1');
    expect(identityTierToRedirectDisposition(verdict.tier)).toBe('auto_merged');
  });

  it('does not auto-merge fuzzy character names', () => {
    const { verdict } = evaluateCharacterIdentity('Hell Fairy', [
      { id: '1', name: 'Helen Fairy', aliases: [] },
    ]);
    expect(verdict.tier).toBe('similar');
    expect(identityTierToRedirectDisposition(verdict.tier)).toBe('uncertain');
  });

  it('does not auto-merge same kinship title with different given names', () => {
    const { verdict } = evaluateCharacterIdentity('Tía Grace', [{ id: '1', name: 'Tía Lourdes', aliases: [] }]);
    expect(verdict.tier).not.toBe('identity_equivalent');
  });

  it('auto-merges projects only on canonical key match', () => {
    const { verdict } = evaluateProjectIdentity('LoreBook App', [
      { id: 'p1', name: 'lorebook app project', aliases: [] },
    ]);
    expect(verdict.tier).toBe('identity_equivalent');
  });

  it('does not auto-merge projects on partial token overlap', () => {
    const { verdict } = evaluateProjectIdentity('LoreBook Memory Feature', [
      { id: 'p1', name: 'LoreBook', aliases: [] },
    ]);
    expect(verdict.tier).toBe('distinct');
  });
});
