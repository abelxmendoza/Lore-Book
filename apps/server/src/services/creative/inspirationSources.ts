import { logger } from '../../logger';
import type { InspirationSource, InspirationSourceType } from './types';

/**
 * Extracts inspiration sources from journal entries
 */
export class InspirationSourceExtractor {
  /**
   * Extract inspiration sources
   */
  extract(entries: any[]): InspirationSource[] {
    const sources: InspirationSource[] = [];

    try {
      const patterns: Array<{ type: InspirationSourceType; regex: RegExp; weight: number }> = [
        { type: 'person', regex: /(she|he|they|friend|coach|mentor|inspired by|learned from)/i, weight: 0.7 },
        { type: 'emotion', regex: /(hype|angry|heartbroken|excited|passionate|fired up|emotional|feeling)/i, weight: 0.6 },
        { type: 'environment', regex: /(gym|la|hollywood|club|street|city|nature|beach|mountains|place)/i, weight: 0.6 },
        { type: 'media', regex: /(anime|music|show|movie|one piece|book|podcast|documentary|film)/i, weight: 0.65 },
        { type: 'experience', regex: /(fight|rolled|sparred|event|travel|adventure|trip|journey|happened)/i, weight: 0.7 },
        { type: 'idea', regex: /(idea|concept|plan|vision|thought|realization|epiphany|insight)/i, weight: 0.6 },
        { type: 'nature', regex: /(sunset|sunrise|ocean|forest|mountain|sky|stars|nature|outdoors)/i, weight: 0.55 },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        // Check for inspiration patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            // Check if it's actually about inspiration (not just mentioning the word)
            const inspirationContext = /(inspired|motivated|sparked|triggered|led to|made me|gave me|idea from)/i.test(contentLower);
            
            if (inspirationContext || pattern.type === 'idea' || pattern.type === 'experience') {
              sources.push({
                id: `inspiration_${entry.id}_${pattern.type}_${Date.now()}`,
                type: pattern.type,
                evidence: content.substring(0, 300),
                weight: pattern.weight,
                timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
                metadata: {
                  source_entry_id: entry.id,
                },
              });
              break; // Only count each entry once per type
            }
          }
        }
      }

      logger.debug({ sources: sources.length, entries: entries.length }, 'Extracted inspiration sources');

      return sources;
    } catch (error) {
      logger.error({ error }, 'Failed to extract inspiration sources');
      return [];
    }
  }

  /**
   * Get inspiration distribution by type
   */
  getInspirationDistribution(sources: InspirationSource[]): Record<InspirationSourceType, number> {
    const distribution: Record<string, number> = {};

    sources.forEach((source) => {
      distribution[source.type] = (distribution[source.type] || 0) + 1;
    });

    return distribution as Record<InspirationSourceType, number>;
  }
}

