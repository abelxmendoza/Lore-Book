import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { v4 as uuid } from 'uuid';
import type { WisdomStatement, WisdomPattern } from './types';

/**
 * Tracks recurring wisdom themes and patterns
 */
export class WisdomTracker {
  /**
   * Identify and track recurring wisdom themes
   */
  async trackPatterns(userId: string, wisdom: WisdomStatement[]): Promise<WisdomPattern[]> {
    const patterns: WisdomPattern[] = [];

    try {
      // Group wisdom by theme (simple keyword-based grouping)
      const themeGroups = this.groupByTheme(wisdom);

      for (const [theme, statements] of themeGroups.entries()) {
        if (statements.length < 2) continue; // Only track themes with 2+ statements

        // Check if pattern already exists
        const existing = await this.getExistingPattern(userId, theme);

        if (existing) {
          // Update existing pattern
          const updated = await this.updatePattern(existing.id, statements.map(s => s.id));
          if (updated) patterns.push(updated);
        } else {
          // Create new pattern
          const newPattern = await this.createPattern(userId, theme, statements);
          if (newPattern) patterns.push(newPattern);
        }
      }

      logger.debug({ userId, patterns: patterns.length }, 'Tracked wisdom patterns');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to track wisdom patterns');
    }

    return patterns;
  }

  /**
   * Group wisdom statements by theme
   */
  private groupByTheme(wisdom: WisdomStatement[]): Map<string, WisdomStatement[]> {
    const groups = new Map<string, WisdomStatement[]>();

    // Extract key themes from statements
    for (const w of wisdom) {
      const themes = this.extractThemes(w.statement);
      
      for (const theme of themes) {
        if (!groups.has(theme)) {
          groups.set(theme, []);
        }
        groups.get(theme)!.push(w);
      }
    }

    return groups;
  }

  /**
   * Extract themes from a statement
   */
  private extractThemes(statement: string): string[] {
    const themes: string[] = [];
    const lower = statement.toLowerCase();

    // Common wisdom themes
    const themeKeywords: Record<string, string[]> = {
      relationships: ['relationship', 'friend', 'love', 'connection', 'people', 'person'],
      work: ['work', 'career', 'job', 'professional', 'business', 'colleague'],
      growth: ['grow', 'learn', 'improve', 'develop', 'progress', 'better'],
      happiness: ['happy', 'joy', 'content', 'satisfied', 'fulfilled', 'peace'],
      struggle: ['difficult', 'hard', 'challenge', 'struggle', 'pain', 'suffer'],
      time: ['time', 'moment', 'present', 'past', 'future', 'now'],
      self: ['self', 'myself', 'i am', 'who i', 'identity', 'person'],
      values: ['value', 'important', 'matter', 'priority', 'principle', 'believe'],
    };

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        themes.push(theme);
      }
    }

    // If no theme found, use first significant word
    if (themes.length === 0) {
      const words = statement.split(/\s+/).filter(w => w.length > 4);
      if (words.length > 0) {
        themes.push(words[0].toLowerCase());
      }
    }

    return themes;
  }

  /**
   * Get existing pattern
   */
  private async getExistingPattern(
    userId: string,
    theme: string
  ): Promise<{ id: string; frequency: number } | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('wisdom_patterns')
        .select('id, frequency')
        .eq('user_id', userId)
        .eq('theme', theme)
        .single();

      if (error || !data) return null;

      return { id: data.id, frequency: data.frequency };
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
    statements: WisdomStatement[]
  ): Promise<WisdomPattern | null> {
    try {
      const statementIds = statements.map(s => s.id);
      const firstSeen = statements[0].first_seen;
      const lastSeen = statements[statements.length - 1].last_seen;

      const { data, error } = await supabaseAdmin
        .from('wisdom_patterns')
        .insert({
          id: uuid(),
          user_id: userId,
          theme,
          statement_ids: statementIds,
          frequency: statements.length,
          first_seen: firstSeen,
          last_seen: lastSeen,
          evolution_timeline: statements.map(s => ({
            date: s.source_date,
            statement: s.statement,
            context: s.context,
            source_id: s.source_id,
          })),
        })
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to create wisdom pattern');
        return null;
      }

      return {
        theme: data.theme,
        statements: data.statement_ids || [],
        frequency: data.frequency,
        first_seen: data.first_seen,
        last_seen: data.last_seen,
        evolution_timeline: data.evolution_timeline || [],
      };
    } catch (error) {
      logger.error({ error }, 'Failed to create wisdom pattern');
      return null;
    }
  }

  /**
   * Update existing pattern
   */
  private async updatePattern(
    patternId: string,
    newStatementIds: string[]
  ): Promise<WisdomPattern | null> {
    try {
      // Get existing pattern
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('wisdom_patterns')
        .select('*')
        .eq('id', patternId)
        .single();

      if (fetchError || !existing) return null;

      // Merge statement IDs
      const existingIds = existing.statement_ids || [];
      const mergedIds = [...new Set([...existingIds, ...newStatementIds])];

      // Update pattern
      const { data, error } = await supabaseAdmin
        .from('wisdom_patterns')
        .update({
          statement_ids: mergedIds,
          frequency: mergedIds.length,
          last_seen: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', patternId)
        .select()
        .single();

      if (error) {
        logger.error({ error }, 'Failed to update wisdom pattern');
        return null;
      }

      return {
        theme: data.theme,
        statements: data.statement_ids || [],
        frequency: data.frequency,
        first_seen: data.first_seen,
        last_seen: data.last_seen,
        evolution_timeline: data.evolution_timeline || [],
      };
    } catch (error) {
      logger.error({ error }, 'Failed to update wisdom pattern');
      return null;
    }
  }
}

