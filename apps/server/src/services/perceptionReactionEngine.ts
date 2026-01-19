import { logger } from '../logger';

import { perceptionService } from './perceptionService';
import { reactionService } from './reactionService';
import { supabaseAdmin } from './supabaseClient';

/**
 * Perception and Reaction Engine
 * 
 * Purpose: Surface patterns and insights without diagnosing or advising
 * 
 * Core Principle: "Reflective mirror, not authority"
 * 
 * What it does:
 * - Detects patterns in perceptions → reactions
 * - Tracks stability/resilience metrics
 * - Surfaces insights as questions
 * - Never diagnoses, moralizes, or advises
 */
export type PatternInsight = {
  type: 'perception_reaction_loop' | 'false_alarm' | 'regulation_trend' | 'belief_impact' | 'recovery_pattern';
  description: string;
  question: string; // Always a question, never a conclusion
  data: {
    perception_count?: number;
    reaction_count?: number;
    avg_intensity?: number;
    recovery_times?: number[];
    confidence_levels?: number[];
    time_span_days?: number;
  };
  confidence: number; // How confident we are this pattern exists (0-1)
};

export type StabilityMetrics = {
  avg_recovery_time_minutes: number | null;
  recovery_trend: 'improving' | 'stable' | 'declining' | 'unknown';
  recurrence_rate: number; // 0-1, how often reactions recur
  intensity_trend: 'decreasing' | 'stable' | 'increasing' | 'unknown';
  resilience_score: number | null; // Calculated from recovery times and recurrence
};

class PerceptionReactionEngine {
  /**
   * Analyze patterns between perceptions and reactions
   * Returns insights as questions, never conclusions
   */
  async analyzePatterns(userId: string): Promise<PatternInsight[]> {
    try {
      const [perceptions, reactions] = await Promise.all([
        perceptionService.getPerceptionEntries(userId),
        reactionService.getReactions(userId)
      ]);

      const insights: PatternInsight[] = [];

      // Pattern 1: Perception → Reaction Loops
      const perceptionReactionMap = new Map<string, number>();
      reactions.forEach(reaction => {
        if (reaction.trigger_type === 'perception') {
          const key = reaction.trigger_id;
          perceptionReactionMap.set(key, (perceptionReactionMap.get(key) || 0) + 1);
        }
      });

      // Find perceptions that triggered multiple reactions
      for (const [perceptionId, reactionCount] of perceptionReactionMap.entries()) {
        if (reactionCount >= 3) {
          const perception = perceptions.find(p => p.id === perceptionId);
          if (perception) {
            const avgIntensity = reactions
              .filter(r => r.trigger_type === 'perception' && r.trigger_id === perceptionId)
              .reduce((sum, r) => sum + (r.intensity || 0), 0) / reactionCount;

            insights.push({
              type: 'perception_reaction_loop',
              description: `This belief about ${perception.subject_alias} triggered ${reactionCount} reactions`,
              question: `What do you notice about how this belief affected you?`,
              data: {
                perception_count: 1,
                reaction_count: reactionCount,
                avg_intensity: avgIntensity,
                confidence_levels: [perception.confidence_level]
              },
              confidence: Math.min(reactionCount / 10, 0.9) // Higher confidence with more reactions
            });
          }
        }
      }

      // Pattern 2: False Alarms (low confidence perceptions with high-intensity reactions)
      const falseAlarms = perceptions
        .filter(p => p.confidence_level < 0.4 && p.status === 'unverified')
        .map(perception => {
          const relatedReactions = reactions.filter(
            r => r.trigger_type === 'perception' && r.trigger_id === perception.id
          );
          const highIntensityReactions = relatedReactions.filter(r => (r.intensity || 0) > 0.7);
          
          if (highIntensityReactions.length > 0) {
            return {
              perception,
              reactions: highIntensityReactions,
              avgIntensity: highIntensityReactions.reduce((sum, r) => sum + (r.intensity || 0), 0) / highIntensityReactions.length
            };
          }
          return null;
        })
        .filter(Boolean) as Array<{ perception: any; reactions: any[]; avgIntensity: number }>;

      if (falseAlarms.length > 0) {
        insights.push({
          type: 'false_alarm',
          description: `${falseAlarms.length} low-confidence belief${falseAlarms.length > 1 ? 's' : ''} triggered strong reactions`,
          question: `What do you notice about beliefs you weren't sure about but still affected you strongly?`,
          data: {
            perception_count: falseAlarms.length,
            reaction_count: falseAlarms.reduce((sum, f) => sum + f.reactions.length, 0),
            avg_intensity: falseAlarms.reduce((sum, f) => sum + f.avgIntensity, 0) / falseAlarms.length,
            confidence_levels: falseAlarms.map(f => f.perception.confidence_level)
          },
          confidence: Math.min(falseAlarms.length / 5, 0.8)
        });
      }

      // Pattern 3: Regulation Trends (recovery time improvements)
      const recoveryTimes = reactions
        .filter(r => r.recovery_time_minutes !== null)
        .map(r => r.recovery_time_minutes!)
        .sort((a, b) => a - b);

      if (recoveryTimes.length >= 5) {
        const recent = recoveryTimes.slice(-5);
        const older = recoveryTimes.slice(0, Math.min(5, recoveryTimes.length - 5));
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
        
        if (recentAvg < olderAvg * 0.8) {
          insights.push({
            type: 'regulation_trend',
            description: `Your recovery times have decreased over time`,
            question: `What do you notice about how you've been handling reactions differently?`,
            data: {
              recovery_times: recoveryTimes,
              time_span_days: 30 // Approximate
            },
            confidence: 0.7
          });
        }
      }

      // Pattern 4: Belief Impact (perceptions with high impact but low confidence)
      const highImpactLowConfidence = perceptions.filter(
        p => p.confidence_level < 0.5 && p.status === 'unverified'
      );
      
      if (highImpactLowConfidence.length >= 3) {
        insights.push({
          type: 'belief_impact',
          description: `${highImpactLowConfidence.length} beliefs you weren't sure about still had significant impact`,
          question: `What patterns do you see in beliefs that affected you despite low confidence?`,
          data: {
            perception_count: highImpactLowConfidence.length,
            confidence_levels: highImpactLowConfidence.map(p => p.confidence_level)
          },
          confidence: Math.min(highImpactLowConfidence.length / 10, 0.75)
        });
      }

      // Pattern 5: Recovery Patterns (recurring reactions)
      const recurringReactions = reactions.filter(r => r.recurrence_count > 0);
      if (recurringReactions.length > 0) {
        const avgRecurrence = recurringReactions.reduce((sum, r) => sum + r.recurrence_count, 0) / recurringReactions.length;
        insights.push({
          type: 'recovery_pattern',
          description: `${recurringReactions.length} reaction${recurringReactions.length > 1 ? 's' : ''} have recurred`,
          question: `What do you notice about reactions that come back?`,
          data: {
            reaction_count: recurringReactions.length,
            recovery_times: recurringReactions
              .filter(r => r.recovery_time_minutes !== null)
              .map(r => r.recovery_time_minutes!)
          },
          confidence: Math.min(recurringReactions.length / 5, 0.8)
        });
      }

      // Sort by confidence (highest first)
      return insights.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      logger.error({ error }, 'Failed to analyze perception-reaction patterns');
      return [];
    }
  }

  /**
   * Calculate stability/resilience metrics
   * Focuses on recovery and resilience, not emotion
   */
  async calculateStabilityMetrics(userId: string): Promise<StabilityMetrics> {
    try {
      const reactions = await reactionService.getReactions(userId);
      
      const resolvedReactions = reactions.filter(r => r.resolution_state === 'resolved' || r.timestamp_resolved !== null);
      const recoveryTimes = resolvedReactions
        .filter(r => r.recovery_time_minutes !== null)
        .map(r => r.recovery_time_minutes!);

      const avgRecoveryTime = recoveryTimes.length > 0
        ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
        : null;

      // Calculate recovery trend
      let recoveryTrend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
      if (recoveryTimes.length >= 6) {
        const recent = recoveryTimes.slice(-3);
        const older = recoveryTimes.slice(0, 3);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        
        if (recentAvg < olderAvg * 0.85) {
          recoveryTrend = 'improving';
        } else if (recentAvg > olderAvg * 1.15) {
          recoveryTrend = 'declining';
        } else {
          recoveryTrend = 'stable';
        }
      }

      // Calculate recurrence rate
      const totalReactions = reactions.length;
      const recurringCount = reactions.filter(r => r.recurrence_count > 0).length;
      const recurrenceRate = totalReactions > 0 ? recurringCount / totalReactions : 0;

      // Calculate intensity trend
      let intensityTrend: 'decreasing' | 'stable' | 'increasing' | 'unknown' = 'unknown';
      const reactionsWithIntensity = reactions.filter(r => r.intensity !== null);
      if (reactionsWithIntensity.length >= 6) {
        const sorted = [...reactionsWithIntensity].sort((a, b) => 
          new Date(a.timestamp_started).getTime() - new Date(b.timestamp_started).getTime()
        );
        const recent = sorted.slice(-3).map(r => r.intensity!);
        const older = sorted.slice(0, 3).map(r => r.intensity!);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        
        if (recentAvg < olderAvg * 0.9) {
          intensityTrend = 'decreasing';
        } else if (recentAvg > olderAvg * 1.1) {
          intensityTrend = 'increasing';
        } else {
          intensityTrend = 'stable';
        }
      }

      // Calculate resilience score (0-1)
      // Based on: faster recovery = higher, less recurrence = higher
      let resilienceScore: number | null = null;
      if (avgRecoveryTime !== null) {
        // Normalize recovery time (assume 24 hours = 0.5, faster = higher)
        const normalizedRecovery = Math.max(0, 1 - (avgRecoveryTime / (24 * 60)));
        // Factor in recurrence (less recurrence = higher)
        const recurrenceFactor = 1 - recurrenceRate;
        resilienceScore = (normalizedRecovery * 0.6) + (recurrenceFactor * 0.4);
      }

      return {
        avg_recovery_time_minutes: avgRecoveryTime,
        recovery_trend: recoveryTrend,
        recurrence_rate: recurrenceRate,
        intensity_trend: intensityTrend,
        resilience_score: resilienceScore
      };
    } catch (error) {
      logger.error({ error }, 'Failed to calculate stability metrics');
      return {
        avg_recovery_time_minutes: null,
        recovery_trend: 'unknown',
        recurrence_rate: 0,
        intensity_trend: 'unknown',
        resilience_score: null
      };
    }
  }

  /**
   * Get reactions that need time-delayed reflection
   * Prompts user weeks later: "Does this reaction still feel accurate?"
   */
  async getReactionsNeedingReflection(userId: string, daysDelay: number = 7): Promise<Array<{
    reaction: any;
    daysSince: number;
  }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysDelay);

      const { data, error } = await supabaseAdmin
        .from('reaction_entries')
        .select('*')
        .eq('user_id', userId)
        .lt('timestamp_started', cutoffDate.toISOString())
        .is('reflection_prompted_at', null)
        .order('timestamp_started', { ascending: false })
        .limit(10);

      if (error) {
        logger.error({ error }, 'Failed to get reactions needing reflection');
        return [];
      }

      return (data || []).map(reaction => ({
        reaction,
        daysSince: Math.floor(
          (new Date().getTime() - new Date(reaction.timestamp_started).getTime()) / (1000 * 60 * 60 * 24)
        )
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to get reactions needing reflection');
      return [];
    }
  }

  /**
   * Record reflection response
   */
  async recordReflection(
    userId: string,
    reactionId: string,
    response: string
  ): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('reaction_entries')
        .update({
          reflection_answered_at: new Date().toISOString(),
          reflection_response: response
        })
        .eq('id', reactionId)
        .eq('user_id', userId);

      if (error) {
        logger.error({ error, reactionId }, 'Failed to record reflection');
        throw error;
      }
    } catch (error) {
      logger.error({ error, reactionId }, 'Failed to record reflection');
      throw error;
    }
  }

  /**
   * Update reaction with resolution state and outcome
   */
  async updateReactionResolution(
    userId: string,
    reactionId: string,
    resolutionState: 'active' | 'resolved' | 'lingering' | 'recurring',
    outcome?: 'avoided' | 'confronted' | 'self_soothed' | 'escalated' | 'processed' | 'other',
    recoveryTimeMinutes?: number
  ): Promise<void> {
    try {
      const reaction = await reactionService.getReactions(userId, { trigger_id: reactionId }).then(r => r[0]);
      if (!reaction) {
        throw new Error('Reaction not found');
      }

      const updateData: any = {
        resolution_state: resolutionState
      };

      if (resolutionState === 'resolved' && reaction.timestamp_resolved === null) {
        updateData.timestamp_resolved = new Date().toISOString();
        
        // Calculate recovery time if not provided
        if (recoveryTimeMinutes === undefined && reaction.timestamp_started) {
          const started = new Date(reaction.timestamp_started);
          const resolved = new Date();
          recoveryTimeMinutes = Math.floor((resolved.getTime() - started.getTime()) / (1000 * 60));
        }
      }

      if (outcome) {
        updateData.outcome = outcome;
      }

      if (recoveryTimeMinutes !== undefined) {
        updateData.recovery_time_minutes = recoveryTimeMinutes;
      }

      // Track intensity over time if available
      if (reaction.intensity !== null) {
        const existing = (reaction as any).intensity_over_time || [];
        updateData.intensity_over_time = [...existing, reaction.intensity];
      }

      await reactionService.updateReaction(userId, reactionId, updateData);
    } catch (error) {
      logger.error({ error, reactionId }, 'Failed to update reaction resolution');
      throw error;
    }
  }
}

export const perceptionReactionEngine = new PerceptionReactionEngine();
