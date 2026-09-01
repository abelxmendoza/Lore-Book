/**
 * Narrative layer on top of the existing life_arcs/arc_event_links model —
 * Life Saga → Life Arc → Narrative Anchor → Event, with Evidence staying
 * below events (unchanged) and life_arc_proposals staying the AI-suggestion
 * layer feeding into life_arcs (unchanged).
 *
 * Deliberately introduces NO new tables and NO schema migration:
 *
 * - "Life Saga" reuses life_arcs.parent_id, which already exists and is
 *   already exercised by arcService.getRootArcs()/nestChildren() — a Saga is
 *   simply a root-level life_arcs row (parent_id IS NULL); its member Arcs are
 *   the rows whose parent_id points at it. This is a single-parent hierarchy:
 *   an arc belongs to at most one saga today. If an arc ever needs to belong
 *   to multiple sagas, that needs a join table — not attempted here.
 *
 * - "Narrative Anchor" reuses arc_event_links, which already links an arc to
 *   a resolved_event/journal_entry and already has a free-form metadata jsonb
 *   column and an importance_score column. The anchor's narrative role
 *   (origin/turning_point/milestone/...) lives in metadata.narrative_role
 *   rather than a new column, and importance reuses importance_score as-is.
 *   The role belongs to the *link row*, not the event — the same event can
 *   hold a different role in a different arc via a second link row.
 *
 * IMPORTANT — mitigates a confirmed RLS gap, does not fix it: the live
 * arc_event_links INSERT policy only checks (auth.uid() = user_id) on the
 * link row; it does not verify arc_id actually belongs to that user (see
 * tests/integration/lifeArcsIsolation.pg.test.ts, which reproduces this
 * live). attachAnchor() below closes that gap at the application layer by
 * verifying arc ownership via arcService.getById() before inserting — but
 * only for callers that go through this service. Any other code path that
 * inserts into arc_event_links directly is still exposed until the RLS
 * policy itself is fixed.
 */
import { supabaseAdmin } from '../../supabaseClient';
import { arcService, type LifeArc } from './arcService';

export type NarrativeAnchorRole =
  | 'origin'
  | 'turning_point'
  | 'milestone'
  | 'escalation'
  | 'climax'
  | 'resolution'
  | 'ending'
  | 'transition'
  | 'supporting';

export const NARRATIVE_ANCHOR_ROLES: readonly NarrativeAnchorRole[] = [
  'origin',
  'turning_point',
  'milestone',
  'escalation',
  'climax',
  'resolution',
  'ending',
  'transition',
  'supporting',
];

export type NarrativeAnchor = {
  linkId: string;
  arcId: string;
  resolvedEventId: string | null;
  journalEntryId: string | null;
  role: NarrativeAnchorRole | null;
  importanceScore: number | null;
  sortTime: string | null;
  createdAt: string;
};

export type AttachAnchorInput = {
  arcId: string;
  role: NarrativeAnchorRole;
  resolvedEventId?: string | null;
  journalEntryId?: string | null;
  importanceScore?: number | null;
  temporalRole?: 'before' | 'during' | 'after' | 'throughout';
};

function isNarrativeAnchorRole(value: unknown): value is NarrativeAnchorRole {
  return typeof value === 'string' && (NARRATIVE_ANCHOR_ROLES as readonly string[]).includes(value);
}

export class ArcNarrativeService {
  /** Root-level arcs for a user — the existing hierarchy already gives us
   * "Life Saga" without a new table (see file header). */
  async getSagas(userId: string): Promise<LifeArc[]> {
    return arcService.getRootArcs(userId);
  }

  /** Arcs whose parent_id points at the given saga (root) arc. */
  async getArcsInSaga(userId: string, sagaArcId: string): Promise<LifeArc[]> {
    const all = await arcService.listForUser(userId);
    return all.filter((arc) => arc.parent_id === sagaArcId);
  }

  /** Assign an existing arc's parent — i.e. put it inside a saga (or move/detach it). */
  async setArcParent(userId: string, arcId: string, sagaArcId: string | null): Promise<LifeArc> {
    if (sagaArcId) {
      const saga = await arcService.getById(userId, sagaArcId);
      if (!saga) throw new Error('Saga arc not found or not owned by this user');
    }
    return arcService.update(userId, arcId, { parent_id: sagaArcId });
  }

  async attachAnchor(userId: string, input: AttachAnchorInput): Promise<NarrativeAnchor> {
    if (!isNarrativeAnchorRole(input.role)) {
      throw new Error(`Invalid narrative anchor role: ${String(input.role)}`);
    }
    if (!input.resolvedEventId && !input.journalEntryId) {
      throw new Error('attachAnchor requires resolvedEventId or journalEntryId');
    }

    // Ownership check the underlying RLS policy doesn't perform — see header.
    const arc = await arcService.getById(userId, input.arcId);
    if (!arc) throw new Error('Arc not found or not owned by this user');

    const { data, error } = await supabaseAdmin
      .from('arc_event_links')
      .insert({
        user_id: userId,
        arc_id: input.arcId,
        resolved_event_id: input.resolvedEventId ?? null,
        journal_entry_id: input.journalEntryId ?? null,
        temporal_role: input.temporalRole ?? 'during',
        importance_score: input.importanceScore ?? null,
        metadata: { narrative_role: input.role },
      })
      .select('*')
      .single();
    if (error) throw error;
    return this.mapAnchor(data);
  }

  async getAnchorsForArc(userId: string, arcId: string): Promise<NarrativeAnchor[]> {
    const { data, error } = await supabaseAdmin
      .from('arc_event_links')
      .select('*')
      .eq('user_id', userId)
      .eq('arc_id', arcId)
      .order('sort_time', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return (data ?? []).map((row) => this.mapAnchor(row));
  }

  /** Unlinks the anchor only — never touches the underlying resolved_event/journal_entry. */
  async removeAnchor(userId: string, linkId: string): Promise<void> {
    const { error } = await supabaseAdmin.from('arc_event_links').delete().eq('user_id', userId).eq('id', linkId);
    if (error) throw error;
  }

  private mapAnchor(row: Record<string, unknown>): NarrativeAnchor {
    const metadata = (row.metadata as Record<string, unknown>) ?? {};
    return {
      linkId: row.id as string,
      arcId: row.arc_id as string,
      resolvedEventId: (row.resolved_event_id as string | null) ?? null,
      journalEntryId: (row.journal_entry_id as string | null) ?? null,
      role: isNarrativeAnchorRole(metadata.narrative_role) ? metadata.narrative_role : null,
      importanceScore: (row.importance_score as number | null) ?? null,
      sortTime: (row.sort_time as string | null) ?? null,
      createdAt: row.created_at as string,
    };
  }
}

export const arcNarrativeService = new ArcNarrativeService();
