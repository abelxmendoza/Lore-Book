/**
 * Consolidate duplicate place cards into one survivor (mirrors character merge).
 */

import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { pickBestPlaceName } from '../utils/namedPlaceExtractor';
import { supabaseAdmin } from './supabaseClient';

export interface LocationMergeReport {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  mentionsMoved: number;
  factsMoved: number;
  linksMoved: number;
  collisionsDropped: number;
  canonicalName: string;
  aliases: string[];
}

type LocationRow = {
  id: string;
  name: string;
  normalized_name: string;
  type?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  associated_character_ids?: string[] | null;
  associated_location_ids?: string[] | null;
  importance_score?: number | null;
};

const LOC_COLUMNS =
  'id, name, normalized_name, type, summary, metadata, associated_character_ids, associated_location_ids, importance_score';

function mergeUniqueStrings(...lists: Array<string[] | null | undefined>): string[] {
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

class LocationMergeService {
  async merge(
    userId: string,
    sourceId: string,
    targetId: string,
    opts: { reason?: string } = {}
  ): Promise<LocationMergeReport> {
    if (sourceId === targetId) throw new Error('Cannot merge a location into itself');

    const [{ data: sourceData }, { data: targetData }] = await Promise.all([
      supabaseAdmin.from('locations').select(LOC_COLUMNS).eq('id', sourceId).eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('locations').select(LOC_COLUMNS).eq('id', targetId).eq('user_id', userId).maybeSingle(),
    ]);

    const source = sourceData as LocationRow | null;
    const target = targetData as LocationRow | null;
    if (!source) throw new Error('Source location not found');
    if (!target) throw new Error('Target location not found');

    const report: LocationMergeReport = {
      sourceId,
      sourceName: source.name,
      targetId,
      targetName: target.name,
      mentionsMoved: 0,
      factsMoved: 0,
      linksMoved: 0,
      collisionsDropped: 0,
      canonicalName: target.name,
      aliases: [],
    };

    await this.mergeMentions(userId, sourceId, targetId, report);
    await this.mergeCharacterLinks(userId, sourceId, targetId, report);
    await this.mergeEntityFacts(userId, sourceId, targetId, report);
    await this.mergeEntityAttributes(userId, sourceId, targetId, report);
    await this.rewriteAssociatedLocationIds(userId, sourceId, targetId);
    const card = await this.mergeCardData(userId, source, target);
    report.canonicalName = card.name;
    report.aliases = card.aliases;

    const { error: delErr } = await supabaseAdmin
      .from('locations')
      .delete()
      .eq('id', sourceId)
      .eq('user_id', userId);
    if (delErr) {
      logger.error({ delErr, sourceId, targetId }, '[LocationMerge] source delete failed');
      throw delErr;
    }

    await supabaseAdmin.from('entity_merge_records').insert({
      user_id: userId,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      source_entity_type: 'LOCATION',
      target_entity_type: 'LOCATION',
      merged_by: 'USER',
      reason: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
    }).then(({ error }) => {
      if (error) logger.debug({ error }, '[LocationMerge] merge record insert failed');
    });

    logger.info({ userId, ...report }, '[LocationMerge] merge complete');
    return report;
  }

  private async mergeMentions(userId: string, sourceId: string, targetId: string, report: LocationMergeReport) {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin.from('location_mentions').select('id, memory_id').eq('user_id', userId).eq('location_id', sourceId),
      supabaseAdmin.from('location_mentions').select('memory_id').eq('user_id', userId).eq('location_id', targetId),
    ]);
    const targetMemories = new Set((targetRows ?? []).map((r: { memory_id: string }) => r.memory_id));
    for (const row of (sourceRows ?? []) as Array<{ id: string; memory_id: string }>) {
      if (targetMemories.has(row.memory_id)) {
        await supabaseAdmin.from('location_mentions').delete().eq('id', row.id);
        report.collisionsDropped++;
      } else {
        const { error } = await supabaseAdmin
          .from('location_mentions')
          .update({ location_id: targetId })
          .eq('id', row.id);
        if (!error) {
          report.mentionsMoved++;
          targetMemories.add(row.memory_id);
        } else {
          await supabaseAdmin.from('location_mentions').delete().eq('id', row.id);
          report.collisionsDropped++;
        }
      }
    }
  }

  private async mergeCharacterLinks(userId: string, sourceId: string, targetId: string, report: LocationMergeReport) {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin
        .from('location_character_links')
        .select('id, character_id, relationship_type')
        .eq('user_id', userId)
        .eq('location_id', sourceId),
      supabaseAdmin
        .from('location_character_links')
        .select('character_id, relationship_type')
        .eq('user_id', userId)
        .eq('location_id', targetId),
    ]);
    const targetKeys = new Set(
      (targetRows ?? []).map((r: { character_id: string; relationship_type: string }) =>
        `${r.character_id}:${r.relationship_type}`
      )
    );
    for (const row of (sourceRows ?? []) as Array<{ id: string; character_id: string; relationship_type: string }>) {
      const key = `${row.character_id}:${row.relationship_type}`;
      if (targetKeys.has(key)) {
        await supabaseAdmin.from('location_character_links').delete().eq('id', row.id);
        report.collisionsDropped++;
      } else {
        const { error } = await supabaseAdmin
          .from('location_character_links')
          .update({ location_id: targetId })
          .eq('id', row.id);
        if (!error) {
          report.linksMoved++;
          targetKeys.add(key);
        } else {
          await supabaseAdmin.from('location_character_links').delete().eq('id', row.id);
          report.collisionsDropped++;
        }
      }
    }
  }

  private async mergeEntityFacts(userId: string, sourceId: string, targetId: string, report: LocationMergeReport) {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin
        .from('entity_facts')
        .select('id, fact')
        .eq('user_id', userId)
        .eq('entity_type', 'location')
        .eq('entity_id', sourceId),
      supabaseAdmin
        .from('entity_facts')
        .select('fact')
        .eq('user_id', userId)
        .eq('entity_type', 'location')
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
          .update({ entity_id: targetId })
          .eq('id', row.id);
        if (!error) report.factsMoved++;
      }
    }
  }

  private async mergeEntityAttributes(userId: string, sourceId: string, targetId: string, report: LocationMergeReport) {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin
        .from('entity_attributes')
        .select('id, attribute_type, attribute_value')
        .eq('user_id', userId)
        .eq('entity_type', 'location')
        .eq('entity_id', sourceId),
      supabaseAdmin
        .from('entity_attributes')
        .select('attribute_type, attribute_value')
        .eq('user_id', userId)
        .eq('entity_type', 'location')
        .eq('entity_id', targetId),
    ]);
    const targetKeys = new Set(
      (targetRows ?? []).map((r: { attribute_type: string; attribute_value: string }) =>
        `${r.attribute_type}:${r.attribute_value}`
      )
    );
    for (const row of (sourceRows ?? []) as Array<{ id: string; attribute_type: string; attribute_value: string }>) {
      const key = `${row.attribute_type}:${row.attribute_value}`;
      if (targetKeys.has(key)) {
        await supabaseAdmin.from('entity_attributes').delete().eq('id', row.id);
        report.collisionsDropped++;
      } else {
        await supabaseAdmin.from('entity_attributes').update({ entity_id: targetId }).eq('id', row.id);
      }
    }
  }

  private async rewriteAssociatedLocationIds(userId: string, sourceId: string, targetId: string) {
    const { data: rows } = await supabaseAdmin
      .from('locations')
      .select('id, associated_location_ids')
      .eq('user_id', userId)
      .contains('associated_location_ids', [sourceId]);

    for (const row of (rows ?? []) as Array<{ id: string; associated_location_ids: string[] | null }>) {
      const next = [...new Set((row.associated_location_ids ?? []).map(id => (id === sourceId ? targetId : id)))];
      await supabaseAdmin
        .from('locations')
        .update({ associated_location_ids: next, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('user_id', userId);
    }
  }

  private async mergeCardData(userId: string, source: LocationRow, target: LocationRow): Promise<{ name: string; aliases: string[] }> {
    const sourceMeta = { ...(source.metadata ?? {}) } as Record<string, unknown>;
    const targetMeta = { ...(target.metadata ?? {}) } as Record<string, unknown>;
    const prevAliases = Array.isArray(targetMeta.aliases) ? (targetMeta.aliases as string[]) : [];

    const aliasCandidates = mergeUniqueStrings(prevAliases, [source.name], prevAliases);
    const canonicalName = pickBestPlaceName([target.name, source.name, ...aliasCandidates]);
    const aliases = aliasCandidates.filter(a => normalizeNameKey(a) !== normalizeNameKey(canonicalName));

    const mergedTags = mergeUniqueStrings(
      Array.isArray(targetMeta.place_tags) ? (targetMeta.place_tags as string[]) : [],
      Array.isArray(sourceMeta.place_tags) ? (sourceMeta.place_tags as string[]) : []
    );
    const mergedSig = mergeUniqueStrings(
      Array.isArray(targetMeta.place_significance) ? (targetMeta.place_significance as string[]) : [],
      Array.isArray(sourceMeta.place_significance) ? (sourceMeta.place_significance as string[]) : []
    );

    const mergedChars = [
      ...new Set([...(target.associated_character_ids ?? []), ...(source.associated_character_ids ?? [])]),
    ];
    const mergedLocIds = [
      ...new Set([
        ...(target.associated_location_ids ?? []),
        ...(source.associated_location_ids ?? []).filter(id => id !== source.id && id !== target.id),
      ]),
    ];

    const summary = [target.summary, source.summary].filter(Boolean).join('\n\n') || null;
    const importance = Math.max(target.importance_score ?? 0, source.importance_score ?? 0);

    await supabaseAdmin
      .from('locations')
      .update({
        name: canonicalName,
        normalized_name: normalizeNameKey(canonicalName),
        type: target.type || source.type || null,
        summary,
        importance_score: importance,
        associated_character_ids: mergedChars,
        associated_location_ids: mergedLocIds,
        metadata: {
          ...targetMeta,
          ...sourceMeta,
          aliases,
          place_tags: mergedTags,
          place_significance: mergedSig,
          merge_history: [
            ...(Array.isArray(targetMeta.merge_history) ? (targetMeta.merge_history as unknown[]) : []),
            { merged_from: source.name, merged_at: new Date().toISOString() },
          ],
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id)
      .eq('user_id', userId);

    return { name: canonicalName, aliases };
  }
}

export const locationMergeService = new LocationMergeService();
