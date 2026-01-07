import { logger } from '../../logger';
import type { DreamSignal, DreamCategory } from './types';

/**
 * Extracts explicit dream/ambition statements from journal entries
 */
export class DreamExtractor {
  /**
   * Extract dream signals from entries
   */
  extract(entries: any[]): DreamSignal[] {
    const dreams: DreamSignal[] = [];

    try {
      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();
        const sentiment = entry.sentiment || this.estimateSentiment(content);

        // Dream category patterns
        const patterns: Array<{ category: DreamCategory; regex: RegExp }> = [
          { category: 'career', regex: /(i want to work at|my dream job|career|profession|become.*engineer|become.*doctor|become.*lawyer|become.*designer|startup|founder|entrepreneur)/ },
          { category: 'creative', regex: /(create|publish|release|write a book|make music|artist|composer|writer|novel|album|artwork|exhibition)/ },
          { category: 'martial', regex: /(compete|fight|championship|belt|martial|combat|tournament|black belt|mma|ufc|olympics)/ },
          { category: 'financial', regex: /(financial freedom|wealth|invest|money goals|millionaire|rich|afford|financial independence|retire early)/ },
          { category: 'lifestyle', regex: /(move to|travel|lifestyle|live in|my ideal life|dream home|beach|mountains|city|countryside)/ },
          { category: 'personal', regex: /(i want to become|i want to be.*person|better person|stronger|smarter|wiser|confident|leader)/ },
          { category: 'legacy', regex: /(leave behind|what i want to be remembered for|impact|change the world|make a difference|influence|legacy)/ },
          { category: 'relationship', regex: /(family goals|relationship dreams|minimalist home|partner|marriage|children|family|love|soulmate)/ },
          { category: 'health', regex: /(get in shape|fitness goals|healthy|strong|fit|marathon|triathlon|health|wellness)/ },
          { category: 'education', regex: /(learn|study|degree|master|phd|education|university|college|course|certification)/ },
          { category: 'adventure', regex: /(adventure|explore|travel|journey|expedition|backpack|hike|climb|sail|road trip)/ },
          { category: 'family', regex: /(family|children|kids|parent|raise|teach|guide|nurture|family time)/ },
        ];

        // Check for dream patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            const clarity = this.estimateClarity(content);
            const desire = this.estimateDesire(sentiment);

            dreams.push({
              id: `dream_${entry.id}_${pattern.category}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              category: pattern.category,
              clarity,
              desire,
              text: content.substring(0, 500),
              entry_id: entry.id,
              metadata: {
                source_entry_id: entry.id,
                sentiment,
              },
            });
          }
        }
      }

      logger.debug({ dreams: dreams.length, entries: entries.length }, 'Extracted dream signals');

      return dreams;
    } catch (error) {
      logger.error({ error }, 'Failed to extract dream signals');
      return [];
    }
  }

  /**
   * Estimate clarity of dream statement
   */
  private estimateClarity(text: string): number {
    const textLower = text.toLowerCase();
    const clarityWords = [
      'exactly', 'specifically', 'clearly', 'for sure', 'my plan', 'definitely',
      'i will', 'i am going to', 'i plan to', 'my goal is', 'i aim to',
      'concrete', 'specific', 'detailed', 'precise',
    ];
    const matches = clarityWords.filter(w => textLower.includes(w)).length;
    return Math.min(1, matches * 0.15 + 0.4);
  }

  /**
   * Estimate desire intensity from sentiment
   */
  private estimateDesire(sentiment: number): number {
    // Normalize sentiment (-1 to +1) to desire (0 to 1)
    // Positive sentiment = higher desire
    return Math.min(1, Math.max(0, (sentiment + 1) / 2 + 0.2));
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Positive indicators
    const positiveMarkers = [
      'want', 'dream', 'hope', 'wish', 'desire', 'aspire', 'excited', 'passionate',
      'love', 'amazing', 'wonderful', 'great', 'perfect', 'ideal', 'fantastic',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Negative indicators
    const negativeMarkers = [
      'doubt', 'uncertain', 'unsure', 'worried', 'anxious', 'fear', 'scared',
      'impossible', 'never', "can't", "won't", 'difficult',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (positiveCount === 0 && negativeCount === 0) return 0.3; // Default slightly positive for dreams
    const total = positiveCount + negativeCount;
    return (positiveCount - negativeCount) / total;
  }
}

