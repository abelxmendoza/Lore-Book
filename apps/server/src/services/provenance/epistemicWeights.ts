export type TruthState =
  | 'CANONICAL'
  | 'CONTEXTUAL'
  | 'REVISED'
  | 'DISPUTED'
  | 'INFERRED'
  | 'PENDING_VERIFICATION';

/** Epistemic multiplier for retrieval ranking. DISPUTED ranks below CANONICAL. */
export function truthStateWeight(state?: string | null): number {
  switch (state) {
    case 'CANONICAL': return 1;
    case 'CONTEXTUAL': return 0.85;
    case 'INFERRED': return 0.7;
    case 'PENDING_VERIFICATION': return 0.6;
    case 'DISPUTED': return 0.35;
    case 'REVISED': return 0.2;
    default: return 0.6;
  }
}
