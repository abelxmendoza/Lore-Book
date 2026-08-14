import { createHash } from 'crypto';

import type {
  StitchAttachmentTarget,
  TimelineTemporalRelation,
  TemporalRelationType,
} from './timelineStitchingTypes';

const RELATION_PATTERNS: Array<{
  pattern: RegExp;
  relations: TemporalRelationType[];
  confidence: number;
}> = [
  { pattern: /\b(?:ended|finished|stopped)\s+(?:right|shortly|just)\s+before\b/i, relations: ['BEFORE', 'ENDS_NEAR'], confidence: 0.9 },
  { pattern: /\b(?:right|shortly|just)\s+before\b/i, relations: ['BEFORE', 'STARTS_NEAR'], confidence: 0.9 },
  { pattern: /\bbefore\b/i, relations: ['BEFORE'], confidence: 0.82 },
  { pattern: /\b(?:right|shortly|just)\s+after\b/i, relations: ['AFTER', 'STARTS_NEAR'], confidence: 0.9 },
  { pattern: /\bafter\b/i, relations: ['AFTER'], confidence: 0.82 },
  { pattern: /\b(?:at|around)\s+the\s+same\s+time\b/i, relations: ['SAME_PERIOD_AS'], confidence: 0.84 },
  { pattern: /\b(?:same\s+period\s+as)\b/i, relations: ['SAME_PERIOD_AS'], confidence: 0.84 },
  { pattern: /\bduring\b/i, relations: ['DURING'], confidence: 0.8 },
  { pattern: /\bwhile\b/i, relations: ['OVERLAPS'], confidence: 0.78 },
];

function candidatePosition(text: string, candidate: StitchAttachmentTarget): number {
  const lowerText = text.toLowerCase();
  const lowerLabel = candidate.attachedToLabel.toLowerCase();
  const exact = lowerText.indexOf(lowerLabel);
  if (exact >= 0) return exact;
  const parts = lowerLabel.split(/\s+|\//).filter((part) => part.length >= 4);
  return parts
    .map((part) => lowerText.indexOf(part))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
}

function relationId(
  userId: string,
  source: StitchAttachmentTarget,
  target: StitchAttachmentTarget,
  relation: TemporalRelationType,
): string {
  return createHash('sha256')
    .update(`${userId}|${source.attachedToId ?? source.attachedToLabel}|${relation}|${target.attachedToId ?? target.attachedToLabel}`.toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

export function extractTemporalRelations(input: {
  text: string;
  userId: string;
  sourceMessageId: string;
  sourceThreadId?: string;
  conversationTime?: string;
  knowledgeTime?: string;
  candidates: StitchAttachmentTarget[];
}): TimelineTemporalRelation[] {
  const positioned = input.candidates
    .map((candidate) => ({ candidate, position: candidatePosition(input.text, candidate) }))
    .filter(({ position }) => position >= 0);
  const output: TimelineTemporalRelation[] = [];

  for (const rule of RELATION_PATTERNS) {
    const match = rule.pattern.exec(input.text);
    if (!match || match.index == null) continue;
    const before = positioned
      .filter(({ position }) => position < match.index)
      .sort((a, b) => b.position - a.position)[0];
    const after = positioned
      .filter(({ position }) => position > match.index)
      .sort((a, b) => a.position - b.position)[0];
    if (!before || !after || before.candidate.attachedToLabel === after.candidate.attachedToLabel) continue;

    for (const relation of rule.relations) {
      output.push({
        id: relationId(input.userId, before.candidate, after.candidate, relation),
        userId: input.userId,
        source: before.candidate,
        target: after.candidate,
        relation,
        confidence: Math.min(rule.confidence, before.candidate.confidence, after.candidate.confidence),
        evidencePhrase: input.text.slice(0, 500),
        sourceMessageId: input.sourceMessageId,
        sourceMessageIds: [input.sourceMessageId],
        sourceThreadIds: input.sourceThreadId ? [input.sourceThreadId] : [],
        sourceAssertionIds: [],
        conversationTime: input.conversationTime,
        knowledgeTime: input.knowledgeTime ?? input.conversationTime ?? new Date().toISOString(),
        inferredNotConfirmed: true,
      });
    }
    break;
  }

  return output;
}
