import { describe, expect, it, vi } from 'vitest';

import {
  CANONICAL_MUTATION_CONTRACT_VERSION,
  CanonicalMutationLayer,
  type CanonicalMutationEnvelope,
} from '../../src/services/canonicalMutation';

function envelope(overrides: Partial<CanonicalMutationEnvelope> = {}): CanonicalMutationEnvelope {
  return {
    version: CANONICAL_MUTATION_CONTRACT_VERSION,
    userId: 'synthetic-user',
    actorId: 'synthetic-user',
    requestorProjection: 'project_projection',
    target: { artifactType: 'project', artifactId: 'project-1', field: 'status', ownerProjection: 'project_projection' },
    intent: 'RETIRE',
    category: 'PROJECT',
    previousValue: 'active',
    proposedValue: 'dormant',
    authority: 'USER_EXPLICIT',
    evidence: [{ sourceType: 'chat_message', sourceId: 'message-1', relation: 'SUPPORTS' }],
    risk: 'LOW',
    reason: 'EXPLICIT_USER_UPDATE',
    affectedProjections: ['project_projection', 'identity_snapshot', 'narrative_ir'],
    rationale: 'The user explicitly said this existing project is no longer active.',
    ...overrides,
  };
}

describe('Canonical Mutation Layer', () => {
  it('automatically authorizes an explicit low-risk project retirement', () => {
    const decision = new CanonicalMutationLayer().evaluate(envelope());
    expect(decision).toEqual(expect.objectContaining({
      outcome: 'ALLOW_AUTOMATIC', policy: 'AUTOMATIC', permitted: true, requiresAtomicAdapter: true,
    }));
    expect(decision.envelope.affectedProjections).toEqual(['project_projection', 'identity_snapshot', 'narrative_ir']);
  });

  it('produces the same mutation key for the same semantic mutation', () => {
    const layer = new CanonicalMutationLayer();
    expect(layer.evaluate(envelope()).mutationKey).toBe(layer.evaluate(envelope()).mutationKey);
  });

  it('returns NO_CHANGE instead of authorizing another write', () => {
    const decision = new CanonicalMutationLayer().evaluate(envelope({ previousValue: 'dormant' }));
    expect(decision.outcome).toBe('NO_CHANGE');
    expect(decision.permitted).toBe(false);
  });

  it('forbids one projection from directly overwriting another', () => {
    const decision = new CanonicalMutationLayer().evaluate(envelope({
      requestorProjection: 'narrative_ir',
    }));
    expect(decision.outcome).toBe('REJECT_BY_POLICY');
    expect(decision.reason).toMatch(/cross-projection/i);
  });

  it('requires confirmation for relationship state and blocks derived identity canon', () => {
    const layer = new CanonicalMutationLayer();
    const relationship = layer.evaluate(envelope({
      category: 'RELATIONSHIP', authority: 'SYSTEM_DERIVED', risk: 'HIGH',
      target: { artifactType: 'relationship', artifactId: 'relationship-1', field: 'status', ownerProjection: 'relationship_projection' },
      requestorProjection: 'relationship_projection',
    }));
    const identity = layer.evaluate(envelope({
      category: 'IDENTITY', authority: 'SYSTEM_DERIVED',
      target: { artifactType: 'identity_snapshot', artifactId: 'identity-1', field: 'dominant_identity', ownerProjection: 'identity_snapshot' },
      requestorProjection: 'identity_snapshot',
    }));
    expect(relationship.outcome).toBe('REQUIRE_CONFIRMATION');
    expect(identity.outcome).toBe('REJECT_BY_POLICY');
  });

  it('does not let callers self-authorize unsupported automatic writes', () => {
    const decision = new CanonicalMutationLayer().evaluate(envelope({
      category: 'PREFERENCE', target: { artifactType: 'preference', artifactId: 'preference-1', field: 'value', ownerProjection: 'preference_projection' },
      requestorProjection: 'preference_projection', requestedPolicy: 'AUTOMATIC',
    }));
    expect(decision.outcome).toBe('QUEUE_REVIEW');
    expect(decision.permitted).toBe(false);
  });

  it('applies an authorized mutation only through an explicitly atomic adapter', async () => {
    const apply = vi.fn().mockResolvedValue({ mutationId: 'mutation-1' });
    const result = await new CanonicalMutationLayer().apply(envelope(), { atomic: true, apply });
    expect(result).toEqual(expect.objectContaining({
      applied: true, executionOutcome: 'APPLIED', transactionMode: 'ATOMIC', mutationId: 'mutation-1',
      projectionInvalidationEvent: {
        type: 'PROJECTION_INVALIDATION_REQUESTED', mutationId: 'mutation-1', projections: ['identity_snapshot', 'narrative_ir'],
      },
    }));
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
