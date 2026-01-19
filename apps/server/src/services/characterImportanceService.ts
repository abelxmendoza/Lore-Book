import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type ImportanceLevel = 'protagonist' | 'major' | 'supporting' | 'minor' | 'background';

export type ImportanceCriteria = {
  mentionCount: number;
  relationshipDepth: number;
  roleSignificance: number; // 0-1 based on role/archetype
  interactionFrequency: number;
  emotionalSignificance: number; // 0-1 based on emotional content
  timelinePresence: number; // How many timeline entries they appear in
  lastMentionDate?: Date;
  firstMentionDate?: Date;
};

export type CharacterImportance = {
  importanceLevel: ImportanceLevel;
  importanceScore: number; // 0-100
  criteria: ImportanceCriteria;
  reasoning: string;
};

class CharacterImportanceService {
  /**
   * Calculate importance level and score for a character
   */
  async calculateImportance(
    userId: string,
    characterId: string,
    criteria: Partial<ImportanceCriteria>
  ): Promise<CharacterImportance> {
    try {
      // Get full criteria by fetching from database if not provided
      const fullCriteria = await this.gatherCriteria(userId, characterId, criteria);

      // Calculate base score
      const baseScore = this.calculateBaseScore(fullCriteria);

      // Use AI to determine importance level with context
      const importanceLevel = await this.determineImportanceLevel(
        userId,
        characterId,
        fullCriteria,
        baseScore
      );

      // Final score (0-100)
      const importanceScore = Math.min(100, Math.max(0, baseScore));

      return {
        importanceLevel,
        importanceScore,
        criteria: fullCriteria,
        reasoning: this.generateReasoning(fullCriteria, importanceLevel)
      };
    } catch (error) {
      logger.error({ error, characterId }, 'Failed to calculate character importance');
      // Default to minor if calculation fails
      return {
        importanceLevel: 'minor',
        importanceScore: 10,
        criteria: criteria as ImportanceCriteria,
        reasoning: 'Unable to calculate importance'
      };
    }
  }

  /**
   * Gather all criteria for importance calculation
   */
  private async gatherCriteria(
    userId: string,
    characterId: string,
    providedCriteria: Partial<ImportanceCriteria>
  ): Promise<ImportanceCriteria> {
    // Get character info
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('name, role, archetype, first_appearance, created_at')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();

    // Count mentions in journal entries
    const { count: mentionCount } = await supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or(`content.ilike.%${character?.name}%,metadata->characters.cs.["${characterId}"]`);

    // Count relationships
    const { count: relationshipCount } = await supabaseAdmin
      .from('character_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`);

    // Get timeline presence (entries with this character)
    const { count: timelinePresence } = await supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .contains('metadata', { characters: [characterId] });

    // Get first and last mention dates
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('date, created_at')
      .eq('user_id', userId)
      .or(`content.ilike.%${character?.name}%,metadata->characters.cs.["${characterId}"]`)
      .order('date', { ascending: true })
      .limit(1);

    const firstMentionDate = entries?.[0]?.date 
      ? new Date(entries[0].date) 
      : character?.first_appearance 
        ? new Date(character.first_appearance) 
        : character?.created_at 
          ? new Date(character.created_at) 
          : undefined;

    const { data: lastEntry } = await supabaseAdmin
      .from('journal_entries')
      .select('date')
      .eq('user_id', userId)
      .or(`content.ilike.%${character?.name}%,metadata->characters.cs.["${characterId}"]`)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    const lastMentionDate = lastEntry?.date ? new Date(lastEntry.date) : undefined;

    // Calculate role significance
    const roleSignificance = this.calculateRoleSignificance(character?.role, character?.archetype);

    // Estimate interaction frequency (mentions per month since first mention)
    const daysSinceFirst = firstMentionDate 
      ? (Date.now() - firstMentionDate.getTime()) / (1000 * 60 * 60 * 24)
      : 30;
    const monthsSinceFirst = Math.max(1, daysSinceFirst / 30);
    const interactionFrequency = (mentionCount || 0) / monthsSinceFirst;

    return {
      mentionCount: providedCriteria.mentionCount ?? (mentionCount || 0),
      relationshipDepth: providedCriteria.relationshipDepth ?? (relationshipCount || 0),
      roleSignificance: providedCriteria.roleSignificance ?? roleSignificance,
      interactionFrequency: providedCriteria.interactionFrequency ?? interactionFrequency,
      emotionalSignificance: providedCriteria.emotionalSignificance ?? 0.5, // Default, can be enhanced
      timelinePresence: providedCriteria.timelinePresence ?? (timelinePresence || 0),
      lastMentionDate,
      firstMentionDate
    };
  }

  /**
   * Calculate base importance score (0-100)
   */
  private calculateBaseScore(criteria: ImportanceCriteria): number {
    let score = 0;

    // Mention count (0-30 points)
    score += Math.min(30, criteria.mentionCount * 2);

    // Relationship depth (0-20 points)
    score += Math.min(20, criteria.relationshipDepth * 5);

    // Role significance (0-20 points)
    score += criteria.roleSignificance * 20;

    // Interaction frequency (0-15 points)
    score += Math.min(15, criteria.interactionFrequency * 3);

    // Emotional significance (0-10 points)
    score += criteria.emotionalSignificance * 10;

    // Timeline presence (0-5 points)
    score += Math.min(5, criteria.timelinePresence * 0.5);

    return score;
  }

  /**
   * Determine importance level using AI for context-aware classification
   */
  private async determineImportanceLevel(
    userId: string,
    characterId: string,
    criteria: ImportanceCriteria,
    baseScore: number
  ): Promise<ImportanceLevel> {
    try {
      // Get character details
      const { data: character } = await supabaseAdmin
        .from('characters')
        .select('name, role, archetype, summary, tags')
        .eq('id', characterId)
        .eq('user_id', userId)
        .single();

      // Use AI to determine importance level with context
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `Determine the importance level of a character based on their role in the user's story.

Importance Levels:
- **protagonist**: The main character (usually the user themselves or a central figure)
- **major**: Key characters with significant impact, frequent mentions, deep relationships
- **supporting**: Regular characters who appear often but aren't central
- **minor**: Occasional characters with limited impact
- **background**: Rarely mentioned, minimal impact

Consider:
- Mention frequency (${criteria.mentionCount} mentions)
- Relationship depth (${criteria.relationshipDepth} relationships)
- Role/archetype significance
- Interaction frequency (${criteria.interactionFrequency.toFixed(2)} per month)
- Timeline presence (${criteria.timelinePresence} entries)

Return only the importance level (protagonist, major, supporting, minor, or background).`
          },
          {
            role: 'user',
            content: `Character: ${character?.name}
Role: ${character?.role || 'unknown'}
Archetype: ${character?.archetype || 'unknown'}
Summary: ${character?.summary || 'none'}
Tags: ${character?.tags?.join(', ') || 'none'}
Base Score: ${baseScore.toFixed(1)}/100

Determine importance level:`
          }
        ]
      });

      const level = completion.choices[0]?.message?.content?.trim().toLowerCase();
      
      // Validate and map to ImportanceLevel
      if (level === 'protagonist' || level === 'major' || level === 'supporting' || level === 'minor' || level === 'background') {
        return level;
      }

      // Fallback to score-based classification
      return this.scoreBasedClassification(baseScore);
    } catch (error) {
      logger.warn({ error, characterId }, 'AI importance classification failed, using score-based');
      return this.scoreBasedClassification(baseScore);
    }
  }

  /**
   * Fallback classification based on score
   */
  private scoreBasedClassification(score: number): ImportanceLevel {
    if (score >= 80) return 'protagonist';
    if (score >= 60) return 'major';
    if (score >= 40) return 'supporting';
    if (score >= 20) return 'minor';
    return 'background';
  }

  /**
   * Calculate role significance (0-1)
   */
  private calculateRoleSignificance(role?: string | null, archetype?: string | null): number {
    const roleLower = (role || '').toLowerCase();
    const archetypeLower = (archetype || '').toLowerCase();

    // High significance roles
    if (roleLower.includes('partner') || roleLower.includes('spouse') || roleLower.includes('best friend') ||
        archetypeLower.includes('mentor') || archetypeLower.includes('guide') || archetypeLower.includes('companion')) {
      return 0.9;
    }

    // Medium-high significance
    if (roleLower.includes('friend') || roleLower.includes('family') || roleLower.includes('colleague') ||
        archetypeLower.includes('ally') || archetypeLower.includes('rival')) {
      return 0.7;
    }

    // Medium significance
    if (roleLower.includes('acquaintance') || roleLower.includes('neighbor') ||
        archetypeLower.includes('stranger') || archetypeLower.includes('bystander')) {
      return 0.5;
    }

    // Low significance
    return 0.3;
  }

  /**
   * Generate reasoning for importance level
   */
  private generateReasoning(criteria: ImportanceCriteria, level: ImportanceLevel): string {
    const reasons: string[] = [];

    if (criteria.mentionCount > 10) {
      reasons.push(`mentioned ${criteria.mentionCount} times`);
    }
    if (criteria.relationshipDepth > 2) {
      reasons.push(`${criteria.relationshipDepth} relationships`);
    }
    if (criteria.interactionFrequency > 2) {
      reasons.push(`frequent interactions (${criteria.interactionFrequency.toFixed(1)}/month)`);
    }
    if (criteria.roleSignificance > 0.7) {
      reasons.push('significant role');
    }

    return reasons.length > 0 
      ? `Classified as ${level} because: ${reasons.join(', ')}`
      : `Classified as ${level} based on overall presence`;
  }

  /**
   * Update character importance in database
   */
  async updateCharacterImportance(
    userId: string,
    characterId: string,
    importance: CharacterImportance
  ): Promise<void> {
    try {
      await supabaseAdmin
        .from('characters')
        .update({
          importance_level: importance.importanceLevel,
          importance_score: importance.importanceScore,
          updated_at: new Date().toISOString()
        })
        .eq('id', characterId)
        .eq('user_id', userId);
    } catch (error) {
      logger.error({ error, characterId }, 'Failed to update character importance');
      throw error;
    }
  }

  /**
   * Recalculate importance for all characters (batch operation)
   */
  async recalculateAllImportances(userId: string): Promise<void> {
    try {
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id')
        .eq('user_id', userId);

      if (!characters) return;

      for (const char of characters) {
        try {
          const importance = await this.calculateImportance(userId, char.id, {});
          await this.updateCharacterImportance(userId, char.id, importance);
        } catch (error) {
          logger.warn({ error, characterId: char.id }, 'Failed to recalculate importance for character');
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Failed to recalculate all importances');
    }
  }
}

export const characterImportanceService = new CharacterImportanceService();
