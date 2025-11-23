import { logger } from '../../logger';
import type { MoneyMindsetInsight, MoneyMindsetType } from './types';

/**
 * Detects money mindset patterns from journal entries
 */
export class MoneyMindsetDetector {
  /**
   * Detect money mindset patterns
   */
  detect(entries: any[]): MoneyMindsetInsight[] {
    const insights: MoneyMindsetInsight[] = [];

    try {
      const patterns: Array<{ type: MoneyMindsetType; regex: RegExp; confidence: number }> = [
        { type: 'scarcity', regex: /(broke|not enough|struggling|can't afford|poor|no money|broke|penniless)/i, confidence: 0.8 },
        { type: 'avoidance', regex: /(ignored bills|put it off|avoid|procrastinate|didn't pay|forgot to pay)/i, confidence: 0.75 },
        { type: 'impulsive_spending', regex: /(bought randomly|splurged|impulse|spent without thinking|bought on a whim)/i, confidence: 0.8 },
        { type: 'growth', regex: /(investing|saving|thinking long term|building wealth|financial planning|future|retirement)/i, confidence: 0.7 },
        { type: 'wealth_building', regex: /(financial freedom|future wealth|building assets|passive income|freedom|independence)/i, confidence: 0.85 },
        { type: 'fear_of_loss', regex: /(afraid to invest|scared to lose|risk|worried about money|anxious about finances)/i, confidence: 0.75 },
        { type: 'delayed_gratification', regex: /(saved instead|resisted|didn't buy|waited|patience|long term thinking)/i, confidence: 0.7 },
        { type: 'anxiety', regex: /(worried about money|stressed about finances|anxious|financial anxiety|money stress)/i, confidence: 0.8 },
        { type: 'confidence', regex: /(confident about money|good with finances|smart spending|financial control|in control)/i, confidence: 0.7 },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        for (const pattern of patterns) {
          if (pattern.regex.test(content)) {
            insights.push({
              id: `mindset_${entry.id}_${pattern.type}_${Date.now()}`,
              type: pattern.type,
              evidence: content.substring(0, 300),
              confidence: pattern.confidence,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              metadata: {
                source_entry_id: entry.id,
              },
            });
            break; // Only count each entry once per pattern type
          }
        }
      }

      logger.debug({ insights: insights.length, entries: entries.length }, 'Detected money mindset patterns');

      return insights;
    } catch (error) {
      logger.error({ error }, 'Failed to detect money mindset patterns');
      return [];
    }
  }

  /**
   * Get dominant mindset
   */
  getDominantMindset(insights: MoneyMindsetInsight[]): MoneyMindsetType | null {
    if (insights.length === 0) return null;

    const counts: Record<string, number> = {};
    insights.forEach((i) => {
      counts[i.type] = (counts[i.type] || 0) + 1;
    });

    const dominant = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0];

    return dominant ? (dominant[0] as MoneyMindsetType) : null;
  }
}

