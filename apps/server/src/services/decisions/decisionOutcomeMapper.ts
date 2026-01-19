import { parseISO, isAfter } from 'date-fns';

import { logger } from '../../logger';

import type { Decision, DecisionInsight, DecisionContext } from './types';

/**
 * Maps outcomes to decisions based on later entries
 */
export class DecisionOutcomeMapper {
  /**
   * Map outcomes to decisions
   */
  mapOutcomes(decisions: Decision[], ctx: DecisionContext): DecisionInsight[] {
    const insights: DecisionInsight[] = [];

    try {
      const entries = ctx.entries || [];

      for (const decision of decisions) {
        const outcome = this.findOutcome(decision, entries);

        if (outcome && outcome !== 'unknown') {
          decision.outcome = outcome;

          insights.push({
            id: crypto.randomUUID(),
            type: 'decision_detected',
            message: `Outcome detected for "${decision.description.substring(0, 60)}...": ${outcome}`,
            confidence: 0.8,
            timestamp: decision.timestamp,
            decision_id: decision.id || '',
            metadata: {
              outcome,
              decision_description: decision.description,
            },
          });
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to map decision outcomes');
    }

    return insights;
  }

  /**
   * Find outcome for a decision by looking at later entries
   */
  private findOutcome(decision: Decision, entries: any[]): 'positive' | 'negative' | 'neutral' | 'unknown' {
    try {
      const decisionDate = parseISO(decision.timestamp);

      // Get entries after the decision
      const laterEntries = entries.filter(e => {
        const entryDate = parseISO(e.date || e.created_at || e.timestamp);
        return isAfter(entryDate, decisionDate);
      });

      // Look for outcome indicators in later entries
      let positiveCount = 0;
      let negativeCount = 0;
      let neutralCount = 0;

      for (const entry of laterEntries.slice(0, 10)) {
        // Only check entries within 90 days
        const entryDate = parseISO(entry.date || entry.created_at || entry.timestamp);
        const daysDiff = (entryDate.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > 90) break;

        const content = (entry.content || entry.text || '').toLowerCase();

        // Check for positive indicators
        if (
          content.includes('worked out') ||
          content.includes('glad i did') ||
          content.includes('happy with') ||
          content.includes('good decision') ||
          content.includes('right choice') ||
          content.includes('best decision') ||
          content.includes('turned out well') ||
          content.includes('successful') ||
          content.includes('pleased') ||
          content.includes('satisfied')
        ) {
          positiveCount++;
        }

        // Check for negative indicators
        if (
          content.includes('regret') ||
          content.includes("didn't go well") ||
          content.includes('bad decision') ||
          content.includes('wrong choice') ||
          content.includes('mistake') ||
          content.includes('wish i had') ||
          content.includes('should have') ||
          content.includes('disappointed') ||
          content.includes('unhappy') ||
          content.includes('failed')
        ) {
          negativeCount++;
        }

        // Check for neutral indicators
        if (
          content.includes('okay') ||
          content.includes('fine') ||
          content.includes('neutral') ||
          content.includes('no change') ||
          content.includes('same')
        ) {
          neutralCount++;
        }
      }

      // Determine outcome based on counts
      if (positiveCount > negativeCount && positiveCount > 0) {
        return 'positive';
      }
      if (negativeCount > positiveCount && negativeCount > 0) {
        return 'negative';
      }
      if (neutralCount > 0 && positiveCount === 0 && negativeCount === 0) {
        return 'neutral';
      }

      return 'unknown';
    } catch (error) {
      logger.error({ error }, 'Failed to find outcome');
      return 'unknown';
    }
  }
}

