import { logger } from '../../logger';

import type { ProcrastinationSignal, ProcrastinationType, TimeCategory } from './types';

/**
 * Detects procrastination signals from journal entries
 */
export class ProcrastinationDetector {
  /**
   * Detect procrastination signals
   */
  detect(entries: any[]): ProcrastinationSignal[] {
    const signals: ProcrastinationSignal[] = [];

    try {
      const patterns: Array<{ type: ProcrastinationType; regex: RegExp; confidence: number }> = [
        { type: 'avoidance', regex: /(didn't start|avoiding|put it off|kept avoiding|procrastinated|avoided)/i, confidence: 0.8 },
        { type: 'delay', regex: /(later|maybe tomorrow|keep pushing it|postponed|delayed|will do it later)/i, confidence: 0.75 },
        { type: 'distraction', regex: /(scrolled|youtube|tiktok|girls|bar|distracted|got sidetracked|wasted time)/i, confidence: 0.7 },
        { type: 'fatigue', regex: /(too tired|no energy|exhausted|can't focus|too drained)/i, confidence: 0.8 },
        { type: 'low_priority', regex: /(not important|doesn't matter|not urgent|can wait|low priority)/i, confidence: 0.7 },
        { type: 'perfectionism', regex: /(not ready|not good enough|need to perfect|waiting for perfect conditions)/i, confidence: 0.75 },
        { type: 'overwhelm', regex: /(too much|overwhelmed|don't know where to start|too big|intimidating)/i, confidence: 0.8 },
      ];

      // Category detection for procrastination context
      const categoryPatterns: Array<{ category: TimeCategory; regex: RegExp }> = [
        { category: 'coding', regex: /(coding|programming|project|code)/i },
        { category: 'work', regex: /(work|job|task|assignment)/i },
        { category: 'learning', regex: /(study|learn|course|reading)/i },
        { category: 'gym', regex: /(gym|workout|exercise|fitness)/i },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();

        // Check for procrastination patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            // Detect category if mentioned
            let category: TimeCategory | undefined;
            for (const catPattern of categoryPatterns) {
              if (catPattern.regex.test(contentLower)) {
                category = catPattern.category;
                break;
              }
            }

            signals.push({
              id: `procrastination_${entry.id}_${pattern.type}_${Date.now()}`,
              type: pattern.type,
              evidence: content.substring(0, 300),
              confidence: pattern.confidence,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              category,
              metadata: {
                source_entry_id: entry.id,
              },
            });
            break; // Only count each entry once
          }
        }
      }

      logger.debug({ signals: signals.length, entries: entries.length }, 'Detected procrastination signals');

      return signals;
    } catch (error) {
      logger.error({ error }, 'Failed to detect procrastination');
      return [];
    }
  }

  /**
   * Get procrastination distribution by type
   */
  getProcrastinationDistribution(signals: ProcrastinationSignal[]): Record<ProcrastinationType, number> {
    const distribution: Record<string, number> = {};

    signals.forEach((signal) => {
      distribution[signal.type] = (distribution[signal.type] || 0) + 1;
    });

    return distribution as Record<ProcrastinationType, number>;
  }
}

