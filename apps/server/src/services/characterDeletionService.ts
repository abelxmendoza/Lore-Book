/**
 * CharacterDeletionService — removes a character and the derived data the
 * FK cascades can't reach.
 *
 * Cascades already clean: character_relationships, character_memories,
 * character_facts, character_timeline_events, rpg_character_traits.
 * Handled here: entity_facts (no FK), the omega entity graph (claims /
 * relationships / evidence cascade off omega_entities), and the character's
 * presence in resolved_events.people arrays.
 *
 * By default events the person appears in are kept (their id is just removed
 * from people[]). Pass deleteEvents=true to drop those events entirely —
 * used when purging fabricated test people.
 */

import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

export interface DeletionReport {
  characterId: string;
  name: string;
  entityFactsDeleted: number;
  eventsDeleted: number;
  eventsDetached: number;
  omegaEntityDeleted: boolean;
}

class CharacterDeletionService {
  async deleteCharacter(
    userId: string,
    characterId: string,
    opts: { deleteEvents?: boolean } = {}
  ): Promise<DeletionReport | null> {
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();
    if (!character) return null;

    const report: DeletionReport = {
      characterId,
      name: character.name,
      entityFactsDeleted: 0,
      eventsDeleted: 0,
      eventsDetached: 0,
      omegaEntityDeleted: false,
    };

    const { data: deletedFacts } = await supabaseAdmin
      .from('entity_facts')
      .delete()
      .eq('user_id', userId)
      .eq('entity_type', 'character')
      .eq('entity_id', characterId)
      .select('id');
    report.entityFactsDeleted = deletedFacts?.length ?? 0;

    const omegaId = (character.metadata as Record<string, any> | null)?.omega_entity_id as string | undefined;
    if (omegaId) {
      const { data: events } = await supabaseAdmin
        .from('resolved_events')
        .select('id, people')
        .eq('user_id', userId)
        .contains('people', [omegaId]);

      for (const ev of (events ?? []) as Array<{ id: string; people: string[] | null }>) {
        if (opts.deleteEvents) {
          await supabaseAdmin.from('resolved_events').delete().eq('id', ev.id).eq('user_id', userId);
          report.eventsDeleted++;
        } else {
          await supabaseAdmin
            .from('resolved_events')
            .update({ people: (ev.people ?? []).filter(p => p !== omegaId) })
            .eq('id', ev.id)
            .eq('user_id', userId);
          report.eventsDetached++;
        }
      }

      // omega_claims / omega_relationships / omega_evidence cascade off this
      const { error: omegaErr } = await supabaseAdmin
        .from('omega_entities')
        .delete()
        .eq('id', omegaId)
        .eq('user_id', userId);
      report.omegaEntityDeleted = !omegaErr;
    }

    const { error } = await supabaseAdmin
      .from('characters')
      .delete()
      .eq('id', characterId)
      .eq('user_id', userId);
    if (error) {
      logger.error({ err: error, characterId }, 'Failed to delete character row');
      throw error;
    }

    logger.info({ userId, ...report }, 'Character deleted');
    return report;
  }
}

export const characterDeletionService = new CharacterDeletionService();
