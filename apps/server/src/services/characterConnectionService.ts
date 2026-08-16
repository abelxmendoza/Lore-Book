// =====================================================
// CHARACTER CONNECTION SERVICE
// Purpose: Remember how people are connected. When two or more characters are
//          talked about in the same conversation / story / situation, record a
//          bidirectional association between them so the network of who-knows-
//          who builds up over time.
//
// Storage: characters.associated_with_character_ids (a uuid[] already read by
//          the characters API and surfaced in the UI as "story_association"
//          relationships and connection counts). We only ADD edges here; we
//          never remove user-curated relationships.
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const STORY_ASSOCIATION_RE = new RegExp(`^story-association-(${UUID_RE})-(${UUID_RE})$`, 'i');

export function parseStoryAssociationId(
  id: string,
): { sourceId: string; targetId: string } | null {
  const match = STORY_ASSOCIATION_RE.exec(String(id ?? '').trim());
  if (!match) return null;
  return { sourceId: match[1], targetId: match[2] };
}

function asIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
}

/** Where two characters were first observed together — "met through Amazon". */
export type ConnectionOriginContext = {
  entityType: 'organization';
  entityId: string;
  entityName: string;
};

function asConnectionOrigins(value: unknown): Record<string, ConnectionOriginContext & { firstSeenAt: string }> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, ConnectionOriginContext & { firstSeenAt: string }>)
    : {};
}

class CharacterConnectionService {
  /**
   * Record that the given characters co-occurred in the same context (a single
   * conversation, journal entry, scene, or detected group). Builds a fully
   * connected, bidirectional set of associations between every pair.
   *
   * Fire-and-forget safe: all errors are caught and logged.
   *
   * @param originContext optional — where these characters were seen together
   *   (e.g. a shared organization). Recorded per-pair as "first seen via"
   *   provenance in metadata.connection_origins, never overwritten once set,
   *   even if the co-mention edge itself already existed without an origin.
   * @returns the number of NEW directed edges added.
   */
  async recordCoMention(
    userId: string,
    characterIds: string[],
    originContext?: ConnectionOriginContext,
  ): Promise<number> {
    try {
      const ids = [...new Set(characterIds.filter(id => typeof id === 'string' && id.length > 0))];
      if (ids.length < 2) return 0;

      const { data: rows, error } = await supabaseAdmin
        .from('characters')
        .select('id, associated_with_character_ids, metadata')
        .eq('user_id', userId)
        .in('id', ids);
      if (error || !rows) return 0;

      let added = 0;
      const now = new Date().toISOString();
      for (const row of rows as Array<{
        id: string;
        associated_with_character_ids: string[] | null;
        metadata: Record<string, unknown> | null;
      }>) {
        const dismissed = new Set(asIdList(row.metadata?.dismissed_associated_character_ids));
        const current = new Set(asIdList(row.associated_with_character_ids));
        const before = current.size;
        for (const other of ids) {
          if (other !== row.id && !dismissed.has(other)) current.add(other);
        }

        const meta = { ...((row.metadata ?? {}) as Record<string, unknown>) };
        const origins = asConnectionOrigins(meta.connection_origins);
        let originsChanged = false;
        if (originContext) {
          for (const other of ids) {
            if (other === row.id || !current.has(other) || origins[other]) continue;
            origins[other] = { ...originContext, firstSeenAt: now };
            originsChanged = true;
          }
        }

        if (current.size === before && !originsChanged) continue;
        added += current.size - before;
        if (originsChanged) meta.connection_origins = origins;

        const { error: updateError } = await supabaseAdmin
          .from('characters')
          .update({
            associated_with_character_ids: [...current],
            ...(originsChanged ? { metadata: meta } : {}),
            updated_at: now,
          })
          .eq('id', row.id)
          .eq('user_id', userId);
        if (updateError) {
          logger.debug({ updateError, characterId: row.id }, 'Failed to persist character connection');
        }
      }

      if (added > 0) {
        logger.debug({ userId, characterIds: ids, added }, 'Recorded character co-mention connections');
      }
      return added;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to record character co-mentions');
      return 0;
    }
  }

  /**
   * User dismissed an inferred story association. Drop both directed edges and
   * remember the dismissal so GET /characters/:id does not resurrect it from
   * mentioned_by / associated_with leftovers.
   */
  async dismissAssociation(userId: string, sourceId: string, targetId: string): Promise<boolean> {
    const ids = [...new Set([sourceId, targetId].filter((id) => typeof id === 'string' && id.length > 0))];
    if (ids.length !== 2) return false;

    const { data: rows, error } = await supabaseAdmin
      .from('characters')
      .select('id, associated_with_character_ids, mentioned_by_character_ids, metadata')
      .eq('user_id', userId)
      .in('id', ids);
    if (error) throw error;
    if (!rows?.length) return false;

    const now = new Date().toISOString();
    let changed = false;
    for (const row of rows as Array<{
      id: string;
      associated_with_character_ids: string[] | null;
      mentioned_by_character_ids: string[] | null;
      metadata: Record<string, unknown> | null;
    }>) {
      const other = row.id === sourceId ? targetId : sourceId;
      const associated = new Set(asIdList(row.associated_with_character_ids));
      const mentionedBy = new Set(asIdList(row.mentioned_by_character_ids));
      const meta = { ...((row.metadata ?? {}) as Record<string, unknown>) };
      const dismissed = new Set(asIdList(meta.dismissed_associated_character_ids));
      associated.delete(other);
      mentionedBy.delete(other);
      dismissed.add(other);
      meta.dismissed_associated_character_ids = [...dismissed];

      const { error: updateError } = await supabaseAdmin
        .from('characters')
        .update({
          associated_with_character_ids: [...associated],
          mentioned_by_character_ids: [...mentionedBy],
          metadata: meta,
          updated_at: now,
        })
        .eq('id', row.id)
        .eq('user_id', userId);
      if (updateError) throw updateError;
      changed = true;
    }

    return changed;
  }
}

export const characterConnectionService = new CharacterConnectionService();
