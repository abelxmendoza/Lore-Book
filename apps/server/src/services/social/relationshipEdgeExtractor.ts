import { logger } from '../../logger';

import type { SocialEdge } from './types';

/**
 * Extracts relationship edges from journal entries
 * Finds co-mentions of people to build social connections
 */
export class RelationshipEdgeExtractor {
  /**
   * Extract social edges from entries
   */
  extract(entries: any[]): SocialEdge[] {
    const edges: SocialEdge[] = [];
    const edgeMap = new Map<string, SocialEdge>();

    try {
      // Enhanced person name regex - matches capitalized words (likely names)
      const personRegex = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g;

      // Common words to filter out
      const commonWords = new Set([
        'I', 'The', 'This', 'That', 'There', 'Then', 'When', 'Where',
        'What', 'Who', 'How', 'Why', 'Which', 'Monday', 'Tuesday',
        'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
        'Los', 'Angeles', 'Hollywood', 'California', 'America',
      ]);

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        // Extract potential names
        const matches = content.match(personRegex) || [];
        const names = matches
          .filter(name => !commonWords.has(name))
          .filter(name => name.length > 2); // Filter very short matches

        const unique = [...new Set(names)];

        // Need at least 2 people to form an edge
        if (unique.length < 2) continue;

        // Create edges between all pairs
        for (let i = 0; i < unique.length; i++) {
          for (let j = i + 1; j < unique.length; j++) {
            const source = unique[i];
            const target = unique[j];

            // Create edge key (sorted to avoid duplicates)
            const edgeKey = [source, target].sort().join('|');

            if (!edgeMap.has(edgeKey)) {
              // Calculate sentiment from entry
              const sentiment = this.extractSentiment(content);

              edgeMap.set(edgeKey, {
                id: `edge_${edgeKey}_${Date.now()}`,
                source,
                target,
                weight: 1,
                sentiment,
                interactions: [content.substring(0, 200)],
                first_interaction: entry.date || entry.created_at || entry.timestamp,
                last_interaction: entry.date || entry.created_at || entry.timestamp,
                metadata: {
                  source_entry_id: entry.id,
                },
              });
            } else {
              // Update existing edge
              const existing = edgeMap.get(edgeKey)!;
              existing.weight += 1;
              existing.interactions.push(content.substring(0, 200));
              existing.last_interaction = entry.date || entry.created_at || entry.timestamp;

              // Update sentiment (average)
              const newSentiment = this.extractSentiment(content);
              existing.sentiment = (existing.sentiment * (existing.weight - 1) + newSentiment) / existing.weight;
            }
          }
        }
      }

      const result = Array.from(edgeMap.values());

      logger.debug({ edges: result.length, entries: entries.length }, 'Extracted relationship edges');

      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to extract relationship edges');
      return [];
    }
  }

  /**
   * Extract sentiment from text (simple keyword-based)
   */
  private extractSentiment(text: string): number {
    const lower = text.toLowerCase();

    // Positive indicators
    const positiveWords = ['love', 'great', 'amazing', 'happy', 'excited', 'grateful', 'proud', 'wonderful', 'best', 'awesome'];
    const positiveCount = positiveWords.filter(word => lower.includes(word)).length;

    // Negative indicators
    const negativeWords = ['hate', 'angry', 'sad', 'frustrated', 'disappointed', 'worried', 'scared', 'hurt', 'bad', 'terrible'];
    const negativeCount = negativeWords.filter(word => lower.includes(word)).length;

    // Calculate sentiment (-1 to 1)
    if (positiveCount === 0 && negativeCount === 0) return 0;
    if (positiveCount > negativeCount) {
      return Math.min(1, positiveCount / 5);
    } else if (negativeCount > positiveCount) {
      return -Math.min(1, negativeCount / 5);
    }

    return 0;
  }
}

