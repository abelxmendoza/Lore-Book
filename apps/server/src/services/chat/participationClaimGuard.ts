export type ParticipationState = {
  desire: boolean | null;
  attendance: boolean | null;
  performance: boolean | null;
};

/**
 * Conservative event-participation parsing. Mentions and desire never promote
 * attendance or performance; explicit negation wins within the same message.
 */
export function detectParticipationState(text: string): ParticipationState {
  const desire = /\b(?:want|hope|would like|wish|thinking about)\b[^.!?\n]{0,50}\b(?:go|attend|perform|play)\b/i.test(text)
    ? true
    : null;
  const attendanceNegative =
    /\b(?:will|would|did|do|am|was|were|can|could)\s+not\s+(?:go|attend)\b|\bwon't\s+(?:go|attend)\b|\bnot\s+attending\b/i.test(text);
  const attendancePositive =
    /\b(?:i|we)\s+(?:will|did|am going to|went to|attended)\b[^.!?\n]{0,30}\b(?:attend|go to)?\b/i.test(text);
  const performanceNegative =
    /\b(?:will|would|did|do|am|was|were|can|could)\s+not\s+(?:perform|play)\b|\bwon't\s+(?:perform|play)\b|\bnot\s+performing\b|\bnot\s+(?:attend|go)[^.!?\n]{0,20}\bor\s+(?:perform|play)\b/i.test(text);
  const performancePositive =
    /\b(?:i|we)\s+(?:will|did|am going to)\s+(?:perform|play)\b|\b(?:i|we)\s+performed\b/i.test(text);

  return {
    desire,
    attendance: attendanceNegative ? false : attendancePositive ? true : null,
    performance: performanceNegative ? false : performancePositive ? true : null,
  };
}

export const PARTICIPATION_EVIDENCE_RULES = [
  'Interest in an event does not prove attendance.',
  'Attendance does not prove performance.',
  'Creative identity does not prove event participation.',
  'A future event mention does not prove confirmed plans.',
  'Explicit non-attendance or non-performance overrides weaker positive inference.',
].join('\n- ');
