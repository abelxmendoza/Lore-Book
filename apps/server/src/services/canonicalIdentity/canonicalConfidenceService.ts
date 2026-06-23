import type { CanonicalIdentityDomain } from './canonicalIdentityTypes';

export function scoreCanonicalIdentity(input: {
  domain: CanonicalIdentityDomain;
  hasContext: boolean;
  duplicate: boolean;
  rulesFired: string[];
}): number {
  if (input.duplicate) return 0.98;
  if (input.rulesFired.includes('rejected')) return 0;
  if (input.domain === 'place' && input.rulesFired.includes('owned_place')) return 0.92;
  if (input.domain === 'group' && input.rulesFired.includes('household_from_owned_place')) return 0.9;
  if (input.domain === 'person' && input.rulesFired.includes('title_preserved')) return 0.91;
  if (input.domain === 'person' && input.rulesFired.includes('contextual_person_name')) return 0.82;
  if (input.hasContext) return 0.78;
  return 0.7;
}
