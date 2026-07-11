import { describe, it, expect } from 'vitest';

import { isBareTitleInvalid } from '../../../src/services/characters/audit/ambiguousCharacterGuard';
import { evaluateBrokenPossessive } from '../../../src/services/characters/audit/brokenPossessiveNameGuard';
import { evaluateWrongDomain, isJunkTestData } from '../../../src/services/characters/audit/wrongDomainCharacterGuard';
import { suggestContextualTitle } from '../../../src/services/characters/audit/contextualReferenceRepairService';
import { compareAmbiguousIdentities } from '../../../src/services/characters/audit/characterIdentityIntegrityService';
import { findMergeCandidatesForCharacter } from '../../../src/services/characters/audit/characterMergeCandidateService';
import {
  auditSingleCharacter,
  characterCardAuditService,
} from '../../../src/services/characters/audit/characterCardAuditService';
import type { CharacterCardAuditInput } from '../../../src/services/characters/audit/characterCardAuditTypes';

function row(
  id: string,
  name: string,
  extra: Partial<CharacterCardAuditInput> = {},
): CharacterCardAuditInput {
  return {
    id,
    name,
    alias: [],
    metadata: {},
    ...extra,
  };
}

function auditOne(name: string, roster: CharacterCardAuditInput[], provenance = '') {
  const input = roster.find((r) => r.name === name) ?? row('x', name);
  if (provenance) {
    input.metadata = { ...input.metadata, storyContext: provenance };
  }
  const map = new Map<string, string>();
  for (const r of roster) {
    map.set(r.id, (r.metadata?.storyContext as string) ?? provenance);
  }
  return auditSingleCharacter(input, roster, map);
}

describe('characterCardAudit guards', () => {
  it('rejects Mr as bare title', () => {
    expect(isBareTitleInvalid('Mr')).toBe(true);
  });

  it('rejects foo as junk', () => {
    expect(isJunkTestData('foo')).toBe(true);
  });

  it('merges Tío Ralph’s into Tio Ralph', () => {
    const roster = [{ id: '1', name: 'Tio Ralph' }];
    const result = evaluateBrokenPossessive("Tío Ralph's", roster);
    expect(result.isBroken).toBe(true);
    expect(result.baseName).toBe('Tio Ralph');
    expect(result.aliasToAdd).toBe("Tío Ralph's");
  });

  it('keeps Tía Grace as valid family title', () => {
    const roster = [row('1', 'Tía Grace')];
    const result = auditOne('Tía Grace', roster);
    expect(result.status).toBe('valid_identity');
    expect(result.recommendedAction).toBe('keep');
  });

  it('keeps Goth Tio as nickname identity', () => {
    const roster = [row('1', 'Goth Tio')];
    const result = auditOne('Goth Tio', roster);
    expect(result.status).toBe('valid_identity');
  });

  it('moves Computer Science majors to group', () => {
    const domain = evaluateWrongDomain('Computer Science majors');
    expect(domain.wrongDomain).toBe(true);
    expect(domain.target).toBe('group');
  });

  it('moves Cyberpunk to interest unless person provenance exists', () => {
    expect(evaluateWrongDomain('Cyberpunk').target).toBe('interest');
    expect(
      evaluateWrongDomain('Cyberpunk', 'Cyberpunk is his nickname on stage').wrongDomain,
    ).toBe(false);
  });

  it('renames potential investor when Antler evidence exists', () => {
    const hint = suggestContextualTitle(
      'potential investor',
      'Met a potential investor from Antler at the pitch event',
    );
    expect(hint?.suggestedTitle).toBe('Potential Investor from Antler');
  });

  it('renames new guy with Noah context', () => {
    const hint = suggestContextualTitle('new guy', 'Noah introduced the new guy at the show');
    expect(hint?.suggestedTitle).toBe('New Guy with Noah');
  });

  it('renames new guy with Ska Prom context', () => {
    const hint = suggestContextualTitle('new guy', 'Saw the new guy at Ska Prom');
    expect(hint?.suggestedTitle).toBe('New Guy from Ska Prom');
  });

  it('does not merge New Guy from Ska Prom with New Guy from East Side Lounge automatically', () => {
    const left = row('1', 'New Guy from Ska Prom', {
      metadata: { storyContext: 'Ska Prom underground show' },
    });
    const right = row('2', 'New Guy from East Side Lounge', {
      metadata: { storyContext: 'East Side Lounge night' },
    });
    const verdict = compareAmbiguousIdentities(
      left,
      right,
      left.metadata.storyContext as string,
      right.metadata.storyContext as string,
    );
    expect(verdict.keepSeparate).toBe(true);
    expect(verdict.samePerson).toBe(false);
  });

  it('flags Ashley/Moth Queen as possible duplicate only with provenance overlap', () => {
    const roster = [
      row('1', 'Ashley', { metadata: { storyContext: 'Ska Prom with Neon Newts' } }),
      row('2', 'Moth Queen', { metadata: { storyContext: 'Ska Prom with Neon Newts' } }),
    ];
    const map = new Map([
      ['1', 'Ska Prom with Neon Newts'],
      ['2', 'Ska Prom with Neon Newts'],
    ]);
    const candidates = findMergeCandidatesForCharacter(roster[0], roster, map);
    expect(candidates.some((c) => c.characterId === '2')).toBe(true);

    const noOverlap = findMergeCandidatesForCharacter(
      row('3', 'Ashley'),
      [row('3', 'Ashley'), row('4', 'Moth Queen', { metadata: {} })],
      new Map([
        ['3', ''],
        ['4', 'Different city entirely'],
      ]),
    );
    expect(noOverlap.some((c) => c.characterId === '4')).toBe(false);
  });

  it('preserves provenance summary on audit results', () => {
    const roster = [
      row('1', 'James', { metadata: { storyContext: 'College friend from CSUF era' } }),
    ];
    const report = characterCardAuditService.auditRoster(roster);
    expect(report[0].provenanceSummary).toContain('CSUF');
  });

  it('classifies Cousin as needs_context', () => {
    const roster = [row('1', 'Cousin')];
    const result = auditOne('Cousin', roster);
    expect(result.status).toBe('needs_context');
  });

  it('classifies last chat as wrong_domain system', () => {
    const domain = evaluateWrongDomain('last chat');
    expect(domain.target).toBe('system');
  });

  it('keeps Mom as valid family reference', () => {
    const result = auditOne('Mom', [row('1', 'Mom')]);
    expect(result.status).toBe('valid_identity');
  });

  it('classifies old college roommate as needs_context without school', () => {
    const result = auditOne('old college roommate', [row('1', 'old college roommate')]);
    expect(result.status).toBe('needs_context');
  });
});
