/**
 * Consolidate duplicate project cards into one survivor (mirrors locationMergeService).
 * `projects.id` is the canonical authority; any incoming id (projects or a
 * people_places project mention) is resolved to it before the merge proceeds.
 */
import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { supabaseAdmin } from './supabaseClient';

export interface ProjectMergeReport {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  canonicalName: string;
  tagsMerged: number;
}

type Row = {
  id: string;
  name: string;
  description: string | null;
  summary: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  importance_score: number | null;
  associated_character_ids: string[] | null;
  associated_location_ids: string[] | null;
};

const COLS = 'id, name, description, summary, tags, metadata, importance_score, associated_character_ids, associated_location_ids';

function uniq(...lists: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) for (const v of list ?? []) {
    const t = (v ?? '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t); out.push(t);
  }
  return out;
}

class ProjectMergeService {
  /** Resolve any id to the canonical projects.id (mirrors location resolver). */
  async resolveCanonicalProjectId(
    userId: string,
    id: string,
    opts: { promote?: boolean } = {}
  ): Promise<string | null> {
    const promote = opts.promote ?? true;
    const { data: existing } = await supabaseAdmin
      .from('projects').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
    if (existing) return (existing as { id: string }).id;

    const { data: pp } = await supabaseAdmin
      .from('people_places').select('id, name, type').eq('id', id).eq('user_id', userId).maybeSingle();
    if (!pp) return null;
    const ppRow = pp as { id: string; name: string; type?: string | null };
    const normalized = normalizeNameKey(ppRow.name);

    const { data: byName } = await supabaseAdmin
      .from('projects').select('id').eq('user_id', userId).eq('normalized_name', normalized).maybeSingle();
    if (byName) return (byName as { id: string }).id;

    if (!promote) return ppRow.id;
    const { data: created, error } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: userId, name: ppRow.name, normalized_name: normalized, type: 'project',
        metadata: { promoted_from_people_place: ppRow.id, promoted_at: new Date().toISOString(), source: 'people_places_promotion' },
      })
      .select('id').single();
    if (error || !created) {
      logger.warn({ userId, id, err: error }, 'resolveCanonicalProjectId: promote failed');
      return null;
    }
    return (created as { id: string }).id;
  }

  async merge(userId: string, sourceId: string, targetId: string): Promise<ProjectMergeReport> {
    const [rs, rt] = await Promise.all([
      this.resolveCanonicalProjectId(userId, sourceId),
      this.resolveCanonicalProjectId(userId, targetId),
    ]);
    if (!rs) throw new Error('Source project not found');
    if (!rt) throw new Error('Target project not found');
    if (rs === rt) throw new Error('Cannot merge a project into itself');
    sourceId = rs; targetId = rt;

    const [{ data: sd }, { data: td }] = await Promise.all([
      supabaseAdmin.from('projects').select(COLS).eq('id', sourceId).eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('projects').select(COLS).eq('id', targetId).eq('user_id', userId).maybeSingle(),
    ]);
    const source = sd as Row | null;
    const target = td as Row | null;
    if (!source) throw new Error('Source project not found');
    if (!target) throw new Error('Target project not found');

    const tags = uniq(target.tags, source.tags);
    const aliases = uniq(
      ((target.metadata?.aliases as string[]) ?? []),
      ((source.metadata?.aliases as string[]) ?? []),
      [source.name]
    );
    await supabaseAdmin.from('projects').update({
      tags,
      description: target.description ?? source.description,
      summary: target.summary ?? source.summary,
      importance_score: Math.max(Number(target.importance_score ?? 50), Number(source.importance_score ?? 50)),
      associated_character_ids: uniq(target.associated_character_ids, source.associated_character_ids),
      associated_location_ids: uniq(target.associated_location_ids, source.associated_location_ids),
      metadata: { ...(source.metadata ?? {}), ...(target.metadata ?? {}), aliases },
      updated_at: new Date().toISOString(),
    }).eq('id', targetId).eq('user_id', userId);

    await supabaseAdmin.from('projects').delete().eq('id', sourceId).eq('user_id', userId);

    return {
      sourceId, sourceName: source.name, targetId, targetName: target.name,
      canonicalName: target.name, tagsMerged: tags.length,
    };
  }
}

export const projectMergeService = new ProjectMergeService();
