import type { PlaceDiagnosticTrace, PlaceEligibilityResult, PlaceEntityKind, PlaceDecision, PlaceMentionContext, PlaceVisitInference } from './placeTypes';

export function buildPlaceDiagnostics(input: {
  originalSpan: string;
  canonicalTitle: string;
  entityKind: PlaceEntityKind;
  decision: PlaceDecision;
  subtype?: string;
  mentionContext: PlaceMentionContext;
  visitInference: PlaceVisitInference;
  eligibility: PlaceEligibilityResult;
  description?: string;
  reasonsAccepted: string[];
  reasonsRejected: string[];
  rulesFired: string[];
  confidence: number;
}): PlaceDiagnosticTrace {
  return { ...input };
}

export function formatPlaceDiagnostics(trace: PlaceDiagnosticTrace): string {
  return [
    `Original Span: ${trace.originalSpan}`,
    `Canonical Title: ${trace.canonicalTitle}`,
    `Entity Type: ${trace.entityKind}`,
    `Decision: ${trace.decision}`,
    `Subtype: ${trace.subtype ?? '—'}`,
    `Mention Context: ${trace.mentionContext}`,
    `Visit Inference: visit=${trace.visitInference.visitCount} mention=${trace.visitInference.mentionCount}`,
    `Confidence: ${Math.round(trace.confidence * 100)}%`,
    `Accepted: ${trace.reasonsAccepted.join(', ') || '—'}`,
    `Rejected: ${trace.reasonsRejected.join(', ') || '—'}`,
    `Rules: ${trace.rulesFired.join(', ') || '—'}`,
  ].join('\n');
}
