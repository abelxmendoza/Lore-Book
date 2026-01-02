import { logger } from '../../logger';
import type { Decision, DecisionInsight } from './types';

/**
 * Detects recurring decision patterns
 */
export class DecisionPatternDetector {
  /**
   * Detect patterns in decisions
   */
  detect(decisions: Decision[]): DecisionInsight[] {
    const insights: DecisionInsight[] = [];

    try {
      // Group by category
      const categoryMap = new Map<string, Decision[]>();
      for (const decision of decisions) {
        const category = decision.category || 'other';
        if (!categoryMap.has(category)) {
          categoryMap.set(category, []);
        }
        categoryMap.get(category)!.push(decision);
      }

      // Detect recurring patterns in each category
      for (const [category, categoryDecisions] of categoryMap) {
        const patterns = this.detectPatternsInCategory(categoryDecisions);
        insights.push(...patterns);
      }

      // Detect cross-category patterns
      const crossCategoryPatterns = this.detectCrossCategoryPatterns(decisions);
      insights.push(...crossCategoryPatterns);

      logger.debug({ patterns: insights.length }, 'Detected decision patterns');

      return insights;
    } catch (error) {
      logger.error({ error }, 'Failed to detect decision patterns');
      return [];
    }
  }

  /**
   * Detect patterns within a category
   */
  private detectPatternsInCategory(decisions: Decision[]): DecisionInsight[] {
    const insights: DecisionInsight[] = [];
    const phraseMap = new Map<string, number>();

    // Extract key phrases from decisions
    for (const decision of decisions) {
      const phrases = this.extractKeyPhrases(decision.description);
      for (const phrase of phrases) {
        phraseMap.set(phrase, (phraseMap.get(phrase) || 0) + 1);
      }
    }

    // Find recurring phrases (appear 3+ times)
    for (const [phrase, count] of phraseMap) {
      if (count >= 3) {
        insights.push({
          id: crypto.randomUUID(),
          type: 'pattern_detected',
          message: `Recurring decision pattern detected: "${phrase}..." (appeared ${count} times)`,
          confidence: Math.min(0.95, 0.7 + count * 0.05),
          timestamp: new Date().toISOString(),
          decision_id: '',
          metadata: {
            pattern: phrase,
            count,
            category: decisions[0]?.category,
          },
        });
      }
    }

    return insights;
  }

  /**
   * Extract key phrases from decision description
   */
  private extractKeyPhrases(description: string): string[] {
    const phrases: string[] = [];
    const words = description.toLowerCase().split(/\s+/);

    // Extract 2-4 word phrases
    for (let i = 0; i < words.length - 1; i++) {
      // 2-word phrase
      if (i < words.length - 1) {
        phrases.push(`${words[i]} ${words[i + 1]}`);
      }
      // 3-word phrase
      if (i < words.length - 2) {
        phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
      }
    }

    // Filter out common stop words and short phrases
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'i', 'my', 'me'];
    return phrases.filter(p => {
      const words = p.split(/\s+/);
      return words.length >= 2 && !words.every(w => stopWords.includes(w));
    });
  }

  /**
   * Detect patterns across categories
   */
  private detectCrossCategoryPatterns(decisions: Decision[]): DecisionInsight[] {
    const insights: DecisionInsight[] = [];

    // Group decisions by outcome
    const outcomeGroups = new Map<string, Decision[]>();
    for (const decision of decisions) {
      const outcome = decision.outcome || 'unknown';
      if (!outcomeGroups.has(outcome)) {
        outcomeGroups.set(outcome, []);
      }
      outcomeGroups.get(outcome)!.push(decision);
    }

    // Detect if user tends to make similar types of decisions
    const categoryOutcomeMap = new Map<string, Map<string, number>>();
    for (const decision of decisions) {
      const category = decision.category || 'other';
      const outcome = decision.outcome || 'unknown';

      if (!categoryOutcomeMap.has(category)) {
        categoryOutcomeMap.set(category, new Map());
      }
      const outcomeMap = categoryOutcomeMap.get(category)!;
      outcomeMap.set(outcome, (outcomeMap.get(outcome) || 0) + 1);
    }

    // Find categories with consistent outcomes
    for (const [category, outcomeMap] of categoryOutcomeMap) {
      const total = Array.from(outcomeMap.values()).reduce((a, b) => a + b, 0);
      if (total >= 3) {
        const dominantOutcome = Array.from(outcomeMap.entries()).sort((a, b) => b[1] - a[1])[0];
        const percentage = (dominantOutcome[1] / total) * 100;

        if (percentage >= 70) {
          insights.push({
            id: crypto.randomUUID(),
            type: 'pattern_detected',
            message: `Pattern: Your ${category} decisions tend to have ${dominantOutcome[0]} outcomes (${percentage.toFixed(0)}% of the time)`,
            confidence: 0.8,
            timestamp: new Date().toISOString(),
            decision_id: '',
            metadata: {
              category,
              dominant_outcome: dominantOutcome[0],
              percentage,
              total_decisions: total,
            },
          });
        }
      }
    }

    return insights;
  }
}

