import type { PropositionDomain, PropositionDurability, SpeechAct } from './beliefTypes';

export function classifyBeliefDurability(input: {
  text: string;
  domain: PropositionDomain;
  speechAct: SpeechAct;
}): PropositionDurability {
  const { text, domain, speechAct } = input;
  const t = text.toLowerCase();

  if (!speechAct || [
    'COMMAND', 'QUESTION', 'REQUEST', 'UI_FEEDBACK', 'SYSTEM_FEEDBACK',
    'PRODUCT_FEEDBACK', 'CONVERSATIONAL_FILLER', 'ROLEPLAY', 'JOKE',
  ].includes(speechAct)) {
    return 'NOT_MEMORY_WORTHY';
  }

  if (domain === 'ASSISTANT_FEEDBACK' || domain === 'UI_PREFERENCE') return 'NOT_MEMORY_WORTHY';
  if (domain === 'EVENT') return 'EVENT_ONLY';
  if (domain === 'PLAN') return 'PLAN_ONLY';
  if (domain === 'EMOTIONAL_STATE' || domain === 'PHYSICAL_STATE') return 'TEMPORARY_STATE';
  if (domain === 'PROJECT_GOAL' || domain === 'PRODUCT_REQUIREMENT') return 'SEMI_DURABLE';
  if (domain === 'OCCUPATION' || domain === 'EMPLOYMENT') return 'SEMI_DURABLE';
  if (domain === 'IDENTITY' || domain === 'RESIDENCE' || domain === 'RELATIONSHIP' || domain === 'ENTITY_CLASSIFICATION' || domain === 'WORLD_FACT') {
    return 'DURABLE';
  }
  if (/\b(?:now|tonight|tomorrow|right now|looking forward)\b/.test(t)) return 'TEMPORARY_STATE';
  if (/\b(?:yesterday|last night|went|stayed|attended)\b/.test(t)) return 'EVENT_ONLY';

  return 'UNKNOWN';
}
