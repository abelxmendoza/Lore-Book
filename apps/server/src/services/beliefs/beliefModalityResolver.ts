import type { BeliefModality, BeliefPolarity, SpeechAct } from './beliefTypes';

export function resolveBeliefModality(text: string, speechAct: SpeechAct): BeliefModality {
  const t = text.toLowerCase();
  if (speechAct === 'HYPOTHETICAL' || /\b(?:what if|hypothetically|imagine)\b/.test(t)) return 'HYPOTHETICAL';
  if (/\b(?:people (?:online |in the scene )?(?:are |were )?(?:calling|saying|accusing|said)|accused|allegation|said i was)\b/.test(t)) {
    return 'ALLEGED';
  }
  if (/\b(?:plan(?:ning)?|going to|about to|looking forward|want to|intend)\b/.test(t)) return 'PLANNED';
  if (/\b(?:want|wish|hope)\b/.test(t)) return 'DESIRED';
  if (/\b(?:i think|i believe|maybe|probably)\b/.test(t)) return 'BELIEVED';
  if (/\b(?:reportedly|according to|they said)\b/.test(t)) return 'REPORTED';
  if (speechAct === 'RETRACTION' || speechAct === 'CORRECTION') return 'ASSERTED';
  return 'ASSERTED';
}

export function resolveBeliefPolarity(text: string): BeliefPolarity {
  if (/\b(?:not|never|no longer|isn'?t|aren'?t|wasn'?t|weren'?t)\b/i.test(text)) return 'NEGATIVE';
  return 'POSITIVE';
}
