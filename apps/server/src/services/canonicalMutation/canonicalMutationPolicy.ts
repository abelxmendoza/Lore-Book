import type {
  CanonicalMutationEnvelope,
  MutationApprovalPolicy,
} from './canonicalMutationTypes';

export type PolicyResolution = { policy: MutationApprovalPolicy; reason: string };

/**
 * Versioned authority matrix. Confidence never grants write authority: the
 * source, target category, field, and mutation intent determine the policy.
 */
export function resolveCanonicalMutationPolicy(envelope: CanonicalMutationEnvelope): PolicyResolution {
  if (envelope.actorId !== envelope.userId) {
    return { policy: 'FORBIDDEN', reason: 'Actor does not own the canonical target.' };
  }
  if (envelope.requestorProjection !== envelope.target.ownerProjection) {
    return { policy: 'FORBIDDEN', reason: 'Cross-projection writes are forbidden; request invalidation instead.' };
  }
  if (envelope.evidence.length === 0) {
    return { policy: 'FORBIDDEN', reason: 'Canonical mutations require provenance evidence.' };
  }
  if (envelope.category === 'EVIDENCE' && !['CONFIRM', 'REJECT'].includes(envelope.intent)) {
    return { policy: 'MANUAL_ONLY', reason: 'Evidence is immutable; corrections append or challenge evidence instead.' };
  }
  if (envelope.category === 'IDENTITY' && envelope.authority === 'SYSTEM_DERIVED') {
    return { policy: 'FORBIDDEN', reason: 'Derived identity may update a projection but cannot become canonical directly.' };
  }
  if (envelope.category === 'NARRATIVE' && envelope.intent === 'CONFIRM' && envelope.authority === 'USER_CONFIRMED') {
    return { policy: 'AUTOMATIC', reason: 'Only the user can canonize their personal interpretation.' };
  }
  if (envelope.category === 'RELATIONSHIP') {
    return envelope.authority === 'USER_CONFIRMED'
      ? { policy: 'REVIEW', reason: 'Relationship state is user-confirmed and reviewable before canon changes.' }
      : { policy: 'CONFIRMATION', reason: 'Relationship state requires explicit user confirmation.' };
  }
  if (envelope.category === 'PROFILE' && /(?:employment|birth|legal)/i.test(envelope.target.field)) {
    return /birth|legal/i.test(envelope.target.field)
      ? { policy: 'MANUAL_ONLY', reason: 'Legal and birth identity fields are manual-only.' }
      : { policy: 'CONFIRMATION', reason: 'Employment history requires explicit confirmation.' };
  }
  if (
    envelope.category === 'CURRENT_FOCUS'
    && envelope.authority === 'USER_EXPLICIT'
    && envelope.risk === 'LOW'
  ) {
    return { policy: 'AUTOMATIC', reason: 'Explicit current focus is low-risk, reversible living state.' };
  }
  if (
    envelope.category === 'PROJECT'
    && envelope.target.field === 'status'
    && envelope.authority === 'USER_EXPLICIT'
    && envelope.risk === 'LOW'
  ) {
    return { policy: 'AUTOMATIC', reason: 'The user explicitly changed the state of an existing canonical project.' };
  }
  if (envelope.authority === 'SYSTEM_DERIVED') {
    return { policy: 'REVIEW', reason: 'System-derived changes are proposals, not direct canonical authority.' };
  }
  if (envelope.risk === 'CRITICAL') {
    return { policy: 'MANUAL_ONLY', reason: 'Critical-risk changes require manual action.' };
  }
  if (envelope.risk === 'HIGH') {
    return { policy: 'CONFIRMATION', reason: 'High-risk changes require explicit confirmation.' };
  }
  // A caller may request stricter handling but may never self-authorize an
  // automatic write by setting requestedPolicy.
  const requested = envelope.requestedPolicy;
  const stricterPolicy = requested === 'FORBIDDEN' || requested === 'MANUAL_ONLY' || requested === 'CONFIRMATION'
    ? requested
    : 'REVIEW';
  return { policy: stricterPolicy, reason: 'No automatic authority rule applies.' };
}
