/**
 * Identity lifecycle — which people deserve a place in someone's biography.
 *
 * Mention → Candidate → Resolved Identity → Character → Core Character
 *
 * Most mentions never leave the first stages.
 */

export type IdentityStage =
  | 'MENTION'
  | 'CANDIDATE'
  | 'RESOLVED'
  | 'CHARACTER'
  | 'CORE_CHARACTER';

export type IdentityScoreSignals = {
  /** Total mention events across messages. */
  mentionCount: number;
  /** Distinct conversation/thread count. */
  conversationCount: number;
  /** Days between first and last seen (0 if unknown). */
  timeSpanDays: number;
  /** Days since last seen (for demotion). */
  daysSinceLastSeen?: number;
  /** 0–1 model/extractor confidence. */
  baseConfidence?: number;
  /** Explicit proper name / RESOLVED mention. */
  namedExplicitly?: boolean;
  /** User confirmed identity ("her name was Jamie"). */
  userConfirmed?: boolean;
  /** Emotional / relationship weight 0–1 from evidence. */
  emotionalWeight?: number;
  /** Relationship strength hint 0–1 (partner, family, close friend). */
  relationshipStrength?: number;
  /** Narrative importance hint 0–1. */
  narrativeImportance?: number;
  /** Future references / follow-ups observed. */
  futureReferences?: number;
};

export type IdentityScoreBreakdown = {
  frequency: number;
  conversations: number;
  timeSpan: number;
  naming: number;
  relationship: number;
  emotional: number;
  narrative: number;
  futureRefs: number;
  total: number;
};

export type IdentityLifecycleDecision = {
  stage: IdentityStage;
  /** 0–100 identity confidence for UI. */
  identityConfidence: number;
  score: IdentityScoreBreakdown;
  /** May create/update a Character Book card. */
  mayPromoteToCharacter: boolean;
  /** Candidate should be archived / hidden from Cast. */
  shouldArchive: boolean;
  reasons: string[];
  /** Human-readable promotion log line. */
  promotionLog: string;
};

/** Score thresholds (0–100). */
export const IDENTITY_THRESHOLDS = {
  /** Below this: remain ephemeral mention. */
  candidate: 25,
  /** Named or strongly evidenced unresolved → resolved identity. */
  resolved: 45,
  /** May become Character Book card. */
  character: 55,
  /** Core character (richer modeling). */
  core: 80,
  /** Archive stale candidates after this many days idle. */
  archiveIdleDays: 180,
} as const;
