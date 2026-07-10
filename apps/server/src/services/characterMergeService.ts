/**
 * CharacterMergeService — consolidate a duplicate character into a survivor.
 *
 * Everything that references the source character is reassigned to the
 * target, the cards' own data is merged (aliases, fill-empty fields,
 * mention counts, user overrides), linked omega entities are merged, and the
 * source row is deleted LAST.
 *
 * No transactions are available through supabase-js, so the design rules are:
 *   - non-destructive steps first; the only irreversible step is the final
 *     source-row delete
 *   - every step is idempotent — a crashed merge can simply be re-run
 *   - on a unique-constraint collision the SOURCE-side row is deleted
 *     (the target already has that data)
 *
 * NOT built on characterDeletionService: that would destroy the source's
 * omega entity and detach events — a merge must preserve them on the target.
 */

import { logger } from '../logger';

import { identityLedgerService } from './identity/identityLedgerService';
import { entityLearningService } from './entityLearningService';
import { readStrengthScore, preserveSurvivorStrength, shouldSwapForStrength } from './identity/strengthWeightedMerge';
import { normalizeNameKey } from '../utils/nameNormalization';
import {
  collectNameKeys,
  flagMergedTextSnippets,
  withMergeReviewMetadata,
} from '../utils/mergeReview';

import { omegaMemoryService } from './omegaMemoryService';
import { recordEntityConsolidation } from './consolidationProtocol';
import { supabaseAdmin } from './supabaseClient';
import { incrementEntityResolutionMetric } from './entities/entityResolutionMetrics';
import { assertEntityMergeAuthorized } from './entities/entityTypeCompatibility';

export interface MergeReport {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  relationshipsMoved: number;
  memoriesMoved: number;
  timelineEventsMoved: number;
  factsMoved: number;
  attributesMoved: number;
  perceptionsMoved: number;
  collisionsDropped: number;
  omegaMerged: boolean;
  canonicalName: string;
  aliases: string[];
  reviewFlags: string[];
}

type CharRow = {
  id: string;
  name: string;
  alias: string[] | null;
  role: string | null;
  summary: string | null;
  pronouns: string | null;
  archetype: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  first_appearance: string | null;
  importance_level: string | null;
  importance_score: number | null;
  status: string | null;
  relationship_depth: string | null;
  tags: string[] | null;
  associated_with_character_ids: string[] | null;
  mentioned_by_character_ids: string[] | null;
  metadata: Record<string, any> | null;
};

const CHAR_COLUMNS =
  'id, name, alias, role, summary, pronouns, archetype, first_name, last_name, avatar_url, first_appearance, importance_level, importance_score, status, relationship_depth, tags, associated_with_character_ids, mentioned_by_character_ids, metadata';

const titlePrefix = /^(?:mr|mrs|ms|miss|dr|prof|dj)\.?\s+/i;

function cleanName(name: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

function splitDisplayName(name: string): { firstName: string | null; lastName: string | null } {
  const canonical = cleanName(name);
  const realSide = canonical.includes(' / ') ? canonical.split(' / ')[0] : canonical;
  const cleaned = realSide.replace(titlePrefix, '').trim();
  const parts = cleaned.split(' ').filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

function nameLooksLikeHandle(name: string): boolean {
  return /[._@]/.test(name);
}

function nameLooksLikeTitle(name: string): boolean {
  return titlePrefix.test(name);
}

function isCompositeDisplayName(name: string): boolean {
  return name.includes(' / ');
}

function fullNameFromFields(character: CharRow): string | null {
  const firstName = cleanName(character.first_name ?? '');
  const lastName = cleanName(character.last_name ?? '');
  if (!firstName || !lastName) return null;
  return `${firstName} ${lastName}`;
}

function singleNameFromFields(character: CharRow): string | null {
  const firstName = cleanName(character.first_name ?? '');
  if (!firstName || character.last_name) return null;
  return firstName;
}

function avoidSourceNameConflict(source: CharRow, target: CharRow, chosen: string): string {
  if (normalizeNameKey(chosen) === normalizeNameKey(source.name) && normalizeNameKey(source.name) !== normalizeNameKey(target.name)) {
    return `${chosen} / ${target.name}`;
  }
  return chosen;
}

function bestDisplayName(source: CharRow, target: CharRow, aliases: string[]): string {
  const candidates = [target.name, source.name, ...(target.alias ?? []), ...(source.alias ?? [])]
    .map(cleanName)
    .filter(Boolean);

  const existingComposite = candidates.find(isCompositeDisplayName);
  if (existingComposite) return avoidSourceNameConflict(source, target, existingComposite);

  const fieldFullName = fullNameFromFields(target) ?? fullNameFromFields(source);
  if (fieldFullName) return avoidSourceNameConflict(source, target, fieldFullName);

  const fieldSingleName = singleNameFromFields(target) ?? singleNameFromFields(source);
  if (fieldSingleName) {
    const bestAlias = aliases.find(alias => normalizeNameKey(alias) !== normalizeNameKey(fieldSingleName));
    return avoidSourceNameConflict(source, target, bestAlias ? `${fieldSingleName} / ${bestAlias}` : fieldSingleName);
  }

  const realFullName = candidates.find(name => {
    const parts = name.replace(titlePrefix, '').split(' ').filter(Boolean);
    return parts.length >= 2 && !nameLooksLikeHandle(name) && !nameLooksLikeTitle(name);
  });
  if (realFullName) return avoidSourceNameConflict(source, target, realFullName);

  const realSingleName = candidates.find(name => {
    const parts = name.replace(titlePrefix, '').split(' ').filter(Boolean);
    return parts.length === 1 && !nameLooksLikeHandle(name) && !nameLooksLikeTitle(name);
  });
  const bestAlias = aliases.find(alias => normalizeNameKey(alias) !== normalizeNameKey(realSingleName ?? '') && alias !== realSingleName);
  const chosen = realSingleName && bestAlias ? `${realSingleName} / ${bestAlias}` : (realSingleName ?? target.name);
  if (normalizeNameKey(chosen) === normalizeNameKey(source.name) && normalizeNameKey(source.name) !== normalizeNameKey(target.name)) {
    return avoidSourceNameConflict(source, target, `${chosen} / ${target.name}`);
  }
  return avoidSourceNameConflict(source, target, chosen);
}

function mergeText(left: string | null, right: string | null): string | null {
  const parts = [left, right]
    .map(value => value?.trim())
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

class CharacterMergeService {
  /**
   * Authority resolver (mirrors locationMergeService.resolveCanonicalLocationId).
   * The Characters Book reads the `characters` table directly, so it normally emits
   * characters.id. This guards against any caller passing a people_places `person`
   * id (the secondary mention store): map it to the canonical character by name.
   * Characters are not auto-created here (creation is gated), so an unmatched
   * person mention returns null rather than promoting.
   */
  async resolveCanonicalCharacterId(userId: string, id: string): Promise<string | null> {
    const { data: existing } = await supabaseAdmin
      .from('characters').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
    if (existing) return (existing as { id: string }).id;

    const { data: pp } = await supabaseAdmin
      .from('people_places').select('id, name, type').eq('id', id).eq('user_id', userId).maybeSingle();
    if (!pp) return null;
    const ppRow = pp as { name: string; type?: string | null };
    if (ppRow.type && ppRow.type !== 'person') return null; // not a person mention

    const { data: byName } = await supabaseAdmin
      .from('characters').select('id').eq('user_id', userId).ilike('name', ppRow.name).maybeSingle();
    return byName ? (byName as { id: string }).id : null;
  }

  async merge(
    userId: string,
    sourceId: string,
    targetId: string,
    opts: { mergedBy?: 'SYSTEM' | 'USER'; reason?: string; evidenceIds?: string[]; resolverVersion?: string } = {}
  ): Promise<MergeReport> {
    // Resolve both ids to the canonical `characters` authority before any check.
    const [resolvedSource, resolvedTarget] = await Promise.all([
      this.resolveCanonicalCharacterId(userId, sourceId),
      this.resolveCanonicalCharacterId(userId, targetId),
    ]);
    if (resolvedSource) sourceId = resolvedSource;
    if (resolvedTarget) targetId = resolvedTarget;
    if (sourceId === targetId) throw new Error('Cannot merge a character into itself');

    const [{ data: sourceData }, { data: targetData }] = await Promise.all([
      supabaseAdmin.from('characters').select(CHAR_COLUMNS).eq('id', sourceId).eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('characters').select(CHAR_COLUMNS).eq('id', targetId).eq('user_id', userId).maybeSingle(),
    ]);
    let source = sourceData as CharRow | null;
    let target = targetData as CharRow | null;
    if (!source) throw new Error('Source character not found');
    if (!target) throw new Error('Target character not found');

    const actor = opts.mergedBy ?? 'USER';
    const mergeReason = opts.reason ?? `Merged "${source.name}" into "${target.name}"`;
    let mergeAuthorization;
    try {
      mergeAuthorization = assertEntityMergeAuthorized({
        sourceType: 'CHARACTER',
        targetType: 'CHARACTER',
        reason: mergeReason,
        evidenceIds: opts.evidenceIds?.length
          ? opts.evidenceIds
          : [`${actor.toLowerCase()}-merge-request:${sourceId}:${targetId}`],
        resolverVersion: opts.resolverVersion,
        actor,
      });
    } catch (error) {
      incrementEntityResolutionMetric('merge_authorization_failures');
      incrementEntityResolutionMetric('merge_attempts_blocked');
      throw error;
    }

    const targetIsSelf = target.metadata?.is_self === true || target.metadata?.is_user === true;
    const sourceIsSelf = source.metadata?.is_self === true || source.metadata?.is_user === true;
    if (sourceIsSelf && !targetIsSelf) {
      throw new Error(
        'Cannot merge the protagonist into another character. Merge the other person into your protagonist card instead.'
      );
    }

    // Strength-weighted direction guard: a weak identity must never absorb a
    // meaningfully stronger one (the survivor would keep the weak row's id and
    // lose the stronger entity's accumulated identity strength). When the source
    // clearly outscores the target and neither side is the protagonist, swap so
    // the stronger identity survives. Degrades to the caller's direction when
    // strength scores are unavailable. See [[project_identity_architecture]] step 3.
    const identityPreserved =
      targetIsSelf || sourceIsSelf || (opts.reason?.toLowerCase().includes('self') ?? false);
    let sourceScore = await readStrengthScore('characters', userId, sourceId);
    let targetScore = await readStrengthScore('characters', userId, targetId);
    let directionSwapped = false;
    if (shouldSwapForStrength(sourceScore, targetScore, { identityPreserved })) {
      [sourceId, targetId] = [targetId, sourceId];
      [source, target] = [target, source];
      [sourceScore, targetScore] = [targetScore, sourceScore];
      directionSwapped = true;
      logger.info(
        { userId, survivorId: targetId, absorbedId: sourceId, sourceScore: targetScore, targetScore: sourceScore },
        '[CharacterMerge] swapped merge direction — stronger identity survives'
      );
    }

    const report: MergeReport = {
      sourceId, sourceName: source.name, targetId, targetName: target.name,
      relationshipsMoved: 0, memoriesMoved: 0, timelineEventsMoved: 0,
      factsMoved: 0, attributesMoved: 0, perceptionsMoved: 0,
      collisionsDropped: 0, omegaMerged: false,
      canonicalName: target.name, aliases: target.alias ?? [], reviewFlags: [],
    };

    await this.mergeRelationships(userId, sourceId, targetId, report);
    await this.mergeMemories(userId, sourceId, targetId, report);
    await this.mergeTimelineEvents(userId, sourceId, targetId, report);
    await this.mergeRpgTraits(userId, sourceId, targetId, report);
    await this.mergeEntityFacts(userId, sourceId, targetId, report);
    await this.mergeEntityAttributes(userId, sourceId, targetId, report);
    await this.mergePerceptions(userId, sourceId, targetId, report);
    await this.mergeEventImpacts(userId, sourceId, targetId);
    await this.mergeArrayReferences(userId, sourceId, targetId);
    await this.mergeEntityMentions(userId, sourceId, targetId);
    const omega = await this.mergeOmega(userId, source, target);
    report.omegaMerged = omega.merged;
    const cardUpdate = await this.mergeCardData(userId, source, target, omega.adoptOmegaId, {
      preserveTargetIdentity: targetIsSelf || opts.reason?.toLowerCase().includes('self') === true,
    });
    report.canonicalName = cardUpdate.name;
    report.aliases = cardUpdate.aliases;
    report.reviewFlags = cardUpdate.reviewFlags;

    // Source row last — at this point everything has been moved; remaining
    // cascades only touch rows that collided (already on the target).
    const { error: delErr } = await supabaseAdmin
      .from('characters')
      .delete()
      .eq('id', sourceId)
      .eq('user_id', userId);
    if (delErr) {
      logger.error({ delErr, sourceId, targetId }, '[CharacterMerge] source delete failed');
      throw delErr;
    }

    await supabaseAdmin.from('entity_merge_records').insert({
      user_id: userId,
      source_entity_id: sourceId,
      target_entity_id: targetId,
      source_entity_type: 'CHARACTER',
      target_entity_type: 'CHARACTER',
      merged_by: opts.mergedBy ?? 'USER',
      reason: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
      metadata: {
        merge_authorized: true,
        merge_authorization_reason: mergeAuthorization.authorizationReason,
        resolver_version: mergeAuthorization.resolverVersion,
        evidence_ids: mergeAuthorization.evidenceIds,
      },
    }).then(({ error }) => {
      if (error) logger.debug({ error }, '[CharacterMerge] merge record insert failed');
    });

    await recordEntityConsolidation({
      userId,
      action: 'ENTITY_MERGE',
      sourceArtifactType: 'character',
      sourceArtifactId: sourceId,
      targetArtifactId: targetId,
      beforeState: { id: sourceId, name: source.name, aliases: source.alias ?? [] },
      afterState: { merged_into: targetId, canonical_name: report.canonicalName, aliases: report.aliases },
      rationale: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
    }).catch((err) => logger.warn({ err, userId, sourceId, targetId }, '[CharacterMerge] cognition_mutations write failed'));

    // The survivor inherits the stronger of the two identity-strength scores —
    // it now holds the union of both entities' evidence. Best-effort; no-op when
    // the column is unavailable.
    await preserveSurvivorStrength('characters', userId, targetId, sourceScore, targetScore);

    // Identity Ledger — the merge survivor (target) absorbs the source identity.
    void identityLedgerService.recordMutation({
      userId,
      entityId: targetId,
      entityType: 'character',
      mutationType: 'ENTITY_MERGED',
      previousValue: { id: sourceId, name: source.name, aliases: source.alias ?? [] },
      newValue: { id: targetId, canonical_name: report.canonicalName, aliases: report.aliases },
      reason: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
      source: opts.mergedBy ?? 'USER',
      metadata: { sourceId, targetId, directionSwapped, sourceScore, targetScore, mergeAuthorization },
    });

    void entityLearningService.recordMergeLearning({
      userId,
      domain: 'characters',
      sourceId,
      sourceName: source.name,
      sourceAliases: source.alias ?? [],
      targetId,
      targetName: target.name,
      canonicalName: report.canonicalName,
      aliases: report.aliases,
      reason: opts.reason ?? `Merged "${source.name}" into "${target.name}"`,
      metadata: { directionSwapped, sourceScore, targetScore, reviewFlags: report.reviewFlags },
    });

    logger.info({ userId, ...report }, '[CharacterMerge] merge complete');
    return report;
  }

  /** Reassign character_relationships; unique(user_id, source, target, type). */
  private async mergeRelationships(userId: string, sourceId: string, targetId: string, report: MergeReport) {
    // Edges directly between the pair would become self-loops — drop them.
    await supabaseAdmin.from('character_relationships').delete().eq('user_id', userId)
      .eq('source_character_id', sourceId).eq('target_character_id', targetId);
    await supabaseAdmin.from('character_relationships').delete().eq('user_id', userId)
      .eq('source_character_id', targetId).eq('target_character_id', sourceId);

    for (const side of ['source_character_id', 'target_character_id'] as const) {
      const other = side === 'source_character_id' ? 'target_character_id' : 'source_character_id';
      const { data: rows } = await supabaseAdmin
        .from('character_relationships')
        .select(`id, ${other}, relationship_type`)
        .eq('user_id', userId)
        .eq(side, sourceId);
      for (const row of (rows ?? []) as any[]) {
        const { data: collision } = await supabaseAdmin
          .from('character_relationships')
          .select('id')
          .eq('user_id', userId)
          .eq(side, targetId)
          .eq(other, row[other])
          .eq('relationship_type', row.relationship_type)
          .limit(1);
        if (collision?.length) {
          await supabaseAdmin.from('character_relationships').delete().eq('id', row.id);
          report.collisionsDropped++;
        } else {
          const { error } = await supabaseAdmin
            .from('character_relationships')
            .update({ [side]: targetId })
            .eq('id', row.id);
          if (!error) report.relationshipsMoved++;
          else { await supabaseAdmin.from('character_relationships').delete().eq('id', row.id); report.collisionsDropped++; }
        }
      }
    }
  }

  /** Reassign character_memories; unique(user_id, character_id, journal_entry_id). */
  private async mergeMemories(userId: string, sourceId: string, targetId: string, report: MergeReport) {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin.from('character_memories').select('id, journal_entry_id').eq('user_id', userId).eq('character_id', sourceId),
      supabaseAdmin.from('character_memories').select('journal_entry_id').eq('user_id', userId).eq('character_id', targetId),
    ]);
    const targetEntries = new Set((targetRows ?? []).map((r: any) => r.journal_entry_id));
    for (const row of (sourceRows ?? []) as any[]) {
      if (targetEntries.has(row.journal_entry_id)) {
        await supabaseAdmin.from('character_memories').delete().eq('id', row.id);
        report.collisionsDropped++;
      } else {
        const { error } = await supabaseAdmin.from('character_memories').update({ character_id: targetId }).eq('id', row.id);
        if (!error) report.memoriesMoved++;
        else { await supabaseAdmin.from('character_memories').delete().eq('id', row.id); report.collisionsDropped++; }
      }
    }
  }

  /** Reassign character_timeline_events; unique(user_id, character_id, event_id, timeline_type). */
  private async mergeTimelineEvents(userId: string, sourceId: string, targetId: string, report: MergeReport) {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin.from('character_timeline_events').select('id, event_id, timeline_type').eq('user_id', userId).eq('character_id', sourceId),
      supabaseAdmin.from('character_timeline_events').select('event_id, timeline_type').eq('user_id', userId).eq('character_id', targetId),
    ]);
    const targetKeys = new Set((targetRows ?? []).map((r: any) => `${r.event_id}:${r.timeline_type}`));
    for (const row of (sourceRows ?? []) as any[]) {
      if (targetKeys.has(`${row.event_id}:${row.timeline_type}`)) {
        await supabaseAdmin.from('character_timeline_events').delete().eq('id', row.id);
        report.collisionsDropped++;
      } else {
        const { error } = await supabaseAdmin.from('character_timeline_events').update({ character_id: targetId }).eq('id', row.id);
        if (!error) report.timelineEventsMoved++;
        else { await supabaseAdmin.from('character_timeline_events').delete().eq('id', row.id); report.collisionsDropped++; }
      }
    }
    // Secondary reference (no uniqueness involved)
    await supabaseAdmin.from('character_timeline_events')
      .update({ connection_character_id: targetId })
      .eq('user_id', userId)
      .eq('connection_character_id', sourceId);
  }

  /** rpg_character_traits is unique per character — keep target's if present. */
  private async mergeRpgTraits(userId: string, sourceId: string, targetId: string, report: MergeReport) {
    const { data: targetTrait } = await supabaseAdmin
      .from('rpg_character_traits').select('id').eq('user_id', userId).eq('character_id', targetId).limit(1);
    if (targetTrait?.length) {
      const { data: deleted } = await supabaseAdmin
        .from('rpg_character_traits').delete().eq('user_id', userId).eq('character_id', sourceId).select('id');
      report.collisionsDropped += deleted?.length ?? 0;
    } else {
      await supabaseAdmin.from('rpg_character_traits').update({ character_id: targetId })
        .eq('user_id', userId).eq('character_id', sourceId);
    }
  }

  /** entity_facts has no FK — facts would be orphaned by delete; move them. */
  private async mergeEntityFacts(userId: string, sourceId: string, targetId: string, report: MergeReport) {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin.from('entity_facts').select('id, fact').eq('user_id', userId).eq('entity_type', 'character').eq('entity_id', sourceId),
      supabaseAdmin.from('entity_facts').select('fact').eq('user_id', userId).eq('entity_type', 'character').eq('entity_id', targetId),
    ]);
    const targetFacts = new Set((targetRows ?? []).map((r: any) => normalizeNameKey(r.fact ?? '')));
    for (const row of (sourceRows ?? []) as any[]) {
      if (targetFacts.has(normalizeNameKey(row.fact ?? ''))) {
        await supabaseAdmin.from('entity_facts').delete().eq('id', row.id);
        report.collisionsDropped++;
      } else {
        const { error } = await supabaseAdmin.from('entity_facts').update({ entity_id: targetId }).eq('id', row.id);
        if (!error) report.factsMoved++;
      }
    }
  }

  /** entity_attributes; unique(user_id, entity_id, entity_type, attribute_type, attribute_value). */
  private async mergeEntityAttributes(userId: string, sourceId: string, targetId: string, report: MergeReport) {
    const [{ data: sourceRows }, { data: targetRows }] = await Promise.all([
      supabaseAdmin.from('entity_attributes').select('id, attribute_type, attribute_value').eq('user_id', userId).eq('entity_type', 'character').eq('entity_id', sourceId),
      supabaseAdmin.from('entity_attributes').select('attribute_type, attribute_value').eq('user_id', userId).eq('entity_type', 'character').eq('entity_id', targetId),
    ]);
    const targetKeys = new Set((targetRows ?? []).map((r: any) => `${r.attribute_type}:${r.attribute_value}`));
    for (const row of (sourceRows ?? []) as any[]) {
      if (targetKeys.has(`${row.attribute_type}:${row.attribute_value}`)) {
        await supabaseAdmin.from('entity_attributes').delete().eq('id', row.id);
        report.collisionsDropped++;
      } else {
        const { error } = await supabaseAdmin.from('entity_attributes').update({ entity_id: targetId }).eq('id', row.id);
        if (!error) report.attributesMoved++;
        else { await supabaseAdmin.from('entity_attributes').delete().eq('id', row.id); report.collisionsDropped++; }
      }
    }
  }

  private async mergePerceptions(userId: string, sourceId: string, targetId: string, report: MergeReport) {
    for (const col of ['subject_person_id', 'source_character_id']) {
      const { data } = await supabaseAdmin
        .from('perception_entries')
        .update({ [col]: targetId })
        .eq('user_id', userId)
        .eq(col, sourceId)
        .select('id');
      report.perceptionsMoved += data?.length ?? 0;
    }
  }

  private async mergeEventImpacts(userId: string, sourceId: string, targetId: string) {
    await supabaseAdmin.from('event_impacts')
      .update({ connection_character_id: targetId })
      .eq('user_id', userId)
      .eq('connection_character_id', sourceId);
  }

  private async mergeArrayReferences(userId: string, sourceId: string, targetId: string) {
    const { data: rows } = await supabaseAdmin
      .from('characters')
      .select('id, associated_with_character_ids, mentioned_by_character_ids')
      .eq('user_id', userId)
      .or(`associated_with_character_ids.cs.{${sourceId}},mentioned_by_character_ids.cs.{${sourceId}}`);
    for (const row of (rows ?? []) as any[]) {
      const rewrite = (ids: string[] | null | undefined) => [...new Set((ids ?? []).map(id => id === sourceId ? targetId : id).filter(id => id !== row.id))];
      await supabaseAdmin.from('characters').update({
        associated_with_character_ids: rewrite(row.associated_with_character_ids),
        mentioned_by_character_ids: rewrite(row.mentioned_by_character_ids),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('user_id', userId);
    }
  }

  private async mergeEntityMentions(userId: string, sourceId: string, targetId: string) {
    await supabaseAdmin.from('entity_mentions')
      .update({ entity_id: targetId })
      .eq('user_id', userId)
      .eq('entity_id', sourceId);
    await supabaseAdmin.from('entity_unit_links')
      .update({ entity_id: targetId, entity_type: 'CHARACTER' })
      .eq('entity_id', sourceId)
      .eq('entity_type', 'CHARACTER');
  }

  /** Merge the card itself: aliases, fill-empty fields, metadata. */
  private async mergeCardData(
    userId: string,
    source: CharRow,
    target: CharRow,
    adoptOmegaId?: string,
    opts: { preserveTargetIdentity?: boolean } = {}
  ): Promise<{ name: string; aliases: string[]; reviewFlags: string[] }> {
    const targetIsSelf = target.metadata?.is_self === true || target.metadata?.is_user === true;
    const preserveTargetIdentity = opts.preserveTargetIdentity === true || targetIsSelf;
    const targetKey = normalizeNameKey(target.name);
    const aliasSet = new Map<string, string>(); // normalized → original casing
    for (const a of [...(target.alias ?? []), ...(source.alias ?? []), source.name]) {
      if (!a) continue;
      const key = normalizeNameKey(a);
      if (key === targetKey) continue;
      if (!aliasSet.has(key)) aliasSet.set(key, a);
    }
    const aliases = [...aliasSet.values()];
    const displayName = preserveTargetIdentity
      ? cleanName(target.name)
      : bestDisplayName(source, target, aliases);
    const displayNameKey = normalizeNameKey(displayName);
    const finalAliases = aliases.filter(alias => normalizeNameKey(alias) !== displayNameKey);
    const nameParts = splitDisplayName(displayName);

    const sm = source.metadata ?? {};
    const tm = target.metadata ?? {};
    const mergedSummary = mergeText(target.summary, source.summary);
    const sourceKeys = collectNameKeys(source.name, normalizeNameKey(source.name), [
      ...(source.alias ?? []),
      ...(target.alias ?? []),
    ]);
    const survivorKeys = collectNameKeys(displayName, displayNameKey, finalAliases);
    const reviewFlags = flagMergedTextSnippets([mergedSummary], sourceKeys, survivorKeys);

    const metadata: Record<string, any> = withMergeReviewMetadata(
      {
        ...tm,
        ...Object.fromEntries(Object.entries(sm).filter(([key]) => !(key in tm))),
        mention_count: ((tm.mention_count as number) ?? 0) + ((sm.mention_count as number) ?? 0),
        distinct_from_mentions: [...new Set([...(tm.distinct_from_mentions ?? []), ...(sm.distinct_from_mentions ?? [])])],
        merged_from: [...(tm.merged_from ?? []), source.id],
        previous_names: [...new Set([...(tm.previous_names ?? []), target.name, source.name].filter(Boolean))],
        official_name: nameParts.firstName ? [nameParts.firstName, nameParts.lastName].filter(Boolean).join(' ') : displayName,
        display_name: displayName,
        aliases_learned_from_merges: finalAliases,
        last_merged_at: new Date().toISOString(),
      },
      reviewFlags,
      'Some merged text may refer only to the absorbed person — review on the character card.'
    );
    if (preserveTargetIdentity) {
      metadata.is_self = true;
      metadata.is_user = true;
    } else {
      delete metadata.is_self;
      delete metadata.is_user;
    }
    // User overrides: keep target's; adopt source's only where target has none
    if (!tm.standing_override && sm.standing_override) metadata.standing_override = sm.standing_override;
    if (tm.impact_override == null && sm.impact_override != null) metadata.impact_override = sm.impact_override;
    // Target had no omega entity — adopt the source's so events/claims stay linked
    if (adoptOmegaId) metadata.omega_entity_id = adoptOmegaId;

    const update: Record<string, any> = {
      name: displayName,
      first_name: nameParts.firstName,
      last_name: nameParts.lastName,
      alias: finalAliases.length > 0 ? finalAliases : null,
      summary: mergedSummary,
      tags: [...new Set([...(target.tags ?? []), ...(source.tags ?? [])])],
      associated_with_character_ids: [...new Set([...(target.associated_with_character_ids ?? []), ...(source.associated_with_character_ids ?? [])].filter(id => id !== target.id && id !== source.id))],
      mentioned_by_character_ids: [...new Set([...(target.mentioned_by_character_ids ?? []), ...(source.mentioned_by_character_ids ?? [])].filter(id => id !== target.id && id !== source.id))],
      metadata,
      updated_at: new Date().toISOString(),
    };
    // Fill-empty: target keeps its own values; source only fills blanks
    for (const field of ['role', 'pronouns', 'archetype', 'avatar_url', 'status', 'relationship_depth'] as const) {
      if (!target[field] && source[field]) update[field] = source[field];
    }
    if ((source.importance_score ?? 0) > (target.importance_score ?? 0)) {
      update.importance_score = source.importance_score;
      if (source.importance_level) update.importance_level = source.importance_level;
    }
    if (source.first_appearance && (!target.first_appearance || source.first_appearance < target.first_appearance)) {
      update.first_appearance = source.first_appearance;
    }

    await supabaseAdmin.from('characters').update(update).eq('id', target.id).eq('user_id', userId);
    return { name: displayName, aliases: finalAliases, reviewFlags };
  }

  /**
   * Merge linked omega entities and rewrite resolved_events.people.
   * Returns adoptOmegaId when the target should take over the source's omega
   * entity (applied by mergeCardData in the same metadata write).
   */
  private async mergeOmega(
    userId: string,
    source: CharRow,
    target: CharRow
  ): Promise<{ merged: boolean; adoptOmegaId?: string }> {
    const sourceOmegaId = source.metadata?.omega_entity_id as string | undefined;
    const targetOmegaId = target.metadata?.omega_entity_id as string | undefined;

    if (sourceOmegaId && targetOmegaId && sourceOmegaId !== targetOmegaId) {
      // Rewrite event participation BEFORE the omega merge deletes the source
      const { data: events } = await supabaseAdmin
        .from('resolved_events')
        .select('id, people')
        .eq('user_id', userId)
        .contains('people', [sourceOmegaId]);
      for (const ev of (events ?? []) as Array<{ id: string; people: string[] | null }>) {
        const people = [...new Set((ev.people ?? []).map(p => (p === sourceOmegaId ? targetOmegaId : p)))];
        await supabaseAdmin.from('resolved_events').update({ people }).eq('id', ev.id).eq('user_id', userId);
      }
      try {
        await omegaMemoryService.mergeEntities(userId, sourceOmegaId, targetOmegaId);
        return { merged: true };
      } catch (err) {
        logger.warn({ err, sourceOmegaId, targetOmegaId }, '[CharacterMerge] omega merge failed');
        return { merged: false };
      }
    }

    if (sourceOmegaId && !targetOmegaId) {
      // Adopt the source's omega entity — events and claims stay valid
      return { merged: true, adoptOmegaId: sourceOmegaId };
    }

    return { merged: false };
  }
}

export const characterMergeService = new CharacterMergeService();
