import { logger } from '../../logger';
import type { ValueSignal, ValueCategory } from './types';

/**
 * Extracts value-related statements from journal entries
 */
export class ValueExtractor {
  /**
   * Extract value signals from entries
   */
  extract(entries: any[]): ValueSignal[] {
    const signals: ValueSignal[] = [];

    try {
      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();
        const sentiment = entry.sentiment || this.estimateSentiment(content);

        // Value category patterns
        const patterns: Array<{ category: ValueCategory; regex: RegExp }> = [
          { category: 'discipline', regex: /(discipline|consistency|grind|hard work|routine|dedication|commitment|perseverance)/ },
          { category: 'loyalty', regex: /(loyal|trust|bros|family|team|tribe|faithful|devoted|stand by)/ },
          { category: 'honor', regex: /(right thing|respect|principle|ethics|integrity|honor|dignity|moral|virtue)/ },
          { category: 'ambition', regex: /(goals|dreams|future|build|achievement|success|aspire|strive|excel)/ },
          { category: 'freedom', regex: /(freedom|independence|autonomy|self reliance|liberty|free|break free|escape)/ },
          { category: 'growth', regex: /(improve|learning|be better|level up|evolve|develop|progress|advance)/ },
          { category: 'courage', regex: /(fearless|brave|risk|fight|stand up|courage|bold|daring|fear nothing)/ },
          { category: 'creativity', regex: /(create|art|build|invent|design|imagination|innovate|original|express)/ },
          { category: 'justice', regex: /(fairness|right|wrong|protect|defend|justice|equality|fair|righteous)/ },
          { category: 'family', regex: /(family|parents|siblings|children|heritage|lineage|ancestors|relatives)/ },
          { category: 'authenticity', regex: /(authentic|real|genuine|true self|be myself|honest|sincere|transparent)/ },
          { category: 'adventure', regex: /(adventure|explore|travel|journey|experience|discover|new places|wander)/ },
          { category: 'stability', regex: /(stability|security|safe|steady|consistent|reliable|predictable|stable)/ },
          { category: 'independence', regex: /(independent|self sufficient|on my own|standalone|self made|rely on myself)/ },
          { category: 'community', regex: /(community|together|unity|belong|connect|support|help others|give back)/ },
          { category: 'wisdom', regex: /(wisdom|knowledge|understanding|insight|learn|teach|mentor|guide|enlighten)/ },
          { category: 'compassion', regex: /(compassion|empathy|kindness|care|love|help|support|understanding|forgive)/ },
          { category: 'excellence', regex: /(excellence|perfect|best|quality|mastery|master|expert|top|elite)/ },
        ];

        // Check for value patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            // Calculate strength: base sentiment + value indicator boost
            const baseStrength = Math.max(0, (sentiment + 1) / 2); // Normalize -1 to +1 into 0 to 1
            const strength = Math.min(1, baseStrength + 0.3); // Boost for value indicators

            signals.push({
              id: `value_${entry.id}_${pattern.category}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              category: pattern.category,
              strength,
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

      logger.debug({ signals: signals.length, entries: entries.length }, 'Extracted value signals');

      return signals;
    } catch (error) {
      logger.error({ error }, 'Failed to extract value signals');
      return [];
    }
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Positive indicators
    const positiveMarkers = [
      'happy', 'glad', 'excited', 'great', 'wonderful', 'amazing', 'love', 'enjoyed', 'fun',
      'good', 'better', 'best', 'proud', 'grateful', 'thankful', 'blessed', 'lucky',
      'pleased', 'satisfied', 'content', 'fulfilled', 'meaningful', 'purpose',
    ];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Negative indicators
    const negativeMarkers = [
      'sad', 'angry', 'frustrated', 'disappointed', 'upset', 'worried', 'anxious', 'stressed',
      'hurt', 'pain', 'exhausted', 'tired', 'overwhelmed', 'hopeless', 'empty', 'regret',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (positiveCount === 0 && negativeCount === 0) return 0;
    const total = positiveCount + negativeCount;
    return (positiveCount - negativeCount) / total;
  }
}

