/**
 * Companion System Engine
 * Calculates relationship depth, shared experiences, support levels, and synergy bonuses
 * All stats are hidden - only used for generating natural language insights
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export interface CompanionStats {
  id: string;
  user_id: string;
  character_id: string;
  relationship_depth: number;
  shared_experiences: number;
  support_level: number;
  influence_score: number;
  trust_level: number;
  relationship_class: 'Mentor' | 'Ally' | 'Rival' | 'Supporter' | 'Family' | 'Friend' | 'Colleague' | 'Other' | null;
  synergy_bonuses: string[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CharacterRelationship {
  id: string;
  source_character_id: string;
  target_character_id: string;
  relationship_type: string;
  closeness_score: number | null;
  status: string;
}

export class CompanionEngine {
  /**
   * Calculate or update companion stats for a character
   */
  async calculateCompanionStats(userId: string, characterId: string): Promise<CompanionStats> {
    try {
      // Get character memories count
      const { data: memories, error: memoriesError } = await supabaseAdmin
        .from('character_memories')
        .select('id, journal_entry_id, role, emotion')
        .eq('user_id', userId)
        .eq('character_id', characterId);

      if (memoriesError) {
        logger.error({ error: memoriesError, userId, characterId }, 'Failed to fetch character memories');
        throw memoriesError;
      }

      const sharedExperiences = memories?.length || 0;

      // Get relationship data
      const { data: relationships, error: relError } = await supabaseAdmin
        .from('character_relationships')
        .select('*')
        .eq('user_id', userId)
        .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`);

      if (relError) {
        logger.error({ error: relError, userId, characterId }, 'Failed to fetch relationships');
        throw relError;
      }

      // Calculate relationship depth (0-100)
      const relationshipDepth = this.calculateRelationshipDepth(sharedExperiences, relationships || []);

      // Calculate support level (0-10)
      const supportLevel = this.calculateSupportLevel(relationships || [], sharedExperiences);

      // Calculate influence score (0-100)
      const influenceScore = this.calculateInfluenceScore(relationships || [], sharedExperiences);

      // Calculate trust level (0-100)
      const trustLevel = this.calculateTrustLevel(relationships || [], sharedExperiences);

      // Determine relationship class
      const relationshipClass = this.determineRelationshipClass(relationships || []);

      // Calculate synergy bonuses
      const synergyBonuses = await this.calculateSynergyBonuses(userId, characterId, relationships || []);

      // Upsert stats
      const stats: Partial<CompanionStats> = {
        user_id: userId,
        character_id: characterId,
        relationship_depth: relationshipDepth,
        shared_experiences: sharedExperiences,
        support_level: supportLevel,
        influence_score: influenceScore,
        trust_level: trustLevel,
        relationship_class: relationshipClass,
        synergy_bonuses: synergyBonuses,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('companion_stats')
        .upsert(stats, {
          onConflict: 'user_id,character_id',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error, userId, characterId }, 'Failed to upsert companion stats');
        throw error;
      }

      return data as CompanionStats;
    } catch (error) {
      logger.error({ error, userId, characterId }, 'Failed to calculate companion stats');
      throw error;
    }
  }

  /**
   * Calculate relationship depth based on shared experiences and relationship strength
   */
  private calculateRelationshipDepth(sharedExperiences: number, relationships: CharacterRelationship[]): number {
    // Base depth from shared experiences (capped at 50)
    let depth = Math.min(50, sharedExperiences * 2);

    // Add relationship strength (closeness score contributes up to 50)
    if (relationships.length > 0) {
      const avgCloseness = relationships.reduce((sum, rel) => sum + (rel.closeness_score || 0), 0) / relationships.length;
      // Closeness is -10 to 10, normalize to 0-50
      depth += ((avgCloseness + 10) / 20) * 50;
    }

    return Math.min(100, Math.max(0, Math.round(depth)));
  }

  /**
   * Calculate support level (0-10)
   */
  private calculateSupportLevel(relationships: CharacterRelationship[], sharedExperiences: number): number {
    if (relationships.length === 0) {
      return Math.min(10, Math.floor(sharedExperiences / 5));
    }

    // Support level based on relationship type and closeness
    const supportTypes = ['mentor', 'ally', 'supporter', 'family', 'friend'];
    let supportScore = 0;

    for (const rel of relationships) {
      const relType = rel.relationship_type.toLowerCase();
      if (supportTypes.some(type => relType.includes(type))) {
        const closeness = rel.closeness_score || 0;
        supportScore += Math.max(0, (closeness + 10) / 2); // Normalize -10 to 10 -> 0 to 10
      }
    }

    // Average support score, capped at 10
    const avgSupport = relationships.length > 0 ? supportScore / relationships.length : 0;
    return Math.min(10, Math.max(0, Math.round(avgSupport)));
  }

  /**
   * Calculate influence score (0-100)
   */
  private calculateInfluenceScore(relationships: CharacterRelationship[], sharedExperiences: number): number {
    // Base influence from shared experiences
    let influence = Math.min(40, sharedExperiences * 2);

    // Add influence from relationship network
    if (relationships.length > 0) {
      const positiveRelationships = relationships.filter(rel => (rel.closeness_score || 0) > 0);
      influence += (positiveRelationships.length / relationships.length) * 60;
    }

    return Math.min(100, Math.max(0, Math.round(influence)));
  }

  /**
   * Calculate trust level (0-100)
   */
  private calculateTrustLevel(relationships: CharacterRelationship[], sharedExperiences: number): number {
    // Trust builds with shared experiences
    let trust = Math.min(50, sharedExperiences * 3);

    // Add trust from positive relationships
    if (relationships.length > 0) {
      const positiveRelationships = relationships.filter(rel => (rel.closeness_score || 0) > 5);
      trust += (positiveRelationships.length / relationships.length) * 50;
    }

    return Math.min(100, Math.max(0, Math.round(trust)));
  }

  /**
   * Determine relationship class based on relationship types
   */
  private determineRelationshipClass(relationships: CharacterRelationship[]): 'Mentor' | 'Ally' | 'Rival' | 'Supporter' | 'Family' | 'Friend' | 'Colleague' | 'Other' | null {
    if (relationships.length === 0) return null;

    // Count relationship types
    const typeCounts: Record<string, number> = {};
    for (const rel of relationships) {
      const type = rel.relationship_type.toLowerCase();
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    // Priority order for classification
    if (typeCounts['mentor'] || typeCounts['teacher'] || typeCounts['coach']) return 'Mentor';
    if (typeCounts['family'] || typeCounts['parent'] || typeCounts['sibling']) return 'Family';
    if (typeCounts['friend'] || typeCounts['best friend']) return 'Friend';
    if (typeCounts['rival'] || typeCounts['competitor']) return 'Rival';
    if (typeCounts['ally'] || typeCounts['partner']) return 'Ally';
    if (typeCounts['supporter'] || typeCounts['supporter']) return 'Supporter';
    if (typeCounts['colleague'] || typeCounts['coworker']) return 'Colleague';

    return 'Other';
  }

  /**
   * Calculate synergy bonuses for character combinations
   */
  private async calculateSynergyBonuses(
    userId: string,
    characterId: string,
    relationships: CharacterRelationship[]
  ): Promise<string[]> {
    const bonuses: string[] = [];

    // Find characters that appear together frequently
    const { data: sharedMemories, error } = await supabaseAdmin
      .from('character_memories')
      .select('journal_entry_id')
      .eq('user_id', userId)
      .eq('character_id', characterId);

    if (error || !sharedMemories) return bonuses;

    // Find other characters in same entries
    const entryIds = sharedMemories.map(m => m.journal_entry_id);
    if (entryIds.length === 0) return bonuses;

    const { data: otherMemories } = await supabaseAdmin
      .from('character_memories')
      .select('character_id')
      .eq('user_id', userId)
      .in('journal_entry_id', entryIds)
      .neq('character_id', characterId);

    if (!otherMemories) return bonuses;

    // Count co-occurrences
    const coOccurrences: Record<string, number> = {};
    for (const mem of otherMemories) {
      coOccurrences[mem.character_id] = (coOccurrences[mem.character_id] || 0) + 1;
    }

    // Generate synergy bonuses for frequent co-occurrences
    for (const [charId, count] of Object.entries(coOccurrences)) {
      if (count >= 3) {
        bonuses.push(`Synergy with ${charId}: ${count} shared experiences`);
      }
    }

    return bonuses;
  }

  /**
   * Get all companion stats for a user
   */
  async getCompanionStats(userId: string): Promise<CompanionStats[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('companion_stats')
        .select('*')
        .eq('user_id', userId)
        .order('relationship_depth', { ascending: false });

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch companion stats');
        throw error;
      }

      return (data || []) as CompanionStats[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get companion stats');
      throw error;
    }
  }

  /**
   * Update companion stats when a new journal entry mentions a character
   */
  async updateOnJournalEntry(userId: string, characterId: string): Promise<void> {
    try {
      await this.calculateCompanionStats(userId, characterId);
    } catch (error) {
      logger.error({ error, userId, characterId }, 'Failed to update companion stats on journal entry');
    }
  }
}

export const companionEngine = new CompanionEngine();
