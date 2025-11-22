import { logger } from '../../logger';
import { spawnPython } from '../../utils/pythonBridge';
import type { Decision, DecisionInsight } from './types';

/**
 * Analyzes similarity between decisions using Python
 */
export class SimilarDecisionAnalyzer {
  /**
   * Analyze similar decisions
   */
  async analyze(decisions: Decision[]): Promise<DecisionInsight[]> {
    try {
      if (decisions.length === 0) {
        return [];
      }

      // Use Python bridge for similarity analysis
      const result = await spawnPython('decisions.similarity:analyze', {
        decisions: decisions.map(d => ({
          id: d.id,
          description: d.description,
          category: d.category,
          outcome: d.outcome,
        })),
      });

      // Convert Python results to DecisionInsight format
      const insights: DecisionInsight[] = [];

      if (result?.matches && Array.isArray(result.matches)) {
        for (const match of result.matches) {
          // Update decision with similarity matches
          const decision = decisions.find(d => d.id === match.decisionId || d.id === match.decision_id);
          if (decision) {
            if (!decision.similarity_matches) {
              decision.similarity_matches = [];
            }
            if (match.similar_decision_id) {
              decision.similarity_matches.push(match.similar_decision_id);
            }
          }

          insights.push({
            id: match.id || crypto.randomUUID(),
            type: 'similar_decision',
            message: match.message || `Similar decisions found for "${match.decisionId || match.decision_id}"`,
            confidence: match.confidence || 0.6,
            timestamp: match.timestamp || new Date().toISOString(),
            decision_id: match.decisionId || match.decision_id,
            metadata: {
              similar_decision_id: match.similar_decision_id,
              similarity_score: match.similarity_score,
              python_match: match,
            },
          });
        }
      }

      logger.debug({ decisions: decisions.length, matches: insights.length }, 'Analyzed decision similarity');

      return insights;
    } catch (error) {
      logger.error({ error }, 'Failed to analyze decision similarity');
      // Return basic similarity based on category and description
      return this.fallbackSimilarity(decisions);
    }
  }

  /**
   * Fallback similarity when Python is unavailable
   */
  private fallbackSimilarity(decisions: Decision[]): DecisionInsight[] {
    const insights: DecisionInsight[] = [];

    // Simple similarity: same category and similar description length
    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      const similar: string[] = [];

      for (let j = i + 1; j < decisions.length; j++) {
        const other = decisions[j];

        // Check if same category
        if (decision.category === other.category && decision.category) {
          // Check if descriptions are similar length (within 20%)
          const lenDiff = Math.abs(decision.description.length - other.description.length);
          const avgLen = (decision.description.length + other.description.length) / 2;
          if (lenDiff / avgLen < 0.2) {
            similar.push(other.id || '');
          }
        }
      }

      if (similar.length > 0) {
        decision.similarity_matches = similar;

        insights.push({
          id: crypto.randomUUID(),
          type: 'similar_decision',
          message: `Found ${similar.length} similar decision(s) in ${decision.category} category`,
          confidence: 0.5,
          timestamp: new Date().toISOString(),
          decision_id: decision.id || '',
          metadata: {
            similar_decision_ids: similar,
            method: 'fallback',
          },
        });
      }
    }

    return insights;
  }
}

