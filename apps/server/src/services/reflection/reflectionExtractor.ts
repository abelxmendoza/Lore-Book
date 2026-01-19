import { logger } from '../../logger';

import type { Reflection } from './types';

/**
 * Extracts reflections from journal entries
 * Simple rule-based extraction for V1
 */
export class ReflectionExtractor {
  /**
   * Extract reflections from entries
   */
  extract(entries: any[]): Reflection[] {
    const reflections: Reflection[] = [];

    try {
      const patterns = [
        {
          type: 'insight' as const,
          regex: /(i realized|i understand|i see now|it dawned on me|i get it)/i,
          confidence: 0.8,
        },
        {
          type: 'realization' as const,
          regex: /(i just realized|it hit me|suddenly i|it clicked|now i know)/i,
          confidence: 0.85,
        },
        {
          type: 'lesson' as const,
          regex: /(i learned|lesson learned|takeaway|what i learned|i now know)/i,
          confidence: 0.8,
        },
        {
          type: 'question' as const,
          regex: /(why do i|what if|i wonder|i question|i'm asking myself)/i,
          confidence: 0.7,
        },
        {
          type: 'gratitude' as const,
          regex: /(i'm grateful|thankful|appreciate|blessed|lucky to)/i,
          confidence: 0.75,
        },
        {
          type: 'growth' as const,
          regex: /(i've grown|i'm becoming|i'm changing|i've evolved|i'm learning to)/i,
          confidence: 0.8,
        },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        for (const pattern of patterns) {
          if (pattern.regex.test(content)) {
            // Extract the reflection sentence
            const sentences = content.split(/[.!?]+/);
            const reflectionSentence = sentences.find(s => pattern.regex.test(s)) || content.substring(0, 200);

            reflections.push({
              id: `reflection_${entry.id}_${pattern.type}_${Date.now()}`,
              entry_id: entry.id,
              text: reflectionSentence.trim(),
              type: pattern.type,
              confidence: pattern.confidence,
              timestamp: entry.date || entry.created_at || entry.timestamp,
              metadata: {
                source_entry_id: entry.id,
              },
            });
            break; // Only one reflection per entry
          }
        }
      }

      logger.debug({ reflections: reflections.length, entries: entries.length }, 'Extracted reflections');

      return reflections;
    } catch (error) {
      logger.error({ error }, 'Failed to extract reflections');
      return [];
    }
  }
}

