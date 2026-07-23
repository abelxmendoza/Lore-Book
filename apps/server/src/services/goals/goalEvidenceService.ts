import type { GoalEvidence, GoalSourceType } from './goalTypes';

export function buildSupportingGoalEvidence(input: {
  text: string;
  sourceMessageId?: string;
  sourceType: GoalSourceType;
  observedAt: Date;
}): GoalEvidence {
  return {
    text: input.text.trim(),
    sourceMessageId: input.sourceMessageId,
    sourceType: input.sourceType,
    observedAt: input.observedAt,
    stance: 'SUPPORTS',
  };
}

export function explainGoalEvidence(text: string, kind: string): string {
  const quote = text.trim().slice(0, 220);
  return `You said, “${quote}” This was classified as ${kind.toLowerCase().replace(/_/g, ' ')}.`;
}
