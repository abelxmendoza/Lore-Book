import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { v4 as uuid } from 'uuid';
import { differenceInMonths, parseISO } from 'date-fns';
import type { LearningRecord, LearningPattern } from './types';

/**
 * Tracks learning patterns and themes
 */
export class LearningTracker {
  /**
   * Identify and track learning patterns
   */
  async trackPatterns(userId: string, learning: LearningRecord[]): Promise<LearningPattern[]> {
    const patterns: LearningPattern[] = [];

    try {
      // Group learning by theme
      const themeGroups = this.groupByTheme(learning);

      for (const [theme, records] of themeGroups.entries()) {
        if (records.length < 2) continue; // Only track themes with 2+ records

        // Check if pattern already exists
        const existing = await this.getExistingPattern(userId, theme);

        if (existing) {
          // Update existing pattern
          const updated = await this.updatePattern(existing.id, records.map(r => r.id));
          if (updated) patterns.push(updated);
        } else {
          // Create new pattern
          const newPattern = await this.createPattern(userId, theme, records);
          if (newPattern) patterns.push(newPattern);
        }
      }

      logger.debug({ userId, patterns: patterns.length }, 'Tracked learning patterns');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to track learning patterns');
    }

    return patterns;
  }

  /**
   * Group learning records by theme
   */
  private groupByTheme(learning: LearningRecord[]): Map<string, LearningRecord[]> {
    const groups = new Map<string, LearningRecord[]>();

    // Extract themes from learning records
    for (const l of learning) {
      const themes = this.extractThemes(l);
      
      for (const theme of themes) {
        if (!groups.has(theme)) {
          groups.set(theme, []);
        }
        groups.get(theme)!.push(l);
      }
    }

    return groups;
  }

  /**
   * Extract themes from a learning record
   */
  private extractThemes(record: LearningRecord): string[] {
    const themes: string[] = [];
    const lowerName = record.name.toLowerCase();
    const lowerDesc = record.description.toLowerCase();

    // Common learning themes
    const themeKeywords: Record<string, string[]> = {
      programming: ['programming', 'code', 'coding', 'developer', 'software', 'algorithm', 'function', 'variable', 'api', 'framework', 'library'],
      design: ['design', 'ui', 'ux', 'interface', 'visual', 'graphic', 'layout', 'typography', 'color'],
      communication: ['communication', 'writing', 'speaking', 'presentation', 'public speaking', 'email', 'meeting'],
      business: ['business', 'marketing', 'sales', 'strategy', 'management', 'leadership', 'entrepreneurship'],
      language: ['language', 'spanish', 'french', 'german', 'chinese', 'japanese', 'english', 'fluent', 'conversational'],
      data: ['data', 'analytics', 'analysis', 'statistics', 'database', 'sql', 'excel', 'spreadsheet'],
      creative: ['creative', 'art', 'music', 'writing', 'photography', 'video', 'editing'],
      technical: ['technical', 'engineering', 'system', 'architecture', 'infrastructure', 'devops'],
    };

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(kw => lowerName.includes(kw) || lowerDesc.includes(kw))) {
        themes.push(theme);
      }
    }

    // If no theme found, use type as theme
    if (themes.length === 0) {
      themes.push(record.type);
    }

    return themes;
  }

  /**
   * Get existing pattern
   */
  private async getExistingPattern(
    userId: string,
    theme: string
  ): Promise<{ id: string; growth_rate: number } | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('learning_patterns')
        .select('id, growth_rate')
        .eq('user_id', userId)
        .eq('theme', theme)
        .single();

      if (error || !data) return null;

      return { id: data.id, growth_rate: data.growth_rate };
    } catch (error) {
      logger.warn({ error }, 'Failed to get existing pattern');
      return null;
    }
  }

  /**
   * Create new pattern
   */
  private async createPattern(
    userId: string,
    theme: string,
    records: LearningRecord[]
  ): Promise<LearningPattern | null> {
    try {
      const recordIds = records.map(r => r.id);
      const firstLearned = records[0].first_mentioned;
      const lastLearned = records[records.length - 1].last_mentioned;
      
      // Calculate average proficiency (convert to number for average)
      const proficiencyLevels: Record<string, number> = {
        beginner: 1,
        intermediate: 2,
        advanced: 3,
        expert: 4,
      };
      const avgProficiency = records.reduce((sum, r) => sum + (proficiencyLevels[r.proficiency] || 1), 0) / records.length;

      // Calculate growth rate (skills per month)
      const monthsDiff = differenceInMonths(parseISO(lastLearned), parseISO(firstLearned));
      const growthRate = monthsDiff > 0 ? records.length / monthsDiff : records.length;

      const { data, error } = await supabaseAdmin
        .from('learning_patterns')
        .insert({
          id: uuid(),
          user_id: userId,
          theme,
          record_ids: recordIds,
          total_skills: records.length,
          avg_proficiency: avgProficiency,
          first_learned: firstLearned,
          last_learned: lastLearned,
          growth_rate: growthRate,
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to create learning pattern');
        return null;
      }

      return {
        theme: data.theme,
        records: data.record_ids || [],
        total_skills: data.total_skills,
        avg_proficiency: data.avg_proficiency,
        first_learned: data.first_learned,
        last_learned: data.last_learned,
        growth_rate: data.growth_rate,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create learning pattern');
      return null;
    }
  }

  /**
   * Update existing pattern
   */
  private async updatePattern(
    patternId: string,
    newRecordIds: string[]
  ): Promise<LearningPattern | null> {
    try {
      // Get existing pattern
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('learning_patterns')
        .select('*')
        .eq('id', patternId)
        .single();

      if (fetchError || !existing) return null;

      // Merge record IDs
      const existingIds = existing.record_ids || [];
      const mergedIds = [...new Set([...existingIds, ...newRecordIds])];

      // Recalculate growth rate
      const { data: records } = await supabaseAdmin
        .from('learning_records')
        .select('first_mentioned, last_mentioned')
        .in('id', mergedIds)
        .order('first_mentioned', { ascending: true });

      if (!records || records.length === 0) return null;

      const firstLearned = records[0].first_mentioned;
      const lastLearned = records[records.length - 1].last_mentioned;
      const monthsDiff = differenceInMonths(parseISO(lastLearned), parseISO(firstLearned));
      const growthRate = monthsDiff > 0 ? mergedIds.length / monthsDiff : mergedIds.length;

      // Update pattern
      const { data, error } = await supabaseAdmin
        .from('learning_patterns')
        .update({
          record_ids: mergedIds,
          total_skills: mergedIds.length,
          last_learned: new Date().toISOString(),
          growth_rate: growthRate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', patternId)
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to update learning pattern');
        return null;
      }

      return {
        theme: data.theme,
        records: data.record_ids || [],
        total_skills: data.total_skills,
        avg_proficiency: data.avg_proficiency,
        first_learned: data.first_learned,
        last_learned: data.last_learned,
        growth_rate: data.growth_rate,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to update learning pattern');
      return null;
    }
  }
}

