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
});
