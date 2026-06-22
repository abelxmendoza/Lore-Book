import type { RelationshipInferenceContext } from './relationshipInferenceTypes';

export function extractEvidencePhrases(text: string, span: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function buildRelationshipContext(
  text: string,
  evidence: string,
  partial: RelationshipInferenceContext = {},
): RelationshipInferenceContext {
  return {
    ...partial,
    eventContext: partial.eventContext ?? text.match(/\b(?:Ska Prom|meetup|party|show|concert)\b/i)?.[0],
    placeContext: partial.placeContext ?? text.match(/\b(?:at|in|from)\s+[^.!?]+/i)?.[0]?.slice(0, 80),
    groupContext: partial.groupContext ?? text.match(/\b(?:football team|band|club|class)\b/i)?.[0],
    organizationContext: partial.organizationContext ?? text.match(/\b(?:Vanguard Robotics|Amazon|Antler)\b/i)?.[0],
    timeContext: partial.timeContext ?? text.match(/\b(?:yesterday|last\s+\w+|used\s+to|haven'?t\s+seen\s+since)\b/i)?.[0],
    emotionalContext: partial.emotionalContext ?? text.match(/\b(?:ghosted|blocked|fight|beef|crush|love)\b/i)?.[0],
  };
}

export function hasProvenance(candidate: {
  sourceMessageIds: string[];
  evidencePhrases: string[];
  subject: { displayName: string };
  object: { displayName: string };
}): boolean {
  return (
    candidate.sourceMessageIds.length > 0 &&
    candidate.evidencePhrases.length > 0 &&
    Boolean(candidate.subject.displayName) &&
    Boolean(candidate.object.displayName)
  );
}
