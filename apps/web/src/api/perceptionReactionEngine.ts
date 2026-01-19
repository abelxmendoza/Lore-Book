import { fetchJson } from '../lib/api';

export type PatternInsight = {
  type: 'perception_reaction_loop' | 'false_alarm' | 'regulation_trend' | 'belief_impact' | 'recovery_pattern';
  description: string;
  question: string;
  data: {
    perception_count?: number;
    reaction_count?: number;
    avg_intensity?: number;
    recovery_times?: number[];
    confidence_levels?: number[];
    time_span_days?: number;
  };
  confidence: number;
};

export type StabilityMetrics = {
  avg_recovery_time_minutes: number | null;
  recovery_trend: 'improving' | 'stable' | 'declining' | 'unknown';
  recurrence_rate: number;
  intensity_trend: 'decreasing' | 'stable' | 'increasing' | 'unknown';
  resilience_score: number | null;
};

export const perceptionReactionEngineApi = {
  /**
   * Get pattern insights (as questions, never conclusions)
   */
  async getPatterns(): Promise<PatternInsight[]> {
    const response = await fetchJson<{ insights: PatternInsight[] }>('/api/perception-reaction-engine/patterns');
    return response.insights;
  },

  /**
   * Get stability/resilience metrics
   */
  async getStabilityMetrics(): Promise<StabilityMetrics> {
    const response = await fetchJson<{ metrics: StabilityMetrics }>('/api/perception-reaction-engine/stability');
    return response.metrics;
  },

  /**
   * Get reactions needing time-delayed reflection
   */
  async getReactionsNeedingReflection(daysDelay: number = 7): Promise<Array<{
    reaction: unknown;
    daysSince: number;
  }>> {
    const response = await fetchJson<{ reactions: Array<{ reaction: unknown; daysSince: number }> }>(
      `/api/perception-reaction-engine/reflection-needed?days=${daysDelay}`
    );
    return response.reactions;
  },

  /**
   * Record reflection response
   */
  async recordReflection(reactionId: string, response: string): Promise<void> {
    await fetchJson(`/api/perception-reaction-engine/reflection/${reactionId}`, {
      method: 'POST',
      body: JSON.stringify({ response })
    });
  },

  /**
   * Update reaction resolution state and outcome
   */
  async updateResolution(
    reactionId: string,
    resolutionState: 'active' | 'resolved' | 'lingering' | 'recurring',
    outcome?: 'avoided' | 'confronted' | 'self_soothed' | 'escalated' | 'processed' | 'other',
    recoveryTimeMinutes?: number
  ): Promise<void> {
    await fetchJson(`/api/perception-reaction-engine/resolution/${reactionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        resolution_state: resolutionState,
        outcome,
        recovery_time_minutes: recoveryTimeMinutes
      })
    });
  }
};
