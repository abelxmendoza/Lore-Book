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

class CharacterConnectionService {
  /**
   * Record that the given characters co-occurred in the same context (a single
   * conversation, journal entry, scene, or detected group). Builds a fully
   * connected, bidirectional set of associations between every pair.
   *
   * Fire-and-forget safe: all errors are caught and logged.
   *
   * @returns the number of NEW directed edges added.
   */
  async recordCoMention(userId: string, characterIds: string[]): Promise<number> {
    try {
      const ids = [...new Set(characterIds.filter(id => typeof id === 'string' && id.length > 0))];
      if (ids.length < 2) return 0;

      const { data: rows, error } = await supabaseAdmin
        .from('characters')
        .select('id, associated_with_character_ids')
        .eq('user_id', userId)
        .in('id', ids);
      if (error || !rows) return 0;

      let added = 0;
      const now = new Date().toISOString();
      for (const row of rows as Array<{ id: string; associated_with_character_ids: string[] | null }>) {
        const current = new Set(Array.isArray(row.associated_with_character_ids) ? row.associated_with_character_ids : []);
        const before = current.size;
        for (const other of ids) {
          if (other !== row.id) current.add(other);
        }
        if (current.size === before) continue;

        added += current.size - before;
        const { error: updateError } = await supabaseAdmin
          .from('characters')
          .update({ associated_with_character_ids: [...current], updated_at: now })
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
}

export const characterConnectionService = new CharacterConnectionService();
