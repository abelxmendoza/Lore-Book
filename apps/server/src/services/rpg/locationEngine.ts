/**
 * Location Exploration Engine
 * Tracks discovery, significance, visit frequency, and lore points
 * All stats are hidden - only used for generating natural language insights
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface LocationStats {
  id: string;
  user_id: string;
  location_id: string;
  discovery_date: string | null;
  visit_count: number;
  significance_score: number;
  location_level: number;
  memories_attached: number;
  is_hidden: boolean;
  lore_points: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class LocationEngine {
  /**
   * Calculate or update location stats
   */
  async calculateLocationStats(userId: string, locationId: string): Promise<LocationStats> {
    try {
      // Get location mentions
      const { data: mentions, error: mentionsError } = await supabaseAdmin
        .from('location_mentions')
        .select('id, memory_id, created_at')
        .eq('user_id', userId)
        .eq('location_id', locationId)
        .order('created_at', { ascending: true });

      if (mentionsError) {
        logger.error({ error: mentionsError, userId, locationId }, 'Failed to fetch location mentions');
        throw mentionsError;
      }

      const visitCount = mentions?.length || 0;
      const memoriesAttached = new Set(mentions?.map(m => m.memory_id)).size;

      // Get first mention as discovery date
      const discoveryDate = mentions && mentions.length > 0 ? mentions[0].created_at : null;

      // Calculate significance score (0-100)
      const significanceScore = this.calculateSignificanceScore(mentions || [], memoriesAttached);

      // Calculate location level (1-10)
      const locationLevel = this.calculateLocationLevel(significanceScore, visitCount);

      // Calculate lore points
      const lorePoints = this.calculateLorePoints(mentions || [], memoriesAttached);

      // Check if location is hidden (unlocked through quests)
      const isHidden = await this.checkIfHidden(userId, locationId);

      // Upsert stats
      const stats: Partial<LocationStats> = {
        user_id: userId,
        location_id: locationId,
        discovery_date: discoveryDate,
        visit_count: visitCount,
        significance_score: significanceScore,
        location_level: locationLevel,
        memories_attached: memoriesAttached,
        is_hidden: isHidden,
        lore_points: lorePoints,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('location_stats')
        .upsert(stats, {
          onConflict: 'user_id,location_id',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, locationId }, 'Failed to upsert location stats');
        throw error;
      }

      return data as LocationStats;
    } catch (error) {
      logger.error({ error, userId, locationId }, 'Failed to calculate location stats');
      throw error;
    }
  }

  /**
   * Calculate significance score (0-100)
   */
  private calculateSignificanceScore(mentions: Array<{ memory_id: string; created_at: string }>, memoriesAttached: number): number {
    // Base significance from memory count (up to 40 points)
    let significance = Math.min(40, memoriesAttached * 4);

    // Add significance from visit frequency (up to 30 points)
    const visitFrequency = mentions.length;
    significance += Math.min(30, visitFrequency * 2);

    // Add significance from recency (up to 30 points)
    if (mentions.length > 0) {
      const mostRecent = new Date(mentions[mentions.length - 1].created_at);
      const daysSince = (Date.now() - mostRecent.getTime()) / (1000 * 60 * 60 * 24);
      // More recent = higher significance
      const recencyScore = Math.max(0, 30 - (daysSince / 30) * 30);
      significance += recencyScore;
    }

    return Math.min(100, Math.max(0, Math.round(significance)));
  }

  /**
   * Calculate location level (1-10)
   */
  private calculateLocationLevel(significanceScore: number, visitCount: number): number {
    // Level based on significance and visits
    const levelScore = (significanceScore / 10) + (visitCount / 5);
    return Math.min(10, Math.max(1, Math.floor(levelScore)));
  }

  /**
   * Calculate lore points
   */
  private calculateLorePoints(mentions: Array<{ memory_id: string }>, memoriesAttached: number): number {
    // Base lore points from unique memories
    let lorePoints = memoriesAttached * 2;

    // Additional points for multiple visits (stories build up)
    if (mentions.length > memoriesAttached) {
      lorePoints += (mentions.length - memoriesAttached);
    }

    return Math.max(0, lorePoints);
  }

  /**
   * Check if location is hidden (unlocked through quests)
   */
  private async checkIfHidden(userId: string, locationId: string): Promise<boolean> {
    // Check if location is linked to a quest requirement
    // For now, all locations are visible unless explicitly marked
    // This can be extended to check quest completion
    return false;
  }

  /**
   * Get all location stats for a user
   */
  async getLocationStats(userId: string): Promise<LocationStats[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('location_stats')
        .select('*')
        .eq('user_id', userId)
        .eq('is_hidden', false)
        .order('significance_score', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch location stats');
        throw error;
      }

      return (data || []) as LocationStats[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get location stats');
      throw error;
    }
  }

  /**
   * Update location stats when a new journal entry mentions a location
   */
  async updateOnJournalEntry(userId: string, locationId: string): Promise<void> {
    try {
      await this.calculateLocationStats(userId, locationId);
    } catch (error) {
      logger.error({ error, userId, locationId }, 'Failed to update location stats on journal entry');
    }
  }

  /**
   * Mark location as discovered (first mention)
   */
  async markDiscovered(userId: string, locationId: string): Promise<void> {
    try {
      const { data: existing } = await supabaseAdmin
        .from('location_stats')
        .select('discovery_date')
        .eq('user_id', userId)
        .eq('location_id', locationId)
        .single();

      if (!existing || !existing.discovery_date) {
        await supabaseAdmin
          .from('location_stats')
          .upsert({
            user_id: userId,
            location_id: locationId,
            discovery_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,location_id',
          });
      }
    } catch (error) {
      logger.error({ error, userId, locationId }, 'Failed to mark location as discovered');
    }
  }
}

export const locationEngine = new LocationEngine();
