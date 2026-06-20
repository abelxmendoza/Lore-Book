import type { LexicalIntelligenceSpan, RawSpanCandidate } from './lexicalIntelligenceTypes';
import {
  evaluateTitleOnlyPersonGuard,
  isMinimumPersonEntity,
  type PersonReferenceType,
} from './titleOnlyEntityGuard';

const GUARDED_SOURCE_TYPES = new Set(['PERSON', 'ROLE']);

function reclassifyAsReference(
  span: LexicalIntelligenceSpan,
  referenceType: PersonReferenceType,
  rule: string
): LexicalIntelligenceSpan {
  return {
    ...span,
    type: referenceType,
    needsReview: true,
    needsResolution: true,
    status: 'needs_review',
    rulesFired: [...(span.rulesFired ?? []), rule],
    colorKey: 'person_reference',
    confidence: Math.min(span.confidence, 0.72),
  };
}

/** Apply title-only guard to a finalized intelligence span. O(1) per span. */
export function applyTitleOnlyGuardToSpan(
  span: LexicalIntelligenceSpan,
  options: { canonMatch?: boolean } = {}
): LexicalIntelligenceSpan {
  if (!GUARDED_SOURCE_TYPES.has(span.type)) return span;

  const guard = evaluateTitleOnlyPersonGuard(span.text);
  if (guard.isTitleOnly && guard.referenceType) {
    return reclassifyAsReference(span, guard.referenceType, 'title_only_entity_guard');
  }

  if (span.type === 'PERSON' && !isMinimumPersonEntity(span.text, options)) {
    return reclassifyAsReference(span, 'UNRESOLVED_PERSON_REFERENCE', 'minimum_person_entity_guard');
  }

  return span;
}

/** Apply guard before overlap merge — converts PERSON/ROLE candidates. */
export function applyTitleOnlyGuardToCandidate(candidate: RawSpanCandidate): RawSpanCandidate {
  if (!GUARDED_SOURCE_TYPES.has(candidate.type)) return candidate;

  const guard = evaluateTitleOnlyPersonGuard(candidate.text);
  if (guard.isTitleOnly && guard.referenceType) {
    return {
      ...candidate,
      type: guard.referenceType,
      needsReview: true,
      baseConfidence: Math.min(candidate.baseConfidence, 0.72),
      evidencePhrases: [...candidate.evidencePhrases, 'title_only_entity_guard'],
    };
  }

  if (candidate.type === 'PERSON' && !isMinimumPersonEntity(candidate.text)) {
    return {
      ...candidate,
      type: 'UNRESOLVED_PERSON_REFERENCE',
      needsReview: true,
      baseConfidence: Math.min(candidate.baseConfidence, 0.68),
      evidencePhrases: [...candidate.evidencePhrases, 'minimum_person_entity_guard'],
    };
  }

  return candidate;
}

export function applyTitleOnlyGuardToSpans(
  spans: LexicalIntelligenceSpan[]
): LexicalIntelligenceSpan[] {
  return spans.map((s) => applyTitleOnlyGuardToSpan(s));
}
