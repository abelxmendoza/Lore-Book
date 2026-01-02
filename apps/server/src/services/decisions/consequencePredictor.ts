import { logger } from '../../logger';
import { spawnPython } from '../../utils/pythonBridge';
import type { Decision, DecisionInsight } from './types';

/**
 * Predicts consequences of decisions using Python
 */
export class ConsequencePredictor {
  /**
   * Predict consequences for decisions
   */
  async predict(decisions: Decision[]): Promise<DecisionInsight[]> {
    try {
      if (decisions.length === 0) {
        return [];
      }

      // Use Python bridge for consequence prediction
      const result = await spawnPython('decisions.predictions:predict', {
        decisions: decisions.map(d => ({
          id: d.id,
          description: d.description,
          category: d.category,
          outcome: d.outcome,
          risk_level: d.risk_level,
          similarity_matches: d.similarity_matches,
        })),
      });

      // Convert Python results to DecisionInsight format
      const insights: DecisionInsight[] = [];

      if (result?.consequences && Array.isArray(result.consequences)) {
        for (const consequence of result.consequences) {
          // Update decision with predicted consequences
          const decision = decisions.find(d => d.id === consequence.decisionId || d.id === consequence.decision_id);
          if (decision) {
            if (!decision.predicted_consequences) {
              decision.predicted_consequences = [];
            }
            if (consequence.predicted_consequence) {
              decision.predicted_consequences.push(consequence.predicted_consequence);
            }
          }

          insights.push({
            id: consequence.id || crypto.randomUUID(),
            type: 'consequence_prediction',
            message: consequence.message || `Likely outcomes predicted for "${consequence.decisionId || consequence.decision_id}"`,
            confidence: consequence.confidence || 0.7,
            timestamp: consequence.timestamp || new Date().toISOString(),
            decision_id: consequence.decisionId || consequence.decision_id,
            metadata: {
              predicted_consequence: consequence.predicted_consequence,
              prediction_score: consequence.prediction_score,
              python_consequence: consequence,
            },
          });
        }
      }

      logger.debug({ decisions: decisions.length, predictions: insights.length }, 'Predicted decision consequences');

      return insights;
    } catch (error) {
      logger.error({ error }, 'Failed to predict decision consequences');
      // Return basic predictions based on risk and category
      return this.fallbackPrediction(decisions);
    }
  }

  /**
   * Fallback prediction when Python is unavailable
   */
  private fallbackPrediction(decisions: Decision[]): DecisionInsight[] {
    const insights: DecisionInsight[] = [];

    for (const decision of decisions) {
      const predicted = this.predictBasicConsequence(decision);
      if (predicted) {
        decision.predicted_consequences = [predicted];

        insights.push({
          id: crypto.randomUUID(),
          type: 'consequence_prediction',
          message: `Based on similar patterns, this decision may lead to: ${predicted}`,
          confidence: 0.6,
          timestamp: new Date().toISOString(),
          decision_id: decision.id || '',
          metadata: {
            predicted_consequence: predicted,
            method: 'fallback',
          },
        });
      }
    }

    return insights;
  }

  /**
   * Basic consequence prediction
   */
  private predictBasicConsequence(decision: Decision): string | null {
    const category = decision.category;
    const riskLevel = decision.risk_level || 0.5;

    if (riskLevel >= 0.7) {
      return 'Potential negative consequences';
    }
    if (riskLevel <= 0.3) {
      return 'Likely positive outcomes';
    }

    // Category-based predictions
    const categoryPredictions: Record<string, string> = {
      career: 'May impact professional growth and opportunities',
      financial: 'Could affect financial stability',
      relationship: 'May influence relationship dynamics',
      health: 'Could impact physical or mental well-being',
      education: 'May affect learning and skill development',
      location: 'Could change daily routine and environment',
      family: 'May influence family relationships',
      social: 'Could affect social connections',
    };

    return categoryPredictions[category || 'other'] || 'Mixed outcomes possible';
  }
}

