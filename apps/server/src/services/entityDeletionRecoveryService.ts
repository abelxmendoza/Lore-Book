/**
 * Entity deletion recovery — when a user removes an entity card, preserve the
 * lore it carried, record a learning signal, block the same wrong card from
 * being recreated, and reprocess source conversations.
 */
import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';
import { correctionTracker } from './activeLearning/correctionTracker';
import { buildRejectionKeys } from './entityRejectionRegistry';
import { ingestionQueue } from './ingestion/ingestionQueue';
import { supabaseAdmin } from './supabaseClient';

export type EntityDeletionKind = 'character' | 'organization' | 'location';
export type DeletionMode = 'permanent' | 'archive';

export type EntityDeletionRecoveryInput = {
  entityType: EntityDeletionKind;
  entityId: string;
  name: string;
  aliases?: string[];
  metadata?: Record<string, unknown> | null;
  omegaEntityId?: string | null;
  reason?: string;
  mode?: DeletionMode;
};

export type EntityDeletionRecoveryReport = {
  eventId: string;
  preserveOmega: boolean;
  omegaEntityId: string | null;
  factsPreserved: number;
  claimsCreated: number;
  sourceMessageIds: string[];
  sourceThreadIds: string[];
  reprocessJobsQueued: number;
  deletionCount: number;
};

type CharacterRow = {
  id: string;
  name: string;
  alias?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

async function collectSourceMessages(
  userId: string,
  entityType: EntityDeletionKind,
  entityId: string,
  searchTerms: string[]
): Promise<{ messageIds: string[]; threadIds: string[] }> {
  const messageIds = new Set<string>();
  const threadIds = new Set<string>();

  const { data: links } = await supabaseAdmin
    .from('entity_conversation_links')
    .select('session_id')
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);

  for (const link of links ?? []) {
    if (link.session_id) threadIds.add(link.session_id as string);
  }

  const { data: edges } = await supabaseAdmin
    .from('provenance_edges')
    .select('source_id, source_type')
    .eq('user_id', userId)
    .eq('relation', 'MENTIONED_ENTITY')
    .in('target_id', [entityId]);

  for (const edge of edges ?? []) {
    if (edge.source_type !== 'utterance') continue;
    const { data: utterance } = await supabaseAdmin
      .from('utterances')
      .select('message_id')
      .eq('id', edge.source_id as string)
      .eq('user_id', userId)
      .maybeSingle();
    if (utterance?.message_id) messageIds.add(utterance.message_id as string);
  }

  for (const term of searchTerms) {
    if (!term || term.length < 3) continue;
    const pattern = `%${term.replace(/[%_]/g, '')}%`;
    const { data: chatMsgs } = await supabaseAdmin
      .from('chat_messages')
      .select('id, session_id')
      .eq('user_id', userId)
      .eq('role', 'user')
      .ilike('content', pattern)
      .limit(40);

    for (const msg of chatMsgs ?? []) {
      messageIds.add(msg.id as string);
      if (msg.session_id) threadIds.add(msg.session_id as string);
    }
  }

  if (entityType === 'character') {
    const { data: memories } = await supabaseAdmin
      .from('character_memories')
      .select('journal_entry_id')
      .eq('user_id', userId)
      .eq('character_id', entityId);

    for (const mem of memories ?? []) {
      if (!mem.journal_entry_id) continue;
      const { data: entry } = await supabaseAdmin
        .from('journal_entries')
        .select('source_message_id, metadata')
        .eq('id', mem.journal_entry_id as string)
        .eq('user_id', userId)
        .maybeSingle();
      const meta = (entry?.metadata ?? {}) as Record<string, unknown>;
      const src =
        (entry?.source_message_id as string | undefined) ??
        (meta.chat_message_id as string | undefined);
      if (src) messageIds.add(src);
    }
  }

  if (entityType === 'location') {
    const { data: memories } = await supabaseAdmin
      .from('location_mentions')
      .select('memory_id')
      .eq('user_id', userId)
      .eq('location_id', entityId);

    for (const mem of memories ?? []) {
      if (!mem.memory_id) continue;
      const { data: entry } = await supabaseAdmin
        .from('journal_entries')
        .select('source_message_id, metadata')
        .eq('id', mem.memory_id as string)
        .eq('user_id', userId)
        .maybeSingle();
      const meta = (entry?.metadata ?? {}) as Record<string, unknown>;
      const src =
        (entry?.source_message_id as string | undefined) ??
        (meta.chat_message_id as string | undefined);
      if (src) messageIds.add(src);
    }
  }

  return { messageIds: [...messageIds], threadIds: [...threadIds] };
}

async function migrateFactsToClaims(
  userId: string,
  entityType: string,
  entityId: string,
  omegaEntityId: string,
  characterId?: string
): Promise<{ factsPreserved: number; claimsCreated: number }> {
  const { data: facts } = await supabaseAdmin
    .from('entity_facts')
    .select('id, fact, confidence, first_seen_at, category')
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId);

  let claimsCreated = 0;
  const now = new Date().toISOString();

  for (const row of facts ?? []) {
    const { error } = await supabaseAdmin.from('omega_claims').insert({
      user_id: userId,
      entity_id: omegaEntityId,
      text: row.fact as string,
      source: 'USER',
      confidence: (row.confidence as number) ?? 0.7,
      start_time: (row.first_seen_at as string) ?? now,
      is_active: true,
      metadata: {
        preserved_from_entity_deletion: true,
        source_entity_type: entityType,
        source_entity_id: entityId,
        character_id: characterId,
        category: row.category,
      },
    });
    if (!error) claimsCreated += 1;
  }

  return { factsPreserved: facts?.length ?? 0, claimsCreated };
}

async function ensureOmegaShelf(
  userId: string,
  name: string,
  existingOmegaId?: string | null
): Promise<string | null> {
  if (existingOmegaId) {
    const { data: existing } = await supabaseAdmin
      .from('omega_entities')
      .select('id, metadata')
      .eq('id', existingOmegaId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      const meta = (existing.metadata ?? {}) as Record<string, unknown>;
      await supabaseAdmin
        .from('omega_entities')
        .update({
          metadata: {
            ...meta,
            user_card_deleted: true,
            do_not_auto_promote_to_character: true,
            lore_shelf: true,
            preserved_at: new Date().toISOString(),
          },
        })
        .eq('id', existingOmegaId)
        .eq('user_id', userId);
      return existingOmegaId;
    }
  }

  const key = normalizeNameKey(name);
  const { data: rows } = await supabaseAdmin
    .from('omega_entities')
    .select('id, primary_name')
    .eq('user_id', userId);

  const match = (rows ?? []).find((r) => normalizeNameKey(r.primary_name) === key);
  if (match) return match.id as string;

  const { data: created, error } = await supabaseAdmin
    .from('omega_entities')
    .insert({
      user_id: userId,
      primary_name: name,
      type: 'CONCEPT',
      metadata: {
        user_card_deleted: true,
        do_not_auto_promote_to_character: true,
        lore_shelf: true,
        preserved_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (error) {
    logger.warn({ err: error, userId, name }, 'Failed to create omega lore shelf');
    return null;
  }
  return created?.id as string;
}

async function incrementDeletionCount(
  userId: string,
  normalizedKeys: string[]
): Promise<number> {
  const { data: prior } = await supabaseAdmin
    .from('entity_deletion_events')
    .select('deletion_count')
    .eq('user_id', userId)
    .overlaps('normalized_keys', normalizedKeys)
    .order('created_at', { ascending: false })
    .limit(1);

  return ((prior?.[0]?.deletion_count as number) ?? 0) + 1;
}

async function queueSourceReprocessing(
  userId: string,
  messageIds: string[]
): Promise<number> {
  let queued = 0;
  for (const messageId of messageIds) {
    const { data: msg } = await supabaseAdmin
      .from('chat_messages')
      .select('id, session_id')
      .eq('id', messageId)
      .eq('user_id', userId)
      .eq('role', 'user')
      .maybeSingle();

    if (!msg?.session_id) continue;

    ingestionQueue.enqueue(
      {
        userId,
        chatMessageId: messageId,
        sessionId: msg.session_id as string,
        force: true,
      },
      'HIGH'
    );
    queued += 1;
  }
  return queued;
}

class EntityDeletionRecoveryService {
  async runBeforeDelete(
    userId: string,
    input: EntityDeletionRecoveryInput
  ): Promise<EntityDeletionRecoveryReport> {
    const mode = input.mode ?? 'permanent';
    const aliases = input.aliases ?? [];
    const normalizedKeys = buildRejectionKeys(input.name, aliases);
    const deletionCount = await incrementDeletionCount(userId, normalizedKeys);

    const searchTerms = [input.name, ...aliases].filter(Boolean);
    const { messageIds, threadIds } = await collectSourceMessages(
      userId,
      input.entityType,
      input.entityId,
      searchTerms
    );

    const meta = input.metadata ?? {};
    const omegaFromMeta = (meta.omega_entity_id as string | undefined) ?? input.omegaEntityId;
    const omegaEntityId = await ensureOmegaShelf(userId, input.name, omegaFromMeta ?? null);

    let factsPreserved = 0;
    let claimsCreated = 0;

    if (omegaEntityId && (input.entityType === 'character' || input.entityType === 'location')) {
      const migrated = await migrateFactsToClaims(
        userId,
        input.entityType,
        input.entityId,
        omegaEntityId,
        input.entityType === 'character' ? input.entityId : undefined
      );
      factsPreserved = migrated.factsPreserved;
      claimsCreated = migrated.claimsCreated;
    }

    const snapshot = {
      name: input.name,
      aliases,
      metadata: meta,
      omegaEntityId,
      factsPreserved,
      claimsCreated,
      sourceMessageCount: messageIds.length,
      sourceThreadCount: threadIds.length,
    };

    const { data: event, error: eventErr } = await supabaseAdmin
      .from('entity_deletion_events')
      .insert({
        user_id: userId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        entity_name: input.name,
        normalized_keys: normalizedKeys,
        deletion_kind: mode,
        reason: input.reason ?? null,
        initiated_by: 'USER',
        snapshot,
        source_message_ids: messageIds,
        source_thread_ids: threadIds,
        facts_preserved: factsPreserved,
        claims_preserved: claimsCreated,
        reprocess_jobs_queued: 0,
        deletion_count: deletionCount,
        metadata: { omega_entity_id: omegaEntityId },
      })
      .select('id')
      .single();

    if (eventErr) {
      logger.warn({ err: eventErr, userId, entityId: input.entityId }, 'entity_deletion_events insert failed');
    }

    await correctionTracker
      .recordCorrection(userId, {
        correction_type: 'entity',
        original_value: input.name,
        corrected_value: '__ENTITY_CARD_REJECTED__',
        context: input.reason ?? `User ${mode} deleted ${input.entityType} card`,
        metadata: {
          entity_type: input.entityType,
          entity_id: input.entityId,
          deletion_kind: mode,
          normalized_keys: normalizedKeys,
          deletion_count: deletionCount,
          omega_entity_id: omegaEntityId,
          facts_preserved: factsPreserved,
        },
      })
      .catch((err) => logger.warn({ err }, 'Failed to record entity deletion correction'));

    await supabaseAdmin
      .from('correction_records')
      .insert({
        user_id: userId,
        target_type: 'ENTITY',
        target_id: input.entityId,
        correction_type: 'USER_CORRECTION',
        before_snapshot: snapshot,
        after_snapshot: {
          status: mode === 'archive' ? 'archived' : 'deleted',
          preserve_omega: true,
          omega_entity_id: omegaEntityId,
        },
        reason: input.reason ?? `user_${mode}_entity_from_ui`,
        initiated_by: 'USER',
        metadata: { entity_type: input.entityType, deletion_count: deletionCount },
      })
      .then(({ error }) => {
        if (error) logger.warn({ err: error }, 'correction_records insert failed (non-blocking)');
      });

    let reprocessJobsQueued = 0;
    if (mode === 'permanent') {
      reprocessJobsQueued = await queueSourceReprocessing(userId, messageIds);
      if (event?.id) {
        await supabaseAdmin
          .from('entity_deletion_events')
          .update({ reprocess_jobs_queued: reprocessJobsQueued })
          .eq('id', event.id)
          .eq('user_id', userId);
      }

      if (input.entityType === 'character' && messageIds.length > 0) {
        import('./characterConversationRescanService')
          .then(({ characterConversationRescanService }) =>
            characterConversationRescanService.rescanDeletedEntitySourceLore(userId, {
              messageIds,
              deletedName: input.name,
              deletedAliases: aliases,
            }),
          )
          .catch((err) =>
            logger.warn({ err, userId, entityId: input.entityId }, 'Deletion-targeted rescan failed (non-blocking)'),
          );
      }
    }

    logger.info(
      {
        userId,
        entityType: input.entityType,
        entityId: input.entityId,
        mode,
        factsPreserved,
        claimsCreated,
        reprocessJobsQueued,
        deletionCount,
      },
      'Entity deletion recovery completed'
    );

    return {
      eventId: event?.id ?? '',
      preserveOmega: Boolean(omegaEntityId),
      omegaEntityId,
      factsPreserved,
      claimsCreated,
      sourceMessageIds: messageIds,
      sourceThreadIds: threadIds,
      reprocessJobsQueued,
      deletionCount,
    };
  }

  /** Load character row shape for delete route. */
  async runBeforeCharacterDelete(
    userId: string,
    character: CharacterRow,
    opts: { reason?: string; mode?: DeletionMode } = {}
  ): Promise<EntityDeletionRecoveryReport> {
    const meta = (character.metadata ?? {}) as Record<string, unknown>;
    return this.runBeforeDelete(userId, {
      entityType: 'character',
      entityId: character.id,
      name: character.name,
      aliases: character.alias ?? [],
      metadata: meta,
      omegaEntityId: meta.omega_entity_id as string | undefined,
      reason: opts.reason,
      mode: opts.mode ?? 'permanent',
    });
  }
}

export const entityDeletionRecoveryService = new EntityDeletionRecoveryService();
