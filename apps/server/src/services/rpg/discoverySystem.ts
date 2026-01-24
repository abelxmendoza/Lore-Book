/**
 * Discovery System
 * Generates engaging prompts and unlocks insights
 */

import { logger } from '../../logger';
import { companionEngine } from './companionEngine';
import { locationEngine } from './locationEngine';
import { supabaseAdmin } from '../supabaseClient';

export interface Discovery {
  text: string;
  type: 'character' | 'location' | 'theme' | 'memory';
  entityId?: string;
  entityName?: string;
  suggestion?: string;
}

export class DiscoverySystem {
  /**
   * Generate discovery prompts for a user
   */
  async generateDiscoveries(userId: string): Promise<Discovery[]> {
    const discoveries: Discovery[] = [];

    // Character discoveries
    const characterDiscoveries = await this.discoverCharacters(userId);
    discoveries.push(...characterDiscoveries);

    // Location discoveries
    const locationDiscoveries = await this.discoverLocations(userId);
    discoveries.push(...locationDiscoveries);

    // Theme discoveries
    const themeDiscoveries = await this.discoverThemes(userId);
    discoveries.push(...themeDiscoveries);

    return discoveries;
  }

  /**
   * Discover characters that haven't been written about recently
   */
  private async discoverCharacters(userId: string): Promise<Discovery[]> {
    const discoveries: Discovery[] = [];

    try {
      // Get all characters
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (!characters || characters.length === 0) return discoveries;

      // Check last mention for each character
      for (const character of characters) {
        const { data: lastMention } = await supabaseAdmin
          .from('character_memories')
          .select('journal_entry_id, created_at')
          .eq('user_id', userId)
          .eq('character_id', character.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (lastMention) {
          const daysSince = (Date.now() - new Date(lastMention.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince > 30) {
            discoveries.push({
              text: `You haven't written about ${character.name} in a while`,
              type: 'character',
              entityId: character.id,
              entityName: character.name,
              suggestion: `Want to check in about ${character.name}?`,
            });
          }
        } else {
          discoveries.push({
            text: `You haven't written about ${character.name} yet`,
            type: 'character',
            entityId: character.id,
            entityName: character.name,
            suggestion: `Want to share something about ${character.name}?`,
          });
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to discover characters');
    }

    return discoveries;
  }

  /**
   * Discover locations that haven't been written about recently
   */
  private async discoverLocations(userId: string): Promise<Discovery[]> {
    const discoveries: Discovery[] = [];

    try {
      // Get all locations
      const { data: locations } = await supabaseAdmin
        .from('locations')
        .select('id, name')
        .eq('user_id', userId);

      if (!locations || locations.length === 0) return discoveries;

      // Check last mention for each location
      for (const location of locations) {
        const { data: lastMention } = await supabaseAdmin
          .from('location_mentions')
          .select('created_at')
          .eq('user_id', userId)
          .eq('location_id', location.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (lastMention) {
          const daysSince = (Date.now() - new Date(lastMention.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince > 60) {
            discoveries.push({
              text: `You haven't written about ${location.name} in a while`,
              type: 'location',
              entityId: location.id,
              entityName: location.name,
              suggestion: `Want to explore memories from ${location.name}?`,
            });
          }
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to discover locations');
    }

    return discoveries;
  }

  /**
   * Discover themes that have been emerging
   */
  private async discoverThemes(userId: string): Promise<Discovery[]> {
    const discoveries: Discovery[] = [];

    try {
      // Get recent entries to detect themes
      const { data: recentEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('tags, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!recentEntries || recentEntries.length < 5) return discoveries;

      // Count tag frequency
      const tagCounts: Record<string, number> = {};
      for (const entry of recentEntries) {
        const tags = entry.tags || [];
        for (const tag of tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }

      // Find emerging themes (mentioned 3+ times recently)
      for (const [tag, count] of Object.entries(tagCounts)) {
        if (count >= 3) {
          discoveries.push({
            text: `You've been exploring ${tag} lately`,
            type: 'theme',
            entityName: tag,
            suggestion: `Want to reflect on how ${tag} has been showing up in your life?`,
          });
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to discover themes');
    }

    return discoveries;
  }

  /**
   * Discover significant memories that could use more detail
   */
  async discoverSignificantMemories(userId: string): Promise<Discovery[]> {
    const discoveries: Discovery[] = [];

    try {
      // Get entries with high sentiment or emotional content
      const { data: significantEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, sentiment, created_at')
        .eq('user_id', userId)
        .or('sentiment.gt.0.7,sentiment.lt.-0.7')
        .order('created_at', { ascending: false })
        .limit(10);

      if (!significantEntries) return discoveries;

      for (const entry of significantEntries) {
        // Check if entry has been expanded on
        const { count: relatedCount } = await supabaseAdmin
          .from('journal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .ilike('content', `%${entry.content.substring(0, 50)}%`)
          .neq('id', entry.id);

        if ((relatedCount || 0) === 0) {
          discoveries.push({
            text: `This memory seems important - want to add more details?`,
            type: 'memory',
            entityId: entry.id,
            suggestion: 'Expanding on significant memories helps preserve your story',
          });
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to discover significant memories');
    }

    return discoveries;
  }
}

export const discoverySystem = new DiscoverySystem();
