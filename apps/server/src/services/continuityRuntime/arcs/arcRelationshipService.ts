import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import type { LifeArc } from './arcService';

export type RelationshipType =
  | 'spawned'     // A gave rise to B (college era → tech career)
  | 'influenced'  // A shaped B without replacing it (depression → values shift)
  | 'overlapped'  // A and B ran simultaneously
  | 'preceded'    // A ended before B began (simple before/after)
  | 'merged'      // Two arcs converged into one
  | 'split';      // One arc diverged into two

export interface ArcRelationship {
  id: string;
  user_id: string;
  source_arc_id: string;
  target_arc_id: string;
  relationship_type: RelationshipType;
  description: string | null;
  confidence: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateRelationshipPayload {
  source_arc_id: string;
  target_arc_id: string;
  relationship_type: RelationshipType;
  description?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export class ArcRelationshipService {
  async upsert(userId: string, payload: CreateRelationshipPayload): Promise<ArcRelationship> {
    const { data, error } = await supabaseAdmin
      .from('arc_relationships')
      .upsert(
        {
          user_id: userId,
          source_arc_id: payload.source_arc_id,
          target_arc_id: payload.target_arc_id,
          relationship_type: payload.relationship_type,
          description: payload.description ?? null,
          confidence: payload.confidence ?? 0.6,
          metadata: payload.metadata ?? {},
        },
        { onConflict: 'source_arc_id,target_arc_id,relationship_type' }
      )
      .select()
      .single();

    if (error) {
      logger.error({ error, userId, payload }, 'arcRelationshipService.upsert failed');
      throw error;
    }
    return this.map(data);
  }

  async upsertMany(userId: string, payloads: CreateRelationshipPayload[]): Promise<void> {
    if (payloads.length === 0) return;

    const rows = payloads.map(p => ({
      user_id: userId,
      source_arc_id: p.source_arc_id,
      target_arc_id: p.target_arc_id,
      relationship_type: p.relationship_type,
      description: p.description ?? null,
      confidence: p.confidence ?? 0.6,
      metadata: p.metadata ?? {},
    }));

    const { error } = await supabaseAdmin
      .from('arc_relationships')
      .upsert(rows, { onConflict: 'source_arc_id,target_arc_id,relationship_type' });

    if (error) {
      logger.error({ error, userId, count: rows.length }, 'arcRelationshipService.upsertMany failed');
      throw error;
    }
  }

  async getRelationshipsForArc(
    userId: string,
    arcId: string
  ): Promise<ArcRelationship[]> {
    const { data, error } = await supabaseAdmin
      .from('arc_relationships')
      .select('*')
      .eq('user_id', userId)
      .or(`source_arc_id.eq.${arcId},target_arc_id.eq.${arcId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(r => this.map(r));
  }

  async getAllForUser(userId: string): Promise<ArcRelationship[]> {
    const { data, error } = await supabaseAdmin
      .from('arc_relationships')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return (data ?? []).map(r => this.map(r));
  }

  async delete(userId: string, relationshipId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('arc_relationships')
      .delete()
      .eq('user_id', userId)
      .eq('id', relationshipId);

    if (error) throw error;
  }

  // ─── Heuristic inference ───────────────────────────────────────────────────
  // Derives relationships from temporal overlap between arc date ranges.
  // Caller passes all arcs for the user; returns payloads ready for upsertMany.

  inferFromArcs(arcs: LifeArc[]): CreateRelationshipPayload[] {
    const datable = arcs.filter(a => a.start_date !== null);
    const results: CreateRelationshipPayload[] = [];

    for (let i = 0; i < datable.length; i++) {
      for (let j = i + 1; j < datable.length; j++) {
        const a = datable[i];
        const b = datable[j];
        const rel = this.inferPair(a, b);
        if (rel) results.push(rel);
      }
    }
    return results;
  }

  private inferPair(
    a: LifeArc,
    b: LifeArc
  ): CreateRelationshipPayload | null {
    if (!a.start_date || !b.start_date) return null;

    const NOW = Date.now();
    const aStart = new Date(a.start_date).getTime();
    const bStart = new Date(b.start_date).getTime();
    const aEnd = a.end_date ? new Date(a.end_date).getTime() : NOW;
    const bEnd = b.end_date ? new Date(b.end_date).getTime() : NOW;

    // Ensure early/late sorted by start
    const [early, late, eStart, eEnd, lStart, lEnd] =
      aStart <= bStart
        ? [a, b, aStart, aEnd, bStart, bEnd]
        : [b, a, bStart, bEnd, aStart, aEnd];

    // ── Containment ─────────────────────────────────────────────────────────
    // early fully contains late (late starts and ends within early's range)
    if (eStart <= lStart && eEnd >= lEnd) {
      return {
        source_arc_id: early.id,
        target_arc_id: late.id,
        relationship_type: 'overlapped',
        confidence: 0.75,
        description: `${early.title} contained ${late.title}`,
        metadata: { allen_relation: 'contains' },
      };
    }

    // late fully contains early
    if (lStart <= eStart && lEnd >= eEnd) {
      return {
        source_arc_id: late.id,
        target_arc_id: early.id,
        relationship_type: 'overlapped',
        confidence: 0.75,
        description: `${late.title} contained ${early.title}`,
        metadata: { allen_relation: 'during' },
      };
    }

    // ── Partial overlap ──────────────────────────────────────────────────────
    if (eEnd > lStart) {
      return {
        source_arc_id: early.id,
        target_arc_id: late.id,
        relationship_type: 'overlapped',
        confidence: 0.7,
        description: `${early.title} and ${late.title} were active simultaneously`,
        metadata: { allen_relation: 'overlaps' },
      };
    }

    // ── Sequential — no overlap ──────────────────────────────────────────────
    const gapDays = (lStart - eEnd) / (1000 * 60 * 60 * 24);

    // Meets: gap < 30 days (one handed off directly to the other)
    if (gapDays <= 30 && early.arc_type === late.arc_type) {
      return {
        source_arc_id: early.id,
        target_arc_id: late.id,
        relationship_type: 'spawned',
        confidence: 0.7,
        description: `${early.title} transitioned into ${late.title}`,
        metadata: { allen_relation: 'meets' },
      };
    }

    // Same-type, close transition
    if (gapDays <= 90 && early.arc_type === late.arc_type) {
      return {
        source_arc_id: early.id,
        target_arc_id: late.id,
        relationship_type: 'spawned',
        confidence: 0.6,
        description: `${early.title} transitioned into ${late.title}`,
        metadata: { allen_relation: 'before_close' },
      };
    }

    if (gapDays <= 365) {
      return {
        source_arc_id: early.id,
        target_arc_id: late.id,
        relationship_type: 'preceded',
        confidence: 0.65,
        description: `${early.title} preceded ${late.title}`,
        metadata: { allen_relation: 'before' },
      };
    }

    return null;
  }

  private map(row: Record<string, unknown>): ArcRelationship {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      source_arc_id: row.source_arc_id as string,
      target_arc_id: row.target_arc_id as string,
      relationship_type: row.relationship_type as RelationshipType,
      description: (row.description as string | null) ?? null,
      confidence: row.confidence as number,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
    };
  }
}

export const arcRelationshipService = new ArcRelationshipService();
