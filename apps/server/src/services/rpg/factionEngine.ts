/**
 * Faction System Engine
 * Auto-detects social groups and tracks reputation
 * All stats are hidden - only used for generating natural language insights
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface FactionStats {
  id: string;
  user_id: string;
  faction_name: string;
  faction_type: 'work' | 'family' | 'friends' | 'hobby' | 'community' | 'other' | null;
  reputation: number;
  relationship_count: number;
  influence_score: number;
  alliance_strength: number;
  conflict_history: Array<{ date: string; type: string; outcome: string }>;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class FactionEngine {
  /**
   * Auto-detect factions from social communities and relationships
   */
  async detectFactions(userId: string): Promise<FactionStats[]> {
    try {
      // Get social communities
      const { data: communities, error: communitiesError } = await supabaseAdmin
        .from('social_communities')
        .select('*')
        .eq('user_id', userId);

      if (communitiesError) {
        logger.error({ error: communitiesError, userId }, 'Failed to fetch social communities');
        throw communitiesError;
      }

      const factions: FactionStats[] = [];

      // Process each community as a potential faction
      for (const community of communities || []) {
        const factionName = community.theme || 'Unknown Group';
        const factionType = this.determineFactionType(community.theme || '');

        const stats = await this.calculateFactionStats(userId, factionName, factionType, community.members || []);
        factions.push(stats);
      }

      // Also detect factions from character relationships
      const relationshipFactions = await this.detectFactionsFromRelationships(userId);
      factions.push(...relationshipFactions);

      return factions;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect factions');
      throw error;
    }
  }

  /**
   * Calculate faction stats
   */
  async calculateFactionStats(
    userId: string,
    factionName: string,
    factionType: 'work' | 'family' | 'friends' | 'hobby' | 'community' | 'other' | null,
    memberNames: string[]
  ): Promise<FactionStats> {
    try {
      // Get characters in this faction
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .in('name', memberNames);

      const characterIds = characters?.map(c => c.id) || [];

      if (characterIds.length === 0) {
        // Return default stats if no characters found
        return this.createDefaultFactionStats(userId, factionName, factionType);
      }

      // Get relationships with these characters
      const { data: relationships } = await supabaseAdmin
        .from('character_relationships')
        .select('*')
        .eq('user_id', userId)
        .in('source_character_id', characterIds);

      const relationshipCount = relationships?.length || 0;

      // Calculate reputation from relationship sentiment
      const reputation = this.calculateReputation(relationships || []);

      // Calculate influence score
      const influenceScore = this.calculateInfluenceScore(characterIds.length, relationships || []);

      // Calculate alliance strength
      const allianceStrength = this.calculateAllianceStrength(relationships || []);

      // Get conflict history
      const conflictHistory = await this.getConflictHistory(userId, characterIds);

      // Upsert stats
      const stats: Partial<FactionStats> = {
        user_id: userId,
        faction_name: factionName,
        faction_type: factionType,
        reputation,
        relationship_count: relationshipCount,
        influence_score: influenceScore,
        alliance_strength: allianceStrength,
        conflict_history: conflictHistory,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('faction_stats')
        .upsert(stats, {
          onConflict: 'user_id,faction_name',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, factionName }, 'Failed to upsert faction stats');
        throw error;
      }

      return data as FactionStats;
    } catch (error) {
      logger.error({ error, userId, factionName }, 'Failed to calculate faction stats');
      throw error;
    }
  }

  /**
   * Detect factions from character relationships
   */
  private async detectFactionsFromRelationships(userId: string): Promise<FactionStats[]> {
    // Group characters by relationship type to detect factions
    const { data: relationships } = await supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id, relationship_type')
      .eq('user_id', userId);

    if (!relationships || relationships.length === 0) return [];

    // Group by relationship type
    const typeGroups: Record<string, string[]> = {};
    for (const rel of relationships) {
      const type = rel.relationship_type.toLowerCase();
      if (!typeGroups[type]) typeGroups[type] = [];
      typeGroups[type].push(rel.source_character_id, rel.target_character_id);
    }

    const factions: FactionStats[] = [];
    for (const [type, characterIds] of Object.entries(typeGroups)) {
      if (characterIds.length >= 2) {
        const uniqueIds = [...new Set(characterIds)];
        const factionName = `${type.charAt(0).toUpperCase() + type.slice(1)} Circle`;
        const factionType = this.determineFactionType(type);
        const stats = await this.calculateFactionStats(userId, factionName, factionType, []);
        factions.push(stats);
      }
    }

    return factions;
  }

  /**
   * Determine faction type from name/theme
   */
  private determineFactionType(theme: string): 'work' | 'family' | 'friends' | 'hobby' | 'community' | 'other' {
    const lower = theme.toLowerCase();
    if (lower.includes('work') || lower.includes('job') || lower.includes('career') || lower.includes('colleague')) return 'work';
    if (lower.includes('family') || lower.includes('parent') || lower.includes('sibling')) return 'family';
    if (lower.includes('friend') || lower.includes('buddy') || lower.includes('pal')) return 'friends';
    if (lower.includes('hobby') || lower.includes('club') || lower.includes('group')) return 'hobby';
    if (lower.includes('community') || lower.includes('neighborhood')) return 'community';
    return 'other';
  }

  /**
   * Calculate reputation (-100 to 100)
   */
  private calculateReputation(relationships: Array<{ closeness_score: number | null }>): number {
    if (relationships.length === 0) return 0;

    const avgCloseness = relationships.reduce((sum, rel) => sum + (rel.closeness_score || 0), 0) / relationships.length;
    // Closeness is -10 to 10, convert to -100 to 100
    return Math.round(avgCloseness * 10);
  }

  /**
   * Calculate influence score (0-100)
   */
  private calculateInfluenceScore(memberCount: number, relationships: Array<{ closeness_score: number | null }>): number {
    // Base influence from member count (up to 40)
    let influence = Math.min(40, memberCount * 5);

    // Add influence from positive relationships (up to 60)
    const positiveRelationships = relationships.filter(rel => (rel.closeness_score || 0) > 0);
    if (relationships.length > 0) {
      influence += (positiveRelationships.length / relationships.length) * 60;
    }

    return Math.min(100, Math.max(0, Math.round(influence)));
  }

  /**
   * Calculate alliance strength (0-100)
   */
  private calculateAllianceStrength(relationships: Array<{ closeness_score: number | null }>): number {
    if (relationships.length === 0) return 0;

    const strongRelationships = relationships.filter(rel => (rel.closeness_score || 0) > 5);
    return Math.round((strongRelationships.length / relationships.length) * 100);
  }

  /**
   * Get conflict history for faction
   */
  private async getConflictHistory(userId: string, characterIds: string[]): Promise<Array<{ date: string; type: string; outcome: string }>> {
    // This would integrate with conflict_detection_engine
    // For now, return empty array
    return [];
  }

  /**
   * Create default faction stats
   */
  private createDefaultFactionStats(
    userId: string,
    factionName: string,
    factionType: 'work' | 'family' | 'friends' | 'hobby' | 'community' | 'other' | null
  ): FactionStats {
    return {
      id: '',
      user_id: userId,
      faction_name: factionName,
      faction_type: factionType,
      reputation: 0,
      relationship_count: 0,
      influence_score: 0,
      alliance_strength: 0,
      conflict_history: [],
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Get all faction stats for a user
   */
  async getFactionStats(userId: string): Promise<FactionStats[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('faction_stats')
        .select('*')
        .eq('user_id', userId)
        .order('influence_score', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch faction stats');
        throw error;
      }

      return (data || []) as FactionStats[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get faction stats');
      throw error;
    }
  }

  /**
   * Update faction stats when relationships change
   */
  async updateOnRelationshipChange(userId: string): Promise<void> {
    try {
      await this.detectFactions(userId);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update faction stats on relationship change');
    }
  }
}

export const factionEngine = new FactionEngine();
