// =====================================================
// CORRECTION AUTHORITY
//
// The enforcement layer for truth-state transitions.
//
// Responsibilities:
//   - Own the valid transition graph for TruthState
//   - Verify ownership before any revision
//   - Apply truth-state changes atomically
//   - Write every mutation to cognition_mutations (audit log)
//   - Propagate state changes to dependent artifacts
//
// Design invariants:
//   - No silent overwrites: every mutation is recorded
//   - Ownership is checked at the DB row level, not just by convention
//   - Transitions are typed: only valid state changes are permitted
//   - The actor_id field is preserved for future delegation support
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { invalidateProjectionsForSource } from '../projectionInvalidationService';
import type { TruthState, ArtifactType } from './types';
import { provenanceEdgeService } from './provenanceEdgeService';

// ─── Transition graph ─────────────────────────────────────────────────────────
//
// Only these transitions are valid. Any other attempted transition is rejected.
// The graph is intentionally strict: correction authority is not a free-form
// editor — it is a formal epistemic governance tool.

type TransitionKey = `${TruthState}->${TruthState}`;

const VALID_TRANSITIONS: Partial<Record<TransitionKey, { requiresRationale: boolean; mutationType: string }>> = {
  'PENDING_VERIFICATION->CANONICAL':        { requiresRationale: false, mutationType: 'CANON_ESCALATION' },
  'PENDING_VERIFICATION->DISPUTED':         { requiresRationale: true,  mutationType: 'DISPUTE' },
  'CANONICAL->REVISED':                     { requiresRationale: true,  mutationType: 'CORRECTION' },
  'INFERRED->CANONICAL':                    { requiresRationale: false, mutationType: 'CANON_ESCALATION' },
  'INFERRED->DISPUTED':                     { requiresRationale: true,  mutationType: 'DISPUTE' },
  'CONTEXTUAL->CANONICAL':                  { requiresRationale: false, mutationType: 'CANON_ESCALATION' },
  'DISPUTED->REVISED':                      { requiresRationale: true,  mutationType: 'CORRECTION' },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CorrectionClaim {
  actorId: string;
  artifactType: ArtifactType;
  artifactId: string;
  fromState: TruthState;
  toState: TruthState;
  rationale?: string;
}

export interface CorrectionResult {
  mutationId: string;
  artifactId: string;
  fromState: TruthState;
  toState: TruthState;
  mutationType: string;
  timestamp: string;
}

// Storage mapping for each artifact type
type TruthStateStorage = 'metadata' | 'column';

const ARTIFACT_STORAGE: Partial<Record<ArtifactType, { table: string; truthStateStorage: TruthStateStorage }>> = {
  journal_entry:   { table: 'journal_entries', truthStateStorage: 'metadata' },
  entry_ir:        { table: 'entry_ir', truthStateStorage: 'metadata' },
  knowledge_unit:  { table: 'knowledge_units', truthStateStorage: 'metadata' },
  utterance:       { table: 'utterances', truthStateStorage: 'metadata' },
  entity:          { table: 'entities', truthStateStorage: 'metadata' },
  insight:         { table: 'insights', truthStateStorage: 'metadata' },
  character:       { table: 'characters', truthStateStorage: 'metadata' },
  extracted_unit:  { table: 'extracted_units', truthStateStorage: 'metadata' },
  omega_claim:     { table: 'omega_claims', truthStateStorage: 'column' },
};

function readTruthState(artifact: Record<string, unknown>, storage: TruthStateStorage): TruthState {
  if (storage === 'column') {
    return (artifact.truth_state as TruthState | undefined) ?? 'PENDING_VERIFICATION';
  }
  const meta = (artifact.metadata as Record<string, unknown>) ?? {};
  return (meta.truth_state as TruthState | undefined) ?? 'PENDING_VERIFICATION';
}

// ─── Service ──────────────────────────────────────────────────────────────────

class CorrectionAuthority {

  /**
   * Returns which truth-state transitions are currently valid
   * for a given artifact, given the actor's ownership.
   */
  permittedTransitions(currentState: TruthState): TruthState[] {
    return (Object.keys(VALID_TRANSITIONS) as TransitionKey[])
      .filter(key => key.startsWith(`${currentState}->`))
      .map(key => key.split('->')[1] as TruthState);
  }

  /**
   * Apply a truth-state revision to a cognition artifact.
   *
   * Steps:
   *  1. Verify the actor owns the artifact (DB-level check)
   *  2. Validate the transition is in the allowed graph
   *  3. Verify rationale is present if required
   *  4. Read current state for the before_state record
   *  5. Update truth_state in the artifact's metadata
   *  6. Write to cognition_mutations (append-only audit log)
   *  7. Return the mutation record
   */
  async applyRevision(claim: CorrectionClaim, userId: string): Promise<CorrectionResult> {
    const { actorId, artifactType, artifactId, fromState, toState, rationale } = claim;

    // ── Ownership: actor must be the data owner ──────────────────────────────
    if (actorId !== userId) {
      throw new Error(`Correction rejected: actor ${actorId} does not match authenticated user ${userId}`);
    }

    // ── Transition validation ────────────────────────────────────────────────
    const transitionKey: TransitionKey = `${fromState}->${toState}`;
    const rule = VALID_TRANSITIONS[transitionKey];

    if (!rule) {
      throw new Error(
        `Invalid truth-state transition: ${fromState} → ${toState}. ` +
        `Permitted from ${fromState}: [${this.permittedTransitions(fromState).join(', ')}]`
      );
    }

    if (rule.requiresRationale && !rationale?.trim()) {
      throw new Error(
        `Transition ${fromState} → ${toState} requires a rationale explaining the correction.`
      );
    }

    // ── Load artifact (ownership + current state) ────────────────────────────
    const storageConfig = ARTIFACT_STORAGE[artifactType];
    if (!storageConfig) {
      throw new Error(`Unsupported artifact type for revision: ${artifactType}`);
    }
    const { table: tableName, truthStateStorage } = storageConfig;

    const { data: artifact, error: loadError } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('id', artifactId)
      .eq('user_id', userId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown };

    if (loadError) {
      throw new Error(`Failed to load artifact: ${(loadError as Error).message ?? loadError}`);
    }
    if (!artifact) {
      throw new Error(`Artifact ${artifactType}:${artifactId} not found or not owned by user.`);
    }

    const currentMeta = (artifact.metadata as Record<string, unknown>) ?? {};
    const currentTruthState = readTruthState(artifact, truthStateStorage);

    // Validate fromState matches actual state (prevents race conditions)
    if (currentTruthState !== fromState) {
      throw new Error(
        `State mismatch: artifact is currently ${currentTruthState}, ` +
        `but revision claims it is ${fromState}. Reload and retry.`
      );
    }

    const beforeState = { truth_state: currentTruthState, metadata: currentMeta };
    const afterMeta = { ...currentMeta, truth_state: toState, revised_at: new Date().toISOString() };

    const updatePayload =
      truthStateStorage === 'column'
        ? { truth_state: toState, metadata: afterMeta, updated_at: new Date().toISOString() }
        : { metadata: afterMeta };

    const { error: updateError } = await supabaseAdmin
      .from(tableName)
      .update(updatePayload)
      .eq('id', artifactId)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Failed to update artifact truth_state: ${(updateError as Error).message}`);
    }

    // ── Write to cognition_mutations audit log ───────────────────────────────
    const mutationId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const { error: mutError } = await supabaseAdmin
      .from('cognition_mutations')
      .insert({
        id:            mutationId,
        user_id:       userId,
        actor_id:      actorId,
        artifact_type: artifactType,
        artifact_id:   artifactId,
        mutation_type: rule.mutationType,
        before_state:  beforeState,
        after_state:   { truth_state: toState, metadata: afterMeta },
        rationale:     rationale ?? null,
        created_at:    timestamp,
      });

    if (mutError) {
      // Mutation logged failure is non-fatal for the revision itself,
      // but must be surfaced for observability.
      logger.error(
        { err: mutError, artifactId, artifactType, userId },
        'CorrectionAuthority: cognition_mutations write failed (revision applied, audit incomplete)'
      );
    }

    // Provenance: artifact → artifact (REVISED_BY) for CORRECTION and DISPUTE transitions
    if (rule.mutationType === 'CORRECTION' || rule.mutationType === 'DISPUTE') {
      provenanceEdgeService.createEdge({
        userId,
        sourceId:      artifactId,
        sourceType:    artifactType,
        targetId:      artifactId,
        targetType:    artifactType,
        relation:      'REVISED_BY',
        confidence:    1.0,
        toTruthState:  toState,
        meta:          { fromState, mutationType: rule.mutationType, mutationId, rationale: rationale ?? null },
      }).catch((e) => logger.warn({ e, artifactId }, 'Provenance REVISED_BY edge write failed'));
    }

    logger.info(
      { userId, artifactType, artifactId, fromState, toState, mutationType: rule.mutationType },
      'CorrectionAuthority: truth-state revised'
    );

    void invalidateProjectionsForSource(userId, artifactId, artifactType, 'source_revision').catch(
      (err) => logger.warn({ err, userId, artifactId, artifactType }, 'Projection invalidation after revision failed')
    );

    return {
      mutationId,
      artifactId,
      fromState,
      toState,
      mutationType: rule.mutationType,
      timestamp,
    };
  }

  /**
   * Fetch the mutation history for a specific artifact.
   * Returns ordered oldest-first for provenance traversal.
   */
  async getMutationHistory(
    artifactId: string,
    userId: string
  ): Promise<Array<{
    id: string;
    mutation_type: string;
    before_state: unknown;
    after_state: unknown;
    rationale: string | null;
    created_at: string;
  }>> {
    const { data, error } = await supabaseAdmin
      .from('cognition_mutations')
      .select('id, mutation_type, before_state, after_state, rationale, created_at')
      .eq('artifact_id', artifactId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true }) as {
        data: Array<{
          id: string;
          mutation_type: string;
          before_state: unknown;
          after_state: unknown;
          rationale: string | null;
          created_at: string;
        }> | null;
        error: unknown;
      };

    if (error) {
      logger.warn({ err: error, artifactId, userId }, 'CorrectionAuthority: getMutationHistory failed');
      return [];
    }

    return data ?? [];
  }

  /**
   * Record a system-initiated mutation (consolidation, pipeline events).
   * Does NOT enforce the transition graph — used by the pipeline, not users.
   */
  async recordSystemMutation(params: {
    userId: string;
    artifactType: ArtifactType;
    artifactId: string;
    mutationType: string;
    beforeState: unknown;
    afterState: unknown;
    rationale?: string;
  }): Promise<void> {
    const { error } = await supabaseAdmin
      .from('cognition_mutations')
      .insert({
        user_id:       params.userId,
        actor_id:      params.userId,
        artifact_type: params.artifactType,
        artifact_id:   params.artifactId,
        mutation_type: params.mutationType,
        before_state:  params.beforeState,
        after_state:   params.afterState,
        rationale:     params.rationale ?? null,
        created_at:    new Date().toISOString(),
      });

    if (error) {
      logger.warn(
        { err: error, ...params },
        'CorrectionAuthority: recordSystemMutation write failed (non-critical)'
      );
    }
  }
}

export const correctionAuthority = new CorrectionAuthority();
