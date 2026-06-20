/** Unified epistemic certainty states across all cognition layers. */
export type EpistemicState =
  | 'UNKNOWN'
  | 'POSSIBLE'
  | 'LIKELY'
  | 'VERIFIED'
  | 'CONTRADICTED'
  | 'DEPRECATED';

export type LegacyTruthState =
  | 'CANONICAL'
  | 'CONTEXTUAL'
  | 'REVISED'
  | 'DISPUTED'
  | 'INFERRED'
  | 'PENDING_VERIFICATION';

export type NarrativeClaimStatus = 'active' | 'superseded' | 'disputed' | 'archived';

const EPISTEMIC_RANK: Record<EpistemicState, number> = {
  UNKNOWN: 0,
  POSSIBLE: 1,
  LIKELY: 2,
  VERIFIED: 3,
  CONTRADICTED: 2,
  DEPRECATED: -1,
};

export function confidenceToEpistemicState(confidence: number): EpistemicState {
  if (confidence >= 0.85) return 'LIKELY';
  if (confidence >= 0.55) return 'POSSIBLE';
  return 'UNKNOWN';
}

export function epistemicStateFromConfidence(
  confidence: number,
  options?: { userVerified?: boolean; contradicted?: boolean; deprecated?: boolean },
): EpistemicState {
  if (options?.deprecated) return 'DEPRECATED';
  if (options?.contradicted) return 'CONTRADICTED';
  if (options?.userVerified) return 'VERIFIED';
  if (confidence >= 0.88) return 'VERIFIED';
  if (confidence >= 0.65) return 'LIKELY';
  if (confidence >= 0.4) return 'POSSIBLE';
  return 'UNKNOWN';
}

export function mapTruthStateToEpistemic(truthState: LegacyTruthState | string | null | undefined): EpistemicState {
  switch (truthState) {
    case 'CANONICAL':
      return 'VERIFIED';
    case 'DISPUTED':
      return 'CONTRADICTED';
    case 'REVISED':
      return 'DEPRECATED';
    case 'INFERRED':
      return 'LIKELY';
    case 'PENDING_VERIFICATION':
      return 'POSSIBLE';
    case 'CONTEXTUAL':
      return 'LIKELY';
    default:
      return 'UNKNOWN';
  }
}

export function mapNarrativeStatusToEpistemic(status: NarrativeClaimStatus | string): EpistemicState {
  switch (status) {
    case 'disputed':
      return 'CONTRADICTED';
    case 'superseded':
    case 'archived':
      return 'DEPRECATED';
    case 'active':
    default:
      return 'LIKELY';
  }
}

export function canPromoteTo(from: EpistemicState, to: EpistemicState): boolean {
  if (from === 'CONTRADICTED' && to === 'LIKELY') return true;
  if (from === 'DEPRECATED') return false;
  return EPISTEMIC_RANK[to] >= EPISTEMIC_RANK[from];
}

export function epistemicRetrievalWeight(state: EpistemicState): number {
  switch (state) {
    case 'VERIFIED':
      return 1.0;
    case 'LIKELY':
      return 0.85;
    case 'POSSIBLE':
      return 0.6;
    case 'CONTRADICTED':
      return 0.35;
    case 'DEPRECATED':
      return 0.1;
    default:
      return 0.45;
  }
}
