import type { SpeechAct } from './beliefTypes';

const COMMAND = /^(?:please\s+)?(?:try again|retry|show|tell|list|check|remember|recap|summari[sz]e|fix|update|delete|forget|can you|could you|do you|what do you|who (?:am|is|else)|did i)\b/i;
const REQUEST = /^(?:please\s+)?(?:help|make|fix|change|add|remove|upload|document)\b|\bcan you (?:document|upload|remember|make)\b/i;
const QUESTION = /^(?:what|why|how|when|where|who|do you|can you|should i|what if)\b|\?$/i;
const SYSTEM_FEEDBACK = /\b(?:that question doesn'?t make sense|doesn'?t make sense for what i said|you(?:'re| are) supposed to recall|those sources (?:don'?t|do not) (?:even )?relate|sources don'?t even relate|you forgot|failed response|completely failed)\b/i;
const PRODUCT_FEEDBACK = /\b(?:chat bubbles?|styling|user interface|\bui\b|glow effect|api tokens?|something went wrong|memory can be saved|neon gradient|moving neon)\b/i;
const UI_FEEDBACK = /\b(?:make the (?:bubble|chat|outline)|glow with|neon gradient outline)\b/i;
const FILLER = /^(?:ok(?:ay)?|yeah|yep|nah|hmm+|lol|lmao|bro|aww man|dude)[!.,\s]*$/i;
const ROLEPLAY = /^(?:imagine you are|pretend (?:you|to)|roleplay|act as if)\b/i;
const HYPOTHETICAL = /\b(?:what if|suppose|hypothetically|imagine if)\b/i;
const CORRECTION = /\b(?:mistake|incorrect|wrong|actually)\b|\b(?:i(?:'m| am)|you(?:'re| are)|he(?:'s| is)|she(?:'s| is)|they(?:'re| are)|is|are|was|were)\s+not\b|\b(?:isn'?t|aren'?t|wasn'?t|weren'?t)\b/i;
const RETRACTION = /\b(?:i(?:'m| am)|he(?:'s| is)|she(?:'s| is)|they(?:'re| are)|is|are)\s+not\b|\b(?:never was|no longer|not actually)\b/i;
const RELATIONSHIP = /\b(?:my (?:cousin|friend|partner|boyfriend|girlfriend|coworker|manager|spouse)|dating|blocked|relationship)\b/i;
const WORLD = /\b(?:is|was)\s+(?:a|an|the)\s+(?:band|club|venue|company|organization|platform|project|product|place|nightclub)\b/i;
const AUTOBIO = /^(?:i(?:'m| am|ve|'ve)?|my|we(?:'re| are)?)\b|\bi(?:'m| am|'ve)?\s+(?:live|work|created|went|stayed|built|felt|feel|started|am|was|were|put|have)\b|\bi am a\b/i;

export type SpeechActClassification = {
  speechAct: SpeechAct;
  confidence: number;
  beliefEligible: boolean;
  reason: string;
};

const ELIGIBLE: ReadonlySet<SpeechAct> = new Set([
  'AUTOBIOGRAPHICAL_ASSERTION',
  'WORLD_ASSERTION',
  'RELATIONSHIP_ASSERTION',
  'CORRECTION',
  'RETRACTION',
]);

export function isSpeechActBeliefEligible(act: SpeechAct): boolean {
  return ELIGIBLE.has(act);
}

export function classifyBeliefSpeechAct(
  claimText: string,
  sourceText?: string,
): SpeechActClassification {
  const claim = (claimText ?? '').trim();
  const source = (sourceText ?? claim).trim();
  const probe = `${source}\n${claim}`;

  if (!claim || claim.length < 3) {
    return { speechAct: 'CONVERSATIONAL_FILLER', confidence: 1, beliefEligible: false, reason: 'empty_or_tiny' };
  }
  if (FILLER.test(claim) || FILLER.test(source)) {
    return { speechAct: 'CONVERSATIONAL_FILLER', confidence: 0.95, beliefEligible: false, reason: 'filler' };
  }
  if (COMMAND.test(source) || COMMAND.test(claim) || /^(?:try again)$/i.test(claim)) {
    return { speechAct: 'COMMAND', confidence: 1, beliefEligible: false, reason: 'command' };
  }
  if (SYSTEM_FEEDBACK.test(probe)) {
    return { speechAct: 'SYSTEM_FEEDBACK', confidence: 0.95, beliefEligible: false, reason: 'assistant_feedback' };
  }
  if (UI_FEEDBACK.test(probe) || PRODUCT_FEEDBACK.test(probe)) {
    const act: SpeechAct = UI_FEEDBACK.test(probe) ? 'UI_FEEDBACK' : 'PRODUCT_FEEDBACK';
    return { speechAct: act, confidence: 0.9, beliefEligible: false, reason: 'product_or_ui_feedback' };
  }
  if (ROLEPLAY.test(source) || ROLEPLAY.test(claim)) {
    return { speechAct: 'ROLEPLAY', confidence: 0.9, beliefEligible: false, reason: 'roleplay_scaffold' };
  }
  if (HYPOTHETICAL.test(probe) && QUESTION.test(claim)) {
    return { speechAct: 'QUESTION', confidence: 0.9, beliefEligible: false, reason: 'hypothetical_question' };
  }
  if (QUESTION.test(claim) || QUESTION.test(source)) {
    return { speechAct: 'QUESTION', confidence: 0.92, beliefEligible: false, reason: 'question' };
  }
  if (REQUEST.test(source) && !AUTOBIO.test(claim)) {
    return { speechAct: 'REQUEST', confidence: 0.85, beliefEligible: false, reason: 'request' };
  }
  if (RETRACTION.test(claim) || (CORRECTION.test(claim) && /\bnot\b/i.test(claim))) {
    return { speechAct: 'RETRACTION', confidence: 0.9, beliefEligible: true, reason: 'retraction' };
  }
  if (CORRECTION.test(claim)) {
    return { speechAct: 'CORRECTION', confidence: 0.88, beliefEligible: true, reason: 'correction' };
  }
  if (
    (RELATIONSHIP.test(claim) && AUTOBIO.test(claim))
    || /\b(?:blocked me|texted me|dating me)\b/i.test(claim)
  ) {
    return { speechAct: 'RELATIONSHIP_ASSERTION', confidence: 0.85, beliefEligible: true, reason: 'relationship' };
  }
  if (WORLD.test(claim) && !AUTOBIO.test(claim)) {
    return { speechAct: 'WORLD_ASSERTION', confidence: 0.85, beliefEligible: true, reason: 'world_fact' };
  }
  if (AUTOBIO.test(claim) || AUTOBIO.test(source)) {
    return { speechAct: 'AUTOBIOGRAPHICAL_ASSERTION', confidence: 0.88, beliefEligible: true, reason: 'autobiographical' };
  }
  if (WORLD.test(claim)) {
    return { speechAct: 'WORLD_ASSERTION', confidence: 0.75, beliefEligible: true, reason: 'world_assertion' };
  }

  return { speechAct: 'UNKNOWN', confidence: 0.4, beliefEligible: false, reason: 'unknown_speech_act' };
}
