import { logger } from '../../logger';
import { spawnPython } from '../../utils/pythonBridge';
import type { Goal, GoalInsight } from './types';

/**
 * Predicts goal success probability using Python analytics
 */
export class SuccessPredictor {
  /**
   * Predict success probability for goals
   */
  async predict(goals: Goal[]): Promise<GoalInsight[]> {
    try {
      if (goals.length === 0) {
        return [];
      }

      // Use Python bridge for predictions
      const result = await spawnPython('goals.predictions:predict', {
        goals: goals.map(g => ({
          id: g.id,
          title: g.title,
          description: g.description,
          status: g.status,
          milestones: g.milestones,
          dependencies: g.dependencies,
        })),
      });

      // Convert Python results to GoalInsight format
      const insights: GoalInsight[] = [];

      if (result?.predictions && Array.isArray(result.predictions)) {
        for (const prediction of result.predictions) {
          insights.push({
            id: prediction.id || crypto.randomUUID(),
            type: 'success_probability',
            message: prediction.message || `Predicted success probability for "${prediction.relatedGoalId}" is ${(prediction.probability * 100).toFixed(0)}%.`,
            confidence: prediction.confidence || 0.7,
            timestamp: prediction.timestamp || new Date().toISOString(),
            related_goal_id: prediction.relatedGoalId || prediction.related_goal_id,
            metadata: {
              probability: prediction.probability,
              python_prediction: prediction,
            },
          });
        }
      }

      logger.debug({ goals: goals.length, insights: insights.length }, 'Predicted goal success');

      return insights;
    } catch (error) {
      logger.error({ error }, 'Failed to predict goal success');
      // Return basic predictions based on goal state
      return this.fallbackPredictions(goals);
    }
  }

  /**
   * Fallback predictions when Python is unavailable
   */
  private fallbackPredictions(goals: Goal[]): GoalInsight[] {
    const insights: GoalInsight[] = [];

    for (const goal of goals) {
      let probability = 0.5; // Default

      // Adjust based on status
      if (goal.status === 'completed') {
        probability = 1.0;
      } else if (goal.status === 'abandoned') {
        probability = 0.1;
      } else if (goal.status === 'paused') {
        probability = 0.3;
      } else if (goal.status === 'active') {
        probability = 0.6;
      }

      // Adjust based on milestones
      if (goal.milestones && goal.milestones.length > 0) {
        const achievedCount = goal.milestones.filter(m => m.achieved).length;
        const progress = achievedCount / goal.milestones.length;
        probability = Math.min(0.9, probability + progress * 0.2);
      }

      // Adjust based on dependencies
      if (goal.dependencies && goal.dependencies.length > 0) {
        // Dependencies might reduce probability slightly
        probability = Math.max(0.3, probability - 0.1);
      }

      goal.probability = probability;

      insights.push({
        id: crypto.randomUUID(),
        type: 'success_probability',
        message: `Predicted success probability for "${goal.title}" is ${(probability * 100).toFixed(0)}%.`,
        confidence: 0.6,
        timestamp: new Date().toISOString(),
        related_goal_id: goal.id,
        metadata: {
          probability,
          calculation_method: 'fallback',
        },
      });
    }

    return insights;
  }
}

