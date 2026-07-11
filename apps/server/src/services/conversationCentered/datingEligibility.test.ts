import { describe, it, expect } from 'vitest';

import {
  evaluateDatingEligibility,
  assessRomanticEvidence,
  hasFamilySignal,
  classifyPersonType,
  type DatingEligibilityInput,
} from './datingEligibilityService';

const person = (
  name: string,
  overrides: Partial<DatingEligibilityInput> = {},
): DatingEligibilityInput => ({
  entityId: `id-${name.toLowerCase().replace(/\s+/g, '-')}`,
  name,
  canonicalType: 'person',
  isKnownOrganization: false,
  evidenceSnippets: [],
  ...overrides,
});

// The conversation-level snippet that leaked onto everyone's card.
const LEAKED_SNIPPET = 'Karina was a one-night stand.';

describe('dating eligibility — reported regression entities', () => {
  it('Tío Rafa: family, never eligible, even with leaked evidence', () => {
    const r = evaluateDatingEligibility(
      person('Tío Rafa', { evidenceSnippets: [LEAKED_SNIPPET] }),
    );
    expect(r.isEligible).toBe(false);
    expect(r.eligibilityReason).toBe('ineligible_family');
    expect(r.visibleInDatingBook).toBe(false);
  });

  it('Glimmerbyte: software project, not eligible', () => {
    const r = evaluateDatingEligibility(
      person('Glimmerbyte', { canonicalType: 'project', evidenceSnippets: [LEAKED_SNIPPET] }),
    );
    expect(r.eligibilityReason).toBe('ineligible_non_person');
    expect(r.visibleInDatingBook).toBe(false);
  });

  it('Static Petals: band (org book), not eligible even if typed person', () => {
    const r = evaluateDatingEligibility(
      person('Static Petals', { isKnownOrganization: true, evidenceSnippets: [LEAKED_SNIPPET] }),
    );
    expect(r.eligibilityReason).toBe('ineligible_non_person');
  });

  it('DJ Vex: person but zero entity-specific romantic evidence — excluded', () => {
    const r = evaluateDatingEligibility(
      person('DJ Vex', { evidenceSnippets: [LEAKED_SNIPPET] }),
    );
    expect(r.isEligible).toBe(false);
    expect(r.eligibilityReason).toBe('ineligible_evidence_belongs_to_other_entity');
  });

  it('Moth Queen / Neon Newts / Umbra: no direct evidence — excluded', () => {
    for (const name of ['Moth Queen', 'Neon Newts', 'Umbra']) {
      const r = evaluateDatingEligibility(
        person(name, { evidenceSnippets: ['We saw them at the show and danced all night'] }),
      );
      expect(r.visibleInDatingBook, name).toBe(false);
    }
  });

  it('Karina Del Valle: her own one-night-stand statement makes her eligible', () => {
    const r = evaluateDatingEligibility(
      person('Karina Del Valle', { evidenceSnippets: [LEAKED_SNIPPET] }),
    );
    expect(r.isEligible).toBe(true);
    expect(r.eligibilityReason).toBe('eligible_explicit_sexual_evidence');
    expect(r.romanticEvidence).toEqual([LEAKED_SNIPPET]);
  });

  it('Luz: romantic history + blocked — eligible from her own evidence', () => {
    const r = evaluateDatingEligibility(
      person('Luz', {
        evidenceSnippets: ['Luz and I were together for a while before we broke up and she blocked me'],
      }),
    );
    expect(r.isEligible).toBe(true);
    expect(r.visibleInDatingBook).toBe(true);
  });
});

describe('dating eligibility — gates', () => {
  it('weak signals never create a card', () => {
    for (const snippet of [
      'Nadia is really attractive',
      'I danced near Nadia at the club',
      'I follow Nadia online',
      'Nadia was at the show',
    ]) {
      const r = evaluateDatingEligibility(person('Nadia', { evidenceSnippets: [snippet] }));
      expect(r.isEligible, snippet).toBe(false);
      expect(r.eligibilityReason).toBe('ineligible_no_romantic_evidence');
    }
  });

  it('unknown entity type with strong evidence goes to review, not the book', () => {
    const r = evaluateDatingEligibility(
      person('Xolo', { canonicalType: null, evidenceSnippets: ['I went on a date with Xolo'] }),
    );
    expect(r.visibleInDatingBook).toBe(false);
    expect(r.reviewRequired).toBe(true);
    expect(r.eligibilityReason).toBe('ineligible_unknown_type');
  });

  it('family + strong direct evidence = integrity conflict, still hidden', () => {
    const r = evaluateDatingEligibility(
      person('Tía Rosa', { evidenceSnippets: ['I kissed Rosa at the party'] }),
    );
    expect(r.visibleInDatingBook).toBe(false);
    expect(r.eligibilityReason).toBe('review_conflicting_evidence');
    expect(r.reviewRequired).toBe(true);
  });

  it('explicit user correction wins for persons but never for non-persons', () => {
    const confirmed = evaluateDatingEligibility(
      person('Marisol', { userConfirmedRomantic: true }),
    );
    expect(confirmed.isEligible).toBe(true);

    const org = evaluateDatingEligibility(
      person('Heartbreak Radio', { isKnownOrganization: true, userConfirmedRomantic: true }),
    );
    expect(org.isEligible).toBe(false);
  });

  it('evidence attribution: leaked snippets are foreign on every other entity', () => {
    const assessment = assessRomanticEvidence([LEAKED_SNIPPET], 'Moth Queen');
    expect(assessment.foreign).toEqual([LEAKED_SNIPPET]);
    expect(assessment.accepted).toEqual([]);
  });

  it('kinship titles across languages hard-block', () => {
    for (const name of ['Tío Rafa', 'Aunt May', 'Prima Lucia', 'Grandma Rose', 'Stepdad Rick']) {
      expect(hasFamilySignal(name), name).toBe(true);
    }
    expect(hasFamilySignal('Juanita')).toBe(false);
  });

  it('person typing: bands/projects/places/pets are non-person; blank is unknown', () => {
    expect(classifyPersonType('band', false)).toBe('non_person');
    expect(classifyPersonType('software_tool', false)).toBe('non_person');
    expect(classifyPersonType('pet', false)).toBe('non_person');
    expect(classifyPersonType('person', false)).toBe('person');
    expect(classifyPersonType(null, false)).toBe('unknown');
    expect(classifyPersonType('person', true)).toBe('non_person');
  });
});
