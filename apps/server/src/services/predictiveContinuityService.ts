/**
 * LORE-KEEPER PREDICTIVE CONTINUITY ENGINE (PCE)
 * Service for generating probabilistic predictions
 */

import OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import type {
  Prediction,
  PredictionEvidence,
  PredictionWithEvidence,
  PredictionInput,
  PredictionContext,
  PredictionType,
  PredictionScope,
  TimeHorizon,
  PredictionEvidenceSourceType,
  MIN_SAMPLE_SIZE,
} from '../types/predictiveContinuity';

import { decisionMemoryService } from './decisionMemoryService';
import { embeddingService } from './embeddingService';
import { insightReflectionService } from './insightReflectionService';
import { omegaMemoryService } from './omegaMemoryService';
import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });
const MIN_SAMPLE = 3;

export class PredictiveContinuityService {
  /**
   * Generate predictions based on context
   */
  async generatePredictions(
    userId: string,
    context: PredictionContext
  ): Promise<Prediction[]> {
    try {
      const predictions: Prediction[] = [];

      // Decision-based predictions
      const decisionPredictions = await this.predictDecisionOutcomes(userId, context);
      predictions.push(...decisionPredictions);

      // Pattern continuation predictions
      const patternPredictions = await this.predictPatternContinuation(userId, context);
      predictions.push(...patternPredictions);

      // Relational trajectory predictions
      const relationalPredictions = await this.predictRelationalTrajectories(userId, context);
      predictions.push(...relationalPredictions);

      // Save predictions
      if (predictions.length > 0) {
        await this.savePredictions(userId, predictions);
      }

      return predictions;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to generate predictions');
      return [];
    }
  }

  /**
   * Predict decision outcomes based on similar past decisions
   */
  private async predictDecisionOutcomes(
    userId: string,
    context: PredictionContext
  ): Promise<Prediction[]> {
    try {
      const similarDecisions = await decisionMemoryService.getSimilarPastDecisions(
        userId,
        {
          decision_type: context.decision_ids ? undefined : undefined, // Will infer from context
          entity_ids: context.entity_ids,
          message: context.message,
        }
      );

      if (similarDecisions.length < MIN_SAMPLE) {
        return [];
      }

      // Analyze outcomes of similar decisions
      const outcomes = await this.analyzeDecisionOutcomes(userId, similarDecisions);

      if (!outcomes || outcomes.length === 0) {
        return [];
      }

      // Calculate most likely outcome
      const mostLikely = this.calculateMostLikelyOutcome(outcomes);
      const probability = mostLikely.probability;
      const confidence = this.calculateConfidence(similarDecisions.length, outcomes.length);

      // Create prediction
      const prediction = await this.createPrediction(userId, {
        title: 'Likely outcome based on similar past decisions',
        description: await this.summarizeOutcomeDistribution(outcomes, similarDecisions),
        probability,
        confidence,
        prediction_type: 'DECISION_OUTCOME',
        scope: this.inferScope(context),
        related_entity_ids: context.entity_ids || [],
        related_decision_ids: similarDecisions.map(d => d.id),
        related_claim_ids: mostLikely.claim_ids || [],
        time_horizon: await this.inferTimeHorizon(outcomes),
      });

      // Add evidence
      if (prediction) {
        await this.addPredictionEvidence(userId, prediction.id, {
          source_type: 'DECISION_HISTORY',
          reference_ids: similarDecisions.map(d => d.id),
          explanation: `Based on ${similarDecisions.length} similar past decisions`,
        });
      }

      return prediction ? [prediction] : [];
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to predict decision outcomes');
      return [];
    }
  }

  /**
   * Predict pattern continuation
   */
  private async predictPatternContinuation(
    userId: string,
    context: PredictionContext
  ): Promise<Prediction[]> {
    try {
      const insights = await insightReflectionService.getInsights(userId, {
        dismissed: false,
        limit: 20,
      });

      const patternInsights = insights.filter(
        i => i.type === 'PATTERN' || i.type === 'RECURRING_THEME'
      );

      if (patternInsights.length === 0) {
        return [];
      }

      const predictions: Prediction[] = [];

      for (const insight of patternInsights.slice(0, 5)) {
        const continuationProbability = await this.estimateContinuationProbability(insight);
        const description = await this.describePatternContinuation(insight);

        const prediction = await this.createPrediction(userId, {
          title: 'Pattern likely to continue',
          description,
          probability: continuationProbability,
          confidence: insight.confidence,
          prediction_type: 'PATTERN_CONTINUATION',
          scope: this.inferScopeFromInsight(insight),
          related_entity_ids: insight.related_entity_ids || [],
          related_insight_ids: [insight.id],
          related_claim_ids: insight.related_claim_ids || [],
          time_horizon: 'MEDIUM',
        });

        if (prediction) {
          await this.addPredictionEvidence(userId, prediction.id, {
            source_type: 'INSIGHT_PATTERN',
            reference_ids: [insight.id],
            explanation: `Based on pattern: ${insight.title}`,
          });

          predictions.push(prediction);
        }
      }

      return predictions;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to predict pattern continuation');
      return [];
    }
  }

  /**
   * Predict relational trajectories
   */
  private async predictRelationalTrajectories(
    userId: string,
    context: PredictionContext
  ): Promise<Prediction[]> {
    try {
      // Get relationships from entities
      const entityIds = context.entity_ids || [];
      if (entityIds.length === 0) {
        return [];
      }

      const predictions: Prediction[] = [];

      for (const entityId of entityIds.slice(0, 3)) {
        // Get claims about this entity
        const claims = await omegaMemoryService.getClaimsForEntity(userId, entityId, true);
        
        if (claims.length < 5) {
          continue; // Need enough data
        }

        // Analyze temporal trends in claims
        const trajectory = await this.detectTrajectory(claims);

        if (trajectory) {
          const prediction = await this.createPrediction(userId, {
            title: 'Relationship trajectory observed',
            description: await this.describeTrajectory(trajectory, entityId),
            probability: trajectory.probability,
            confidence: trajectory.confidence,
            prediction_type: 'RELATIONAL',
            scope: 'RELATIONSHIP',
            related_entity_ids: [entityId],
            related_claim_ids: claims.slice(0, 10).map(c => c.id),
            time_horizon: trajectory.timeHorizon,
          });

          if (prediction) {
            await this.addPredictionEvidence(userId, prediction.id, {
              source_type: 'TEMPORAL_TREND',
              reference_ids: claims.slice(0, 5).map(c => c.id),
              explanation: `Based on temporal trend in ${claims.length} claims`,
            });

            predictions.push(prediction);
          }
        }
      }

      return predictions;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to predict relational trajectories');
      return [];
    }
  }

  /**
   * Get predictions for user
   */
  async getPredictions(
    userId: string,
    filters?: {
      dismissed?: boolean;
      prediction_type?: PredictionType;
      scope?: PredictionScope;
      limit?: number;
    }
  ): Promise<Prediction[]> {
    try {
      let query = supabaseAdmin
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false });

      if (filters?.dismissed !== undefined) {
        query = query.eq('dismissed', filters.dismissed);
      } else {
        query = query.eq('dismissed', false); // Default to non-dismissed
      }

      if (filters?.prediction_type) {
        query = query.eq('prediction_type', filters.prediction_type);
      }

      if (filters?.scope) {
        query = query.eq('scope', filters.scope);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ err: error, userId }, 'Failed to get predictions');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get predictions');
      throw error;
    }
  }

  /**
   * Get prediction with evidence
   */
  async explainPrediction(
    predictionId: string,
    userId: string
  ): Promise<PredictionWithEvidence | null> {
    try {
      // Get prediction
      const { data: prediction, error: predError } = await supabaseAdmin
        .from('predictions')
        .select('*')
        .eq('id', predictionId)
        .eq('user_id', userId)
        .single();

      if (predError || !prediction) {
        return null;
      }

      // Get evidence
      const { data: evidence } = await supabaseAdmin
        .from('prediction_evidence')
        .select('*')
        .eq('prediction_id', predictionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      return {
        prediction,
        evidence: evidence || [],
      };
    } catch (error) {
      logger.error({ err: error, predictionId, userId }, 'Failed to explain prediction');
      return null;
    }
  }

  /**
   * Dismiss prediction
   */
  async dismissPrediction(predictionId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('predictions')
        .update({ dismissed: true })
        .eq('id', predictionId)
        .eq('user_id', userId);

      if (error) {
        logger.error({ err: error, predictionId, userId }, 'Failed to dismiss prediction');
        throw error;
      }
    } catch (error) {
      logger.error({ err: error, predictionId, userId }, 'Failed to dismiss prediction');
      throw error;
    }
  }

  /**
   * Helper: Create prediction
   */
  private async createPrediction(
    userId: string,
    input: PredictionInput
  ): Promise<Prediction | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('predictions')
        .insert({
          user_id: userId,
          title: input.title,
          description: input.description,
          probability: input.probability,
          confidence: input.confidence,
          prediction_type: input.prediction_type,
          scope: input.scope,
          related_entity_ids: input.related_entity_ids || [],
          related_decision_ids: input.related_decision_ids || [],
          related_insight_ids: input.related_insight_ids || [],
          related_claim_ids: input.related_claim_ids || [],
          time_horizon: input.time_horizon,
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId }, 'Failed to create prediction');
        return null;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to create prediction');
      return null;
    }
  }

  /**
   * Helper: Save multiple predictions
   */
  private async savePredictions(userId: string, predictions: Prediction[]): Promise<void> {
    // Predictions are already saved in createPrediction
    // This is a placeholder for batch operations if needed
  }

  /**
   * Helper: Add prediction evidence
   */
  private async addPredictionEvidence(
    userId: string,
    predictionId: string,
    evidence: {
      source_type: PredictionEvidenceSourceType;
      reference_ids: string[];
      explanation: string;
    }
  ): Promise<void> {
    try {
      const evidenceRecords = evidence.reference_ids.map(refId => ({
        user_id: userId,
        prediction_id: predictionId,
        source_type: evidence.source_type,
        reference_id: refId,
        explanation: evidence.explanation,
      }));

      await supabaseAdmin
        .from('prediction_evidence')
        .insert(evidenceRecords);
    } catch (error) {
      logger.error({ err: error, predictionId, userId }, 'Failed to add prediction evidence');
    }
  }

  /**
   * Helper: Analyze decision outcomes
   */
  private async analyzeDecisionOutcomes(
    userId: string,
    decisions: any[]
  ): Promise<Array<{ sentiment: string; count: number; claim_ids: string[] }>> {
    try {
      const outcomes: Array<{ sentiment: string; count: number; claim_ids: string[] }> = [];
      const sentimentCounts: Record<string, { count: number; claim_ids: string[] }> = {};

      for (const decision of decisions) {
        const summary = await decisionMemoryService.summarizeDecision(decision.id, userId);
        if (!summary || !summary.outcomes || summary.outcomes.length === 0) {
          continue;
        }

        for (const outcome of summary.outcomes) {
          const sentiment = outcome.sentiment || 'UNCLEAR';
          if (!sentimentCounts[sentiment]) {
            sentimentCounts[sentiment] = { count: 0, claim_ids: [] };
          }
          sentimentCounts[sentiment].count++;
          sentimentCounts[sentiment].claim_ids.push(...(outcome.linked_claim_ids || []));
        }
      }

      return Object.entries(sentimentCounts).map(([sentiment, data]) => ({
        sentiment,
        count: data.count,
        claim_ids: data.claim_ids,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze decision outcomes');
      return [];
    }
  }

  /**
   * Helper: Calculate most likely outcome
   */
  private calculateMostLikelyOutcome(
    outcomes: Array<{ sentiment: string; count: number; claim_ids: string[] }>
  ): { sentiment: string; probability: number; claim_ids: string[] } {
    const total = outcomes.reduce((sum, o) => sum + o.count, 0);
    if (total === 0) {
      return { sentiment: 'UNCLEAR', probability: 0.5, claim_ids: [] };
    }

    const mostLikely = outcomes.reduce((max, o) => (o.count > max.count ? o : max), outcomes[0]);
    const probability = mostLikely.count / total;

    return {
      sentiment: mostLikely.sentiment,
      probability,
      claim_ids: mostLikely.claim_ids,
    };
  }

  /**
   * Helper: Calculate confidence
   */
  private calculateConfidence(sampleSize: number, outcomeCount: number): number {
    // More samples and outcomes = higher confidence
    const sampleConfidence = Math.min(1.0, sampleSize / 10);
    const outcomeConfidence = Math.min(1.0, outcomeCount / 5);
    return (sampleConfidence * 0.6 + outcomeConfidence * 0.4);
  }

  /**
   * Helper: Summarize outcome distribution
   */
  private async summarizeOutcomeDistribution(
    outcomes: Array<{ sentiment: string; count: number }>,
    decisions: any[]
  ): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'Summarize decision outcome distribution in a neutral, probabilistic way. Do NOT give advice or say "you should".'
          },
          {
            role: 'user',
            content: `Based on ${decisions.length} similar past decisions, the outcomes were distributed as follows:

${JSON.stringify(outcomes, null, 2)}

Provide a neutral summary of what this suggests about likely outcomes.`
          }
        ]
      });

      return completion.choices[0]?.message?.content || 'Based on similar past decisions, outcomes vary.';
    } catch (error) {
      return `Based on ${decisions.length} similar past decisions, outcomes were distributed across different sentiments.`;
    }
  }

  /**
   * Helper: Infer time horizon
   */
  private async inferTimeHorizon(
    outcomes: Array<{ sentiment: string; count: number }>
  ): Promise<TimeHorizon> {
    // Simple heuristic: more outcomes = longer time horizon
    const totalOutcomes = outcomes.reduce((sum, o) => sum + o.count, 0);
    if (totalOutcomes >= 10) return 'LONG';
    if (totalOutcomes >= 5) return 'MEDIUM';
    return 'SHORT';
  }

  /**
   * Helper: Estimate continuation probability
   */
  private async estimateContinuationProbability(insight: any): Promise<number> {
    // Base probability on insight confidence and type
    let baseProbability = insight.confidence || 0.6;

    // Patterns are more likely to continue than one-off events
    if (insight.type === 'RECURRING_THEME') {
      baseProbability = Math.min(1.0, baseProbability + 0.2);
    }

    return Math.min(0.95, baseProbability); // Cap at 95%
  }

  /**
   * Helper: Describe pattern continuation
   */
  private async describePatternContinuation(insight: any): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'Describe how a pattern might continue in a neutral, probabilistic way. Do NOT give advice.'
          },
          {
            role: 'user',
            content: `Pattern: ${insight.title}\nDescription: ${insight.description}\n\nDescribe how this pattern might continue.`
          }
        ]
      });

      return completion.choices[0]?.message?.content || `The pattern "${insight.title}" may continue.`;
    } catch (error) {
      return `The pattern "${insight.title}" may continue based on past observations.`;
    }
  }

  /**
   * Helper: Detect trajectory
   */
  private async detectTrajectory(claims: any[]): Promise<{
    direction: 'positive' | 'negative' | 'neutral';
    probability: number;
    confidence: number;
    timeHorizon: TimeHorizon;
  } | null> {
    if (claims.length < 5) {
      return null;
    }

    // Analyze sentiment trends over time
    const sortedClaims = claims.sort((a, b) => {
      const timeA = new Date(a.start_time || a.created_at).getTime();
      const timeB = new Date(b.start_time || b.created_at).getTime();
      return timeA - timeB;
    });

    const recentClaims = sortedClaims.slice(-5);
    const olderClaims = sortedClaims.slice(0, 5);

    // Simple sentiment analysis (assuming claims have sentiment field)
    const recentSentiment = this.averageSentiment(recentClaims);
    const olderSentiment = this.averageSentiment(olderClaims);

    const diff = recentSentiment - olderSentiment;
    const direction = diff > 0.1 ? 'positive' : diff < -0.1 ? 'negative' : 'neutral';
    const probability = Math.abs(diff) * 0.7 + 0.3; // Base probability
    const confidence = Math.min(1.0, claims.length / 10);

    return {
      direction,
      probability: Math.min(0.9, probability),
      confidence,
      timeHorizon: 'MEDIUM',
    };
  }

  /**
   * Helper: Average sentiment
   */
  private averageSentiment(claims: any[]): number {
    // Map sentiment to numeric value
    const sentimentMap: Record<string, number> = {
      POSITIVE: 1.0,
      MIXED: 0.5,
      NEUTRAL: 0.0,
      NEGATIVE: -1.0,
    };

    const sum = claims.reduce((acc, claim) => {
      const sentiment = claim.sentiment || 'NEUTRAL';
      return acc + (sentimentMap[sentiment] || 0);
    }, 0);

    return sum / claims.length;
  }

  /**
   * Helper: Describe trajectory
   */
  private async describeTrajectory(
    trajectory: { direction: string; probability: number },
    entityId: string
  ): Promise<string> {
    const directionText = {
      positive: 'improving',
      negative: 'declining',
      neutral: 'stable',
    }[trajectory.direction as keyof typeof directionText] || 'changing';

    return `The relationship trajectory appears to be ${directionText} based on recent patterns. This is a probabilistic observation, not a prediction of certainty.`;
  }

  /**
   * Helper: Infer scope
   */
  private inferScope(context: PredictionContext): PredictionScope {
    if (context.entity_ids && context.entity_ids.length > 0) {
      return 'ENTITY';
    }
    return 'SELF';
  }

  /**
   * Helper: Infer scope from insight
   */
  private inferScopeFromInsight(insight: any): PredictionScope {
    if (insight.scope === 'ENTITY' && insight.related_entity_ids && insight.related_entity_ids.length > 0) {
      return 'ENTITY';
    }
    if (insight.scope === 'SELF') {
      return 'SELF';
    }
    return 'SELF';
  }
}

export const predictiveContinuityService = new PredictiveContinuityService();

