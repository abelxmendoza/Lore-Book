import { describe, expect, it } from 'vitest';
import { arbitrateCandidateDomain } from './domainArbitrationLayer';

describe('event brand and contextual alias arbitration', () => {
  it('classifies Code Red as an event even in locative language', () => {
    const result = arbitrateCandidateDomain('Code Red', 'I went to Code Red after Lick N Dip');
    expect(result.winningDomain).toBe('EVENT');
    expect(result.allowedAsPlace).toBe(false);
    expect(result.rulesFired).toContain('canonical_event_brand');
  });

  it('routes weeb city to the Anime Expo event alias, never a place', () => {
    const result = arbitrateCandidateDomain('weeb city', 'Posted from weeb city during Anime Expo');
    expect(result.winningDomain).toBe('EVENT');
    expect(result.allowedAsPlace).toBe(false);
    expect(result.rulesFired).toContain('anime_expo_contextual_alias');
  });
});
