import { describe, it, expect } from 'vitest';
import {
  applyTitleUpdate,
  applyNamedPersonMergeProposal,
  lockCharacterTitle,
  proposeMergeContextualWithNamedPerson,
} from '../../../src/services/identity/characterTitleStabilityService';
import {
  recordAliasUsage,
  suggestAliasTitlePromotion,
} from '../../../src/services/identity/aliasProminenceService';
import type { CharacterDisplayTitle } from '../../../src/services/identity/personDisplayTitleTypes';

function baseTitle(overrides: Partial<CharacterDisplayTitle> = {}): CharacterDisplayTitle {
  return {
    characterId: 'c1',
    primaryTitle: 'Mira Castellanos',
    titleParts: { givenName: 'Mira', familyName: 'Castellanos' },
    titleType: 'legal_or_full_name',
    aliases: [{ id: 'a1', value: 'Moth Queen', aliasType: 'stage_name', prominenceScore: 0, evidenceCount: 1 }],
    stability: 'stable',
    evidencePhrases: [],
    ...overrides,
  };
}

describe('aliasProminenceService', () => {
  it('suggests Moth Queen promotion after repeated use', () => {
    const current = baseTitle();
    let map = recordAliasUsage({}, 'Moth Queen', 'stage_name');
    for (let i = 0; i < 10; i++) {
      map = recordAliasUsage(map, 'Moth Queen', 'stage_name');
    }
    map = recordAliasUsage(map, 'Mira Castellanos', 'nickname');

    const suggestion = suggestAliasTitlePromotion(current, map);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.proposedPrimaryTitle).toBe('Moth Queen');
    expect(suggestion?.stability).toBe('suggested_update');
  });

  it('does not auto-promote without threshold', () => {
    const current = baseTitle();
    const map = recordAliasUsage({}, 'Moth Queen', 'stage_name');
    expect(suggestAliasTitlePromotion(current, map)).toBeNull();
  });
});

describe('characterTitleStabilityService', () => {
  it('locked title is not auto-renamed', () => {
    const current = baseTitle({ stability: 'locked' });
    const result = applyTitleUpdate({
      current,
      proposal: {
        proposedPrimaryTitle: 'Moth Queen',
        proposedTitleType: 'stage_name',
        proposedParts: { stageName: 'Moth Queen' },
        reason: 'inferred',
        stability: 'suggested_update',
        preservePreviousAsAlias: true,
      },
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('title_locked');
  });

  it('suggested update preserves old title as alias when applied with confirmation', () => {
    const current = baseTitle({ stability: 'temporary', primaryTitle: 'Potential Investor from Antler' });
    const result = applyTitleUpdate({
      current,
      proposal: {
        proposedPrimaryTitle: 'Jiho Kang',
        proposedTitleType: 'legal_or_full_name',
        proposedParts: { givenName: 'Jiho', familyName: 'Kang' },
        reason: 'named_person_discovered',
        stability: 'stable',
        preservePreviousAsAlias: true,
      },
      userConfirmed: true,
    });
    expect(result.applied).toBe(true);
    expect(result.displayTitle.primaryTitle).toBe('Jiho Kang');
    expect(result.displayTitle.aliases.some((a) => a.value.includes('Antler'))).toBe(true);
  });

  it('proposes merge contextual reference with named person', () => {
    const current = baseTitle({
      primaryTitle: 'Potential Investor from Antler',
      titleType: 'role_contextual',
      stability: 'temporary',
    });
    const proposal = proposeMergeContextualWithNamedPerson(current, 'Jiho Kang', {
      subtitle: 'Antler investor who saw my GitHub',
    });
    expect(proposal.suggestedPrimary).toBe('Jiho Kang');
    expect(proposal.suggestedAliases).toContain('Potential Investor from Antler');
  });

  it('merge requires user confirmation', () => {
    const current = baseTitle({
      primaryTitle: 'Potential Investor from Antler',
      titleType: 'role_contextual',
    });
    const proposal = proposeMergeContextualWithNamedPerson(current, 'Jiho Kang');
    const result = applyNamedPersonMergeProposal(current, proposal, false);
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('merge_requires_confirmation');
  });

  it('lockCharacterTitle sets stability locked', () => {
    const locked = lockCharacterTitle(baseTitle());
    expect(locked.stability).toBe('locked');
  });

  it('subtitle stored separately does not change primary on suggestion-only path', () => {
    const current = baseTitle();
    const result = applyTitleUpdate({
      current,
      proposal: {
        proposedPrimaryTitle: 'Moth Queen',
        proposedTitleType: 'stage_name',
        proposedParts: { stageName: 'Moth Queen' },
        reason: 'alias_prominence',
        stability: 'suggested_update',
        preservePreviousAsAlias: true,
      },
      userConfirmed: false,
    });
    expect(result.applied).toBe(false);
    expect(result.displayTitle.stability).toBe('suggested_update');
    expect(result.displayTitle.primaryTitle).toBe('Mira Castellanos');
  });
});
