import { describe, expect, it } from 'vitest';

import {
  evaluateCanonicalRelationshipEvidence,
  resolveCanonicalIdentity,
  type CanonicalIdentityRecord,
} from '../../../src/services/canonicalIdentity';

const existing = (...records: CanonicalIdentityRecord[]) => records;

describe('canonicalIdentity', () => {
  it('merges Tio Ralph variants into one canonical person identity', () => {
    const identities = existing({
      id: 'p-tio-ralph',
      domain: 'person',
      canonicalIdentity: 'tio ralph',
      displayName: 'Tio Ralph',
      aliases: ['Tío Ralph', 'my tio Ralph', 'uncle Ralph', 'Ralph'],
    });

    for (const rawText of ['Tio Ralph', 'Tío Ralph', 'my tio Ralph', "Tio Ralph's"]) {
      const result = resolveCanonicalIdentity({
        rawText,
        domain: 'person',
        existingIdentities: identities,
      });

      expect(result.status, rawText).toBe('duplicate');
      expect(result.displayName).toBe('Tio Ralph');
      expect(result.duplicateOf?.id).toBe('p-tio-ralph');
    }
  });

  it('rejects bare Tio as an unstable identity', () => {
    const result = resolveCanonicalIdentity({ rawText: 'Tio', domain: 'person' });

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toBe('bare_family_title_without_identity');
  });

  it('rejects person-pair group names', () => {
    for (const rawText of ['Leslie & Tio Family', 'Mom & Ben Group', 'Daisy and Juan Group']) {
      const result = resolveCanonicalIdentity({ rawText, domain: 'group' });

      expect(result.status, rawText).toBe('rejected');
      expect(result.rejectionReason).toBe('person_pair_is_not_group_identity');
    }
  });

  it('creates owner-anchored household names', () => {
    const result = resolveCanonicalIdentity({
      rawText: "at Tio Ralph's house",
      domain: 'group',
      contextText: "Leslie's graduation party was at Tio Ralph's house",
    });

    expect(result.status).toBe('accepted');
    expect(result.displayName).toBe('Tio Ralph Household');
    expect(result.metadata.anchor_display_name).toBe('Tio Ralph');
  });

  it('creates contextual unnamed person identities', () => {
    expect(resolveCanonicalIdentity({
      rawText: 'potential investor',
      domain: 'person',
      contextText: 'a potential investor from Antler saw my GitHub repo',
    })).toMatchObject({
      status: 'accepted',
      displayName: 'Potential Investor From Antler',
      requiresReview: true,
    });

    expect(resolveCanonicalIdentity({
      rawText: 'new guy',
      domain: 'person',
      contextText: 'the new guy with Noah was there',
    })).toMatchObject({
      status: 'accepted',
      displayName: 'New Guy With Noah',
      requiresReview: true,
    });
  });

  it("merges Abuela's House variants", () => {
    const identities = existing({
      id: 'place-abuela-house',
      domain: 'place',
      canonicalIdentity: "abuela's house",
      displayName: "Abuela's House",
      aliases: ['Here at Abuela\'s House', 'Abuelas House'],
    });

    for (const rawText of ["Here at Abuela's House", 'Abuelas House']) {
      const result = resolveCanonicalIdentity({
        rawText,
        domain: 'place',
        existingIdentities: identities,
      });

      expect(result.status, rawText).toBe('duplicate');
      expect(result.displayName).toBe("Abuela's House");
    }
  });

  it('removes place sentence bleed', () => {
    const result = resolveCanonicalIdentity({
      rawText: 'Bad Dogg Compound. It',
      domain: 'place',
    });

    expect(result.status).toBe('accepted');
    expect(result.displayName).toBe('Bad Dogg Compound');
    expect(result.displayName).not.toContain('It');
  });

  it('preserves professional titles', () => {
    expect(resolveCanonicalIdentity({ rawText: 'Dr. Garcia', domain: 'person' })).toMatchObject({
      status: 'accepted',
      displayName: 'Dr. Garcia',
    });
    expect(resolveCanonicalIdentity({ rawText: 'Professor Kim', domain: 'person' })).toMatchObject({
      status: 'accepted',
      displayName: 'Professor Kim',
    });
  });

  it("canonicalizes Mom's House from noisy ownership spans", () => {
    const result = resolveCanonicalIdentity({
      rawText: 'My Moms House with my Abuela',
      domain: 'place',
    });

    expect(result.status).toBe('accepted');
    expect(result.displayName).toBe("Mom's House");
    expect(result.metadata.owner_display_name).toBe('Mom');
  });

  it('suppresses duplicates before new card creation', () => {
    const result = resolveCanonicalIdentity({
      rawText: 'Bad Dogg Compound. It',
      domain: 'place',
      existingIdentities: existing({
        id: 'place-bad-dogg',
        domain: 'place',
        canonicalIdentity: 'bad dogg compound',
        displayName: 'Bad Dogg Compound',
      }),
    });

    expect(result.status).toBe('duplicate');
    expect(result.duplicateOf?.id).toBe('place-bad-dogg');
  });

  it('rejects relationship proximity without evidence', () => {
    expect(evaluateCanonicalRelationshipEvidence("I'm not dating Goth Tio WTF")).toMatchObject({
      allowed: false,
      reason: 'relationship_negated',
    });
    expect(evaluateCanonicalRelationshipEvidence('Goth Tio and I were both at the show')).toMatchObject({
      allowed: false,
      reason: 'proximity_is_not_relationship_evidence',
    });
  });
});
