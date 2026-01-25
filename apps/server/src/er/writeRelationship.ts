/**
 * ER Write Dispatcher — Writes validated relationships to the correct target tables.
 * Single entry point: writeRelationship dispatches to character_relationships,
 * entity_relationships, event_mentions, location_mentions, or character_memories.
 */

import { logger } from '../logger';
import { supabaseAdmin } from '../services/supabaseClient';
import type { ExtractedRelationship, TargetTable, ResolvedEntity } from './erSchema';
import { toStorageEntityType } from './erSchema';
import {
  upsertTemporalRelationship,
  writeRelationshipSnapshot,
} from './temporalEdgeService';

export type WriteContext = {
  userId: string;
  memoryId?: string;
  scope?: string;
};

export type WriteRelationshipOpts = {
  scope?: string;
  evidenceSourceIds?: string[];
  evidence?: string;
};

/**
 * Write a validated relationship to the appropriate target table.
 * For event_mentions, location_mentions, character_memories: requires ctx.memoryId;
 * if missing, logs and returns without writing.
 */
export async function writeRelationship(
  userId: string,
  targetTable: TargetTable,
  rel: ExtractedRelationship,
  resolvedEntities: Map<string, ResolvedEntity>,
  ctx: WriteContext,
  opts?: WriteRelationshipOpts
): Promise<void> {
  const fromEnt = resolvedEntities.get(rel.fromTempId);
  const toEnt = resolvedEntities.get(rel.toTempId);
  if (!fromEnt || !toEnt) return;

  const fromStorage = toStorageEntityType(fromEnt.type);
  const toStorage = toStorageEntityType(toEnt.type);

  // Mention-style tables require memoryId
  if (
    targetTable === 'event_mentions' ||
    targetTable === 'location_mentions' ||
    targetTable === 'character_memories'
  ) {
    if (!ctx.memoryId) {
      logger.debug(
        { targetTable, from: rel.fromTempId, to: rel.toTempId },
        'writeRelationship: memoryId required for mention-style table, skipping'
      );
      return;
    }
  }

  try {
    switch (targetTable) {
      case 'character_relationships': {
        // Both must be character
        if (fromStorage !== 'character' || toStorage !== 'character') return;
        const closeness = Math.round(Math.max(-10, Math.min(10, (rel.confidence - 0.5) * 20)));
        const row: Record<string, unknown> = {
          user_id: userId,
          source_character_id: fromEnt.id,
          target_character_id: toEnt.id,
          relationship_type: rel.relationship,
          closeness_score: closeness,
          updated_at: new Date().toISOString(),
        };
        if (ctx.memoryId != null) row.last_shared_memory_id = ctx.memoryId;
        const { error } = await supabaseAdmin.from('character_relationships').upsert(row as any, {
          onConflict: 'user_id,source_character_id,target_character_id,relationship_type',
          ignoreDuplicates: false,
        });
        if (error) {
          if (isDuplicateOrUniqueError(error)) return;
          throw error;
        }
        try {
          const scope = ctx.scope ?? 'global';
          const evidenceIds = opts?.evidenceSourceIds ?? (ctx.memoryId ? [ctx.memoryId] : []);
          const edge = await upsertTemporalRelationship(
            userId,
            fromEnt.id,
            toEnt.id,
            'character',
            'character',
            rel.relationship,
            rel.kind,
            rel.confidence,
            scope,
            ctx,
            evidenceIds
          );
          if (edge) await writeRelationshipSnapshot(edge, scope);
        } catch (e) {
          logger.warn(
            { err: e, targetTable: 'character_relationships', from: rel.fromTempId, to: rel.toTempId },
            'temporal edge/snapshot failed (non-blocking)'
          );
        }
        break;
      }

      case 'entity_relationships': {
        const scopeVal = opts?.scope ?? null;
        const row = {
          user_id: userId,
          from_entity_id: fromEnt.id,
          from_entity_type: fromStorage,
          to_entity_id: toEnt.id,
          to_entity_type: toStorage,
          relationship_type: rel.relationship,
          scope: scopeVal,
          confidence: rel.confidence,
          evidence_count: 1,
          evidence_source_ids: opts?.evidenceSourceIds ?? [],
          metadata: opts?.evidence != null ? { evidence: opts.evidence } : {},
        };
        let existingQ = supabaseAdmin
          .from('entity_relationships')
          .select('id, evidence_count, confidence, evidence_source_ids, metadata')
          .eq('user_id', userId)
          .eq('from_entity_id', fromEnt.id)
          .eq('from_entity_type', fromStorage)
          .eq('to_entity_id', toEnt.id)
          .eq('to_entity_type', toStorage)
          .eq('relationship_type', rel.relationship);
        existingQ = scopeVal != null ? existingQ.eq('scope', scopeVal) : existingQ.is('scope', null);
        const { data: existing } = await existingQ.single();

        if (existing) {
          const existingIds = (existing.evidence_source_ids as string[]) || [];
          const newIds = [
            ...existingIds,
            ...(opts?.evidenceSourceIds ?? []).filter((id: string) => !existingIds.includes(id)),
          ];
          await supabaseAdmin
            .from('entity_relationships')
            .update({
              evidence_count: (existing.evidence_count || 1) + 1,
              confidence: Math.max(existing.confidence ?? 0, rel.confidence),
              evidence_source_ids: newIds,
              updated_at: new Date().toISOString(),
              metadata: {
                ...(existing.metadata as Record<string, unknown> || {}),
                evidence: opts?.evidence,
                last_detected_at: new Date().toISOString(),
              },
            })
            .eq('id', existing.id);
        } else {
          await supabaseAdmin.from('entity_relationships').insert({
            ...row,
            metadata: { evidence: opts?.evidence, detected_at: new Date().toISOString() },
          });
        }
        try {
          const scope = ctx.scope ?? 'global';
          const evidenceIds = opts?.evidenceSourceIds ?? (ctx.memoryId ? [ctx.memoryId] : []);
          const edge = await upsertTemporalRelationship(
            userId,
            fromEnt.id,
            toEnt.id,
            fromStorage,
            toStorage,
            rel.relationship,
            rel.kind,
            rel.confidence,
            scope,
            ctx,
            evidenceIds
          );
          if (edge) await writeRelationshipSnapshot(edge, scope);
        } catch (e) {
          logger.warn(
            { err: e, targetTable: 'entity_relationships', from: rel.fromTempId, to: rel.toTempId },
            'temporal edge/snapshot failed (non-blocking)'
          );
        }
        break;
      }

      case 'event_mentions': {
        // event_id = "to" (EVENT), memory_id = ctx.memoryId
        const eventId = toEnt.id;
        const { error } = await supabaseAdmin.from('event_mentions').insert({
          event_id: eventId,
          memory_id: ctx.memoryId!,
          signal: {},
        });
        if (error && isDuplicateOrUniqueError(error)) return;
        if (error) throw error;
        break;
      }

      case 'location_mentions': {
        // location_id = "to" (LOCATION), memory_id = ctx.memoryId
        const locationId = toEnt.id;
        const { error } = await supabaseAdmin.from('location_mentions').insert({
          user_id: userId,
          location_id: locationId,
          memory_id: ctx.memoryId!,
          raw_text: opts?.evidence ?? '',
          extracted_name: null,
        });
        if (error && isDuplicateOrUniqueError(error)) return;
        if (error) throw error;
        break;
      }

      case 'character_memories': {
        // character_id = "from" (PERSON/CHARACTER), journal_entry_id = ctx.memoryId
        const characterId = fromEnt.id;
        await supabaseAdmin.from('character_memories').upsert(
          {
            user_id: userId,
            character_id: characterId,
            journal_entry_id: ctx.memoryId!,
            role: null,
            emotion: null,
            perspective: null,
          },
          { onConflict: 'user_id,character_id,journal_entry_id', ignoreDuplicates: true }
        );
        break;
      }
    }
  } catch (e) {
    if (e && typeof e === 'object' && 'message' in e) {
      const msg = (e as { message?: string }).message;
      if (typeof msg === 'string' && (msg.includes('duplicate') || msg.includes('unique'))) return;
    }
    logger.error(
      { err: e, targetTable, from: rel.fromTempId, to: rel.toTempId, relationship: rel.relationship },
      'writeRelationship failed'
    );
    throw e;
  }
}

function isDuplicateOrUniqueError(err: { message?: string; code?: string }): boolean {
  const m = err?.message ?? '';
  const c = err?.code ?? '';
  return (
    m.includes('duplicate') ||
    m.includes('unique') ||
    c === '23505' ||
    c === '23503'
  );
}
