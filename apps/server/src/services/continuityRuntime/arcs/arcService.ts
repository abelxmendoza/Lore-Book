import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';

export type ArcType = 'life_era' | 'skill' | 'location' | 'work' | 'custom';
export type ArcSource = 'inferred' | 'user_created';

export interface LifeArc {
  id: string;
  user_id: string;
  title: string;
  arc_type: ArcType;
  parent_id: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  summary: string | null;
  confidence: number;
  source: ArcSource;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  children?: LifeArc[];
}

export interface UpsertArcPayload {
  title: string;
  arc_type: ArcType;
  parent_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  summary?: string | null;
  confidence?: number;
  source?: ArcSource;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export class ArcService {
  async upsert(userId: string, payload: UpsertArcPayload): Promise<LifeArc> {
    const { data, error } = await supabaseAdmin
      .from('life_arcs')
      .upsert(
        {
          user_id: userId,
          title: payload.title,
          arc_type: payload.arc_type,
          parent_id: payload.parent_id ?? null,
          start_date: payload.start_date ?? null,
          end_date: payload.end_date ?? null,
          is_active: payload.is_active ?? false,
          summary: payload.summary ?? null,
          confidence: payload.confidence ?? 0.5,
          source: payload.source ?? 'inferred',
          tags: payload.tags ?? [],
          metadata: payload.metadata ?? {},
        },
        { onConflict: 'user_id,title' }
      )
      .select()
      .single();

    if (error) {
      logger.error({ error, userId, title: payload.title }, 'arcService.upsert failed');
      throw error;
    }
    return this.map(data);
  }

  async getById(userId: string, arcId: string): Promise<LifeArc | null> {
    const { data, error } = await supabaseAdmin
      .from('life_arcs')
      .select('*')
      .eq('user_id', userId)
      .eq('id', arcId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return this.map(data);
  }

  async listForUser(
    userId: string,
    opts: { arc_type?: ArcType; min_confidence?: number; include_children?: boolean } = {}
  ): Promise<LifeArc[]> {
    let q = supabaseAdmin
      .from('life_arcs')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: true, nullsFirst: false });

    if (opts.arc_type) q = q.eq('arc_type', opts.arc_type);
    if (opts.min_confidence !== undefined) q = q.gte('confidence', opts.min_confidence);

    const { data, error } = await q;
    if (error) {
      logger.error({ error, userId }, 'arcService.listForUser failed');
      throw error;
    }

    const arcs = (data ?? []).map(r => this.map(r));

    if (opts.include_children) {
      return this.nestChildren(arcs);
    }
    return arcs;
  }

  async getRootArcs(userId: string): Promise<LifeArc[]> {
    const { data, error } = await supabaseAdmin
      .from('life_arcs')
      .select('*')
      .eq('user_id', userId)
      .is('parent_id', null)
      .order('start_date', { ascending: true, nullsFirst: false });

    if (error) throw error;
    return (data ?? []).map(r => this.map(r));
  }

  async getActiveArcs(userId: string): Promise<LifeArc[]> {
    const { data, error } = await supabaseAdmin
      .from('life_arcs')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('confidence', 0.5);

    if (error) throw error;
    return (data ?? []).map(r => this.map(r));
  }

  async update(userId: string, arcId: string, patch: Partial<UpsertArcPayload>): Promise<LifeArc> {
    const { data, error } = await supabaseAdmin
      .from('life_arcs')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', arcId)
      .select()
      .single();

    if (error) throw error;
    return this.map(data);
  }

  async delete(userId: string, arcId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('life_arcs')
      .delete()
      .eq('user_id', userId)
      .eq('id', arcId);

    if (error) throw error;
  }

  private nestChildren(arcs: LifeArc[]): LifeArc[] {
    const byId = new Map(arcs.map(a => [a.id, { ...a, children: [] as LifeArc[] }]));
    const roots: LifeArc[] = [];

    for (const arc of byId.values()) {
      if (arc.parent_id && byId.has(arc.parent_id)) {
        byId.get(arc.parent_id)!.children!.push(arc);
      } else {
        roots.push(arc);
      }
    }
    return roots;
  }

  private map(row: Record<string, unknown>): LifeArc {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      title: row.title as string,
      arc_type: row.arc_type as ArcType,
      parent_id: (row.parent_id as string | null) ?? null,
      start_date: (row.start_date as string | null) ?? null,
      end_date: (row.end_date as string | null) ?? null,
      is_active: row.is_active as boolean,
      summary: (row.summary as string | null) ?? null,
      confidence: row.confidence as number,
      source: row.source as ArcSource,
      tags: (row.tags as string[]) ?? [],
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}

export const arcService = new ArcService();
