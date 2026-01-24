/**
 * RPG Processor
 * Integrates with journal entry creation to update all RPG stats automatically
 */

import { logger } from '../../logger';
import { companionEngine } from './companionEngine';
import { locationEngine } from './locationEngine';
import { factionEngine } from './factionEngine';
import { chapterEngine } from './chapterEngine';
import { challengeEngine } from './challengeEngine';
import { skillTreeEngine } from './skillTreeEngine';
import { resourceEngine } from './resourceEngine';
import { questChainEngine } from './questChainEngine';
import { supabaseAdmin } from '../supabaseClient';

export class RpgProcessor {
  /**
   * Process a new journal entry and update all RPG stats
   */
  async processJournalEntry(userId: string, entryId: string): Promise<void> {
    try {
      // Get journal entry
      const { data: entry, error: entryError } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, chapter_id, created_at')
        .eq('id', entryId)
        .eq('user_id', userId)
        .single();

      if (entryError || !entry) {
        logger.error({ error: entryError, userId, entryId }, 'Failed to fetch journal entry');
        return;
      }

      // Update companion stats for mentioned characters
      await this.updateCompanionStats(userId, entryId);

      // Update location stats for mentioned locations
      await this.updateLocationStats(userId, entryId);

      // Update faction stats (when relationships change)
      await this.updateFactionStats(userId);

      // Update chapter stats (when timeline progresses)
      if (entry.chapter_id) {
        await chapterEngine.updateOnTimelineProgress(userId, entry.chapter_id);
      }

      // Update challenge stats (when conflicts detected)
      await challengeEngine.updateOnConflictDetected(userId);

      // Update resource stats (from activity patterns)
      const entryDate = new Date(entry.created_at);
      await resourceEngine.updateOnActivityChange(userId, entryDate);

      // Update quest chain progress
      await questChainEngine.updateOnQuestChange(userId);

      logger.info({ userId, entryId }, 'RPG stats updated for journal entry');
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to process journal entry for RPG stats');
    }
  }

  /**
   * Update companion stats for characters mentioned in entry
   */
  private async updateCompanionStats(userId: string, entryId: string): Promise<void> {
    try {
      const { data: characterMemories } = await supabaseAdmin
        .from('character_memories')
        .select('character_id')
        .eq('user_id', userId)
        .eq('journal_entry_id', entryId);

      if (!characterMemories) return;

      const characterIds = [...new Set(characterMemories.map(m => m.character_id))];
      for (const characterId of characterIds) {
        await companionEngine.updateOnJournalEntry(userId, characterId);
      }
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to update companion stats');
    }
  }

  /**
   * Update location stats for locations mentioned in entry
   */
  private async updateLocationStats(userId: string, entryId: string): Promise<void> {
    try {
      const { data: locationMentions } = await supabaseAdmin
        .from('location_mentions')
        .select('location_id')
        .eq('user_id', userId)
        .eq('memory_id', entryId);

      if (!locationMentions) return;

      const locationIds = [...new Set(locationMentions.map(m => m.location_id))];
      for (const locationId of locationIds) {
        await locationEngine.updateOnJournalEntry(userId, locationId);
        await locationEngine.markDiscovered(userId, locationId);
      }
    } catch (error) {
      logger.error({ error, userId, entryId }, 'Failed to update location stats');
    }
  }

  /**
   * Update faction stats when relationships change
   */
  private async updateFactionStats(userId: string): Promise<void> {
    try {
      await factionEngine.updateOnRelationshipChange(userId);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update faction stats');
    }
  }
}

export const rpgProcessor = new RpgProcessor();
