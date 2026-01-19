import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { WisdomStatement } from './types';

/**
 * Connects wisdom to related experiences and patterns
 */
export class WisdomConnector {
  /**
   * Connect wisdom to related journal entries and patterns
   */
  async connectWisdom(
    userId: string,
    wisdom: WisdomStatement[]
  ): Promise<WisdomStatement[]> {
    const connected: WisdomStatement[] = [];

    for (const w of wisdom) {
      try {
        // Find related journal entries (by tags, content similarity, date proximity)
        const relatedEntries = await this.findRelatedEntries(userId, w);
        
        // Find related patterns from analytics
        const relatedPatterns = await this.findRelatedPatterns(userId, w);

        // Update wisdom with connections
        const updated = {
          ...w,
          related_experiences: relatedEntries,
          related_patterns: relatedPatterns,
        };

        // Update in database
        await supabaseAdmin
          .from('wisdom_statements')
          .update({
            related_experiences: relatedEntries,
            related_patterns: relatedPatterns,
            updated_at: new Date().toISOString(),
          })
          .eq('id', w.id);

        connected.push(updated);
      } catch (error) {
        logger.warn({ error, wisdomId: w.id }, 'Failed to connect wisdom');
        connected.push(w);
      }
    }

    return connected;
  }

  /**
   * Find related journal entries
   */
  private async findRelatedEntries(
    userId: string,
    wisdom: WisdomStatement
  ): Promise<string[]> {
    try {
      // Get entries around the same time (within 30 days)
      const sourceDate = new Date(wisdom.source_date);
      const startDate = new Date(sourceDate);
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date(sourceDate);
      endDate.setDate(endDate.getDate() + 30);

      const { data: entries, error } = await supabaseAdmin
        .from('journal_entries')
        .select('id, content, tags')
        .eq('user_id', userId)
        .gte('date', startDate.toISOString())
        .lte('date', endDate.toISOString())
        .limit(50);

      if (error || !entries) return [];

      // Find entries with similar tags or content
      const related: string[] = [];
      const wisdomLower = wisdom.statement.toLowerCase();
      const wisdomTags = new Set(wisdom.tags.map(t => t.toLowerCase()));

      for (const entry of entries) {
        // Skip the source entry
        if (entry.id === wisdom.source_id) continue;

        // Check tag overlap
        const entryTags = new Set((entry.tags || []).map((t: string) => t.toLowerCase()));
        const tagOverlap = [...wisdomTags].filter(t => entryTags.has(t));
        
        if (tagOverlap.length > 0) {
          related.push(entry.id);
          continue;
        }

        // Check content similarity (simple keyword matching)
        const entryLower = entry.content.toLowerCase();
        const wisdomWords = new Set(wisdomLower.split(/\s+/).filter(w => w.length > 4));
        const entryWords = new Set(entryLower.split(/\s+/).filter(w => w.length > 4));
        const wordOverlap = [...wisdomWords].filter(w => entryWords.has(w));

        if (wordOverlap.length >= 2) {
          related.push(entry.id);
        }
      }

      return related.slice(0, 5); // Limit to 5 related entries
    } catch (error) {
      logger.warn({ error }, 'Failed to find related entries');
      return [];
    }
  }

  /**
   * Find related patterns from analytics
   */
  private async findRelatedPatterns(
    userId: string,
    wisdom: WisdomStatement
  ): Promise<string[]> {
    try {
      // Get insights from analytics
      const { data: insights, error } = await supabaseAdmin
        .from('analytics_cache')
        .select('payload')
        .eq('user_id', userId)
        .eq('type', 'insight_engine')
        .single();

      if (error || !insights) return [];

      const payload = insights.payload as any;
      const insightsList = payload.insights || [];

      const related: string[] = [];
      const wisdomLower = wisdom.statement.toLowerCase();

      for (const insight of insightsList) {
        const insightText = (insight.description || '').toLowerCase();
        
        // Simple keyword matching
        const wisdomWords = wisdomLower.split(/\s+/).filter(w => w.length > 4);
        const insightWords = insightText.split(/\s+/).filter(w => w.length > 4);
        const overlap = wisdomWords.filter(w => insightWords.includes(w));

        if (overlap.length >= 2) {
          related.push(insight.id || insight.type || 'unknown');
        }
      }

      return related.slice(0, 3); // Limit to 3 related patterns
    } catch (error) {
      logger.warn({ error }, 'Failed to find related patterns');
      return [];
    }
  }
}

