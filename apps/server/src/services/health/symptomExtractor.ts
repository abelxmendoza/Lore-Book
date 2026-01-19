import { logger } from '../../logger';

import type { SymptomEvent, SymptomType } from './types';

/**
 * Extracts symptom events from journal entries
 */
export class SymptomExtractor {
  /**
   * Extract symptom events from entries
   */
  extract(entries: any[]): SymptomEvent[] {
    const symptoms: SymptomEvent[] = [];

    try {
      const patterns: Array<{ type: SymptomType; regex: RegExp }> = [
        { type: 'fatigue', regex: /(tired|exhausted|low energy|drained|worn out|beat|spent)/i },
        { type: 'headache', regex: /(headache|migraine|head hurts|head pain|head pounding)/i },
        { type: 'tightness', regex: /(tight|stiff|tense|muscle tight|knot|cramp)/i },
        { type: 'soreness', regex: /(sore|aching|worked out too hard|muscle sore|body aches)/i },
        { type: 'pain', regex: /(pain|hurt|hurting|aching|discomfort)/i },
        { type: 'injury', regex: /(sprain|twisted|tore|injured|hurt myself|pulled|strained)/i },
        { type: 'stress_somatic', regex: /(stomach hurt|chest tight|can't breathe|shortness of breath|nervous stomach|butterflies)/i },
        { type: 'sleep_issue', regex: /(insomnia|couldn't sleep|bad sleep|restless|trouble sleeping|woke up|slept poorly)/i },
        { type: 'digestion', regex: /(stomach|digestive|nausea|upset stomach|indigestion|bloated|constipation)/i },
        { type: 'immune', regex: /(sick|fever|cough|flu|cold|sore throat|runny nose|congested)/i },
      ];

      for (const entry of entries) {
        const content = entry.content || entry.text || '';
        if (!content) continue;

        const contentLower = content.toLowerCase();
        const sentiment = entry.sentiment || this.estimateSentiment(content);

        // Check for symptom patterns
        for (const pattern of patterns) {
          if (pattern.regex.test(contentLower)) {
            // Calculate intensity: base sentiment + symptom indicator boost
            const baseIntensity = Math.max(0, (sentiment < 0 ? Math.abs(sentiment) : 0.3));
            const intensity = Math.min(1, baseIntensity + 0.3);

            symptoms.push({
              id: `symptom_${entry.id}_${pattern.type}_${Date.now()}`,
              timestamp: entry.date || entry.created_at || entry.timestamp || new Date().toISOString(),
              type: pattern.type,
              intensity,
              evidence: content.substring(0, 500),
              weight: 0.8,
              entry_id: entry.id,
              metadata: {
                source_entry_id: entry.id,
                sentiment,
              },
            });
          }
        }
      }

      logger.debug({ symptoms: symptoms.length, entries: entries.length }, 'Extracted symptom events');

      return symptoms;
    } catch (error) {
      logger.error({ error }, 'Failed to extract symptom events');
      return [];
    }
  }

  /**
   * Estimate sentiment from text if not provided
   */
  private estimateSentiment(text: string): number {
    const textLower = text.toLowerCase();

    // Negative indicators (symptoms are usually negative)
    const negativeMarkers = [
      'tired', 'exhausted', 'pain', 'hurt', 'sick', 'sore', 'ache', 'uncomfortable',
      'bad', 'worse', 'terrible', 'awful', 'miserable',
    ];
    const negativeCount = negativeMarkers.filter(m => textLower.includes(m)).length;

    // Positive indicators (rare for symptoms)
    const positiveMarkers = ['better', 'good', 'fine', 'okay', 'recovered'];
    const positiveCount = positiveMarkers.filter(m => textLower.includes(m)).length;

    // Calculate sentiment (-1 to +1)
    if (negativeCount === 0 && positiveCount === 0) return -0.3; // Default negative for symptoms
    const total = negativeCount + positiveCount;
    return (positiveCount - negativeCount) / total;
  }
}

