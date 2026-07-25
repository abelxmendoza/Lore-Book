import type { PropositionAttribution, PropositionDomain } from './beliefTypes';

export function resolveBeliefAttribution(input: {
  text: string;
  domain: PropositionDomain;
  userId: string;
}): PropositionAttribution {
  const t = input.text.toLowerCase();
  const isAllegation = input.domain === 'ALLEGATION'
    || /\b(?:people (?:online |in the scene )?(?:are |were )?(?:calling|saying|accusing|said)|accused|said i was|calling me)\b/.test(t);
  const isAdmission = /\b(?:i (?:did|put|touched|crossed)|i did not respect|after (?:she|he|they) told me no)\b/.test(t);

  if (isAllegation && !isAdmission) {
    return {
      assertionSource: 'GROUP',
      claimantEntityIds: ['group:scene'],
      targetEntityIds: [`user:${input.userId}`],
      status: 'ALLEGATION',
      attributionText: 'Reported third-party accusation; not established as fact about the user.',
    };
  }

  if (isAdmission) {
    return {
      assertionSource: 'USER_DIRECT',
      claimantEntityIds: [`user:${input.userId}`],
      targetEntityIds: [],
      status: 'DIRECT_ASSERTION',
      attributionText: 'User-authored admission of specific behavior.',
    };
  }

  return {
    assertionSource: 'USER_DIRECT',
    claimantEntityIds: [`user:${input.userId}`],
    targetEntityIds: [],
    status: 'DIRECT_ASSERTION',
  };
}
