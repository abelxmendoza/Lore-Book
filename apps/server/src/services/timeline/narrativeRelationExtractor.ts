import { createHash } from 'crypto';

import type {
  NarrativeRelationType,
  StitchAttachmentTarget,
  TimelineNarrativeRelation,
} from './timelineStitchingTypes';

type NarrativeMatch = {
  sourceLabel: string;
  targetLabel: string;
  relation: NarrativeRelationType;
  confidence: number;
};

const PATTERNS: Array<{ pattern: RegExp; relation: NarrativeRelationType; confidence: number }> = [
  { pattern: /(?:i\s+)?(?:consider|think of|see)\s+(.{2,100}?)\s+(?:as\s+)?(?:the\s+)?(?:real|true)\s+(?:beginning|start)\s+of\s+(.{2,120})/i, relation: 'CONSIDERED_BEGINNING_OF', confidence: 0.96 },
  { pattern: /(.{2,100}?)\s+(?:was|is)\s+(?:the\s+)?(?:real|true)\s+(?:beginning|start)\s+of\s+(.{2,120})/i, relation: 'CONSIDERED_BEGINNING_OF', confidence: 0.92 },
  { pattern: /(.{2,100}?)\s+(?:was|is|became)\s+(?:a|the)\s+turning point in\s+(.{2,120})/i, relation: 'TURNING_POINT_IN', confidence: 0.9 },
  { pattern: /(.{2,100}?)\s+(?:marked|was)\s+(?:the\s+)?end of (?:that\s+|the\s+)?chapter(?:\s+(?:of|in)\s+(.{2,120}))?/i, relation: 'END_OF_CHAPTER', confidence: 0.88 },
  { pattern: /(.{2,100}?)\s+(?:defined|was the defining period of)\s+(.{2,120})/i, relation: 'DEFINING_PERIOD_OF', confidence: 0.86 },
  { pattern: /(.{2,100}?)\s+(?:brought|led|pulled)\s+(?:me|us)\s+back to\s+(.{2,120})/i, relation: 'RETURN_TO', confidence: 0.9 },
  { pattern: /(.{2,100}?)\s+(?:was|marked)\s+(?:a|the)\s+restart of\s+(.{2,120})/i, relation: 'RESTART_OF', confidence: 0.88 },
];

function cleanLabel(value: string | undefined): string {
  return String(value ?? '')
    .replace(/[.!?]+$/g, '')
    .replace(/^(?:and|but|then)\s+/i, '')
    .trim();
}

function findCandidate(label: string, candidates: StitchAttachmentTarget[]): StitchAttachmentTarget | undefined {
  const key = label.toLowerCase();
  return candidates.find((candidate) => {
    const candidateKey = candidate.attachedToLabel.toLowerCase();
    return key.includes(candidateKey) || candidateKey.includes(key);
  });
}

function relationId(userId: string, source: StitchAttachmentTarget, relation: NarrativeRelationType, target: StitchAttachmentTarget): string {
  return createHash('sha256')
    .update(`${userId}|${source.attachedToId ?? source.attachedToLabel}|${relation}|${target.attachedToId ?? target.attachedToLabel}`.toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

function matchNarrativeRelation(text: string): NarrativeMatch | null {
  for (const rule of PATTERNS) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    const sourceLabel = cleanLabel(match[1]);
    const targetLabel = cleanLabel(match[2]) || 'this life chapter';
    if (!sourceLabel || !targetLabel) continue;
    return { sourceLabel, targetLabel, relation: rule.relation, confidence: rule.confidence };
  }
  return null;
}

export function extractNarrativeRelations(input: {
  text: string;
  userId: string;
  sourceMessageId: string;
  sourceThreadId?: string;
  conversationTime?: string;
  knowledgeTime?: string;
  candidates: StitchAttachmentTarget[];
}): TimelineNarrativeRelation[] {
  // Recall questions consume canonical meaning; they do not create it again.
  if (/\?\s*$/.test(input.text.trim())) return [];
  const match = matchNarrativeRelation(input.text);
  if (!match) return [];

  const source = findCandidate(match.sourceLabel, input.candidates) ?? {
    attachedToType: 'narrative_anchor' as const,
    attachedToLabel: match.sourceLabel,
    confidence: match.confidence,
  };
  const target = findCandidate(match.targetLabel, input.candidates) ?? {
    attachedToType: 'narrative_anchor' as const,
    attachedToLabel: match.targetLabel,
    confidence: match.confidence,
  };
  const knowledgeTime = input.knowledgeTime ?? input.conversationTime ?? new Date().toISOString();

  return [{
    id: relationId(input.userId, source, match.relation, target),
    userId: input.userId,
    source,
    target,
    relation: match.relation,
    confidence: Math.min(match.confidence, source.confidence, target.confidence),
    evidencePhrase: input.text.slice(0, 500),
    sourceMessageId: input.sourceMessageId,
    sourceMessageIds: [input.sourceMessageId],
    sourceThreadIds: input.sourceThreadId ? [input.sourceThreadId] : [],
    sourceAssertionIds: [],
    conversationTime: input.conversationTime,
    knowledgeTime,
    inferredNotConfirmed: true,
  }];
}
