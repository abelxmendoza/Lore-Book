/**
 * Consolidate duplicate project cards into one survivor (mirrors locationMergeService).
 * `projects.id` is the canonical authority; any incoming id (projects or a
 * people_places project mention) is resolved to it before the merge proceeds.
 */
import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import {
  collectNameKeys,
  flagMergedTextSnippets,
  withMergeReviewMetadata,
} from '../utils/mergeReview';
import { recordEntityConsolidation } from './consolidationProtocol';
import { entityLearningService } from './entityLearningService';
import { identityLedgerService } from './identity/identityLedgerService';
import { supabaseAdmin } from './supabaseClient';

export interface ProjectMergeReport {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  canonicalName: string;
  aliases: string[];
  tagsMerged: number;
  factsMoved: number;
  attributesMoved: number;
  omegaLinked: number;
  skillLinksUpdated: number;
  learningLinksUpdated: number;
  suggestionsUpdated: number;
  collisionsDropped: number;
  reviewFlags: string[];
}

type Row = {
  id: string;
  name: string;
  normalized_name: string;
  description: string | null;
  summary: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  importance_score: number | null;
  associated_character_ids: string[] | null;
  associated_location_ids: string[] | null;
  type: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
};

const COLS =
  'id, name, normalized_name, description, summary, tags, metadata, importance_score, associated_character_ids, associated_location_ids, type, status, started_at, ended_at';

function uniq(...lists: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const raw of list ?? []) {
      const label = (raw ?? '').trim();
      if (!label) continue;
      const key = normalizeNameKey(label);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

function mergeText(left: string | null, right: string | null): string | null {
  const parts = [left, right]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    const key = normalizeNameKey(part);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(part);
  }
  return merged.length > 0 ? merged.join('\n\n') : null;
}

function pickCanonicalProjectName(target: Row, source: Row, aliases: string[]): string {
  const candidates = [target.name, source.name, ...aliases].map((n) => n.trim()).filter(Boolean);
  const scored = candidates.map((name) => ({
    name,
    score: name.length + (/\s/.test(name) ? 4 : 0) + (name === target.name ? 2 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.name ?? target.name;
}

function collectNameKeysForProject(row: Row, aliases: string[]): Set<string> {
  return collectNameKeys(row.name, row.normalized_name, aliases);
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
      .from('projects')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) return (existing as { id: string }).id;

    const { data: pp } = await supabaseAdmin
      .from('people_places')
      .select('id, name, type')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!pp) return null;
    const ppRow = pp as { id: string; name: string; type?: string | null };
    const normalized = normalizeNameKey(ppRow.name);

    const { data: byName } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .eq('normalized_name', normalized)
      .maybeSingle();
    if (byName) return (byName as { id: string }).id;

    if (!promote) return ppRow.id;
    const { data: created, error } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: userId,
        name: ppRow.name,
        normalized_name: normalized,
        type: 'project',
        metadata: {
          promoted_from_people_place: ppRow.id,
          promoted_at: new Date().toISOString(),
          source: 'people_places_promotion',
        },
      })
      .select('id')
      .single();
    if (error || !created) {
      logger.warn({ userId, id, err: error }, 'resolveCanonicalProjectId: promote failed');
      return null;
    }
    return (created as { id: string }).id;
  }

  async merge(
    userId: string,
    sourceId: string,
    targetId: string,
    opts: { reason?: string } = {}
  ): Promise<ProjectMergeReport> {
    const [rs, rt] = await Promise.all([
      this.resolveCanonicalProjectId(userId, sourceId),
      this.resolveCanonicalProjectId(userId, targetId),
    ]);
    if (!rs) throw new Error('Source project not found');
    if (!rt) throw new Error('Target project not found');
    if (rs === rt) throw new Error('Cannot merge a project into itself');
    sourceId = rs;
    targetId = rt;

    const [{ data: sd }, { data: td }] = await Promise.all([
      supabaseAdmin.from('projects').select(COLS).eq('id', sourceId).eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('projects').select(COLS).eq('id', targetId).eq('user_id', userId).maybeSingle(),
    ]);
    const source = sd as Row | null;
    const target = td as Row | null;
    if (!source) throw new Error('Source project not found');
    if (!target) throw new Error('Target project not found');

    const report: ProjectMergeReport = {
      sourceId,
      sourceName: source.name,
      targetId,
      targetName: target.name,
      canonicalName: target.name,
      aliases: [],
      tagsMerged: 0,
      factsMoved: 0,
      attributesMoved: 0,
      omegaLinked: 0,
      skillLinksUpdated: 0,
      learningLinksUpdated: 0,
      suggestionsUpdated: 0,
      collisionsDropped: 0,
      reviewFlags: [],
    };

    await this.mergeEntityFacts(userId, sourceId, targetId, report);
    await this.mergeEntityAttributes(userId, sourceId, targetId, report);
    await this.linkOmegaEntities(userId, source, target, targetId, report);
    await this.mergeProjectSuggestions(userId, sourceId, targetId, report);
    await this.rewriteSkillProjectLinks(userId, source, target, targetId, report);
    await this.rewriteLearningProjectLinks(userId, sourceId, source.name, targetId, target.name, report);
    await this.rewritePeoplePlaceLinks(userId, sourceId, targetId, report);

    const card = await this.mergeCardData(userId, source, target, report);
    report.canonicalName = card.name;
    report.aliases = card.aliases;
    report.tagsMerged = card.tags.length;
    report.reviewFlags = card.reviewFlags;

    const { error: delErr } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', sourceId)
      .eq('user_id', userId);
    if (delErr) {
      logger.error({ delErr, sourceId, targetId }, '[ProjectMerge] source delete failed');
      throw delErr;
    }

    await supabaseAdmin
      .from('entity_merge_records')
      .insert({
        user_id: userId,
        source_entity_id: sourceId,
        target_entity_id: targetId,
        source_entity_type: 'PROJECT',
        target_entity_type: 'PROJECT',
        merged_by: 'USER',
        reason: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
      })
      .then(({ error }) => {
        if (error) logger.debug({ error }, '[ProjectMerge] merge record insert failed');
      });

    await recordEntityConsolidation({
      userId,
      action: 'ENTITY_MERGE',
      sourceArtifactType: 'entity',
      sourceArtifactId: sourceId,
      targetArtifactId: targetId,
      beforeState: { id: sourceId, name: source.name, tags: source.tags ?? [] },
      afterState: { merged_into: targetId, canonical_name: report.canonicalName, aliases: report.aliases },
      rationale: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
    }).catch((err) => logger.warn({ err, userId, sourceId, targetId }, '[ProjectMerge] consolidation audit failed'));

    void identityLedgerService.recordMutation({
      userId,
      entityId: targetId,
      entityType: 'project',
      mutationType: 'ENTITY_MERGED',
      previousValue: { id: sourceId, name: source.name },
      newValue: { id: targetId, canonical_name: report.canonicalName, aliases: report.aliases },
      reason: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
      source: 'USER',
      metadata: { sourceId, targetId, reviewFlags: report.reviewFlags },
    });

    void entityLearningService.recordMergeLearning({
      userId,
      domain: 'projects',
      sourceId,
      sourceName: source.name,
      sourceAliases: Array.isArray(source.metadata?.aliases) ? (source.metadata!.aliases as string[]) : [],
      targetId,
      targetName: target.name,
      canonicalName: report.canonicalName,
      aliases: report.aliases,
      reason: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
      metadata: { reviewFlags: report.reviewFlags },
    });

    logger.info({ userId, ...report }, '[ProjectMerge] merge complete');
    return report;
  }

  private async mergeEntityFacts(
    userId: string,
    sourceId: string,
    targetId: string,
    report: ProjectMergeReport
  ): Promise<void> {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin
        .from('entity_facts')
        .select('id, fact')
        .eq('user_id', userId)
        .eq('entity_type', 'project')
        .eq('entity_id', sourceId),
      supabaseAdmin
        .from('entity_facts')
        .select('fact')
        .eq('user_id', userId)
        .eq('entity_type', 'project')
        .eq('entity_id', targetId),
    ]);
    const targetFacts = new Set((targetRows ?? []).map((r: { fact: string }) => normalizeNameKey(r.fact ?? '')));
    for (const row of (sourceRows ?? []) as Array<{ id: string; fact: string }>) {
      if (targetFacts.has(normalizeNameKey(row.fact ?? ''))) {
        await supabaseAdmin.from('entity_facts').delete().eq('id', row.id);
        report.collisionsDropped++;
      } else {
        const { error } = await supabaseAdmin
          .from('entity_facts')
          .update({ entity_id: targetId, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (!error) report.factsMoved++;
      }
    }
  }

  private async mergeEntityAttributes(
    userId: string,
    sourceId: string,
    targetId: string,
    report: ProjectMergeReport
  ): Promise<void> {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin
        .from('entity_attributes')
        .select('id, attribute_type, attribute_value')
        .eq('user_id', userId)
        .eq('entity_type', 'project')
        .eq('entity_id', sourceId),
      supabaseAdmin
        .from('entity_attributes')
        .select('attribute_type, attribute_value')
        .eq('user_id', userId)
        .eq('entity_type', 'project')
        .eq('entity_id', targetId),
    ]);
    const targetKeys = new Set(
      (targetRows ?? []).map(
        (r: { attribute_type: string; attribute_value: string }) => `${r.attribute_type}:${r.attribute_value}`
      )
    );
    for (const row of (sourceRows ?? []) as Array<{ id: string; attribute_type: string; attribute_value: string }>) {
      const key = `${row.attribute_type}:${row.attribute_value}`;
      if (targetKeys.has(key)) {
        await supabaseAdmin.from('entity_attributes').delete().eq('id', row.id);
        report.collisionsDropped++;
      } else {
        const { error } = await supabaseAdmin
          .from('entity_attributes')
          .update({ entity_id: targetId })
          .eq('id', row.id);
        if (!error) report.attributesMoved++;
      }
    }
  }

  private async linkOmegaEntities(
    userId: string,
    source: Row,
    target: Row,
    targetId: string,
    report: ProjectMergeReport
  ): Promise<void> {
    const sourceKey = normalizeNameKey(source.name);
    const { data: rows } = await supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name, metadata')
      .eq('user_id', userId)
      .eq('type', 'PROJECT');
    for (const row of (rows ?? []) as Array<{ id: string; primary_name: string; metadata: Record<string, unknown> | null }>) {
      const meta = row.metadata ?? {};
      const linkedProjectId = typeof meta.canonical_project_id === 'string' ? meta.canonical_project_id : null;
      const nameMatch = normalizeNameKey(row.primary_name) === sourceKey;
      if (linkedProjectId !== source.id && !nameMatch) continue;
      const { error } = await supabaseAdmin
        .from('omega_entities')
        .update({
          metadata: {
            ...meta,
            canonical_project_id: targetId,
            merged_from_project_id: source.id,
            merged_from_project_name: source.name,
            merged_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('user_id', userId);
      if (!error) report.omegaLinked++;
    }
  }

  private async mergeProjectSuggestions(
    userId: string,
    sourceId: string,
    targetId: string,
    report: ProjectMergeReport
  ): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('project_suggestions')
      .update({ matched_project_id: targetId, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('matched_project_id', sourceId)
      .select('id');
    if (!error) report.suggestionsUpdated += (data ?? []).length;
  }

  private async rewriteSkillProjectLinks(
    userId: string,
    source: Row,
    target: Row,
    targetId: string,
    report: ProjectMergeReport
  ): Promise<void> {
    const { data: skills } = await supabaseAdmin
      .from('skills')
      .select('id, related_projects')
      .eq('user_id', userId);
    for (const skill of (skills ?? []) as Array<{ id: string; related_projects: unknown }>) {
      const raw = skill.related_projects;
      if (!Array.isArray(raw) || raw.length === 0) continue;
      let changed = false;
      const next = raw.map((entry) => {
        if (typeof entry === 'string') {
          if (entry === source.id || normalizeNameKey(entry) === normalizeNameKey(source.name)) {
            changed = true;
            return target.name;
          }
          return entry;
        }
        if (entry && typeof entry === 'object') {
          const obj = entry as Record<string, unknown>;
          const id = typeof obj.id === 'string' ? obj.id : null;
          const name = typeof obj.name === 'string' ? obj.name : null;
          if (id === source.id || (name && normalizeNameKey(name) === normalizeNameKey(source.name))) {
            changed = true;
            return { ...obj, id: targetId, name: target.name };
          }
        }
        return entry;
      });
      if (!changed) continue;
      const deduped = JSON.parse(JSON.stringify(next));
      await supabaseAdmin
        .from('skills')
        .update({ related_projects: deduped, updated_at: new Date().toISOString() })
        .eq('id', skill.id)
        .eq('user_id', userId);
      report.skillLinksUpdated++;
    }
  }

  private async rewriteLearningProjectLinks(
    userId: string,
    sourceId: string,
    sourceName: string,
    targetId: string,
    targetName: string,
    report: ProjectMergeReport
  ): Promise<void> {
    const { data: rows } = await supabaseAdmin
      .from('learning_records')
      .select('id, related_projects')
      .eq('user_id', userId);
    const sourceKey = normalizeNameKey(sourceName);
    for (const row of (rows ?? []) as Array<{ id: string; related_projects: string[] | null }>) {
      const refs = row.related_projects ?? [];
      if (refs.length === 0) continue;
      let changed = false;
      const next = uniq(
        refs.map((ref) => {
          if (ref === sourceId || normalizeNameKey(ref) === sourceKey) {
            changed = true;
            return targetName;
          }
          return ref;
        })
      );
      if (!changed) continue;
      await supabaseAdmin
        .from('learning_records')
        .update({ related_projects: next, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('user_id', userId);
      report.learningLinksUpdated++;
    }
  }

  private async rewritePeoplePlaceLinks(
    userId: string,
    sourceId: string,
    targetId: string,
    report: ProjectMergeReport
  ): Promise<void> {
    const { data: rows } = await supabaseAdmin
      .from('people_places')
      .select('id, metadata')
      .eq('user_id', userId)
      .contains('metadata', { canonical_project_id: sourceId });
    for (const row of (rows ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
      const meta = row.metadata ?? {};
      await supabaseAdmin
        .from('people_places')
        .update({
          metadata: {
            ...meta,
            canonical_project_id: targetId,
            merged_from_project_id: sourceId,
            merged_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('user_id', userId);
      report.suggestionsUpdated++;
    }
  }

  private async mergeCardData(
    userId: string,
    source: Row,
    target: Row,
    report: ProjectMergeReport
  ): Promise<{ name: string; aliases: string[]; tags: string[]; reviewFlags: string[] }> {
    const targetMeta = { ...(target.metadata ?? {}) } as Record<string, unknown>;
    const sourceMeta = { ...(source.metadata ?? {}) } as Record<string, unknown>;
    const existingAliases = Array.isArray(targetMeta.aliases) ? (targetMeta.aliases as string[]) : [];
    const sourceAliases = Array.isArray(sourceMeta.aliases) ? (sourceMeta.aliases as string[]) : [];
    const canonicalName = pickCanonicalProjectName(target, source, uniq(existingAliases, sourceAliases, [source.name]));
    const finalAliases = uniq(existingAliases, sourceAliases, [target.name, source.name]).filter(
      (alias) => normalizeNameKey(alias) !== normalizeNameKey(canonicalName)
    );
    const tags = uniq(target.tags, source.tags);
    const description = mergeText(target.description, source.description);
    const summary = mergeText(target.summary, source.summary);

    const sourceKeys = collectNameKeysForProject(source, finalAliases);
    const survivorKeys = collectNameKeysForProject({ ...target, name: canonicalName }, finalAliases);
    const reviewFlags = flagMergedTextSnippets([description, summary], sourceKeys, survivorKeys);

    const startedAt =
      target.started_at && source.started_at
        ? new Date(target.started_at) <= new Date(source.started_at)
          ? target.started_at
          : source.started_at
        : target.started_at ?? source.started_at;
    const endedAt =
      target.ended_at && source.ended_at
        ? new Date(target.ended_at) >= new Date(source.ended_at)
          ? target.ended_at
          : source.ended_at
        : target.ended_at ?? source.ended_at;

    const mergedMetadata: Record<string, unknown> = withMergeReviewMetadata(
      {
        ...sourceMeta,
        ...targetMeta,
        aliases: finalAliases,
        merged_from: uniq(
          Array.isArray(targetMeta.merged_from) ? (targetMeta.merged_from as string[]) : [],
          [source.name]
        ),
        last_merge: {
          at: new Date().toISOString(),
          source_id: source.id,
          source_name: source.name,
          absorbed_ids: uniq(
            Array.isArray((targetMeta.last_merge as Record<string, unknown>)?.absorbed_ids)
              ? ((targetMeta.last_merge as Record<string, unknown>).absorbed_ids as string[])
              : [],
            [source.id]
          ),
        },
      },
      reviewFlags,
      'Some merged text may refer only to the absorbed project name — review in the project modal.'
    );

    await supabaseAdmin
      .from('projects')
      .update({
        name: canonicalName,
        normalized_name: normalizeNameKey(canonicalName),
        tags,
        description,
        summary,
        type: target.type ?? source.type ?? 'project',
        status: target.status ?? source.status ?? 'active',
        importance_score: Math.max(Number(target.importance_score ?? 50), Number(source.importance_score ?? 50)),
        associated_character_ids: uniq(target.associated_character_ids, source.associated_character_ids),
        associated_location_ids: uniq(target.associated_location_ids, source.associated_location_ids),
        started_at: startedAt,
        ended_at: endedAt,
        metadata: mergedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id)
      .eq('user_id', userId);

    return { name: canonicalName, aliases: finalAliases, tags, reviewFlags };
  }
}

export const projectMergeService = new ProjectMergeService();
