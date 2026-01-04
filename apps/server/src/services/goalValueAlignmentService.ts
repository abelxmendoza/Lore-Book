/**
 * LORE-KEEPER GOAL TRACKING & VALUE ALIGNMENT ENGINE (GVAE)
 * Service for tracking values, goals, and alignment
 */

import OpenAI from 'openai';
import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import { config } from '../config';
import { omegaMemoryService } from './omegaMemoryService';
import { decisionMemoryService } from './decisionMemoryService';
import { insightReflectionService } from './insightReflectionService';
import type {
  Value,
  Goal,
  GoalSignal,
  AlignmentSnapshot,
  GoalWithAlignment,
  ValueInput,
  GoalInput,
  GoalType,
  GoalStatus,
  TargetTimeframe,
  GoalSignalSourceType,
  DriftObservation,
} from '../types/goalValueAlignment';

const openai = new OpenAI({ apiKey: config.openAiKey });

export class GoalValueAlignmentService {
  /**
   * Declare a value
   */
  async declareValue(userId: string, input: ValueInput): Promise<Value> {
    try {
      const { data, error } = await supabaseAdmin
        .from('values')
        .insert({
          user_id: userId,
          name: input.name,
          description: input.description,
          priority: input.priority || 0.5,
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId }, 'Failed to declare value');
        throw error;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to declare value');
      throw error;
    }
  }

  /**
   * Update value priority
   */
  async updateValuePriority(userId: string, valueId: string, newPriority: number): Promise<Value> {
    try {
      const { data, error } = await supabaseAdmin
        .from('values')
        .update({ priority: newPriority })
        .eq('id', valueId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error({ err: error, valueId, userId }, 'Failed to update value priority');
        throw error;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, valueId, userId }, 'Failed to update value priority');
      throw error;
    }
  }

  /**
   * Get values for user
   */
  async getValues(userId: string, activeOnly: boolean = true): Promise<Value[]> {
    try {
      let query = supabaseAdmin
        .from('values')
        .select('*')
        .eq('user_id', userId)
        .order('priority', { ascending: false });

      if (activeOnly) {
        query = query.is('ended_at', null);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ err: error, userId }, 'Failed to get values');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get values');
      throw error;
    }
  }

  /**
   * Declare a goal
   */
  async declareGoal(userId: string, input: GoalInput): Promise<Goal> {
    try {
      const { data, error } = await supabaseAdmin
        .from('goals')
        .insert({
          user_id: userId,
          title: input.title,
          description: input.description,
          goal_type: input.goal_type,
          related_value_ids: input.related_value_ids || [],
          target_timeframe: input.target_timeframe,
          confidence: input.confidence || 0.6,
          status: 'ACTIVE',
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId }, 'Failed to declare goal');
        throw error;
      }

      // Evaluate initial signals
      await this.evaluateGoalSignals(userId, data.id);

      return data;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to declare goal');
      throw error;
    }
  }

  /**
   * Get goals for user
   */
  async getGoals(
    userId: string,
    filters?: {
      status?: GoalStatus;
      goal_type?: GoalType;
      limit?: number;
    }
  ): Promise<Goal[]> {
    try {
      let query = supabaseAdmin
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.goal_type) {
        query = query.eq('goal_type', filters.goal_type);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ err: error, userId }, 'Failed to get goals');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get goals');
      throw error;
    }
  }

  /**
   * Get active goals
   */
  async getActiveGoals(userId: string): Promise<Goal[]> {
    return this.getGoals(userId, { status: 'ACTIVE' });
  }

  /**
   * Update goal status
   */
  async updateGoalStatus(
    userId: string,
    goalId: string,
    status: GoalStatus
  ): Promise<Goal> {
    try {
      const updateData: any = { status };
      if (status === 'COMPLETED' || status === 'ABANDONED') {
        updateData.ended_at = new Date().toISOString();
      }

      const { data, error } = await supabaseAdmin
        .from('goals')
        .update(updateData)
        .eq('id', goalId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error({ err: error, goalId, userId }, 'Failed to update goal status');
        throw error;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, goalId, userId }, 'Failed to update goal status');
      throw error;
    }
  }

  /**
   * Evaluate goal signals (read-only analysis)
   */
  async evaluateGoalSignals(userId: string, goalId: string): Promise<GoalSignal[]> {
    try {
      const goal = await this.getGoal(userId, goalId);
      if (!goal) {
        throw new Error('Goal not found');
      }

      const signals: GoalSignal[] = [];

      // Analyze claims
      const claimSignals = await this.analyzeClaims(userId, goal);
      signals.push(...claimSignals);

      // Analyze decisions
      const decisionSignals = await this.analyzeDecisions(userId, goal);
      signals.push(...decisionSignals);

      // Analyze insights
      const insightSignals = await this.analyzeInsights(userId, goal);
      signals.push(...insightSignals);

      // Analyze outcomes
      const outcomeSignals = await this.analyzeOutcomes(userId, goal);
      signals.push(...outcomeSignals);

      // Save signals
      if (signals.length > 0) {
        await this.saveSignals(userId, signals);
      }

      return signals;
    } catch (error) {
      logger.error({ err: error, goalId, userId }, 'Failed to evaluate goal signals');
      return [];
    }
  }

  /**
   * Compute alignment for a goal
   */
  async computeAlignment(userId: string, goalId: string): Promise<AlignmentSnapshot> {
    try {
      const signals = await this.getGoalSignals(userId, goalId);

      if (signals.length === 0) {
        throw new Error('No signals available for alignment calculation');
      }

      // Calculate weighted average alignment score
      const weightedScore = this.calculateWeightedAlignment(signals);
      const confidence = this.calculateConfidence(signals);
      const timeWindow = this.deriveTimeWindow(signals);

      const snapshot: AlignmentSnapshot = {
        id: '',
        user_id: userId,
        goal_id: goalId,
        alignment_score: weightedScore,
        confidence,
        time_window: timeWindow,
        generated_at: new Date().toISOString(),
      };

      // Save snapshot
      const { data, error } = await supabaseAdmin
        .from('alignment_snapshots')
        .insert({
          user_id: userId,
          goal_id: goalId,
          alignment_score: weightedScore,
          confidence,
          time_window: timeWindow,
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error, goalId, userId }, 'Failed to save alignment snapshot');
        throw error;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, goalId, userId }, 'Failed to compute alignment');
      throw error;
    }
  }

  /**
   * Detect goal drift
   */
  async detectGoalDrift(userId: string, goalId: string): Promise<DriftObservation | null> {
    try {
      const snapshots = await this.getAlignmentSnapshots(userId, goalId);

      if (snapshots.length < 3) {
        return null; // Need at least 3 snapshots to detect trend
      }

      const trend = this.detectDownwardTrend(snapshots);

      if (trend === 'downward') {
        const goal = await this.getGoal(userId, goalId);
        if (!goal) {
          return null;
        }

        return {
          title: 'Goal alignment drift observed',
          description: await this.describeDrift(goal, snapshots),
          disclaimer: 'This is an observation, not a judgment.',
          goal_id: goalId,
          trend: 'downward',
        };
      }

      return null;
    } catch (error) {
      logger.error({ err: error, goalId, userId }, 'Failed to detect goal drift');
      return null;
    }
  }

  /**
   * Get goal with alignment data
   */
  async getGoalWithAlignment(userId: string, goalId: string): Promise<GoalWithAlignment | null> {
    try {
      const goal = await this.getGoal(userId, goalId);
      if (!goal) {
        return null;
      }

      const signals = await this.getGoalSignals(userId, goalId);
      const snapshots = await this.getAlignmentSnapshots(userId, goalId);

      return {
        goal,
        signals,
        snapshots,
      };
    } catch (error) {
      logger.error({ err: error, goalId, userId }, 'Failed to get goal with alignment');
      return null;
    }
  }

  /**
   * Get latest alignment snapshots for goals
   */
  async getLatestAlignmentSnapshots(userId: string, goalIds: string[]): Promise<AlignmentSnapshot[]> {
    try {
      if (goalIds.length === 0) {
        return [];
      }

      const { data, error } = await supabaseAdmin
        .from('alignment_snapshots')
        .select('*')
        .eq('user_id', userId)
        .in('goal_id', goalIds)
        .order('generated_at', { ascending: false });

      if (error) {
        logger.error({ err: error, userId }, 'Failed to get latest snapshots');
        throw error;
      }

      // Get latest snapshot per goal
      const latestByGoal = new Map<string, AlignmentSnapshot>();
      for (const snapshot of (data || [])) {
        if (!latestByGoal.has(snapshot.goal_id)) {
          latestByGoal.set(snapshot.goal_id, snapshot);
        }
      }

      return Array.from(latestByGoal.values());
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get latest snapshots');
      return [];
    }
  }

  /**
   * Helper: Get goal
   */
  private async getGoal(userId: string, goalId: string): Promise<Goal | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('goals')
        .select('*')
        .eq('id', goalId)
        .eq('user_id', userId)
        .single();

      if (error) {
        return null;
      }

      return data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: Analyze claims
   */
  private async analyzeClaims(userId: string, goal: Goal): Promise<GoalSignal[]> {
    try {
      // Get claims related to goal's values
      const values = await this.getValues(userId, true);
      const goalValues = values.filter(v => goal.related_value_ids.includes(v.id));

      if (goalValues.length === 0) {
        return [];
      }

      // Get entities and claims
      const entities = await omegaMemoryService.getEntities(userId);
      const allClaims: any[] = [];

      for (const entity of entities) {
        const claims = await omegaMemoryService.getClaimsForEntity(userId, entity.id, true);
        allClaims.push(...claims.slice(0, 10));
      }

      // Use LLM to evaluate alignment
      const signals: GoalSignal[] = [];

      for (const claim of allClaims.slice(0, 5)) {
        const alignment = await this.evaluateClaimAlignment(claim, goal, goalValues);
        if (alignment) {
          signals.push({
            id: '',
            user_id: userId,
            goal_id: goal.id,
            source_type: 'CLAIM',
            reference_id: claim.id,
            alignment_score: alignment.score,
            explanation: alignment.explanation,
            recorded_at: new Date().toISOString(),
          });
        }
      }

      return signals;
    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze claims');
      return [];
    }
  }

  /**
   * Helper: Analyze decisions
   */
  private async analyzeDecisions(userId: string, goal: Goal): Promise<GoalSignal[]> {
    try {
      const decisions = await decisionMemoryService.getDecisions(userId, {
        decision_type: this.mapGoalTypeToDecisionType(goal.goal_type),
        limit: 10,
      });

      const signals: GoalSignal[] = [];

      for (const decision of decisions.slice(0, 5)) {
        const alignment = await this.evaluateDecisionAlignment(decision, goal);
        if (alignment) {
          signals.push({
            id: '',
            user_id: userId,
            goal_id: goal.id,
            source_type: 'DECISION',
            reference_id: decision.id,
            alignment_score: alignment.score,
            explanation: alignment.explanation,
            recorded_at: new Date().toISOString(),
          });
        }
      }

      return signals;
    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze decisions');
      return [];
    }
  }

  /**
   * Helper: Analyze insights
   */
  private async analyzeInsights(userId: string, goal: Goal): Promise<GoalSignal[]> {
    try {
      const insights = await insightReflectionService.getInsights(userId, {
        dismissed: false,
        limit: 10,
      });

      const signals: GoalSignal[] = [];

      for (const insight of insights.slice(0, 5)) {
        const alignment = await this.evaluateInsightAlignment(insight, goal);
        if (alignment) {
          signals.push({
            id: '',
            user_id: userId,
            goal_id: goal.id,
            source_type: 'INSIGHT',
            reference_id: insight.id,
            alignment_score: alignment.score,
            explanation: alignment.explanation,
            recorded_at: new Date().toISOString(),
          });
        }
      }

      return signals;
    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze insights');
      return [];
    }
  }

  /**
   * Helper: Analyze outcomes
   */
  private async analyzeOutcomes(userId: string, goal: Goal): Promise<GoalSignal[]> {
    try {
      const decisions = await decisionMemoryService.getDecisions(userId, {
        decision_type: this.mapGoalTypeToDecisionType(goal.goal_type),
        limit: 10,
      });

      const signals: GoalSignal[] = [];

      for (const decision of decisions) {
        const summary = await decisionMemoryService.summarizeDecision(decision.id, userId);
        if (!summary || !summary.outcomes || summary.outcomes.length === 0) {
          continue;
        }

        for (const outcome of summary.outcomes.slice(0, 2)) {
          const alignment = await this.evaluateOutcomeAlignment(outcome, goal);
          if (alignment) {
            signals.push({
              id: '',
              user_id: userId,
              goal_id: goal.id,
              source_type: 'OUTCOME',
              reference_id: outcome.id,
              alignment_score: alignment.score,
              explanation: alignment.explanation,
              recorded_at: new Date().toISOString(),
            });
          }
        }
      }

      return signals;
    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze outcomes');
      return [];
    }
  }

  /**
   * Helper: Evaluate claim alignment
   */
  private async evaluateClaimAlignment(
    claim: any,
    goal: Goal,
    values: Value[]
  ): Promise<{ score: number; explanation: string } | null> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Evaluate how a claim aligns with a goal and values. Return alignment score from -1.0 (misaligned) to +1.0 (aligned). Be neutral and observational.`
          },
          {
            role: 'user',
            content: `Goal: ${goal.title}
Description: ${goal.description}

Values: ${values.map(v => `${v.name}: ${v.description}`).join(', ')}

Claim: ${claim.text}

Evaluate alignment and return JSON:
{
  "score": -1.0 to 1.0,
  "explanation": "brief explanation"
}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return {
        score: response.score || 0,
        explanation: response.explanation || 'Alignment evaluated',
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: Evaluate decision alignment
   */
  private async evaluateDecisionAlignment(
    decision: any,
    goal: Goal
  ): Promise<{ score: number; explanation: string } | null> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Evaluate how a decision aligns with a goal. Return alignment score from -1.0 to +1.0. Be neutral.`
          },
          {
            role: 'user',
            content: `Goal: ${goal.title}
Decision: ${decision.title}

Evaluate alignment and return JSON:
{
  "score": -1.0 to 1.0,
  "explanation": "brief explanation"
}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return {
        score: response.score || 0,
        explanation: response.explanation || 'Alignment evaluated',
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: Evaluate insight alignment
   */
  private async evaluateInsightAlignment(
    insight: any,
    goal: Goal
  ): Promise<{ score: number; explanation: string } | null> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Evaluate how an insight aligns with a goal. Return alignment score from -1.0 to +1.0. Be neutral.`
          },
          {
            role: 'user',
            content: `Goal: ${goal.title}
Insight: ${insight.title} - ${insight.description}

Evaluate alignment and return JSON:
{
  "score": -1.0 to 1.0,
  "explanation": "brief explanation"
}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return {
        score: response.score || 0,
        explanation: response.explanation || 'Alignment evaluated',
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: Evaluate outcome alignment
   */
  private async evaluateOutcomeAlignment(
    outcome: any,
    goal: Goal
  ): Promise<{ score: number; explanation: string } | null> {
    // Simple heuristic: positive sentiment = positive alignment
    const sentimentMap: Record<string, number> = {
      POSITIVE: 0.7,
      MIXED: 0.0,
      NEGATIVE: -0.7,
      UNCLEAR: 0.0,
    };

    const score = sentimentMap[outcome.sentiment || 'UNCLEAR'] || 0;

    return {
      score,
      explanation: `Outcome sentiment: ${outcome.sentiment || 'UNCLEAR'}`,
    };
  }

  /**
   * Helper: Save signals
   */
  private async saveSignals(userId: string, signals: GoalSignal[]): Promise<void> {
    try {
      const signalRecords = signals.map(s => ({
        user_id: userId,
        goal_id: s.goal_id,
        source_type: s.source_type,
        reference_id: s.reference_id,
        alignment_score: s.alignment_score,
        explanation: s.explanation,
      }));

      await supabaseAdmin
        .from('goal_signals')
        .insert(signalRecords);
    } catch (error) {
      logger.error({ err: error }, 'Failed to save signals');
    }
  }

  /**
   * Helper: Get goal signals
   */
  private async getGoalSignals(userId: string, goalId: string): Promise<GoalSignal[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('goal_signals')
        .select('*')
        .eq('user_id', userId)
        .eq('goal_id', goalId)
        .order('recorded_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get goal signals');
      return [];
    }
  }

  /**
   * Helper: Get alignment snapshots
   */
  private async getAlignmentSnapshots(userId: string, goalId: string): Promise<AlignmentSnapshot[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('alignment_snapshots')
        .select('*')
        .eq('user_id', userId)
        .eq('goal_id', goalId)
        .order('generated_at', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error }, 'Failed to get alignment snapshots');
      return [];
    }
  }

  /**
   * Helper: Calculate weighted alignment
   */
  private calculateWeightedAlignment(signals: GoalSignal[]): number {
    if (signals.length === 0) {
      return 0;
    }

    // Simple average for now (can be weighted by recency, confidence, etc.)
    const sum = signals.reduce((acc, s) => acc + s.alignment_score, 0);
    return sum / signals.length;
  }

  /**
   * Helper: Calculate confidence
   */
  private calculateConfidence(signals: GoalSignal[]): number {
    // More signals = higher confidence
    return Math.min(1.0, signals.length / 10);
  }

  /**
   * Helper: Derive time window
   */
  private deriveTimeWindow(signals: GoalSignal[]): { start: string; end: string } {
    if (signals.length === 0) {
      const now = new Date().toISOString();
      return { start: now, end: now };
    }

    const times = signals.map(s => new Date(s.recorded_at).getTime());
    const start = new Date(Math.min(...times)).toISOString();
    const end = new Date(Math.max(...times)).toISOString();

    return { start, end };
  }

  /**
   * Helper: Detect downward trend
   */
  private detectDownwardTrend(snapshots: AlignmentSnapshot[]): 'downward' | 'upward' | 'stable' {
    if (snapshots.length < 3) {
      return 'stable';
    }

    const recent = snapshots.slice(-3);
    const older = snapshots.slice(0, 3);

    const recentAvg = recent.reduce((sum, s) => sum + s.alignment_score, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.alignment_score, 0) / older.length;

    const diff = recentAvg - olderAvg;

    if (diff < -0.2) {
      return 'downward';
    } else if (diff > 0.2) {
      return 'upward';
    }

    return 'stable';
  }

  /**
   * Helper: Describe drift
   */
  private async describeDrift(goal: Goal, snapshots: AlignmentSnapshot[]): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'Describe goal alignment drift in a neutral, observational way. Do NOT judge or give advice.'
          },
          {
            role: 'user',
            content: `Goal: ${goal.title}

Alignment scores over time:
${JSON.stringify(snapshots.map(s => ({ score: s.alignment_score, date: s.generated_at })), null, 2)}

Describe the drift neutrally.`
          }
        ]
      });

      return completion.choices[0]?.message?.content || 'Alignment drift observed over time.';
    } catch (error) {
      return 'Alignment drift observed over time.';
    }
  }

  /**
   * Helper: Map goal type to decision type
   */
  private mapGoalTypeToDecisionType(goalType: GoalType): any {
    const mapping: Record<GoalType, any> = {
      CAREER: 'CAREER',
      RELATIONSHIP: 'RELATIONSHIP',
      HEALTH: 'HEALTH',
      FINANCIAL: 'FINANCIAL',
      CREATIVE: 'CREATIVE',
      PERSONAL: 'PERSONAL',
    };

    return mapping[goalType] || 'OTHER';
  }
}

export const goalValueAlignmentService = new GoalValueAlignmentService();

