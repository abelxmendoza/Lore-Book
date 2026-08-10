import { createHash } from 'node:crypto';

import { resolveCanonicalMutationPolicy } from './canonicalMutationPolicy';
import {
  CANONICAL_MUTATION_CONTRACT_VERSION,
  type AtomicCanonicalMutationAdapter,
  type CanonicalMutationApplyResult,
  type CanonicalMutationDecision,
  type CanonicalMutationEnvelope,
  type MutationApprovalPolicy,
  type MutationGovernanceOutcome,
} from './canonicalMutationTypes';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function mutationKey(envelope: CanonicalMutationEnvelope): string {
  const material = {
    version: envelope.version,
    userId: envelope.userId,
    target: envelope.target,
    intent: envelope.intent,
    previousValue: envelope.previousValue,
    proposedValue: envelope.proposedValue,
    evidence: envelope.evidence.map((item) => ({ sourceType: item.sourceType, sourceId: item.sourceId, relation: item.relation })),
  };
  return `cm_${createHash('sha256').update(stableJson(material)).digest('hex').slice(0, 24)}`;
}

function outcomeFor(policy: MutationApprovalPolicy): MutationGovernanceOutcome {
  if (policy === 'AUTOMATIC') return 'ALLOW_AUTOMATIC';
  if (policy === 'REVIEW') return 'QUEUE_REVIEW';
  if (policy === 'CONFIRMATION') return 'REQUIRE_CONFIRMATION';
  if (policy === 'MANUAL_ONLY') return 'REQUIRE_MANUAL_ACTION';
  return 'REJECT_BY_POLICY';
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

export class CanonicalMutationLayer {
  evaluate(envelope: CanonicalMutationEnvelope): CanonicalMutationDecision {
    if (envelope.version !== CANONICAL_MUTATION_CONTRACT_VERSION) {
      return {
        mutationKey: mutationKey(envelope), contractVersion: CANONICAL_MUTATION_CONTRACT_VERSION,
        outcome: 'REJECT_BY_POLICY', policy: 'FORBIDDEN', reason: 'Unsupported mutation contract version.',
        permitted: false, requiresAtomicAdapter: true, envelope,
      };
    }
    if (valuesEqual(envelope.previousValue, envelope.proposedValue)) {
      return {
        mutationKey: mutationKey(envelope), contractVersion: CANONICAL_MUTATION_CONTRACT_VERSION,
        outcome: 'NO_CHANGE', policy: 'AUTOMATIC', reason: 'Canonical state already matches the proposal.',
        permitted: false, requiresAtomicAdapter: false, envelope,
      };
    }
    const resolved = resolveCanonicalMutationPolicy(envelope);
    return {
      mutationKey: mutationKey(envelope), contractVersion: CANONICAL_MUTATION_CONTRACT_VERSION,
      outcome: outcomeFor(resolved.policy), policy: resolved.policy, reason: resolved.reason,
      permitted: resolved.policy === 'AUTOMATIC', requiresAtomicAdapter: resolved.policy === 'AUTOMATIC',
      envelope,
    };
  }

  async apply(envelope: CanonicalMutationEnvelope, adapter: AtomicCanonicalMutationAdapter): Promise<CanonicalMutationApplyResult> {
    const decision = this.evaluate(envelope);
    if (!decision.permitted) return { ...decision, applied: false, executionOutcome: 'NOT_EXECUTED', transactionMode: 'NOT_APPLICABLE' };
    if (adapter.atomic !== true) {
      return { ...decision, applied: false, executionOutcome: 'NOT_EXECUTED', transactionMode: 'NOT_APPLICABLE', error: 'Atomic mutation adapter required.' };
    }
    try {
      const applied = await adapter.apply(decision);
      const projections = [...new Set(envelope.affectedProjections)].filter((projection) => projection !== envelope.target.ownerProjection);
      return {
        ...decision, applied: true, executionOutcome: 'APPLIED', transactionMode: 'ATOMIC', mutationId: applied.mutationId,
        projectionInvalidationEvent: {
          type: 'PROJECTION_INVALIDATION_REQUESTED', mutationId: applied.mutationId, projections,
        },
      };
    } catch (error) {
      return {
        ...decision, applied: false, executionOutcome: 'FAILED_TRANSACTION', transactionMode: 'ATOMIC',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const canonicalMutationLayer = new CanonicalMutationLayer();
