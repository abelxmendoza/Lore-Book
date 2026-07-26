/**
 * Pre-write gate for entity_facts — cheap heuristics, no LLM.
 *
 * Drops conversational acts, ephemeral calendar noise, and weak subject
 * attachment before upsert. Tags keepers with assertion_type metadata.
 */

import { classifyBeliefSpeechAct } from '../beliefs/beliefSpeechActClassifier';
import { classifyFactStability } from './opinionVsFactClassifier';
import { factTemporalPolarity } from './entityFactDedup';

export type FactAssertionType =
  | 'self_asserted'
  | 'reported_by_other'
  | 'feeling'
  | 'uncertain'
  | 'durable_trait';

export type FactWriteDecision =
  | { action: 'keep'; assertionType: FactAssertionType; reason: string }
  | { action: 'drop'; reason: string; kind: 'conversational' | 'ephemeral' | 'opinion' | 'subject' | 'noise' };

export type ExtractedFactLike = {
  fact: string;
  category: string;
  confidence: number;
  contradicts?: string;
};

const CONVERSATIONAL_FACT =
  /\b(?:is asking|was asking|asks about|is testing|is currently seeing|wants the assistant|wants lore(?:book)? to|thinks the question|does not make sense|doesn't make sense|is asking whether|is asking what|is asking about their own identity|character card was made|remember their story|failed response|many sources)\b/i;

const EPHEMERAL_EVENT =
  /\b(?:tomorrow|yesterday|tonight|this morning|this afternoon|next (?:week|monday|tuesday|wednesday|thursday|friday)|second day|first day|third day|day\s*\d+|starts? at\s*\d|starting (?:a new job )?tomorrow|about to start|on their (?:first|second|third) day|led .+ tonight|went for a run yesterday)\b/i;

/** Ephemeral calendar noise that is NOT a durable employment status. */
const EPHEMERAL_WITHOUT_EMPLOYER =
  /\b(?:waiting for (?:an |the )?(?:official )?offer letter|background check|starts? at\s*\d|about to start(?:ing)?(?:\s+their)?(?:\s+first day)?|is starting a new job tomorrow|is on their second day)\b/i;

const REPORTED_BY_OTHER =
  /\b(?:was described as|people say|they say|she said|he said|someone said|accused of|called (?:me|him|her))\b/i;

const FEELING =
  /\b(?:feels?|feeling|felt|ashamed|excited|anxious|nervous|happy|sad|angry)\b/i;

const IMAGE_NOISE =
  /\b(?:is pictured in the image|shown in the (?:photo|image|picture)|appears in the (?:photo|image))\b/i;

/** Role claims that often belong to someone else mentioned in chat. */
const FOREIGN_ROLE_CLAIM =
  /^(?:is|was)\s+(?:a |an |the )?(?:dj|recruiter|youtuber|teacher|instructor|bootcamp|manager for)\b/i;

const SELF_OWNERSHIP =
  /\b(?:narrator|the user|i am|i'm|my |works as|works at|worked at|lives in|has |had )\b/i;

/**
 * Decide whether an extracted fact should land in entity_facts.
 * @param path `self` applies stricter subject + conversational gates.
 */
export function gateEntityFactWrite(
  fact: ExtractedFactLike,
  opts: {
    path: 'self' | 'character' | 'organization' | 'location';
    sourceText?: string;
    entityName?: string;
  },
): FactWriteDecision {
  const text = (fact.fact ?? '').trim();
  if (!text || text.length < 3) {
    return { action: 'drop', reason: 'empty_or_tiny', kind: 'noise' };
  }

  if (IMAGE_NOISE.test(text)) {
    return { action: 'drop', reason: 'image_caption_noise', kind: 'noise' };
  }

  if (CONVERSATIONAL_FACT.test(text)) {
    return { action: 'drop', reason: 'conversational_act_fact', kind: 'conversational' };
  }

  const speech = classifyBeliefSpeechAct(text, opts.sourceText);
  if (
    !speech.beliefEligible &&
    (speech.speechAct === 'QUESTION' ||
      speech.speechAct === 'COMMAND' ||
      speech.speechAct === 'REQUEST' ||
      speech.speechAct === 'SYSTEM_FEEDBACK' ||
      speech.speechAct === 'PRODUCT_FEEDBACK' ||
      speech.speechAct === 'UI_FEEDBACK' ||
      speech.speechAct === 'ROLEPLAY' ||
      speech.speechAct === 'CONVERSATIONAL_FILLER')
  ) {
    return { action: 'drop', reason: `speech_act_${speech.reason}`, kind: 'conversational' };
  }

  // Ephemeral calendar / day-of events — not durable identity facts.
  if (EPHEMERAL_WITHOUT_EMPLOYER.test(text) || (EPHEMERAL_EVENT.test(text) && !/\b(?:works?|worked|employed|job at|at amazon|at ring|at vanguard)\b/i.test(text))) {
    // Allow durable "is unemployed" / "works at X" even if nearby temporal words exist,
    // but drop pure schedule fragments.
    if (
      EPHEMERAL_WITHOUT_EMPLOYER.test(text) ||
      (!/\b(?:works?|worked|unemployed|employed|job at|quality assurance|technician)\b/i.test(text) &&
        factTemporalPolarity(text) !== 'past')
    ) {
      if (EPHEMERAL_EVENT.test(text) || EPHEMERAL_WITHOUT_EMPLOYER.test(text)) {
        return { action: 'drop', reason: 'ephemeral_event', kind: 'ephemeral' };
      }
    }
  }

  if (opts.path === 'self' || opts.path === 'character') {
    const stability = classifyFactStability(fact, opts.sourceText || text);
    if (stability === 'opinion_or_reaction') {
      return { action: 'drop', reason: 'opinion_or_reaction', kind: 'opinion' };
    }
  }

  if (opts.path === 'self') {
    // Misattribution: role/celebrity claims without self ownership cues.
    if (FOREIGN_ROLE_CLAIM.test(text) && !SELF_OWNERSHIP.test(text)) {
      return { action: 'drop', reason: 'foreign_role_without_self_ownership', kind: 'subject' };
    }
    // Third-person named subject ("Marcus is a DJ…") must not land on self.
    if (
      /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:is|was|works|worked|lives|lived)\b/.test(text) &&
      !SELF_OWNERSHIP.test(text) &&
      !/\b(?:narrator|the user)\b/i.test(text)
    ) {
      return { action: 'drop', reason: 'third_person_named_subject', kind: 'subject' };
    }
    // "Is a DJ for Prayers" / "Ran Clever Programmer" style — often about others.
    if (
      /\b(?:for prayers|foos gone wild|cholo goth|clever programmer)\b/i.test(text) &&
      !/\b(?:i |my |narrator)\b/i.test(opts.sourceText || '')
    ) {
      // Still allow if source clearly first-person about self activity; otherwise drop.
      if (!/\bi(?:'m| am|'ve| was)?\b.{0,40}\b(?:dj|youtuber|taught|ran)\b/i.test(opts.sourceText || '')) {
        return { action: 'drop', reason: 'likely_other_person_claim', kind: 'subject' };
      }
    }
  }

  let assertionType: FactAssertionType = 'durable_trait';
  if (REPORTED_BY_OTHER.test(text) || REPORTED_BY_OTHER.test(opts.sourceText || '')) {
    assertionType = 'reported_by_other';
  } else if (FEELING.test(text) && !/\b(?:works?|lived?|has |had )\b/i.test(text)) {
    assertionType = 'feeling';
  } else if (/\b(?:thinks?|thought|maybe|might|possibly)\b/i.test(text)) {
    assertionType = 'uncertain';
  } else if (opts.path === 'self') {
    assertionType = 'self_asserted';
  }

  return { action: 'keep', assertionType, reason: 'passed_write_gate' };
}

/** Classify an existing DB row for cleanup tooling. */
export function classifyExistingFactForCleanup(factText: string, category: string): FactWriteDecision {
  return gateEntityFactWrite(
    { fact: factText, category, confidence: 0.7 },
    { path: 'self', sourceText: factText },
  );
}
