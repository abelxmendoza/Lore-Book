import type {
  HistoricalInterpretationRecord,
  HistoricalInterpretationTimeline,
  InterpretationCandidate,
  InterpretationKind,
} from './historicalInterpretationTypes';

const REFLECTION_CUE = /\b(?:looking back|at the time|back then|i used to (?:think|believe|feel)|i (?:now|later) (?:think|believe|feel|see|understand|realize)|now i (?:think|believe|feel|see|understand|realize)|i learned|lesson (?:was|is)|in hindsight|it became|i came to (?:see|understand|realize)|my view (?:changed|shifted))\b/i;

function kindFor(text: string): InterpretationKind {
  if (/\b(?:i learned|lesson|takeaway|taught me)\b/i.test(text)) return 'LESSON';
  if (/\b(?:now i feel|i now feel|at the time i felt|emotion|acceptance|anger|sadness|relief)\b/i.test(text)) return 'EMOTION';
  if (/\b(?:who i am|became|identity|kind of person|defined me|founder|artist|engineer)\b/i.test(text)) return 'IDENTITY_REFRAME';
  return 'MEANING';
}

function whyChangedFor(text: string): string {
  if (/\b(?:new evidence|learned more|found out|later discovered)\b/i.test(text)) return 'New supporting evidence changed the interpretation.';
  if (/\b(?:looking back|in hindsight|now i|i now|later)\b/i.test(text)) return 'Later reflection changed how the event is understood.';
  return 'The user explicitly reflected on the meaning of the event.';
}

/** Ordinary event-chat detail is not automatically treated as interpretation. */
export function detectHistoricalInterpretationCandidate(text: string): InterpretationCandidate | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length < 12 || !REFLECTION_CUE.test(normalized)) return null;
  const cueCount = [REFLECTION_CUE, /\b(?:changed|shifted|realized|learned|understand|meaning|turning point)\b/i]
    .filter((pattern) => pattern.test(normalized)).length;
  return {
    interpretation: normalized,
    kind: kindFor(normalized),
    confidence: Math.min(0.98, 0.82 + cueCount * 0.06),
    whyChanged: whyChangedFor(normalized),
  };
}

export function projectHistoricalInterpretationTimeline(
  eventRecordId: string,
  records: HistoricalInterpretationRecord[],
): HistoricalInterpretationTimeline {
  const interpretations = [...records]
    .filter((record) => record.eventRecordId === eventRecordId && record.status !== 'REJECTED')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const canonical = interpretations.filter((record) => record.status === 'CANONICAL').at(-1) ?? null;
  const latestUserProposal = interpretations.filter((record) => record.author === 'USER' && record.status === 'PROPOSED').at(-1) ?? null;
  const currentUnderstanding = canonical ?? latestUserProposal;
  return {
    eventRecordId,
    historicalFactImmutable: true,
    interpretations,
    currentUnderstanding,
    alternativeInterpretations: interpretations.filter((record) => record.id !== currentUnderstanding?.id && record.status !== 'SUPERSEDED'),
  };
}
