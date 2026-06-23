/**
 * Projects Book service — canonical project entities (mirrors locationService).
 * The `projects` table is the single authority; reads emit projects.id.
 */
import { logger } from '../logger';
import { normalizeNameKey, namesOverlapByContainment } from '../utils/nameNormalization';
import { supabaseAdmin } from './supabaseClient';

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  normalized_name: string;
  type: string | null;
  status: string | null;
  description: string | null;
  summary: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  importance_score: number | null;
  associated_character_ids: string[] | null;
  associated_location_ids: string[] | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, user_id, name, normalized_name, type, status, description, summary, tags, metadata, importance_score, associated_character_ids, associated_location_ids, started_at, ended_at, created_at, updated_at';

export type ProjectUpdate = Partial<{
  status: string | null;
  type: string | null;
  description: string | null;
  summary: string | null;
  tags: string[];
  importance_score: number;
}>;

class ProjectService {
  async listProjects(userId: string): Promise<ProjectRow[]> {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) {
      logger.warn({ error, userId }, 'listProjects failed — trying organizations fallback');
      return this.listProjectsFromOrganizations(userId);
    }
    if ((data ?? []).length > 0) return (data ?? []) as ProjectRow[];
    return this.listProjectsFromOrganizations(userId);
  }

  /** When `projects` is empty/unmigrated, surface organizations as project cards (WMA parity). */
  private async listProjectsFromOrganizations(userId: string): Promise<ProjectRow[]> {
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name, description, type, status, updated_at, created_at')
      .eq('user_id', userId)
      .not('type', 'eq', 'family')
      .order('updated_at', { ascending: false })
      .limit(24);
    if (error) {
      logger.error({ error, userId }, 'listProjectsFromOrganizations failed');
      return [];
    }
    const now = new Date().toISOString();
    return (data ?? []).map((o: Record<string, unknown>) => ({
      id: String(o.id),
      user_id: userId,
      name: String(o.name ?? 'Project'),
      normalized_name: String(o.name ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
      type: (o.type as string) ?? 'project',
      status: (o.status as string) ?? 'active',
      description: (o.description as string) ?? null,
      summary: null,
      tags: null,
      metadata: { source: 'organizations_fallback' },
      importance_score: null,
      associated_character_ids: null,
      associated_location_ids: null,
      started_at: null,
      ended_at: null,
      created_at: String(o.created_at ?? now),
      updated_at: String(o.updated_at ?? now),
    }));
  }

  async getProject(userId: string, id: string): Promise<ProjectRow | null> {
    const { data } = await supabaseAdmin
      .from('projects').select(COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle();
    return (data as ProjectRow) ?? null;
  }

  async updateProject(userId: string, id: string, patch: ProjectUpdate): Promise<ProjectRow | null> {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select(COLUMNS)
      .maybeSingle();
    if (error) {
      logger.error({ error, userId, id }, 'updateProject failed');
      return null;
    }
    return (data as ProjectRow) ?? null;
  }

  /** Delete a project (user-scoped). Returns false if it didn't exist. */
  async deleteProject(userId: string, id: string): Promise<boolean> {
    const { data: existing } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!existing) return false;

    const { error } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) {
      logger.error({ error, userId, id }, 'deleteProject failed');
      throw error;
    }
    return true;
  }

  /** Exact-name + containment duplicate groups (mirrors locations /duplicates). */
  async listDuplicates(userId: string): Promise<Array<{ match_type: 'exact' | 'containment'; canonical_name: string; projects: ProjectRow[] }>> {
    const rows = await this.listProjects(userId);
    const groups: Array<{ match_type: 'exact' | 'containment'; canonical_name: string; projects: ProjectRow[] }> = [];

    const byKey = new Map<string, ProjectRow[]>();
    for (const row of rows) {
      const key = normalizeNameKey(row.name);
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(row);
    }
    for (const [canonical_name, projects] of byKey.entries()) {
      if (projects.length > 1) groups.push({ match_type: 'exact', canonical_name, projects });
    }

    const seen = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        const ak = normalizeNameKey(a.name), bk = normalizeNameKey(b.name);
        if (ak === bk || !namesOverlapByContainment(ak, bk)) continue;
        const pairKey = [a.id, b.id].sort().join(':');
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        groups.push({ match_type: 'containment', canonical_name: ak.length <= bk.length ? ak : bk, projects: [a, b] });
      }
    }
    return groups;
  }
}

export const projectService = new ProjectService();
