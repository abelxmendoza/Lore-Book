import { describe, it, expect } from 'vitest';
import {
  assessRomanticPartnerEligibility,
  hasThirdPartyPartnerCue,
  isRelationshipRoleLabel,
} from './romanticEligibility';

describe('isRelationshipRoleLabel', () => {
  it('flags relationship role labels, not real names', () => {
    expect(isRelationshipRoleLabel('Ex Lover')).toBe(true);
    expect(isRelationshipRoleLabel('ex')).toBe(true);
    expect(isRelationshipRoleLabel('my ex')).toBe(true);
    expect(isRelationshipRoleLabel('Crush')).toBe(true);
    expect(isRelationshipRoleLabel('Sol')).toBe(false);
    expect(isRelationshipRoleLabel('Ashley')).toBe(false);
  });
});

describe('hasThirdPartyPartnerCue', () => {
  it('detects when the person belongs to someone else', () => {
    expect(hasThirdPartyPartnerCue('her boyfriend Juan aka Oscuri.dad was there')).toBe(true);
    expect(hasThirdPartyPartnerCue('she said she had a boyfriend')).toBe(true);
    expect(hasThirdPartyPartnerCue('I knew she was taken')).toBe(true);
    expect(hasThirdPartyPartnerCue('his girlfriend came too')).toBe(true);
  });

  it('does not fire on the user\'s own relationship', () => {
    expect(hasThirdPartyPartnerCue('I was seeing Sol for a couple weeks')).toBe(false);
    expect(hasThirdPartyPartnerCue('we had a one night stand')).toBe(false);
    expect(hasThirdPartyPartnerCue('')).toBe(false);
  });
});

describe('assessRomanticPartnerEligibility', () => {
  it('accepts a real, available partner', () => {
    expect(assessRomanticPartnerEligibility({ name: 'Sol', evidence: 'I was seeing Sol' }).eligible).toBe(true);
  });

  it('rejects a role label ("Ex Lover" = band name here)', () => {
    const r = assessRomanticPartnerEligibility({ name: 'Ex Lover', evidence: 'great show' });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('role_label_not_a_person');
  });

  it('rejects someone else\'s partner from evidence (Juan = Daisy\'s boyfriend)', () => {
    const r = assessRomanticPartnerEligibility({ name: 'Juan', evidence: 'her boyfriend Juan aka Oscuri.dad' });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('third_party_partner');
  });

  it('rejects collective / non-individual names', () => {
    expect(assessRomanticPartnerEligibility({ name: 'The Engineers' }).eligible).toBe(false);
  });

  describe('Groups & Organizations cross-reference', () => {
    const orgs = ['Ex Lover', 'Northwind Robotics'];

    it("does not romance a bandmate when the romantic cue is the band's name", () => {
      // "Ex Lover" is a band in the Orgs book → the ex-lover cue is really the band.
      const r = assessRomanticPartnerEligibility({
        name: 'Obscurio',
        evidence: 'played a show with my ex lover bandmates',
        knownOrganizationNames: orgs,
      });
      expect(r.eligible).toBe(false);
      expect(r.reason).toBe('role_cue_is_known_organization');
    });

    it('rejects a "partner" that is actually one of the user\'s organizations', () => {
      const r = assessRomanticPartnerEligibility({
        name: 'Northwind Robotics',
        evidence: 'I love Northwind Robotics',
        knownOrganizationNames: orgs,
      });
      expect(r.eligible).toBe(false);
      // Caught as a non-individual person before the org check, but still rejected.
      expect(r.eligible).toBe(false);
    });

    it('still accepts a genuine partner even with an org book present', () => {
      const r = assessRomanticPartnerEligibility({
        name: 'Sol',
        evidence: 'I was dating Sol for a while',
        knownOrganizationNames: orgs,
      });
      expect(r.eligible).toBe(true);
    });

    it('does not over-suppress when the band name is not a relationship word', () => {
      const r = assessRomanticPartnerEligibility({
        name: 'Sol',
        evidence: 'Sol and I went to a Northwind Robotics meetup',
        knownOrganizationNames: orgs,
      });
      expect(r.eligible).toBe(true);
    });
  });
});

describe('ex-lover disambiguation: band vs real ex sexual partner', () => {
  const orgs = ['Ex Lover'];

  it('keeps a genuine romantic cue even though a band shares the phrase', () => {
    expect(
      assessRomanticPartnerEligibility({
        name: 'Jessica',
        evidence: 'Jessica is my ex lover, we used to date before the scene days',
        knownOrganizationNames: orgs,
      }).eligible,
    ).toBe(true);
    expect(
      assessRomanticPartnerEligibility({
        name: 'Daisy',
        evidence: 'an ex lover of mine showed up at the function',
        knownOrganizationNames: orgs,
      }).eligible,
    ).toBe(true);
  });

  it('still rejects band usage of the same phrase', () => {
    const r = assessRomanticPartnerEligibility({
      name: 'Mr. Chino',
      evidence: 'Ex Lover played with Voltra and Mr. Chino sounded great',
      knownOrganizationNames: orgs,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('role_cue_is_known_organization');
  });

  it('rejects when both usages appear (band context wins on ambiguity)', () => {
    const r = assessRomanticPartnerEligibility({
      name: 'Someone',
      evidence: 'my ex lover came to the Ex Lover show',
      knownOrganizationNames: orgs,
    });
    expect(r.eligible).toBe(false);
  });
});
