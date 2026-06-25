export type PromotionDomain = 'person' | 'pet' | 'place' | 'organization' | 'group' | 'thing' | 'project';
export type PromotionStage = 'ignore' | 'track' | 'growing' | 'suggest' | 'confirmed';

export type EntityPromotionCandidate = {
  name: string;
  domain: PromotionDomain;
  mentionCount: number;
  documentCount?: number;
  confidence?: number;
  emotionalWeight?: number;
  entityConnectionScore?: number;
  userActionScore?: number;
  hasPossessiveCue?: boolean;
  hasProjectCue?: boolean;
  hasConfirmedEntityConnection?: boolean;
  isGeneric?: boolean;
};

export type EntityPromotionResult = {
  stage: PromotionStage;
  score: number;
  reasons: string[];
  constraintsFailed: string[];
};

type EntityPromotionPolicy = {
  minMentionsToTrack: number;
  minMentionsToChip: number;
  minDocumentsToChip: number;
  minScoreToSuggest: number;
  maxSuggestionsPerMessage: number;
  requiresUserConfirmation: boolean;
};

export const ENTITY_PROMOTION_POLICIES: Record<PromotionDomain, EntityPromotionPolicy> = {
  person: {
    minMentionsToTrack: 1,
    minMentionsToChip: 1,
    minDocumentsToChip: 1,
    minScoreToSuggest: 0.55,
    maxSuggestionsPerMessage: 5,
    requiresUserConfirmation: true,
  },
  pet: {
    minMentionsToTrack: 1,
    minMentionsToChip: 1,
    minDocumentsToChip: 1,
    minScoreToSuggest: 0.3,
    maxSuggestionsPerMessage: 3,
    requiresUserConfirmation: true,
  },
  place: {
    minMentionsToTrack: 1,
    minMentionsToChip: 2,
    minDocumentsToChip: 1,
    minScoreToSuggest: 0.6,
    maxSuggestionsPerMessage: 4,
    requiresUserConfirmation: true,
  },
  organization: {
    minMentionsToTrack: 1,
    minMentionsToChip: 2,
    minDocumentsToChip: 1,
    minScoreToSuggest: 0.65,
    maxSuggestionsPerMessage: 4,
    requiresUserConfirmation: true,
  },
  group: {
    minMentionsToTrack: 1,
    minMentionsToChip: 2,
    minDocumentsToChip: 1,
    minScoreToSuggest: 0.62,
    maxSuggestionsPerMessage: 4,
    requiresUserConfirmation: true,
  },
  project: {
    minMentionsToTrack: 1,
    minMentionsToChip: 2,
    minDocumentsToChip: 1,
    minScoreToSuggest: 0.45,
    maxSuggestionsPerMessage: 3,
    requiresUserConfirmation: true,
  },
  thing: {
    minMentionsToTrack: 2,
    minMentionsToChip: 5,
    minDocumentsToChip: 2,
    minScoreToSuggest: 0.7,
    maxSuggestionsPerMessage: 2,
    requiresUserConfirmation: true,
  },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scorePromotionCandidate(candidate: EntityPromotionCandidate): number {
  const mentionScore = clamp01(candidate.mentionCount / 8);
  const documentSpreadScore = clamp01((candidate.documentCount ?? 1) / 4);
  const confidenceScore = clamp01(candidate.confidence ?? 0.55);
  const cueBoost = candidate.hasPossessiveCue || candidate.hasProjectCue ? 0.18 : 0;
  const connectionScore = clamp01(
    candidate.entityConnectionScore ?? (candidate.hasConfirmedEntityConnection ? 0.75 : 0)
  );

  return clamp01(
    mentionScore * 0.3 +
      documentSpreadScore * 0.2 +
      confidenceScore * 0.15 +
      clamp01(candidate.emotionalWeight ?? 0) * 0.15 +
      connectionScore * 0.12 +
      clamp01(candidate.userActionScore ?? 0) * 0.08 +
      cueBoost
  );
}

export function evaluateEntityPromotion(candidate: EntityPromotionCandidate): EntityPromotionResult {
  const policy = ENTITY_PROMOTION_POLICIES[candidate.domain];
  const score = scorePromotionCandidate(candidate);
  const reasons: string[] = [];
  const constraintsFailed: string[] = [];
  const documentCount = candidate.documentCount ?? 1;

  if (candidate.isGeneric) constraintsFailed.push('generic term');
  if (candidate.mentionCount < policy.minMentionsToTrack) constraintsFailed.push('too few mentions to track');

  if (candidate.mentionCount >= policy.minMentionsToTrack) {
    reasons.push(`${candidate.mentionCount} mention${candidate.mentionCount === 1 ? '' : 's'}`);
  }
  if (documentCount > 1) reasons.push(`${documentCount} sources`);
  if (candidate.hasPossessiveCue) reasons.push('owned or personal object cue');
  if (candidate.hasProjectCue) reasons.push('project cue');
  if (candidate.hasConfirmedEntityConnection) reasons.push('connected to known context');

  if (constraintsFailed.length > 0) {
    return { stage: 'ignore', score, reasons, constraintsFailed };
  }

  const chipReady =
    candidate.mentionCount >= policy.minMentionsToChip ||
    (candidate.domain === 'thing' && candidate.hasPossessiveCue && candidate.mentionCount >= 1) ||
    (candidate.domain === 'project' && candidate.hasProjectCue);

  if (!chipReady) return { stage: 'track', score, reasons, constraintsFailed };

  if (
    score >= policy.minScoreToSuggest &&
    documentCount >= policy.minDocumentsToChip &&
    (candidate.domain !== 'thing' || candidate.hasConfirmedEntityConnection || candidate.hasPossessiveCue)
  ) {
    return { stage: 'suggest', score, reasons, constraintsFailed };
  }

  return { stage: 'growing', score, reasons, constraintsFailed };
}
