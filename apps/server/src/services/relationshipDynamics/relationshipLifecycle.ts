import { logger } from '../../logger';
import { parseISO, differenceInDays } from 'date-fns';
import type {
  RelationshipInteraction,
  RelationshipMetrics,
  RelationshipLifecycle,
  RelationshipStage,
} from './types';

/**
 * Detects relationship lifecycle stages
 */
export class RelationshipLifecycleDetector {
  /**
   * Detect lifecycle from interactions and metrics
   */
  detectLifecycle(
    interactions: RelationshipInteraction[],
    metrics: RelationshipMetrics
  ): RelationshipLifecycle {
    if (interactions.length === 0) {
      return {
        current_stage: 'distant',
        stage_history: [],
        transitions: [],
        stage_confidence: 0.5,
      };
    }

    // Analyze interaction timeline
    const stages = this.analyzeStages(interactions, metrics);
    const currentStage = this.determineCurrentStage(interactions, metrics, stages);
    const transitions = this.detectTransitions(stages);

    return {
      current_stage: currentStage,
      stage_history: stages,
      transitions,
      stage_confidence: this.calculateConfidence(interactions, metrics, currentStage),
    };
  }

  /**
   * Analyze stages over time
   */
  private analyzeStages(
    interactions: RelationshipInteraction[],
    metrics: RelationshipMetrics
  ): Array<{
    stage: RelationshipStage;
    start_date: string;
    end_date?: string;
    duration_days: number;
  }> {
    const stages: Array<{
      stage: RelationshipStage;
      start_date: string;
      end_date?: string;
      duration_days: number;
    }> = [];

    if (interactions.length === 0) return stages;

    // Group interactions into time periods
    const periods = this.groupIntoPeriods(interactions);

    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      const stage = this.classifyPeriod(period, i, periods.length, metrics);

      const startDate = parseISO(period[0].date);
      const endDate = parseISO(period[period.length - 1].date);
      const duration = differenceInDays(endDate, startDate);

      stages.push({
        stage,
        start_date: period[0].date,
        end_date: period[period.length - 1].date,
        duration_days: duration,
      });
    }

    return stages;
  }

  /**
   * Group interactions into time periods
   */
  private groupIntoPeriods(
    interactions: RelationshipInteraction[]
  ): RelationshipInteraction[][] {
    const periods: RelationshipInteraction[][] = [];
    let currentPeriod: RelationshipInteraction[] = [interactions[0]];

    for (let i = 1; i < interactions.length; i++) {
      const prev = interactions[i - 1];
      const curr = interactions[i];

      const prevDate = parseISO(prev.date);
      const currDate = parseISO(curr.date);
      const daysDiff = differenceInDays(currDate, prevDate);

      // If gap is more than 60 days, start new period
      if (daysDiff > 60) {
        periods.push(currentPeriod);
        currentPeriod = [curr];
      } else {
        currentPeriod.push(curr);
      }
    }

    if (currentPeriod.length > 0) {
      periods.push(currentPeriod);
    }

    return periods;
  }

  /**
   * Classify a time period into a stage
   */
  private classifyPeriod(
    period: RelationshipInteraction[],
    periodIndex: number,
    totalPeriods: number,
    metrics: RelationshipMetrics
  ): RelationshipStage {
    const avgSentiment =
      period.reduce((sum, i) => sum + i.sentiment, 0) / period.length;
    const frequency = period.length;
    const hasConflict = period.some(i => i.interaction_type === 'conflict');
    const hasSupport = period.some(i => i.interaction_type === 'support');

    // First period
    if (periodIndex === 0) {
      if (frequency >= 3 && avgSentiment > 0) return 'forming';
      return 'developing';
    }

    // Last period
    if (periodIndex === totalPeriods - 1) {
      // Check if relationship is ending
      if (metrics.last_interaction_days_ago > 180) {
        return 'ended';
      }

      // Check if reconnecting
      if (periodIndex > 0 && metrics.last_interaction_days_ago > 60) {
        const prevPeriod = periodIndex > 0;
        if (prevPeriod && avgSentiment > 0) {
          return 'reconnecting';
        }
      }

      // Check if declining
      if (avgSentiment < -0.2 || hasConflict) {
        return 'declining';
      }

      // Check if distant
      if (frequency < 2 && metrics.last_interaction_days_ago > 30) {
        return 'distant';
      }
    }

    // Middle periods
    if (avgSentiment > 0.3 && hasSupport && !hasConflict) {
      if (frequency >= 4) return 'deepening';
      return 'established';
    }

    if (avgSentiment > 0 && frequency >= 2) {
      return 'maintaining';
    }

    if (avgSentiment < -0.2 || hasConflict) {
      return 'declining';
    }

    if (frequency < 1) {
      return 'distant';
    }

    return 'maintaining';
  }

  /**
   * Determine current stage
   */
  private determineCurrentStage(
    interactions: RelationshipInteraction[],
    metrics: RelationshipMetrics,
    stages: Array<{ stage: RelationshipStage; start_date: string; end_date?: string }>
  ): RelationshipStage {
    if (stages.length === 0) return 'distant';

    const lastStage = stages[stages.length - 1];

    // If no recent interactions, might be distant or ended
    if (metrics.last_interaction_days_ago > 180) {
      return 'ended';
    }

    if (metrics.last_interaction_days_ago > 60) {
      return 'distant';
    }

    // Use last stage, but adjust based on current metrics
    let currentStage = lastStage.stage;

    // Check for recent decline
    if (metrics.sentiment_trend === 'declining' && metrics.average_sentiment < -0.2) {
      if (currentStage !== 'declining' && currentStage !== 'ended') {
        return 'declining';
      }
    }

    // Check for reconnection
    if (metrics.last_interaction_days_ago > 30 && metrics.last_interaction_days_ago < 90) {
      if (metrics.average_sentiment > 0 && currentStage === 'distant') {
        return 'reconnecting';
      }
    }

    return currentStage;
  }

  /**
   * Detect stage transitions
   */
  private detectTransitions(
    stages: Array<{ stage: RelationshipStage; start_date: string; end_date?: string }>
  ): Array<{
    from_stage: RelationshipStage;
    to_stage: RelationshipStage;
    date: string;
    trigger?: string;
  }> {
    const transitions: Array<{
      from_stage: RelationshipStage;
      to_stage: RelationshipStage;
      date: string;
      trigger?: string;
    }> = [];

    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1];
      const curr = stages[i];

      if (prev.stage !== curr.stage) {
        transitions.push({
          from_stage: prev.stage,
          to_stage: curr.stage,
          date: curr.start_date,
          trigger: this.inferTrigger(prev.stage, curr.stage),
        });
      }
    }

    return transitions;
  }

  /**
   * Infer transition trigger
   */
  private inferTrigger(
    from: RelationshipStage,
    to: RelationshipStage
  ): string | undefined {
    // Common transitions
    if (from === 'forming' && to === 'developing') {
      return 'Increased interaction frequency';
    }

    if (from === 'developing' && to === 'established') {
      return 'Relationship stabilization';
    }

    if (from === 'established' && to === 'deepening') {
      return 'Increased emotional connection';
    }

    if (to === 'declining') {
      return 'Negative interactions or reduced contact';
    }

    if (to === 'distant') {
      return 'Reduced interaction frequency';
    }

    if (from === 'distant' && to === 'reconnecting') {
      return 'Renewed contact';
    }

    if (to === 'ended') {
      return 'No contact for extended period';
    }

    return undefined;
  }

  /**
   * Calculate confidence in stage detection
   */
  private calculateConfidence(
    interactions: RelationshipInteraction[],
    metrics: RelationshipMetrics,
    stage: RelationshipStage
  ): number {
    let confidence = 0.5;

    // More interactions = higher confidence
    if (interactions.length >= 10) confidence += 0.2;
    else if (interactions.length >= 5) confidence += 0.1;

    // Consistent patterns = higher confidence
    if (metrics.interaction_consistency > 0.7) confidence += 0.15;
    else if (metrics.interaction_consistency > 0.5) confidence += 0.1;

    // Recent interactions = higher confidence
    if (metrics.last_interaction_days_ago < 30) confidence += 0.15;

    // Stage-specific confidence adjustments
    if (stage === 'ended' && metrics.last_interaction_days_ago > 180) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }
}

