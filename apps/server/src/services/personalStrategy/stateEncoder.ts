import { logger } from '../../logger';
import { emotionalIntelligenceEngine } from '../emotionalIntelligence/emotionalEngine';
import { goalsEngine } from '../goals/goalEngine';
import { goalValueAlignmentService } from '../goalValueAlignmentService';
import { habitsEngine } from '../habits/habitEngine';
import { supabaseAdmin } from '../supabaseClient';

import { PatternPredictor } from './supervised/inference/predictPattern';
import type { RLStateVector, PatternType } from './types';

export class StateEncoder {
  private patternPredictor: PatternPredictor;

  constructor() {
    this.patternPredictor = new PatternPredictor();
  }

  /**
   * Encode current user state into RL state vector
   * Enhanced with pattern prediction
   */
  async encodeCurrentState(userId: string): Promise<RLStateVector> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: recentEntries } = await supabaseAdmin
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .gte('date', sevenDaysAgo.toISOString())
        .order('date', { ascending: false })
        .limit(50);

      const entries = recentEntries || [];

      // 1. Mood & Energy
      const emotionalState = await this.getEmotionalState(userId, entries);

      // 2. Physical State
      const physicalState = await this.getPhysicalState(userId, entries);

      // 3. Behavioral State
      const behavioralState = await this.getBehavioralState(userId);

      // 4. Goal State
      const goalState = await this.getGoalState(userId);

      // 5. Relationship State
      const relationshipState = await this.getRelationshipState(userId);

      // 6. Identity Alignment
      const identityAlignment = await this.getIdentityAlignment(userId);

      // 7. Temporal State
      const now = new Date();
      const temporalState = {
        time_of_day: now.getHours(),
        day_of_week: now.getDay(),
        days_since_last_entry: this.getDaysSinceLastEntry(entries),
      };

      // 8. Pattern Type (from supervised learning)
      let patternType: PatternType | undefined;
      if (entries.length > 0) {
        const latestEntry = entries[0];
        const patternPrediction = await this.patternPredictor.predict(
          userId,
          latestEntry.content || latestEntry.text || '',
          await this.extractStateFeatures(latestEntry, userId)
        );
        patternType = patternPrediction.pattern;
      }

      const state: RLStateVector = {
        ...emotionalState,
        ...physicalState,
        ...behavioralState,
        ...goalState,
        ...relationshipState,
        identity_alignment: identityAlignment,
        ...temporalState,
        pattern_type: patternType,
      };

      logger.debug({ userId, state }, 'Encoded current state');

      return state;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to encode current state');
      return this.getDefaultState();
    }
  }

  private async getEmotionalState(
    userId: string,
    entries: any[]
  ): Promise<Pick<RLStateVector, 'mood' | 'energy' | 'stress'>> {
    if (entries.length === 0) {
      return { mood: 0, energy: 0.5, stress: 0.5 };
    }

    try {
      const emotionalSummary = await emotionalIntelligenceEngine(entries[0], userId);
      const dominantEmotions = emotionalSummary.dominantEmotions || [];

      let mood = 0.0;
      const positiveEmotions = ['joy', 'excitement', 'gratitude', 'love', 'pride', 'happy', 'content'];
      const negativeEmotions = ['sadness', 'anger', 'fear', 'anxiety', 'shame', 'depressed', 'angry'];

      dominantEmotions.forEach(emotion => {
        const emotionLower = emotion.toLowerCase();
        if (positiveEmotions.some(p => emotionLower.includes(p))) mood += 0.2;
        if (negativeEmotions.some(n => emotionLower.includes(n))) mood -= 0.2;
      });
      mood = Math.max(-1, Math.min(1, mood));

      const volatility = emotionalSummary.volatilityScore || 0.5;
      const energy = Math.max(0, 1 - volatility);

      const hasAnxiety = dominantEmotions.some(e => {
        const emotionLower = e.toLowerCase();
        return ['anxiety', 'fear', 'worry', 'stress', 'overwhelmed'].some(s => emotionLower.includes(s));
      });
      const stress = hasAnxiety ? 0.7 : Math.min(volatility, 0.5);

      return { mood, energy, stress };
    } catch (error) {
      logger.debug({ error }, 'Failed to get emotional state');
      return { mood: 0, energy: 0.5, stress: 0.5 };
    }
  }

  private async getPhysicalState(
    userId: string,
    entries: any[]
  ): Promise<Pick<RLStateVector, 'sleep_hours' | 'health_score'>> {
    let sleepHours: number | undefined;
    for (const entry of entries) {
      const content = (entry.content || entry.text || '').toLowerCase();
      const sleepMatch = content.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?)\s*(of\s*)?sleep/i);
      if (sleepMatch) {
        sleepHours = parseFloat(sleepMatch[1]);
        break;
      }
    }

    let healthScore = 0.7;
    try {
      const { healthEngine } = await import('../health/healthEngine');
      const healthData = await healthEngine.getHealthData(userId);
      healthScore = healthData?.overall_score || 0.7;
    } catch (error) {
      logger.debug({ error }, 'Failed to get health score');
    }

    return { sleep_hours: sleepHours, health_score: healthScore };
  }

  private async getBehavioralState(
    userId: string
  ): Promise<Pick<RLStateVector, 'last_actions' | 'consistency_score'>> {
    try {
      const { data: recentActivities } = await supabaseAdmin
        .from('activities')
        .select('normalized_name')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      const lastActions = (recentActivities || []).map(a => a.normalized_name).filter(Boolean);

      const habits = await habitsEngine.getHabits(userId);
      const avgStreak = habits.length > 0
        ? habits.reduce((sum, h) => sum + (h.streak || 0), 0) / habits.length
        : 0;
      const consistencyScore = Math.min(avgStreak / 30, 1.0);

      return { last_actions: lastActions, consistency_score: consistencyScore };
    } catch (error) {
      logger.debug({ error }, 'Failed to get behavioral state');
      return { last_actions: [], consistency_score: 0.5 };
    }
  }

  private async getGoalState(
    userId: string
  ): Promise<Pick<RLStateVector, 'active_goals_count' | 'goal_progress_score' | 'goal_at_risk_count'>> {
    try {
      const goals = await goalsEngine.getGoals(userId);
      const activeGoals = goals.filter(g => g.status === 'active');

      const avgProgress = activeGoals.length > 0
        ? activeGoals.reduce((sum, g) => {
            const milestones = g.milestones || [];
            const completed = milestones.filter((m: any) => m.completed).length;
            return sum + (completed / Math.max(milestones.length, 1));
          }, 0) / activeGoals.length
        : 0;

      const now = Date.now();
      const atRisk = activeGoals.filter(g => {
        const milestones = g.milestones || [];
        const completed = milestones.filter((m: any) => m.completed).length;
        const progress = completed / Math.max(milestones.length, 1);
        const lastActionAt = g.last_action_at ? new Date(g.last_action_at).getTime() : 0;
        const daysSinceUpdate = lastActionAt > 0 ? (now - lastActionAt) / (1000 * 60 * 60 * 24) : 999;
        return progress < 0.3 || daysSinceUpdate > 30;
      }).length;

      return {
        active_goals_count: activeGoals.length,
        goal_progress_score: avgProgress,
        goal_at_risk_count: atRisk,
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to get goal state');
      return { active_goals_count: 0, goal_progress_score: 0, goal_at_risk_count: 0 };
    }
  }

  private async getRelationshipState(
    userId: string
  ): Promise<Pick<RLStateVector, 'social_activity_score' | 'relationship_health_score'>> {
    try {
      const { data: socialActivities } = await supabaseAdmin
        .from('activities')
        .select('*')
        .eq('user_id', userId)
        .in('category', ['social', 'relationship'])
        .order('created_at', { ascending: false })
        .limit(30);

      const socialActivityScore = Math.min((socialActivities?.length || 0) / 10, 1.0);

      let relationshipHealthScore = 0.5;
      try {
        const { relationshipDynamicsEngine } = await import('../relationshipDynamics/relationshipDynamicsEngine');
        const relationships = await relationshipDynamicsEngine.getRelationships(userId);
        relationshipHealthScore = relationships.length > 0
          ? relationships.reduce((sum, r) => sum + (r.health_score || 0.5), 0) / relationships.length
          : 0.5;
      } catch (error) {
        logger.debug({ error }, 'Failed to get relationship health');
      }

      return {
        social_activity_score: socialActivityScore,
        relationship_health_score: relationshipHealthScore,
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to get relationship state');
      return { social_activity_score: 0.5, relationship_health_score: 0.5 };
    }
  }

  private async getIdentityAlignment(userId: string): Promise<number> {
    try {
      const values = await goalValueAlignmentService.getValues(userId);
      if (values.length === 0) return 0.5;

      const { data: snapshots } = await supabaseAdmin
        .from('alignment_snapshots')
        .select('alignment_score')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(1);

      if (snapshots && snapshots.length > 0) {
        return Math.max(0, Math.min(1, snapshots[0].alignment_score || 0.5));
      }

      return 0.5;
    } catch (error) {
      logger.debug({ error }, 'Failed to get identity alignment');
      return 0.5;
    }
  }

  private getDaysSinceLastEntry(entries: any[]): number {
    if (entries.length === 0) return 999;
    const lastEntry = entries[0];
    const lastDate = new Date(lastEntry.date || lastEntry.created_at);
    return (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  }

  async extractFeatures(state: RLStateVector): Promise<Record<string, any>> {
    return {
      mood: state.mood,
      energy: state.energy,
      stress: state.stress,
      timeOfDay: state.time_of_day,
      dayOfWeek: state.day_of_week,
      goalProgress: state.goal_progress_score,
      alignment: state.identity_alignment,
      consistency: state.consistency_score,
      activeGoals: state.active_goals_count,
      goalsAtRisk: state.goal_at_risk_count,
      patternType: state.pattern_type,
    };
  }

  async getStateAtTime(userId: string, timestamp: string): Promise<RLStateVector> {
    return this.encodeCurrentState(userId);
  }

  private async extractStateFeatures(entry: any, userId: string): Promise<Record<string, number>> {
    const entryTime = new Date(entry.date || entry.created_at);
    const { data: snapshot } = await supabaseAdmin
      .from('state_snapshots')
      .select('snapshot_data')
      .eq('user_id', userId)
      .lte('timestamp', entryTime.toISOString())
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (snapshot?.snapshot_data) {
      return snapshot.snapshot_data;
    }

    return {
      mood: 0,
      energy: 0.5,
      stress: 0.5,
      consistency_score: 0.5,
      identity_alignment: 0.5,
      goal_progress_score: 0,
    };
  }

  private getDefaultState(): RLStateVector {
    const now = new Date();
    return {
      mood: 0,
      energy: 0.5,
      stress: 0.5,
      last_actions: [],
      consistency_score: 0.5,
      identity_alignment: 0.5,
      time_of_day: now.getHours(),
      day_of_week: now.getDay(),
      days_since_last_entry: 0,
      active_goals_count: 0,
      goal_progress_score: 0,
      goal_at_risk_count: 0,
      social_activity_score: 0.5,
      relationship_health_score: 0.5,
    };
  }
}
