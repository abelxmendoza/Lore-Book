import { logger } from '../../logger';

import type { SocialEdge, ToxicitySignal } from './types';

/**
 * Detects toxic or draining relationships
 */
export class ToxicityAnalyzer {
  /**
   * Detect toxicity signals from edges
   */
  detect(edges: SocialEdge[]): ToxicitySignal[] {
    const toxic: ToxicitySignal[] = [];
    const toxicMap = new Map<string, ToxicitySignal>();

    try {
      // Negative patterns
      const negativePatterns = [
        { words: /(hate|despise|loathe)/i, severity: 0.9, category: 'emotional' as const },
        { words: /(angry|furious|rage|mad)/i, severity: 0.8, category: 'emotional' as const },
        { words: /(fight|argue|conflict|dispute)/i, severity: 0.7, category: 'behavioral' as const },
        { words: /(drama|gossip|rumor)/i, severity: 0.6, category: 'social' as const },
        { words: /(anxious|worried|stressed|nervous)/i, severity: 0.7, category: 'emotional' as const },
        { words: /(avoid|dread|uncomfortable)/i, severity: 0.6, category: 'behavioral' as const },
        { words: /(hurt|pain|sad|disappointed)/i, severity: 0.7, category: 'emotional' as const },
        { words: /(fear|scared|afraid|terrified)/i, severity: 0.8, category: 'emotional' as const },
        { words: /(jealous|envy|resent)/i, severity: 0.6, category: 'emotional' as const },
        { words: /(toxic|draining|exhausting|negative)/i, severity: 0.8, category: 'other' as const },
      ];

      for (const edge of edges) {
        // Check each interaction
        for (const interaction of edge.interactions) {
          const lower = interaction.toLowerCase();

          for (const pattern of negativePatterns) {
            if (pattern.words.test(lower)) {
              // Check if person is mentioned in this interaction
              const person = lower.includes(edge.target.toLowerCase()) ? edge.target : edge.source;

              const key = person;

              if (!toxicMap.has(key)) {
                toxicMap.set(key, {
                  id: `toxic_${person}_${Date.now()}`,
                  person,
                  evidence: interaction.substring(0, 300),
                  severity: pattern.severity,
                  category: pattern.category,
                  timestamp: edge.last_interaction || new Date().toISOString(),
                  metadata: {
                    source_edge_id: edge.id,
                    pattern_matched: pattern.words.source,
                  },
                });
              } else {
                // Update existing signal (increase severity if multiple patterns)
                const existing = toxicMap.get(key)!;
                existing.severity = Math.min(1, existing.severity + 0.1);
                existing.evidence += `\n${interaction.substring(0, 300)}`;

                // Update category if more severe
                if (pattern.severity > existing.severity) {
                  existing.category = pattern.category;
                }
              }
            }
          }
        }

        // Also check edge sentiment
        if (edge.sentiment < -0.5) {
          const person = edge.target;
          const key = person;

          if (!toxicMap.has(key)) {
            toxicMap.set(key, {
              id: `toxic_${person}_${Date.now()}`,
              person,
              evidence: edge.interactions.join('\n').substring(0, 300),
              severity: Math.abs(edge.sentiment),
              category: 'emotional',
              timestamp: edge.last_interaction || new Date().toISOString(),
              metadata: {
                source_edge_id: edge.id,
                negative_sentiment: edge.sentiment,
              },
            });
          }
        }
      }

      const result = Array.from(toxicMap.values());

      logger.debug({ toxic: result.length, edges: edges.length }, 'Detected toxicity signals');

      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to detect toxicity');
      return [];
    }
  }

  /**
   * Get most toxic relationships
   */
  getMostToxic(signals: ToxicitySignal[], topN: number = 5): ToxicitySignal[] {
    return signals
      .sort((a, b) => b.severity - a.severity)
      .slice(0, topN);
  }
}

