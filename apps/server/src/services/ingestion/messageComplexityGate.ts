/**
 * Deterministic preflight for ingestion / decorator spend.
 * Never calls a model. Uncertain input fails upward to AMBIGUOUS.
 */

export type MessageComplexityClass =
  | 'SIMPLE_FACT'
  | 'SIMPLE_EVENT'
  | 'ENTITY_MENTION'
  | 'CORRECTION'
  | 'MULTI_EVENT'
  | 'TEMPORALLY_COMPLEX'
  | 'RELATIONSHIP_COMPLEX'
  | 'AMBIGUOUS'
  | 'NO_LORE'
  | 'REFLECTIVE';

export type MessageComplexityFeatures = {
  wordCount: number;
  sentenceCount: number;
  tokenEstimate: number;
  conjunctionCount: number;
  temporalMarkerCount: number;
  namedEntityCount: number;
  hasCorrection: boolean;
  hasExplicitDate: boolean;
  hasFirstPersonVerb: boolean;
  hasNegation: boolean;
  hasRelationshipVerb: boolean;
  hasListStructure: boolean;
  hasChronologyAmbiguity: boolean;
  isInterrogative: boolean;
};

export type MessageComplexityDecision = {
  class: MessageComplexityClass;
  confidence: number;
  features: MessageComplexityFeatures;
  /** True when the expensive path should run because the gate is unsure. */
  failUpward: boolean;
  reasons: string[];
};

const CORRECTION_RE =
  /\b(actually|wait|scratch that|never mind|i was wrong|i meant|i mean|correction|let me correct|i take that back|not .+,? (?:it was|it is))\b/i;

const RELATIONSHIP_VERB_RE =
  /\b(dated|dating|married|boyfriend|girlfriend|partner|wife|husband|fiancé|fiancee|broke up|introduced|met through|best friend|coworker|colleague)\b/i;

const FIRST_PERSON_VERB_RE =
  /\b(i|we)\s+(went|did|met|saw|visited|worked|started|stopped|left|joined|had|got|made|built|talked|ate|ran|walked|drove)\b/i;

const TEMPORAL_RE =
  /\b(yesterday|today|tomorrow|tonight|this morning|last night|last week|last month|last year|in \d{4}|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|ago|later that|the next day)\b/i;

const EXPLICIT_DATE_RE =
  /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?|in \d{4})\b/i;

const MULTI_EVENT_RE =
  /\b(and then|then i|then we|afterwards|after that|later i|later we|meanwhile)\b/i;

const CHRONOLOGY_AMBIGUITY_RE =
  /\b(before or after|not sure (?:when|if)|i don't remember whether|around then|sometime in|or maybe)\b/i;

const REFLECTIVE_RE =
  /\b(looking back|in hindsight|i (?:feel|felt|think|thought|wonder|realize)|what does that mean|how am i doing)\b/i;

const NEGATION_RE = /\b(not|never|didn't|did not|wasn't|was not|no longer)\b/i;

const CONJUNCTION_RE = /\b(and then|then|after that|while|meanwhile|although|however|but then)\b/gi;

const LIST_RE = /(?:^|\n)\s*(?:[-*]|\d+[.)])\s+\S+/;

const TITLE_CASE_NAME_RE = /\b[A-ZÀ-Ý][a-zà-ÿ'’-]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’-]+){0,2}\b/g;

const STOP_NAMES = new Set([
  'I',
  'I\'m',
  'The',
  'A',
  'An',
  'This',
  'That',
  'Then',
  'After',
  'Before',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);

const INTERROGATIVE_START =
  /^(?:what|who|when|where|why|how|which|whose|whom|am|is|are|was|were|do|does|did|have|has|had|can|could|would|should|will)\b/i;

export function extractMessageComplexityFeatures(text: string): MessageComplexityFeatures {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/) : [];
  const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const names = (trimmed.match(TITLE_CASE_NAME_RE) ?? []).filter((n) => !STOP_NAMES.has(n));
  const conjunctions = trimmed.match(CONJUNCTION_RE) ?? [];
  const temporals = trimmed.match(new RegExp(TEMPORAL_RE.source, 'gi')) ?? [];

  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    tokenEstimate: words.length,
    conjunctionCount: conjunctions.length,
    temporalMarkerCount: temporals.length,
    namedEntityCount: names.length,
    hasCorrection: CORRECTION_RE.test(trimmed),
    hasExplicitDate: EXPLICIT_DATE_RE.test(trimmed),
    hasFirstPersonVerb: FIRST_PERSON_VERB_RE.test(trimmed),
    hasNegation: NEGATION_RE.test(trimmed),
    hasRelationshipVerb: RELATIONSHIP_VERB_RE.test(trimmed),
    hasListStructure: LIST_RE.test(trimmed),
    hasChronologyAmbiguity: CHRONOLOGY_AMBIGUITY_RE.test(trimmed),
    isInterrogative: INTERROGATIVE_START.test(trimmed) || trimmed.endsWith('?'),
  };
}

export function classifyMessageComplexity(text: string): MessageComplexityDecision {
  const features = extractMessageComplexityFeatures(text);
  const reasons: string[] = [];

  if (!text.trim()) {
    return {
      class: 'NO_LORE',
      confidence: 0.95,
      features,
      failUpward: false,
      reasons: ['empty'],
    };
  }

  if (features.hasCorrection) {
    reasons.push('correction_marker');
    return { class: 'CORRECTION', confidence: 0.9, features, failUpward: false, reasons };
  }

  if (features.hasChronologyAmbiguity || (features.temporalMarkerCount >= 2 && features.sentenceCount >= 2)) {
    reasons.push('chronology_ambiguity');
    return { class: 'TEMPORALLY_COMPLEX', confidence: 0.82, features, failUpward: false, reasons };
  }

  if (MULTI_EVENT_RE.test(text) && (features.sentenceCount >= 2 || features.conjunctionCount >= 2)) {
    reasons.push('multi_event_pattern');
    return { class: 'MULTI_EVENT', confidence: 0.85, features, failUpward: false, reasons };
  }

  if ((features.hasRelationshipVerb || /\bthrough\b/i.test(text)) && features.namedEntityCount >= 2) {
    reasons.push('relationship_verb');
    return { class: 'RELATIONSHIP_COMPLEX', confidence: 0.8, features, failUpward: false, reasons };
  }

  if (REFLECTIVE_RE.test(text)) {
    reasons.push('reflective');
    return { class: 'REFLECTIVE', confidence: 0.75, features, failUpward: false, reasons };
  }

  if (features.isInterrogative && !features.hasFirstPersonVerb) {
    reasons.push('interrogative');
    return { class: 'NO_LORE', confidence: 0.88, features, failUpward: false, reasons };
  }

  if (features.namedEntityCount >= 4) {
    reasons.push('entity_heavy');
    return { class: 'AMBIGUOUS', confidence: 0.6, features, failUpward: true, reasons };
  }

  const structurallySimple =
    features.wordCount <= 28 &&
    features.sentenceCount <= 2 &&
    features.conjunctionCount <= 1 &&
    features.temporalMarkerCount <= 1 &&
    !features.hasListStructure &&
    !features.hasChronologyAmbiguity;

  if (structurallySimple && features.hasFirstPersonVerb) {
    reasons.push('simple_first_person_event');
    return { class: 'SIMPLE_EVENT', confidence: 0.9, features, failUpward: false, reasons };
  }

  if (structurallySimple && features.namedEntityCount >= 1 && features.wordCount <= 12) {
    reasons.push('entity_mention');
    return { class: 'ENTITY_MENTION', confidence: 0.8, features, failUpward: false, reasons };
  }

  if (structurallySimple && features.hasFirstPersonVerb === false && features.wordCount <= 20) {
    reasons.push('simple_fact');
    return { class: 'SIMPLE_FACT', confidence: 0.72, features, failUpward: false, reasons };
  }

  if (features.wordCount > 60 || features.sentenceCount > 4 || features.namedEntityCount > 6) {
    reasons.push('long_or_dense');
    return { class: 'AMBIGUOUS', confidence: 0.55, features, failUpward: true, reasons };
  }

  reasons.push('uncertain');
  return { class: 'AMBIGUOUS', confidence: 0.5, features, failUpward: true, reasons };
}

export function shouldBypassMultiEventSplit(decision: MessageComplexityDecision): boolean {
  if (decision.failUpward) return false;
  return (
    decision.class === 'SIMPLE_EVENT' ||
    decision.class === 'SIMPLE_FACT' ||
    decision.class === 'ENTITY_MENTION' ||
    decision.class === 'NO_LORE'
  );
}

export function shouldUseCheapIngestion(decision: MessageComplexityDecision): boolean {
  if (decision.failUpward) return false;
  return (
    decision.class === 'SIMPLE_EVENT' ||
    decision.class === 'SIMPLE_FACT' ||
    decision.class === 'ENTITY_MENTION' ||
    decision.class === 'NO_LORE'
  );
}

export function isSimpleWorkingMemoryTurn(decision: MessageComplexityDecision): boolean {
  return shouldUseCheapIngestion(decision) || decision.class === 'NO_LORE';
}
