import type { TruthClaimOrigin } from './truthStateTypes';

/** Authority order — higher rank wins in conflict resolution. */
export const TRUTH_AUTHORITY_RANK: Record<TruthClaimOrigin, number> = {
  manual_edit: 9,
  user_corrected: 8,
  user_confirmed: 7,
  explicit_user: 6,
  implicit_user: 5,
  system_inferred: 4,
  assistant_generated: 2,
};

export function originOutranks(a: TruthClaimOrigin, b: TruthClaimOrigin): boolean {
  return TRUTH_AUTHORITY_RANK[a] > TRUTH_AUTHORITY_RANK[b];
}

export function highestAuthority(origins: TruthClaimOrigin[]): TruthClaimOrigin {
  return origins.reduce((best, current) =>
    TRUTH_AUTHORITY_RANK[current] > TRUTH_AUTHORITY_RANK[best] ? current : best,
  );
}

export function canOverride(
  incoming: TruthClaimOrigin,
  existing: TruthClaimOrigin,
): boolean {
  return originOutranks(incoming, existing);
}

export function assistantCanCanonize(_origin: TruthClaimOrigin): boolean {
  return false;
}

export function correctionOutranksInference(
  incoming: TruthClaimOrigin,
  existing: TruthClaimOrigin,
): boolean {
  return (
    (incoming === 'user_corrected' || incoming === 'manual_edit') &&
    (existing === 'system_inferred' || existing === 'assistant_generated' || existing === 'implicit_user')
  );
}
