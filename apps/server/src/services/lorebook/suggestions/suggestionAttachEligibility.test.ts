import { describe, expect, it } from 'vitest';

import {
  evaluateAttachEligibility,
  isAttachPlan,
  mergeAliasList,
  mergeEvidenceRefs,
} from './suggestionAttachEligibility';
import type { AttachCanonRecord } from './suggestionAttachTypes';

function org(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return {
    aliases: [],
    domain: 'organizations',
    userId: 'user-a',
    mentionCount: 1,
    evidence: [],
    ...partial,
  };
}

function person(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return {
    aliases: [],
    domain: 'characters',
    userId: 'user-a',
    mentionCount: 1,
    evidence: [],
    ...partial,
  };
}

function skill(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return {
    aliases: [],
    domain: 'skills',
    userId: 'user-a',
    mentionCount: 1,
    evidence: [],
    ...partial,
  };
}

function place(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return {
    aliases: [],
    domain: 'locations',
    userId: 'user-a',
    mentionCount: 1,
    evidence: [],
    ...partial,
  };
}

describe('suggestion attach-or-alias', () => {
  it('1. exact canonical name attaches and does not spawn', () => {
    const result = evaluateAttachEligibility({
      name: 'Vanguard Robotics',
      domain: 'organizations',
      evidence: 'I work at Vanguard Robotics',
      userId: 'user-a',
      sourceMessageId: 'msg-1',
      canon: { organizations: [org({ id: 'org-1', name: 'Vanguard Robotics', canonicalType: 'employer' })] },
    });
    expect(result.decision).toBe('ATTACH_EXACT');
    expect(result.suggestionSuppressed).toBe(true);
    expect(isAttachPlan(result)).toBe(true);
    if (isAttachPlan(result)) {
      expect(result.aliasAdded).toBe(false);
      expect(result.evidenceAttached).toBe(true);
      expect(result.target.id).toBe('org-1');
    }
  });

  it('2. existing alias attaches without adding a duplicate alias', () => {
    const result = evaluateAttachEligibility({
      name: 'USC',
      domain: 'organizations',
      evidence: 'Priya graduated from USC',
      userId: 'user-a',
      canon: {
        organizations: [
          org({
            id: 'org-usc',
            name: 'University of Southern California',
            aliases: ['USC'],
            canonicalType: 'university',
          }),
        ],
      },
    });
    expect(result.decision).toBe('ATTACH_EXACT');
    expect(result.matchBasis).toBe('existing_alias');
    if (isAttachPlan(result)) expect(result.aliasAdded).toBe(false);
  });

  it('3. acronym/full-name org attaches as a safe alias', () => {
    const result = evaluateAttachEligibility({
      name: 'USC',
      domain: 'organizations',
      evidence: 'Priya graduated from USC',
      incomingType: 'company',
      userId: 'user-a',
      canon: {
        organizations: [
          org({
            id: 'org-usc',
            name: 'University of Southern California',
            canonicalType: 'university',
          }),
        ],
      },
    });
    expect(result.decision).toBe('ATTACH_ALIAS');
    expect(result.matchBasis).toBe('acronym_match');
    expect(result.typeConflict).toBe(true);
    expect(result.canonicalTypePreserved).toBe(true);
    expect(result.incomingTypeNormalized).toBe('university');
    if (isAttachPlan(result)) {
      expect(result.aliasAdded).toBe(true);
      expect(result.nextAliases).toContain('USC');
    }
  });

  it('4+19. repeated acronym rescan is idempotent', () => {
    const canon = org({
      id: 'org-usc',
      name: 'University of Southern California',
      aliases: ['USC'],
      canonicalType: 'university',
      evidence: [{ quote: 'Priya graduated from USC', sourceMessageId: 'msg-1' }],
      mentionCount: 2,
    });
    const result = evaluateAttachEligibility({
      name: 'USC',
      domain: 'organizations',
      evidence: 'Priya graduated from USC',
      sourceMessageId: 'msg-1',
      userId: 'user-a',
      canon: { organizations: [canon] },
    });
    expect(result.decision).toBe('ATTACH_EXACT');
    if (isAttachPlan(result)) {
      expect(result.evidenceAttached).toBe(false);
      expect(result.aliasAdded).toBe(false);
      expect(result.nextEvidence).toHaveLength(1);
      expect(result.nextAliases).toEqual(['USC']);
      expect(result.nextMentionCount).toBe(2);
    }
  });

  it('5. type conflict keeps canonical type', () => {
    const result = evaluateAttachEligibility({
      name: 'University of Southern California',
      domain: 'organizations',
      incomingType: 'company',
      userId: 'user-a',
      canon: {
        organizations: [org({ id: 'org-usc', name: 'University of Southern California', canonicalType: 'university' })],
      },
    });
    expect(result.decision).toBe('ATTACH_EXACT');
    expect(result.typeConflict).toBe(true);
    expect(result.canonicalTypePreserved).toBe(true);
    expect(result.incomingTypeNormalized).toBe('university');
  });

  it('6. strong type conflict + weak identity stays review', () => {
    const result = evaluateAttachEligibility({
      name: 'Vanguard',
      domain: 'organizations',
      incomingType: 'software',
      userId: 'user-a',
      canon: {
        organizations: [org({ id: 'org-1', name: 'Vanguard Robotics', canonicalType: 'employer' })],
      },
    });
    expect(result.decision).toBe('REVIEW_DUPLICATE');
    expect(result.typeConflict).toBe(true);
    expect(result.suggestionSuppressed).toBe(false);
  });

  it('7. first-name-only Character is not auto-attached', () => {
    const result = evaluateAttachEligibility({
      name: 'Maya',
      domain: 'characters',
      evidence: 'Maya waved from across the room',
      userId: 'user-a',
      canon: { characters: [person({ id: 'c-1', name: 'Maya Chen' })] },
    });
    expect(result.decision).toBe('REVIEW_DUPLICATE');
    expect(result.matchBasis).toBe('first_name_only');
    expect(isAttachPlan(result)).toBe(false);
  });

  it('7c. given name may alias when evidence names the full identity', () => {
    const result = evaluateAttachEligibility({
      name: 'Maya',
      domain: 'characters',
      evidence: 'Maya Chen said she goes by Maya at work',
      userId: 'user-a',
      canon: { characters: [person({ id: 'c-1', name: 'Maya Chen' })] },
    });
    expect(result.decision).toBe('ATTACH_ALIAS');
    if (isAttachPlan(result)) expect(result.nextAliases).toContain('Maya');
  });

  it('8. full person name exact attaches', () => {
    const result = evaluateAttachEligibility({
      name: 'Maya Chen',
      domain: 'characters',
      evidence: 'Maya Chen joined the study group',
      userId: 'user-a',
      sourceMessageId: 'msg-maya',
      canon: { characters: [person({ id: 'c-1', name: 'Maya Chen' })] },
    });
    expect(result.decision).toBe('ATTACH_EXACT');
    expect(result.suggestionSuppressed).toBe(true);
  });

  it('7b. Maya Lopez is not Maya Chen', () => {
    const result = evaluateAttachEligibility({
      name: 'Maya Lopez',
      domain: 'characters',
      evidence: 'Maya Lopez sat down',
      userId: 'user-a',
      canon: { characters: [person({ id: 'c-1', name: 'Maya Chen' })] },
    });
    expect(result.decision === 'REVIEW_DUPLICATE' || result.decision === 'CREATE_NEW').toBe(true);
    expect(isAttachPlan(result)).toBe(false);
  });

  it('9. relational her friend does not attach', () => {
    const result = evaluateAttachEligibility({
      name: 'her friend',
      domain: 'characters',
      evidence: 'I went out with her friend',
      userId: 'user-a',
      canon: { characters: [person({ id: 'c-1', name: 'Maya Chen' })] },
    });
    expect(result.decision).toBe('REJECT');
    expect(result.matchBasis).toBe('relational_reference');
  });

  it('10. parent org vs department is not the same entity', () => {
    const result = evaluateAttachEligibility({
      name: 'Amazon Failure Analysis Lab',
      domain: 'organizations',
      evidence: 'I joined the Amazon Failure Analysis Lab',
      userId: 'user-a',
      canon: { organizations: [org({ id: 'org-amz', name: 'Amazon', canonicalType: 'employer' })] },
    });
    expect(result.decision).toBe('REVIEW_DUPLICATE');
    expect(result.matchBasis).toBe('hierarchy_not_duplicate');
  });

  it('10b. Ring is not an alias of Amazon', () => {
    const result = evaluateAttachEligibility({
      name: 'Ring',
      domain: 'organizations',
      userId: 'user-a',
      canon: { organizations: [org({ id: 'org-amz', name: 'Amazon', canonicalType: 'employer' })] },
    });
    expect(result.decision).toBe('CREATE_NEW');
  });

  it('11. skill synonym/normalization attaches', () => {
    const result = evaluateAttachEligibility({
      name: 'debugging',
      domain: 'skills',
      evidence: 'I have been practicing debugging at Vanguard Robotics',
      userId: 'user-a',
      canon: { skills: [skill({ id: 'sk-1', name: 'Software Debugging' })] },
    });
    expect(result.decision === 'ATTACH_EXACT' || result.decision === 'ATTACH_ALIAS').toBe(true);
    expect(result.canonical?.id).toBe('sk-1');
  });

  it('12. related but distinct skills stay separate', () => {
    const django = evaluateAttachEligibility({
      name: 'Django',
      domain: 'skills',
      evidence: 'I used Django last week',
      userId: 'user-a',
      canon: { skills: [skill({ id: 'sk-1', name: 'Python' })] },
    });
    expect(django.decision).toBe('CREATE_NEW');

    const debug = evaluateAttachEligibility({
      name: 'Software Debugging',
      domain: 'skills',
      evidence: 'I have been practicing software debugging',
      userId: 'user-a',
      canon: { skills: [skill({ id: 'sk-1', name: 'Python' })] },
    });
    expect(debug.decision).toBe('CREATE_NEW');
  });

  it('13. place acronym attaches', () => {
    const result = evaluateAttachEligibility({
      name: 'LAX',
      domain: 'locations',
      evidence: 'I flew into LAX',
      userId: 'user-a',
      canon: {
        locations: [place({ id: 'loc-1', name: 'Los Angeles International Airport' })],
      },
    });
    expect(result.decision).toBe('ATTACH_ALIAS');
    expect(result.matchBasis).toBe('place_acronym');
  });

  it('14. wrong-book routed candidate enriches the institution', () => {
    const result = evaluateAttachEligibility({
      name: 'USC',
      domain: 'locations',
      evidence: 'Priya graduated from USC',
      userId: 'user-a',
      canon: {
        locations: [],
        organizations: [
          org({ id: 'org-usc', name: 'University of Southern California', canonicalType: 'university' }),
        ],
      },
    });
    expect(result.decision).toBe('ATTACH_ALIAS');
    expect(result.matchBasis).toBe('routed_canonical');
    expect(result.canonical?.domain).toBe('organizations');
    expect(result.suggestionSuppressed).toBe(true);
    expect(result.contextualRole).toBe('third_party');
  });

  it('15. exact attachment suppresses a suggestion UI row', () => {
    const result = evaluateAttachEligibility({
      name: 'Oscar Martinez',
      domain: 'characters',
      evidence: 'Oscar Martinez texted me',
      userId: 'user-a',
      canon: { characters: [person({ id: 'c-1', name: 'Oscar Martinez' })] },
    });
    expect(result.suggestionSuppressed).toBe(true);
    expect(result.decision).toBe('ATTACH_EXACT');
  });

  it('16. ambiguous similarity remains reviewable', () => {
    const result = evaluateAttachEligibility({
      name: 'Maya',
      domain: 'characters',
      evidence: 'Maya said hello',
      userId: 'user-a',
      canon: {
        characters: [person({ id: 'c-1', name: 'Maya Chen' }), person({ id: 'c-2', name: 'Maya Lopez' })],
      },
    });
    expect(result.decision).toBe('REVIEW_DUPLICATE');
    expect(result.suggestionSuppressed).toBe(false);
  });

  it('17+18. evidence refs and alias lists dedupe', () => {
    const evidence = mergeEvidenceRefs(
      [{ quote: 'I work at Vanguard Robotics', sourceMessageId: 'm1' }],
      { quote: 'I work at Vanguard Robotics', sourceMessageId: 'm1' },
    );
    expect(evidence.attached).toBe(false);
    expect(evidence.refs).toHaveLength(1);

    const aliases = mergeAliasList('University of Southern California', ['USC'], 'usc');
    expect(aliases.added).toBe(false);
    expect(aliases.aliases).toEqual(['USC']);
  });

  it('20. tenant isolation ignores another user canon', () => {
    const result = evaluateAttachEligibility({
      name: 'University of Southern California',
      domain: 'organizations',
      userId: 'user-b',
      canon: {
        organizations: [
          org({ id: 'org-a', name: 'University of Southern California', userId: 'user-a', canonicalType: 'university' }),
        ],
      },
    });
    expect(result.decision).toBe('CREATE_NEW');
  });

  it('does not attach Failure Analysis Team as an Amazon alias', () => {
    const result = evaluateAttachEligibility({
      name: 'Failure Analysis Team',
      domain: 'organizations',
      userId: 'user-a',
      canon: { organizations: [org({ id: 'org-amz', name: 'Amazon', canonicalType: 'employer' })] },
    });
    expect(isAttachPlan(result)).toBe(false);
  });

  it('does not attach USC Electrical Engineering Department to USC the place', () => {
    const result = evaluateAttachEligibility({
      name: 'USC Electrical Engineering Department',
      domain: 'locations',
      userId: 'user-a',
      canon: { locations: [place({ id: 'loc-usc', name: 'USC' })] },
    });
    expect(result.decision).toBe('REVIEW_DUPLICATE');
    expect(result.matchBasis).toBe('hierarchy_not_duplicate');
  });

  it('canonical lookup failure is DEGRADED, never CREATE_NEW', () => {
    const result = evaluateAttachEligibility({
      name: 'Brand New Skill',
      domain: 'skills',
      userId: 'user-a',
      canon: {},
      canonStatus: 'degraded',
    });
    expect(result.decision).toBe('DEGRADED');
    expect(result.reason).toBe('canonical_index_degraded');
  });

  it('quest near-duplicate attaches to the active quest', () => {
    const result = evaluateAttachEligibility({
      name: 'Finish my resume',
      domain: 'quests',
      userId: 'user-a',
      canon: {
        quests: [
          {
            id: 'q-1',
            name: 'Finish resume',
            aliases: [],
            domain: 'quests',
            status: 'active',
            userId: 'user-a',
          },
        ],
      },
    });
    expect(result.decision).toBe('ATTACH_EXACT');
    expect(result.canonical?.id).toBe('q-1');
  });

  it('completed quest still attaches rather than spawning a new active copy', () => {
    const result = evaluateAttachEligibility({
      name: 'Finish resume',
      domain: 'quests',
      userId: 'user-a',
      canon: {
        quests: [
          {
            id: 'q-done',
            name: 'Finish resume',
            aliases: [],
            domain: 'quests',
            status: 'completed',
            userId: 'user-a',
          },
        ],
      },
    });
    expect(result.decision).toBe('ATTACH_EXACT');
    expect(isAttachPlan(result) && result.target.status).toBe('completed');
  });
});
