/**
 * Consolidate duplicate place cards into one survivor (mirrors character merge).
 */

import { logger } from '../logger';
import { entityLearningService } from './entityLearningService';
import { identityLedgerService } from './identity/identityLedgerService';
import { readStrengthScore, preserveSurvivorStrength, shouldSwapForStrength } from './identity/strengthWeightedMerge';
import { normalizeNameKey } from '../utils/nameNormalization';
import {
  collectNameKeys,
  flagMergedTextSnippets,
  withMergeReviewMetadata,
} from '../utils/mergeReview';
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
  reviewFlags: string[];
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

function metadataStringArray(meta: Record<string, unknown>, key: string): string[] {
  const value = meta[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function mergeMetadataArrays(key: string, targetMeta: Record<string, unknown>, sourceMeta: Record<string, unknown>): string[] {
  return mergeUniqueStrings(metadataStringArray(targetMeta, key), metadataStringArray(sourceMeta, key));
}

function isResidenceName(name: string): boolean {
  return /\b(?:house|home|family home|apartment|condo|casa|residence)\b/i.test(name);
}

function ownerResidenceScore(name: string): number {
  if (!isResidenceName(name)) return 0;
  if (/\b(?:mom|dad|abuela|abuelo|grandma|grandpa|tio|tia|tía|aunt|uncle|dr\.?|professor)\b(?:'s|s)?\s+(?:house|home|apartment|condo|casa|place|office|clinic)\b/i.test(name)) {
    return 80;
  }
  if (/[A-Za-zÀ-ÿ]+(?:'s|s)\s+(?:house|home|apartment|condo|casa|place|office|clinic)\b/i.test(name)) {
    return 70;
  }
  if (/\bfamily\s+home\b/i.test(name)) return 20;
  return 10;
}

function canonicalPlaceMergeName(targetName: string, sourceName: string, aliases: string[]): string {
  const candidates = mergeUniqueStrings([targetName, sourceName], aliases);
  const ownerBased = candidates
    .filter((name) => ownerResidenceScore(name) > 0)
    .sort((a, b) => ownerResidenceScore(b) - ownerResidenceScore(a) || a.length - b.length)[0];

  if (ownerBased && ownerResidenceScore(ownerBased) >= 70) return titleCaseResidence(ownerBased);
  return pickBestPlaceName(candidates);
}

function titleCaseResidence(name: string): string {
  return name
    .replace(/[’‘]/g, "'")
    .replace(/\b(abuelas|abuela's)\s+house\b/i, "Abuela's House")
    .replace(/\b(moms|mom's)\s+house\b/i, "Mom's House")
    .replace(/\b(dads|dad's)\s+house\b/i, "Dad's House")
    .replace(/\b(tio\s+[A-Za-zÀ-ÿ]+)'?s?\s+house\b/i, (_m, owner: string) => `${titleCaseWords(owner)}'s House`)
    .replace(/\b(tia|tía)\s+([A-Za-zÀ-ÿ]+)'?s?\s+house\b/i, (_m, title: string, namePart: string) => `${titleCaseWords(`${title} ${namePart}`)}'s House`)
    .replace(/\b([A-Za-zÀ-ÿ]+)'s\s+house\b/i, (_m, owner: string) => `${titleCaseWords(owner)}'s House`);
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^t[ií]a$/i.test(word)) return 'Tía';
      if (/^tio$/i.test(word)) return 'Tio';
      if (/^dr\.?$/i.test(word)) return 'Dr.';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function residenceAliasVariants(name: string): string[] {
  const variants = new Set<string>();
  const cleaned = name.trim().replace(/[’‘]/g, "'");
  if (!cleaned) return [];
  variants.add(cleaned);
  variants.add(titleCaseResidence(cleaned));
  if (/'s\s+/i.test(cleaned)) variants.add(cleaned.replace(/'s\s+/i, 's '));
  if (/\babuelas\s+house\b/i.test(cleaned)) variants.add("Abuela's House");
  if (/\bmoms\s+house\b/i.test(cleaned)) variants.add("Mom's House");
  return [...variants].filter(Boolean);
}

export function buildMergedPlaceIdentity(
  source: Pick<LocationRow, 'id' | 'name' | 'metadata'>,
  target: Pick<LocationRow, 'id' | 'name' | 'metadata'>,
): { canonicalName: string; aliases: string[]; mergeHistory: Array<Record<string, unknown>> } {
  const sourceMeta = { ...(source.metadata ?? {}) } as Record<string, unknown>;
  const targetMeta = { ...(target.metadata ?? {}) } as Record<string, unknown>;
  const targetAliases = metadataStringArray(targetMeta, 'aliases');
  const sourceAliases = metadataStringArray(sourceMeta, 'aliases');
  const rawAliasCandidates = mergeUniqueStrings(
    targetAliases,
    sourceAliases,
    [source.name, target.name],
    [...sourceAliases, source.name, target.name].flatMap(residenceAliasVariants),
  );
  const canonicalName = canonicalPlaceMergeName(target.name, source.name, rawAliasCandidates);
  const aliases = rawAliasCandidates.filter((alias) => alias.trim() && alias.trim() !== canonicalName);
  const mergeHistory = [
    ...(Array.isArray(targetMeta.merge_history) ? (targetMeta.merge_history as Array<Record<string, unknown>>) : []),
    {
      source_id: source.id,
      source_name: source.name,
      source_aliases: sourceAliases,
      target_id: target.id,
      target_name_before: target.name,
      canonical_name_after: canonicalName,
      merged_at: new Date().toISOString(),
    },
  ];

  return { canonicalName, aliases: mergeUniqueStrings(aliases), mergeHistory };
}

class LocationMergeService {
  /**
   * Hotfix for location-authority drift: the Location Book (GET /api/locations →
   * locationService.listLocations) can emit a people_places id while merge resolves
   * against the `locations` table. These id spaces are disjoint, which produced the
   * "Source location not found" 500. Until listLocations is made canonical-id-first
   * (see docs/location-id-consolidation-plan.md), resolve any incoming id to the
   * canonical locations.id: (1) already a locations row → use it; (2) a people_places
   * id → map by normalized name to the canonical locations row; (3) people_places with
   * no canonical row yet → promote it to a canonical locations row. Returns the
   * canonical locations.id or null when the id resolves to nothing the user owns.
   */
  async resolveCanonicalLocationId(
    userId: string,
    id: string,
    opts: { promote?: boolean } = {}
  ): Promise<string | null> {
    const promote = opts.promote ?? true;
    // (1) Already canonical.
    const { data: existing } = await supabaseAdmin
      .from('locations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) return (existing as { id: string }).id;

    // (2) people_places id → map to canonical by normalized name.
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
      .from('locations')
      .select('id')
      .eq('user_id', userId)
      .eq('normalized_name', normalized)
      .maybeSingle();
    if (byName) return (byName as { id: string }).id;

    // (3) No canonical row yet. Read-only callers (e.g. GET facts) stop here with
    // the people_places id; write callers promote it into `locations`.
    if (!promote) return ppRow.id;

    // Promote the people_places entry into `locations`, preserving provenance.
    const { data: created, error: createErr } = await supabaseAdmin
      .from('locations')
      .insert({
        user_id: userId,
        name: ppRow.name,
        normalized_name: normalized,
        type: ppRow.type ?? 'place',
        metadata: { promoted_from_people_place: ppRow.id, promoted_at: new Date().toISOString(), source: 'people_places_promotion' },
      })
      .select('id')
      .single();
    if (createErr || !created) {
      logger.warn({ userId, id, err: createErr }, 'resolveCanonicalLocationId: could not promote people_place to canonical location');
      return null;
    }
    return (created as { id: string }).id;
  }

  async merge(
    userId: string,
    sourceId: string,
    targetId: string,
    opts: { reason?: string } = {}
  ): Promise<LocationMergeReport> {
    // Resolve both ids to the canonical authority BEFORE any equality/lookup check,
    // so a people_places-id payload from the Location Book merges correctly.
    const [resolvedSourceId, resolvedTargetId] = await Promise.all([
      this.resolveCanonicalLocationId(userId, sourceId),
      this.resolveCanonicalLocationId(userId, targetId),
    ]);
    if (!resolvedSourceId) throw new Error('Source location not found');
    if (!resolvedTargetId) throw new Error('Target location not found');
    if (resolvedSourceId === resolvedTargetId) throw new Error('Cannot merge a location into itself');
    sourceId = resolvedSourceId;
    targetId = resolvedTargetId;

    const [{ data: sourceData }, { data: targetData }] = await Promise.all([
      supabaseAdmin.from('locations').select(LOC_COLUMNS).eq('id', sourceId).eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('locations').select(LOC_COLUMNS).eq('id', targetId).eq('user_id', userId).maybeSingle(),
    ]);

    let source = sourceData as LocationRow | null;
    let target = targetData as LocationRow | null;
    if (!source) throw new Error('Source location not found');
    if (!target) throw new Error('Target location not found');

    // Strength-weighted direction guard: a weak place identity must never absorb
    // a meaningfully stronger one. Swap so the stronger survives. Degrades to the
    // caller's direction when scores are unavailable. See strengthWeightedMerge.
    let sourceScore = await readStrengthScore('locations', userId, sourceId);
    let targetScore = await readStrengthScore('locations', userId, targetId);
    let directionSwapped = false;
    if (shouldSwapForStrength(sourceScore, targetScore)) {
      [sourceId, targetId] = [targetId, sourceId];
      [source, target] = [target, source];
      [sourceScore, targetScore] = [targetScore, sourceScore];
      directionSwapped = true;
      logger.info(
        { userId, survivorId: targetId, absorbedId: sourceId },
        '[LocationMerge] swapped merge direction — stronger identity survives'
      );
    }

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
      reviewFlags: [],
    };

    await this.mergeMentions(userId, sourceId, targetId, report);
    await this.mergeCharacterLinks(userId, sourceId, targetId, report);
    await this.mergeEntityFacts(userId, sourceId, targetId, report);
    await this.mergeEntityAttributes(userId, sourceId, targetId, report);
    await this.rewriteAssociatedLocationIds(userId, sourceId, targetId);
    const card = await this.mergeCardData(userId, source, target);
    report.canonicalName = card.name;
    report.aliases = card.aliases;
    report.reviewFlags = card.reviewFlags;

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

    // Survivor inherits the stronger identity-strength score (best-effort).
    await preserveSurvivorStrength('locations', userId, targetId, sourceScore, targetScore);

    void identityLedgerService.recordMutation({
      userId,
      entityId: targetId,
      entityType: 'location',
      mutationType: 'ENTITY_MERGED',
      previousValue: { id: sourceId, name: source.name },
      newValue: { id: targetId, canonical_name: report.canonicalName, aliases: report.aliases },
      reason: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
      source: 'USER',
      metadata: { sourceId, targetId, directionSwapped, sourceScore, targetScore, reviewFlags: report.reviewFlags },
    });

    void entityLearningService.recordMergeLearning({
      userId,
      domain: 'locations',
      sourceId,
      sourceName: source.name,
      sourceAliases: Array.isArray(source.metadata?.aliases) ? (source.metadata!.aliases as string[]) : [],
      targetId,
      targetName: target.name,
      canonicalName: report.canonicalName,
      aliases: report.aliases,
      reason: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
      metadata: { directionSwapped, sourceScore, targetScore, reviewFlags: report.reviewFlags },
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

  private async mergeCardData(
    userId: string,
    source: LocationRow,
    target: LocationRow
  ): Promise<{ name: string; aliases: string[]; reviewFlags: string[] }> {
    const sourceMeta = { ...(source.metadata ?? {}) } as Record<string, unknown>;
    const targetMeta = { ...(target.metadata ?? {}) } as Record<string, unknown>;
    const identity = buildMergedPlaceIdentity(source, target);
    const canonicalName = identity.canonicalName;
    const aliases = identity.aliases;

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
    const sourceKeys = collectNameKeys(source.name, normalizeNameKey(source.name), aliases);
    const survivorKeys = collectNameKeys(canonicalName, normalizeNameKey(canonicalName), aliases);
    const reviewFlags = flagMergedTextSnippets([summary], sourceKeys, survivorKeys);
    const sourceType = source.type ?? undefined;
    const targetType = target.type ?? undefined;
    const type =
      /^(?:private_residence|family_home|home|house)$/i.test(sourceType ?? '') &&
      /^(?:private_residence|family_home|home|house|place)$/i.test(targetType ?? '')
        ? source.type
        : target.type || source.type || null;

    await supabaseAdmin
      .from('locations')
      .update({
        name: canonicalName,
        normalized_name: normalizeNameKey(canonicalName),
        type,
        summary,
        importance_score: importance,
        associated_character_ids: mergedChars,
        associated_location_ids: mergedLocIds,
        metadata: withMergeReviewMetadata(
          {
            ...sourceMeta,
            ...targetMeta,
            aliases,
            place_tags: mergedTags,
            place_significance: mergedSig,
            rooms: mergeMetadataArrays('rooms', targetMeta, sourceMeta),
            evidence: mergeMetadataArrays('evidence', targetMeta, sourceMeta),
            source_messages: mergeMetadataArrays('source_messages', targetMeta, sourceMeta),
            source_message_ids: mergeMetadataArrays('source_message_ids', targetMeta, sourceMeta),
            privacy_flags: mergeMetadataArrays('privacy_flags', targetMeta, sourceMeta),
            privacy_sensitive: Boolean(targetMeta.privacy_sensitive || sourceMeta.privacy_sensitive),
            privacySensitive: Boolean(targetMeta.privacySensitive || sourceMeta.privacySensitive),
            merge_history: identity.mergeHistory,
          },
          reviewFlags,
          'Some merged text may refer only to the absorbed place name — review on the place card.'
        ),
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id)
      .eq('user_id', userId);

    return { name: canonicalName, aliases, reviewFlags };
  }
}

export const locationMergeService = new LocationMergeService();
