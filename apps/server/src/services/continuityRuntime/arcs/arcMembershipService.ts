import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';

export type MembershipRole = 'defining_moment' | 'turning_point' | 'background' | 'transition';

export interface ArcMembership {
  id: string;
  user_id: string;
  arc_id: string;
  event_candidate_id: string;
  importance_score: number;
  role: MembershipRole | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SetMembershipPayload {
  arc_id: string;
  event_candidate_id: string;
  importance_score?: number;
  role?: MembershipRole | null;
  metadata?: Record<string, unknown>;
}

export class ArcMembershipService {
  async set(userId: string, payload: SetMembershipPayload): Promise<ArcMembership> {
    const { data, error } = await supabaseAdmin
      .from('arc_memberships')
      .upsert(
        {
          user_id: userId,
          arc_id: payload.arc_id,
          event_candidate_id: payload.event_candidate_id,
          importance_score: payload.importance_score ?? 0.5,
          role: payload.role ?? null,
          metadata: payload.metadata ?? {},
        },
        { onConflict: 'arc_id,event_candidate_id' }
      )
      .select()
      .single();

    if (error) {
      logger.error({ error, userId, payload }, 'arcMembershipService.set failed');
      throw error;
    }
    return this.map(data);
  }

  async setMany(userId: string, payloads: SetMembershipPayload[]): Promise<void> {
    if (payloads.length === 0) return;

    const rows = payloads.map(p => ({
      user_id: userId,
      arc_id: p.arc_id,
      event_candidate_id: p.event_candidate_id,
      importance_score: p.importance_score ?? 0.5,
      role: p.role ?? null,
      metadata: p.metadata ?? {},
    }));

    const { error } = await supabaseAdmin
      .from('arc_memberships')
      .upsert(rows, { onConflict: 'arc_id,event_candidate_id' });

    if (error) {
      logger.error({ error, userId, count: rows.length }, 'arcMembershipService.setMany failed');
      throw error;
    }
  }

  async getMembershipsForArc(
    userId: string,
    arcId: string,
    opts: { min_importance?: number; limit?: number } = {}
  ): Promise<ArcMembership[]> {
    let q = supabaseAdmin
      .from('arc_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('arc_id', arcId)
      .order('importance_score', { ascending: false });

    if (opts.min_importance !== undefined) q = q.gte('importance_score', opts.min_importance);
    if (opts.limit) q = q.limit(opts.limit);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(r => this.map(r));
  }

  async getArcsForEventCandidate(
    userId: string,
    eventCandidateId: string
  ): Promise<ArcMembership[]> {
    const { data, error } = await supabaseAdmin
      .from('arc_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('event_candidate_id', eventCandidateId)
      .order('importance_score', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(r => this.map(r));
  }

  async remove(userId: string, arcId: string, eventCandidateId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('arc_memberships')
      .delete()
      .eq('user_id', userId)
      .eq('arc_id', arcId)
      .eq('event_candidate_id', eventCandidateId);

    if (error) throw error;
  }

  private map(row: Record<string, unknown>): ArcMembership {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      arc_id: row.arc_id as string,
      event_candidate_id: row.event_candidate_id as string,
      importance_score: row.importance_score as number,
      role: (row.role as MembershipRole | null) ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
    };
  }
}

export const arcMembershipService = new ArcMembershipService();
