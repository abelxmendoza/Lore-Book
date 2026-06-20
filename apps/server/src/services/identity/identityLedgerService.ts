/**
 * Identity Ledger v1 — IdentityLedgerService
 *
 * Every identity mutation in LoreBook (create / update / archive / merge /
 * merge-rejection / alias / relationship / truth-state / confidence) is written
 * here as an immutable, append-only audit event. The backing table
 * (`identity_mutations`) is enforced append-only at the DB layer; this service
 * is the single write path the rest of the app uses.
 *
 * Reads make identity decisions explainable and historically traceable:
 *   - recordMutation()     append one event
 *   - getEntityHistory()   full ordered history for one entity
 *   - getRecentMutations() recent events across all entities (audit feed)
 *   - getMutationTimeline() entity history shaped into a human timeline
 */
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export const IDENTITY_MUTATION_TYPES = [
  'ENTITY_CREATED',
  'ENTITY_UPDATED',
  'ENTITY_ARCHIVED',
  'ENTITY_MERGED',
  'MERGE_REJECTED',
  'ALIAS_ADDED',
  'ALIAS_REMOVED',
  'RELATIONSHIP_CREATED',
  'RELATIONSHIP_REMOVED',
  'TRUTH_STATE_CHANGED',
  'CONFIDENCE_CHANGED',
] as const;

export type IdentityMutationType = (typeof IDENTITY_MUTATION_TYPES)[number];

/** Origin of the mutation — who/what caused it. */
export type MutationSource = 'USER' | 'SYSTEM' | 'PIPELINE' | (string & {});

export interface RecordMutationInput {
  userId: string;
  entityId: string;
  entityType: string;
  mutationType: IdentityMutationType;
  /** State before the change. Omit/null for creation events. */
  previousValue?: unknown;
  /** State after the change. Omit/null for removal events. */
  newValue?: unknown;
  reason?: string;
  /** Confidence in the mutation itself (0..1). */
  confidence?: number;
  source?: MutationSource;
  metadata?: Record<string, unknown>;
}

export interface IdentityMutationRow {
  id: string;
  user_id: string;
  entity_id: string;
  entity_type: string;
  mutation_type: IdentityMutationType;
  previous_value: unknown;
  new_value: unknown;
  reason: string | null;
  confidence: number | null;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TimelineEntry {
  id: string;
  mutationType: IdentityMutationType;
  /** Short human-readable summary of the event. */
  summary: string;
  reason: string | null;
  source: string;
  confidence: number | null;
  previousValue: unknown;
  newValue: unknown;
  at: string;
}

type InsertPayload = Omit<IdentityMutationRow, 'id' | 'created_at'>;

const SELECT_COLUMNS =
  'id, user_id, entity_id, entity_type, mutation_type, previous_value, new_value, reason, confidence, source, metadata, created_at';

/** Pure: normalize input into the row payload we insert. Exported for tests. */
export function buildMutationRow(input: RecordMutationInput): InsertPayload {
  return {
    user_id: input.userId,
    entity_id: input.entityId,
    entity_type: input.entityType,
    mutation_type: input.mutationType,
    previous_value: input.previousValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason ?? null,
    confidence: typeof input.confidence === 'number' ? input.confidence : null,
    source: input.source ?? 'SYSTEM',
    metadata: input.metadata ?? {},
  };
}

/** Pure: a short human label for one mutation. Exported for tests. */
export function summarizeMutation(row: Pick<IdentityMutationRow, 'mutation_type' | 'entity_type' | 'reason'>): string {
  const t = row.entity_type;
  switch (row.mutation_type) {
    case 'ENTITY_CREATED': return `${t} created`;
    case 'ENTITY_UPDATED': return `${t} updated`;
    case 'ENTITY_ARCHIVED': return `${t} archived`;
    case 'ENTITY_MERGED': return `${t} merged`;
    case 'MERGE_REJECTED': return `Merge rejected`;
    case 'ALIAS_ADDED': return `Alias added`;
    case 'ALIAS_REMOVED': return `Alias removed`;
    case 'RELATIONSHIP_CREATED': return `Relationship added`;
    case 'RELATIONSHIP_REMOVED': return `Relationship removed`;
    case 'TRUTH_STATE_CHANGED': return `Truth state changed`;
    case 'CONFIDENCE_CHANGED': return `Confidence changed`;
    default: return `${t} mutation`;
  }
}

class IdentityLedgerService {
  /**
   * Append one immutable identity mutation. Audit writes are best-effort:
   * a ledger failure must never break the underlying operation, so errors are
   * logged and swallowed. Returns the inserted row id, or null on failure.
   */
  async recordMutation(input: RecordMutationInput): Promise<string | null> {
    if (!input.userId || !input.entityId) {
      logger.warn({ input }, '[IdentityLedger] recordMutation missing userId/entityId — skipped');
      return null;
    }

    const payload = buildMutationRow(input);
    try {
      const { data, error } = await supabaseAdmin
        .from('identity_mutations')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        logger.warn({ err: error, entityId: input.entityId, mutationType: input.mutationType },
          '[IdentityLedger] recordMutation insert failed (non-fatal)');
        return null;
      }
      return (data as { id: string } | null)?.id ?? null;
    } catch (err) {
      logger.warn({ err, entityId: input.entityId, mutationType: input.mutationType },
        '[IdentityLedger] recordMutation threw (non-fatal)');
      return null;
    }
  }

  /** Full ordered history (oldest → newest) for one entity. */
  async getEntityHistory(
    userId: string,
    entityId: string,
    opts: { limit?: number; ascending?: boolean } = {}
  ): Promise<IdentityMutationRow[]> {
    const { limit = 200, ascending = true } = opts;
    try {
      const { data, error } = await supabaseAdmin
        .from('identity_mutations')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .order('created_at', { ascending })
        .limit(limit);

      if (error) {
        logger.warn({ err: error, entityId }, '[IdentityLedger] getEntityHistory failed');
        return [];
      }
      return (data as IdentityMutationRow[] | null) ?? [];
    } catch (err) {
      logger.warn({ err, entityId }, '[IdentityLedger] getEntityHistory threw');
      return [];
    }
  }

  /**
   * Recent mutations across all entities — the global audit feed. Optionally
   * filter by entity type and/or mutation type.
   */
  async getRecentMutations(
    userId: string,
    opts: { limit?: number; entityType?: string; mutationType?: IdentityMutationType } = {}
  ): Promise<IdentityMutationRow[]> {
    const { limit = 50, entityType, mutationType } = opts;
    try {
      let query = supabaseAdmin
        .from('identity_mutations')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId);

      if (entityType) query = query.eq('entity_type', entityType);
      if (mutationType) query = query.eq('mutation_type', mutationType);

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.warn({ err: error }, '[IdentityLedger] getRecentMutations failed');
        return [];
      }
      return (data as IdentityMutationRow[] | null) ?? [];
    } catch (err) {
      logger.warn({ err }, '[IdentityLedger] getRecentMutations threw');
      return [];
    }
  }

  /**
   * Entity history shaped into a human-readable timeline (newest → oldest),
   * each entry carrying a short summary so the identity's evolution is
   * explainable without inspecting raw before/after blobs.
   */
  async getMutationTimeline(
    userId: string,
    entityId: string,
    opts: { limit?: number } = {}
  ): Promise<TimelineEntry[]> {
    const rows = await this.getEntityHistory(userId, entityId, {
      limit: opts.limit ?? 200,
      ascending: false,
    });
    return rows.map((row) => ({
      id: row.id,
      mutationType: row.mutation_type,
      summary: summarizeMutation(row),
      reason: row.reason,
      source: row.source,
      confidence: row.confidence,
      previousValue: row.previous_value,
      newValue: row.new_value,
      at: row.created_at,
    }));
  }
}

export const identityLedgerService = new IdentityLedgerService();
export type { IdentityLedgerService };
