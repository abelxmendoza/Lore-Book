/**
 * Speech-act / timeline eligibility for Omni main surface.
 * Extends life-log policy with recap/command/correction/product-feedback classes.
 */

import {
  evaluateLifeLogEligibility,
  autobiographicalClause,
} from '../events/lifeLogEligibilityPolicy';

export type TimelineSpeechAct =
  | 'LIVED_EVENT'
  | 'RECALLED_EVENT'
  | 'REFLECTION'
  | 'CORRECTION'
  | 'QUESTION'
  | 'COMMAND'
  | 'RECAP_REQUEST'
  | 'PRODUCT_FEEDBACK'
  | 'SYSTEM_DEBUGGING'
  | 'EXTERNAL_CONTEXT'
  | 'EMPTY'
  | 'UNKNOWN';

export type TimelineSurface =
  | 'OMNI_MAIN'
  | 'PROJECT_TIMELINE'
  | 'REFLECTION_LAYER'
  | 'EVIDENCE_ONLY'
  | 'EXCLUDED'
  | 'NEEDS_REVIEW';

export type TimelineEligibility = {
  eligible: boolean;
  surface: TimelineSurface;
  speechAct: TimelineSpeechAct;
  reasons: string[];
  blockers: string[];
};

const RECAP = /\b(?:recap(?:\s+everything)?|summari[sz]e\s+(?:this|the)\s+thread|what\s+did\s+we\s+discuss)\b/i;
const CORRECTION =
  /\b(?:please\s+change|change\s+(?:his|her|their|the)\s+status|you\s+have\s+.+\s+in\s+(?:love|romance|relationships)|he(?:'s| is)\s+more\s+like\s+a\s+friend|correct\s+this|that(?:'s| is)\s+wrong)\b/i;
const PRODUCT_FEEDBACK =
  /\b(?:what\s+happened\s+to\s+all\s+my\s+characters|token\s+spam|characters?\s+stroke|wtf|bug|broken|ui\s+(?:bug|issue)|testing\s+the\s+chat)\b/i;
const SYSTEM_DEBUG = /\b(?:debug|console\.log|stack\s+trace|distilled:\s*"?empty"?)\b/i;
const EXTERNAL = /^(?:the\s+)?(?:world cup|weather|news)\b.*\b(?:is|are|was|were|going on)\b/i;
const QUESTION = /^(?:who|what|when|where|why|how|do you|can you|did i)\b.+\?$/i;
const EMPTY_TITLE =
  /^(?:captured conversation|untitled(?: event)?|unknown(?: event)?|abel\s+\w+(?:'s)?\s+event|hi\s+\w+|event|moment)$/i;
const DISTILLED_EMPTY = /distilled:\s*"?empty"?/i;

export function classifyTimelineSpeechAct(input: {
  text: string;
  title?: string | null;
}): TimelineSpeechAct {
  const raw = `${input.title ?? ''} ${input.text}`.trim();
  if (!raw || DISTILLED_EMPTY.test(raw) || EMPTY_TITLE.test((input.title ?? '').trim())) {
    return 'EMPTY';
  }
  if (RECAP.test(raw)) return 'RECAP_REQUEST';
  if (CORRECTION.test(raw)) return 'CORRECTION';
  if (SYSTEM_DEBUG.test(raw)) return 'SYSTEM_DEBUGGING';
  if (PRODUCT_FEEDBACK.test(raw)) return 'PRODUCT_FEEDBACK';
  if (EXTERNAL.test(raw)) return 'EXTERNAL_CONTEXT';
  if (QUESTION.test(raw.trim())) return 'QUESTION';
  if (/^(?:please\s+)?(?:remember|fix|update|delete|generate|show me|list)\b/i.test(raw) &&
      !/\b(?:i|we)\s+(?:went|was|were|did|built|started)\b/i.test(autobiographicalClause(raw))) {
    return 'COMMAND';
  }
  if (/\b(?:i feel|feeling|reflect(?:ing|ed)?|thinking about)\b/i.test(raw) &&
      !/\b(?:went|attended|worked|met)\b/i.test(raw)) {
    return 'REFLECTION';
  }
  if (/\b(?:years? ago|back when|used to)\b/i.test(raw)) return 'RECALLED_EVENT';
  return 'LIVED_EVENT';
}

export function evaluateTimelineEligibility(input: {
  text: string;
  title?: string | null;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}): TimelineEligibility {
  const speechAct = classifyTimelineSpeechAct(input);
  const lifeLog = evaluateLifeLogEligibility({
    text: input.text,
    title: input.title,
    type: input.type,
    metadata: input.metadata,
  });

  const reasons: string[] = [speechAct, lifeLog.reason];
  const blockers: string[] = [];

  const excludedActs: TimelineSpeechAct[] = [
    'RECAP_REQUEST',
    'COMMAND',
    'CORRECTION',
    'QUESTION',
    'PRODUCT_FEEDBACK',
    'SYSTEM_DEBUGGING',
    'EMPTY',
    'EXTERNAL_CONTEXT',
  ];

  if (excludedActs.includes(speechAct)) {
    blockers.push(`speech_act:${speechAct}`);
    const surface: TimelineSurface =
      speechAct === 'CORRECTION'
        ? 'EVIDENCE_ONLY'
        : speechAct === 'PRODUCT_FEEDBACK' || speechAct === 'SYSTEM_DEBUGGING'
          ? 'PROJECT_TIMELINE'
          : speechAct === 'REFLECTION'
            ? 'REFLECTION_LAYER'
            : 'EXCLUDED';
    return { eligible: false, surface, speechAct, reasons, blockers };
  }

  if (!lifeLog.eligible) {
    blockers.push(`life_log:${lifeLog.reason}`);
    return {
      eligible: false,
      surface: 'EXCLUDED',
      speechAct,
      reasons,
      blockers,
    };
  }

  if (speechAct === 'REFLECTION') {
    return {
      eligible: true,
      surface: 'REFLECTION_LAYER',
      speechAct,
      reasons,
      blockers,
    };
  }

  // Recovered tags alone don't exclude, but they shouldn't boost Omni without date quality
  if ((input.tags ?? []).some((t) => /^recovered$/i.test(t))) {
    reasons.push('recovered_tag');
  }

  return {
    eligible: true,
    surface: 'OMNI_MAIN',
    speechAct,
    reasons,
    blockers,
  };
}
