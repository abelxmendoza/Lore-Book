import type { PropositionDomain, SpeechAct } from './beliefTypes';

export function classifyBeliefDomain(text: string, speechAct: SpeechAct): PropositionDomain {
  const t = text.toLowerCase();

  if (speechAct === 'SYSTEM_FEEDBACK' || speechAct === 'PRODUCT_FEEDBACK') return 'ASSISTANT_FEEDBACK';
  if (speechAct === 'UI_FEEDBACK' || /\b(?:neon|glow|bubble|outline|gradient)\b/.test(t)) return 'UI_PREFERENCE';
  if (/\b(?:people (?:online |in the scene )?(?:are |were )?(?:calling|saying|accusing|said)|accused|allegation|called me|said i was)\b/.test(t)) {
    return 'ALLEGATION';
  }
  if (speechAct === 'CORRECTION' || speechAct === 'RETRACTION') return 'CORRECTION';
  if (/\b(?:felt|feel|stoked|depressed|excited|anxious|happy|sad|looking forward)\b/.test(t)) {
    return 'EMOTIONAL_STATE';
  }
  if (/\b(?:live(?:s)? (?:in|with)|i live|residence|anaheim)\b/.test(t)) return 'RESIDENCE';
  if (/\b(?:works? (?:as|at|for)|working (?:as|at|for)|occupation|technician|developer|engineer|employer)\b/.test(t)) {
    return 'OCCUPATION';
  }
  if (/\b(?:cousin|friend|partner|dating|blocked|boyfriend|girlfriend|relationship|spouse)\b/.test(t)) {
    return 'RELATIONSHIP';
  }
  if (/\b(?:is|was)\s+(?:a|an|the)\s+(?:band|club|venue|company|nightclub|platform|project)\b/.test(t)) {
    return 'ENTITY_CLASSIFICATION';
  }
  if (/\b(?:want|launch|revenue|users love|getting it to work|product requirement|remember everything)\b/.test(t)
    && /\b(?:lorebook|memovault|app|product)\b/.test(t)) {
    return /\b(?:glow|neon|ui|bubble|outline)\b/.test(t) ? 'UI_PREFERENCE' : 'PROJECT_GOAL';
  }
  if (/\b(?:plan(?:ning)? (?:to|on)|about to|going to|looking forward to|tonight|tomorrow)\b/.test(t)
    && !/\b(?:yesterday|last night|went|stayed|attended)\b/.test(t)) {
    return 'PLAN';
  }
  if (/\b(?:at \w+ now|i(?:'m| am) at)\b/.test(t)) return 'PHYSICAL_STATE';
  if (/\b(?:went|attended|visited|stayed|met|texted|happened|yesterday|last night|saturday)\b/.test(t)) {
    return 'EVENT';
  }
  if (/\b(?:created|creator of|software developer|i am a)\b/.test(t)) return 'IDENTITY';
  if (/\b(?:believe|think|opinion)\b/.test(t)) return 'BELIEF_OR_OPINION';

  return 'UNKNOWN';
}
